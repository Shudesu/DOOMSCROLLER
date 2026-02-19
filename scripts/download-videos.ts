import { config } from 'dotenv';
config({ path: '.env.local' });
import { Pool } from 'pg';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

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

const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '10');
const DRY_RUN = process.argv.includes('--dry-run');

async function getTargetReels(limit: number) {
  // Get reels that have videoUrl in Apify data but no video_r2_key yet
  const result = await pool.query(`
    SELECT ig_code, video_url FROM (
      SELECT DISTINCT ON (j.ig_code)
        j.ig_code,
        h.payload->>'videoUrl' as video_url,
        h.fetched_at
      FROM ig_jobs j
      JOIN ig_apify_reels_raw_history h ON h.ig_code = j.ig_code
      WHERE j.video_r2_key IS NULL
        AND h.payload->>'videoUrl' IS NOT NULL
        AND h.payload->>'videoUrl' != ''
        AND h.fetched_at > now() - interval '24 hours'
      ORDER BY j.ig_code, h.fetched_at DESC
    ) sub
    ORDER BY sub.fetched_at DESC
    LIMIT $1
  `, [limit]);
  return result.rows as { ig_code: string; video_url: string }[];
}

async function downloadVideo(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    },
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function uploadToR2(key: string, body: Buffer): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: 'video/mp4',
  }));
}

async function r2Exists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function updateDb(igCode: string, r2Key: string): Promise<void> {
  await pool.query(
    'UPDATE ig_jobs SET video_r2_key = $1 WHERE ig_code = $2',
    [r2Key, igCode]
  );
}

async function main() {
  console.log(`Fetching up to ${LIMIT} reels without video_r2_key...`);
  const reels = await getTargetReels(LIMIT);
  console.log(`Found ${reels.length} reels to process`);

  if (DRY_RUN) {
    for (const reel of reels) {
      console.log(`[DRY RUN] ${reel.ig_code} → ig/${reel.ig_code}/video.mp4`);
    }
    await pool.end();
    return;
  }

  let success = 0;
  let failed = 0;

  for (const reel of reels) {
    const r2Key = `ig/${reel.ig_code}/video.mp4`;
    try {
      // Check if already in R2
      if (await r2Exists(r2Key)) {
        console.log(`[SKIP] ${reel.ig_code} already in R2, updating DB`);
        await updateDb(reel.ig_code, r2Key);
        success++;
        continue;
      }

      console.log(`[DL] ${reel.ig_code}...`);
      const videoData = await downloadVideo(reel.video_url);
      const sizeMB = (videoData.length / 1024 / 1024).toFixed(1);
      console.log(`  Downloaded ${sizeMB}MB`);

      console.log(`[UP] Uploading to R2: ${r2Key}`);
      await uploadToR2(r2Key, videoData);

      await updateDb(reel.ig_code, r2Key);
      console.log(`[OK] ${reel.ig_code} done`);
      success++;
    } catch (err: any) {
      console.error(`[ERR] ${reel.ig_code}: ${err.message}`);
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
