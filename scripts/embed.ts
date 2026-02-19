import { config } from 'dotenv';
config({ path: '.env.local' });
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL!;
const NEON_DATABASE_URL = process.env.NEON_EMBEDDING_DATABASE_URL!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=disable') ? undefined : { rejectUnauthorized: false },
});

const neonPool = new Pool({
  connectionString: NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '100');
const DRY_RUN = process.argv.includes('--dry-run');
const CHUNK_SIZE = 600;
const OVERLAP = 100;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

// n8n "Read Cursor" — get last cursor position
async function readCursor(): Promise<{ last_updated_at: string; last_ig_code: string }> {
  const result = await pool.query(`
    SELECT last_updated_at, last_ig_code
    FROM public.embedding_cursor
    WHERE name = 'ig_embed_v1';
  `);
  if (result.rows.length === 0) {
    return { last_updated_at: '1970-01-01T00:00:00Z', last_ig_code: '' };
  }
  return result.rows[0];
}

// n8n "Execute a SQL query2" — fetch jobs since cursor
async function fetchJobsSinceCursor(cursor: { last_updated_at: string; last_ig_code: string }, limit: number) {
  const result = await pool.query(`
    SELECT
      j.ig_code,
      j.owner_id,
      j.transcript_text,
      j.transcript_ja,
      j.transcript_duration_sec,
      j.updated_at
    FROM public.ig_jobs j
    WHERE j.transcript_text IS NOT NULL
      AND j.transcript_text <> ''
      AND (j.error_message IS NULL OR j.error_message = '')
      AND (
        date_trunc('milliseconds', j.updated_at) > date_trunc('milliseconds', $1::timestamptz)
        OR (
          date_trunc('milliseconds', j.updated_at) = date_trunc('milliseconds', $1::timestamptz)
          AND j.ig_code > $2::text
        )
      )
    ORDER BY j.updated_at ASC, j.ig_code ASC
    LIMIT $3;
  `, [cursor.last_updated_at, cursor.last_ig_code, limit]);
  return result.rows as { ig_code: string; owner_id: string; transcript_text: string; transcript_ja: string; transcript_duration_sec: number; updated_at: string }[];
}

// n8n "Execute a SQL query" — update cursor position
async function updateCursor(lastUpdatedAt: string, lastIgCode: string): Promise<void> {
  await pool.query(`
    UPDATE public.embedding_cursor
    SET
      last_updated_at = $1::timestamptz,
      last_ig_code = $2,
      updated_at = now()
    WHERE name = 'ig_embed_v1';
  `, [lastUpdatedAt, lastIgCode]);
}

// n8n "Code in JavaScript" — chunk splitter (600 chars, overlap 100)
function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];

  const sentences = text.match(/([^.?!]+[.?!]+)/g) || [text];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > CHUNK_SIZE && current.length > 0) {
      chunks.push(current.trim());
      // Keep overlap
      const words = current.split(' ');
      const overlapWords: string[] = [];
      let overlapLen = 0;
      for (let i = words.length - 1; i >= 0 && overlapLen < OVERLAP; i--) {
        overlapWords.unshift(words[i]);
        overlapLen += words[i].length + 1;
      }
      current = overlapWords.join(' ') + ' ' + sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// Call OpenAI Embeddings API (batch: multiple texts in one call)
async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Embeddings API error: ${response.status} ${errText.slice(0, 200)}`);
  }

  const result = await response.json() as { data: { embedding: number[]; index: number }[] };
  // Sort by index to match input order
  return result.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

// n8n "Execute a SQL query1" — INSERT into Neon pgvector
async function insertVector(id: string, igCode: string, chunkIndex: number, transcriptText: string, metadata: object, embedding: number[]): Promise<void> {
  const embeddingStr = `[${embedding.join(',')}]`;
  await neonPool.query(`
    INSERT INTO script_vectors (
      id, ig_code, chunk_index, transcript_text, metadata, embedding
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6::vector)
    ON CONFLICT (id) DO NOTHING;
  `, [id, igCode, chunkIndex, transcriptText, JSON.stringify(metadata), embeddingStr]);
}

async function main() {
  const cursor = await readCursor();
  console.log(`Cursor: updated_at=${cursor.last_updated_at}, ig_code=${cursor.last_ig_code}`);

  const jobs = await fetchJobsSinceCursor(cursor, LIMIT);
  console.log(`Found ${jobs.length} jobs to embed`);

  if (jobs.length === 0) {
    await pool.end();
    await neonPool.end();
    return;
  }

  if (DRY_RUN) {
    for (const job of jobs) {
      const chunks = chunkText(job.transcript_text);
      console.log(`[DRY RUN] ${job.ig_code}: ${chunks.length} chunks, ${job.transcript_text.length} chars`);
    }
    await pool.end();
    await neonPool.end();
    return;
  }

  let totalChunks = 0;
  let failed = 0;
  let lastSuccessJob: typeof jobs[0] | null = null;

  for (const job of jobs) {
    try {
      const chunks = chunkText(job.transcript_text);

      // Batch all chunks for one job into a single API call
      const embeddings = await getEmbeddings(chunks);

      for (let ci = 0; ci < chunks.length; ci++) {
        const id = `${job.ig_code}:${ci}`;
        const metadata = {
          ig_code: job.ig_code,
          owner_id: job.owner_id,
          chunk_index: ci,
          total_chunks: chunks.length,
        };

        await insertVector(id, job.ig_code, ci, chunks[ci], metadata, embeddings[ci]);
        totalChunks++;
      }

      console.log(`[OK] ${job.ig_code}: ${chunks.length} chunks embedded`);
      lastSuccessJob = job;
    } catch (err: any) {
      console.error(`[ERR] ${job.ig_code}: ${err.message}`);
      failed++;
    }
  }

  // Only advance cursor if at least one job succeeded
  if (lastSuccessJob) {
    await updateCursor(lastSuccessJob.updated_at, lastSuccessJob.ig_code);
    console.log(`Cursor advanced to: ${lastSuccessJob.ig_code} @ ${lastSuccessJob.updated_at}`);
  } else {
    console.log('No jobs succeeded, cursor not advanced');
  }
  console.log(`\nDone: ${totalChunks} chunks embedded, ${failed} jobs failed`);

  await pool.end();
  await neonPool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
