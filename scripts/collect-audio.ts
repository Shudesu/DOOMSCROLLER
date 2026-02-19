import { config } from 'dotenv';
config({ path: '.env.local' });
import { Pool } from 'pg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const DATABASE_URL = process.env.DATABASE_URL!;
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

const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '50');
const DRY_RUN = process.argv.includes('--dry-run');

// n8n "stuck requeue" — reset stuck audio_downloading jobs
async function requeueStuck(): Promise<number> {
  const result = await pool.query(`
    WITH stuck AS (
      SELECT ig_code
      FROM public.ig_jobs
      WHERE status = 'audio_downloading'
        AND updated_at < now() - interval '1 minutes'
      ORDER BY updated_at ASC
      LIMIT 200
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public.ig_jobs j
    SET
      status = 'queued',
      updated_at = now(),
      error_message = 'requeued: audio_downloading timeout'
    FROM stuck
    WHERE j.ig_code = stuck.ig_code
    RETURNING j.ig_code;
  `);
  return result.rowCount || 0;
}

// n8n "Pick & audio_downloading" — claim jobs for download
async function pickJobs(limit: number) {
  const result = await pool.query(`
    WITH picked AS (
      SELECT ig_code, owner_id, audio_url
      FROM public.ig_jobs
      WHERE audio_url IS NOT NULL AND btrim(audio_url) <> ''
        AND (r2_key IS NULL OR btrim(r2_key) = '')
        AND status IN ('queued','awaiting_audio_url')
      ORDER BY updated_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public.ig_jobs j
    SET status = 'audio_downloading',
        updated_at = now(),
        error_message = NULL
    FROM picked
    WHERE j.ig_code = picked.ig_code
    RETURNING j.ig_code, picked.owner_id, picked.audio_url;
  `, [limit]);
  return result.rows as { ig_code: string; owner_id: string; audio_url: string }[];
}

// n8n "update" — save R2 location
async function markUploaded(igCode: string, r2Bucket: string, r2Key: string): Promise<void> {
  await pool.query(`
    UPDATE public.ig_jobs
    SET
      r2_bucket = $2,
      r2_key = $3,
      audio_saved_at = now(),
      status = 'audio_ready',
      updated_at = now(),
      error_message = null
    WHERE ig_code = $1;
  `, [igCode, r2Bucket, r2Key]);
}

// n8n "Execute a SQL query2" — reset to queued on error
async function markError(igCode: string, errorMsg: string): Promise<void> {
  await pool.query(`
    UPDATE public.ig_jobs
    SET
      status = 'queued',
      updated_at = now(),
      error_message = left(COALESCE($2, 'http download failed'), 500)
    WHERE ig_code = $1;
  `, [igCode, errorMsg]);
}

// n8n "Execute a SQL query (awaiting_audio_url)" — for jobs with missing audio_url
async function markAwaitingAudioUrl(): Promise<number> {
  const result = await pool.query(`
    UPDATE public.ig_jobs
    SET
      status = 'awaiting_audio_url',
      updated_at = now(),
      error_message = 'missing audio_url'
    WHERE status = 'queued'
      AND (audio_url IS NULL OR btrim(audio_url) = '')
      AND (r2_key IS NULL OR btrim(r2_key) = '')
    RETURNING ig_code;
  `);
  return result.rowCount || 0;
}

async function downloadAudio(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
}

async function uploadToR2(key: string, body: Buffer): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: 'audio/mpeg',
  }));
}

async function main() {
  if (DRY_RUN) {
    // Read-only preview: show what would be picked without changing status
    const preview = await pool.query(`
      SELECT ig_code, audio_url
      FROM public.ig_jobs
      WHERE audio_url IS NOT NULL AND btrim(audio_url) <> ''
        AND (r2_key IS NULL OR btrim(r2_key) = '')
        AND status IN ('queued','awaiting_audio_url')
      ORDER BY updated_at ASC
      LIMIT $1;
    `, [LIMIT]);
    console.log(`[DRY RUN] ${preview.rows.length} jobs would be processed:`);
    for (const row of preview.rows) {
      console.log(`  ${row.ig_code} → ${row.audio_url.slice(0, 80)}...`);
    }
    await pool.end();
    return;
  }

  // Requeue stuck jobs
  const requeued = await requeueStuck();
  if (requeued > 0) console.log(`Requeued ${requeued} stuck audio_downloading jobs`);

  // Mark jobs with no audio_url
  const awaiting = await markAwaitingAudioUrl();
  if (awaiting > 0) console.log(`Marked ${awaiting} jobs as awaiting_audio_url`);

  // Pick jobs
  console.log(`Picking up to ${LIMIT} jobs with audio_url...`);
  const jobs = await pickJobs(LIMIT);
  console.log(`Found ${jobs.length} jobs to process`);

  if (jobs.length === 0) {
    await pool.end();
    return;
  }

  let success = 0;
  let failed = 0;

  for (const job of jobs) {
    const r2Key = `ig/${job.ig_code}/audio.mp3`;
    try {
      console.log(`[DL] ${job.ig_code}...`);
      const audioData = await downloadAudio(job.audio_url);
      const sizeKB = (audioData.length / 1024).toFixed(0);
      console.log(`  Downloaded ${sizeKB}KB`);

      console.log(`[UP] Uploading to R2: ${r2Key}`);
      await uploadToR2(r2Key, audioData);

      await markUploaded(job.ig_code, R2_BUCKET, r2Key);
      console.log(`[OK] ${job.ig_code} done`);
      success++;
    } catch (err: any) {
      console.error(`[ERR] ${job.ig_code}: ${err.message}`);
      await markError(job.ig_code, err.message);
      failed++;
    }
  }

  console.log(`\nDone: ${success} success, ${failed} failed`);
  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
