import { config } from 'dotenv';
config({ path: '.env.local' });
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=disable') ? undefined : { rejectUnauthorized: false },
});

const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '50');
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 10;

const TRANSLATE_PROMPT = `次の台本を日本語に翻訳してください。

これは Instagram / TikTok などの
「短尺リール動画内で話されているセリフ」です。

翻訳ルール：
- 砕けた口調・話し言葉のテンポを保つ
- 字幕として自然に読める日本語にする
- 固有名詞 / サービス名 / 略語 / スラングは無理に日本語化しない
- 意味が曖昧なスラングは雰囲気重視で訳す
- 翻訳できない語句は英語のまま残す
- 誇張・煽り・CTA（例: check this, link in bio 等）はその意図を保つ
- 内容の善悪や正確性は判断しない（翻訳のみ行う）
- 出力は翻訳結果のみ（前置き・注釈・説明は不要）

原文：`;

// n8n "Execute a SQL query" — pick transcribed jobs and claim them as 'translating'
async function pickJobs(limit: number) {
  const result = await pool.query(`
    WITH picked AS (
      SELECT ig_code, transcript_text
      FROM public.ig_jobs
      WHERE status IN ('transcribed','translating')
        AND transcript_text IS NOT NULL
        AND btrim(transcript_text) <> ''
        AND (transcript_ja IS NULL OR btrim(transcript_ja) = '')
      ORDER BY updated_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public.ig_jobs j
    SET status = 'translating',
        updated_at = now(),
        error_message = NULL
    FROM picked
    WHERE j.ig_code = picked.ig_code
    RETURNING j.ig_code, picked.transcript_text;
  `, [limit]);
  return result.rows as { ig_code: string; transcript_text: string }[];
}

// n8n "Execute a SQL query3" — count remaining
async function countRemaining(): Promise<number> {
  const result = await pool.query(`
    SELECT count(*)::int AS remaining_translate
    FROM public.ig_jobs
    WHERE transcript_text IS NOT NULL
      AND btrim(transcript_text) <> ''
      AND (transcript_ja IS NULL OR btrim(transcript_ja) = '')
      AND status IN ('transcribed','translating');
  `);
  return result.rows[0].remaining_translate;
}

// Call GPT-4.1 for translation
async function translateText(transcriptText: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1',
      messages: [{ role: 'user', content: TRANSLATE_PROMPT + transcriptText }],
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GPT API error: ${response.status} ${text.slice(0, 200)}`);
  }

  const result = await response.json() as { choices: { message: { content: string } }[] };
  return result.choices[0].message.content;
}

// n8n "Code in JavaScript (normalizeText)" — text normalization
function normalizeText(text: string): string {
  return text
    .replace(/"/g, '\u201C') // fullwidth quotes for JSON safety
    .replace(/,/g, '\uFF0C') // fullwidth comma for CSV safety
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // remove control chars (keep \n, \t)
    .replace(/ {2,}/g, ' ') // collapse repeated spaces
    .replace(/\n{3,}/g, '\n\n') // collapse repeated blank lines
    .trim();
}

// n8n "Execute a SQL query2" — save Japanese translation
async function saveTranslation(igCode: string, translatedText: string): Promise<void> {
  const cleaned = normalizeText(translatedText);
  const isValid = cleaned && !['null', 'undefined'].includes(cleaned.toLowerCase());

  await pool.query(`
    UPDATE public.ig_jobs
    SET
      transcript_ja = $2,
      updated_at = now(),
      error_message = null
    WHERE ig_code = $1;
  `, [igCode, isValid ? cleaned : null]);
}

async function main() {
  const remaining = await countRemaining();
  console.log(`${remaining} jobs remaining for translation`);

  if (remaining === 0) {
    console.log('Nothing to translate.');
    await pool.end();
    return;
  }

  if (DRY_RUN) {
    const preview = await pool.query(`
      SELECT ig_code, left(transcript_text, 80) AS preview
      FROM public.ig_jobs
      WHERE status IN ('transcribed','translating')
        AND transcript_text IS NOT NULL AND btrim(transcript_text) <> ''
        AND (transcript_ja IS NULL OR btrim(transcript_ja) = '')
      ORDER BY updated_at ASC
      LIMIT $1;
    `, [LIMIT]);
    console.log(`[DRY RUN] ${preview.rows.length} jobs would be translated:`);
    for (const row of preview.rows) {
      console.log(`  ${row.ig_code}: ${row.preview}...`);
    }
    await pool.end();
    return;
  }

  console.log(`Picking up to ${LIMIT} jobs...`);
  const jobs = await pickJobs(LIMIT);
  console.log(`Found ${jobs.length} jobs`);

  if (jobs.length === 0) {
    await pool.end();
    return;
  }

  let success = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (job) => {
        try {
          const translated = await translateText(job.transcript_text);
          await saveTranslation(job.ig_code, translated);
          console.log(`[OK] ${job.ig_code}: ${translated.slice(0, 60)}...`);
          return 'success';
        } catch (err: any) {
          console.error(`[ERR] ${job.ig_code}: ${err.message}`);
          await pool.query(`UPDATE public.ig_jobs SET error_message = left($2, 500), updated_at = now() WHERE ig_code = $1`, [job.ig_code, err.message]);
          throw err;
        }
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') success++;
      else failed++;
    }
  }

  console.log(`\nDone: ${success} translated, ${failed} failed`);
  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
