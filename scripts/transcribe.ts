import { config } from 'dotenv';
config({ path: '.env.local' });
import { Pool } from 'pg';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DATABASE_URL = process.env.DATABASE_URL!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_ENDPOINT = process.env.R2_ENDPOINT!;
const R2_BUCKET = process.env.R2_BUCKET!;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=disable') ? undefined : { rejectUnauthorized: false },
});

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '100');
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 5;

// n8n "Execute a SQL query" — pick jobs and mark as transcribing
async function pickJobs(limit: number) {
  const result = await pool.query(`
    WITH picked AS (
      SELECT ig_code, r2_bucket, r2_key, owner_id
      FROM public.ig_jobs
      WHERE owner_id IS NOT NULL
        AND r2_bucket IS NOT NULL AND btrim(r2_bucket) <> ''
        AND r2_key    IS NOT NULL AND btrim(r2_key)    <> ''
        AND (transcript_text IS NULL OR btrim(transcript_text) = '')
        AND (
          status IN ('queued','audio_ready','transcribed')
          OR (status = 'transcribing' AND updated_at < now() - interval '30 minutes')
        )
      ORDER BY updated_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public.ig_jobs j
    SET status = 'transcribing',
        updated_at = now(),
        error_message = null
    FROM picked
    WHERE j.ig_code = picked.ig_code
    RETURNING j.ig_code, picked.r2_bucket, picked.r2_key, picked.owner_id;
  `, [limit]);
  return result.rows as { ig_code: string; r2_bucket: string; r2_key: string; owner_id: string }[];
}

// Generate presigned URL for R2 object
async function getPresignedUrl(bucket: string, key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, command, { expiresIn: 600 });
}

// Download audio from presigned URL
async function downloadAudio(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// Call OpenAI Whisper API
async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), filename);
  formData.append('model', 'whisper-1');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: formData,
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Whisper API error: ${response.status} ${text.slice(0, 200)}`);
  }

  const result = await response.json() as { text: string };
  return result.text;
}

// n8n "Execute a SQL query2" — save transcript
async function saveTranscript(igCode: string, transcriptText: string | null): Promise<void> {
  const hasText = transcriptText && transcriptText.trim().length > 0;
  await pool.query(`
    UPDATE public.ig_jobs
    SET
      transcript_text = $2,
      status = $3,
      transcribed_at = $4,
      updated_at = now(),
      error_message = null
    WHERE ig_code = $1;
  `, [
    igCode,
    hasText ? transcriptText : null,
    hasText ? 'transcribed' : 'no_speech',
    hasText ? new Date().toISOString() : null,
  ]);
}

async function main() {
  if (DRY_RUN) {
    // Read-only preview without changing status
    const preview = await pool.query(`
      SELECT ig_code, r2_key
      FROM public.ig_jobs
      WHERE owner_id IS NOT NULL
        AND r2_bucket IS NOT NULL AND btrim(r2_bucket) <> ''
        AND r2_key    IS NOT NULL AND btrim(r2_key)    <> ''
        AND (transcript_text IS NULL OR btrim(transcript_text) = '')
        AND (
          status IN ('queued','audio_ready','transcribed')
          OR (status = 'transcribing' AND updated_at < now() - interval '30 minutes')
        )
      ORDER BY updated_at ASC
      LIMIT $1;
    `, [LIMIT]);
    console.log(`[DRY RUN] ${preview.rows.length} jobs would be transcribed:`);
    for (const row of preview.rows) {
      console.log(`  ${row.ig_code} → ${row.r2_key}`);
    }
    await pool.end();
    return;
  }

  console.log(`Picking up to ${LIMIT} jobs for transcription...`);
  const jobs = await pickJobs(LIMIT);
  console.log(`Found ${jobs.length} jobs`);

  if (jobs.length === 0) {
    await pool.end();
    return;
  }

  let success = 0;
  let failed = 0;
  let noSpeech = 0;

  // Process in batches
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (job) => {
        try {
          const presignedUrl = await getPresignedUrl(job.r2_bucket, job.r2_key);
          const audioData = await downloadAudio(presignedUrl);
          console.log(`[DL] ${job.ig_code} (${(audioData.length / 1024).toFixed(0)}KB)`);

          const transcript = await transcribeAudio(audioData, `${job.ig_code}.mp3`);
          await saveTranscript(job.ig_code, transcript);

          if (transcript && transcript.trim().length > 0) {
            console.log(`[OK] ${job.ig_code}: ${transcript.slice(0, 60)}...`);
            return 'success';
          } else {
            console.log(`[NS] ${job.ig_code}: no speech detected`);
            return 'no_speech';
          }
        } catch (err: any) {
          console.error(`[ERR] ${job.ig_code}: ${err.message}`);
          await pool.query(`UPDATE public.ig_jobs SET status = 'audio_ready', updated_at = now(), error_message = left($2, 500) WHERE ig_code = $1`, [job.ig_code, err.message]);
          throw err;
        }
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value === 'no_speech') noSpeech++;
        else success++;
      } else {
        failed++;
      }
    }
  }

  console.log(`\nDone: ${success} transcribed, ${noSpeech} no_speech, ${failed} failed`);
  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
