import { config } from 'dotenv';
config({ path: '.env.local' });
import { Pool } from 'pg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const DATABASE_URL = process.env.DATABASE_URL!;
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN!;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
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

const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// n8n "Code in JavaScript" — Extract Instagram shortcode from URL
function extractShortcode(text: string): { ok: boolean; ig_code?: string; ig_canonical_url?: string } {
  const m = text.match(/https?:\/\/(www\.)?instagram\.com\/(reel|p|tv)\/([A-Za-z0-9_-]+)/i);
  if (!m) return { ok: false };
  const code = m[3];
  return { ok: true, ig_code: code, ig_canonical_url: `https://www.instagram.com/reel/${code}/` };
}

// Telegram helpers
async function sendMessage(chatId: number, text: string): Promise<void> {
  await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

async function getUpdates(offset: number): Promise<any[]> {
  const response = await fetch(`${TG_API}/getUpdates?offset=${offset}&timeout=30`, {
    signal: AbortSignal.timeout(40_000),
  });
  if (!response.ok) throw new Error(`Telegram getUpdates error: ${response.status}`);
  const data = await response.json() as { ok: boolean; result: any[] };
  return data.result || [];
}

// n8n "Execute a SQL query" — initial ig_jobs insert (returns ig_code only if newly inserted)
async function initialJobInsert(igCode: string, canonicalUrl: string): Promise<string | null> {
  const result = await pool.query(`
    INSERT INTO public.ig_jobs (ig_code, canonical_url, status, created_at, updated_at)
    VALUES ($1, $2, 'queued', now(), now())
    ON CONFLICT (ig_code) DO UPDATE
    SET canonical_url = EXCLUDED.canonical_url,
        updated_at = now()
    RETURNING ig_code, status;
  `, [igCode, canonicalUrl]);
  return result.rows[0]?.ig_code || null;
}

// n8n "Run an Actor and get dataset" — Apify Instagram Scraper (profile posts)
async function apifyInstagramScraper(canonicalUrl: string): Promise<any[]> {
  const body = {
    addParentData: false,
    directUrls: [canonicalUrl],
    resultsLimit: 200,
    resultsType: 'posts',
    searchLimit: 1,
    searchType: 'hashtag',
  };

  const url = 'https://api.apify.com/v2/acts/shu8hvrXbJbY3Eb9W/run-sync-get-dataset-items?timeout=120';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${APIFY_API_TOKEN}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(150_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Apify Scraper error: ${response.status} ${text.slice(0, 200)}`);
  }

  const items = await response.json();
  return Array.isArray(items) ? items : [];
}

// n8n "Execute a SQL query1" — upsert ig_accounts
async function upsertAccount(ownerId: string, username: string): Promise<void> {
  await pool.query(`
    INSERT INTO public.ig_accounts (owner_id, username, updated_at, last_collected_at)
    VALUES ($1, $2, now(), NULL)
    ON CONFLICT (owner_id) DO UPDATE
    SET username = EXCLUDED.username,
        updated_at = now()
    RETURNING owner_id, username;
  `, [ownerId, username]);
}

// n8n "Run an Actor and get dataset1" — Apify Instagram Reel Scraper
async function apifyReelScraper(ownerId: string, shortCode: string): Promise<any[]> {
  const body = {
    includeDownloadedVideo: false,
    includeSharesCount: false,
    includeTranscript: false,
    resultsLimit: 15,
    skipPinnedPosts: true,
    username: [ownerId, `reel/${shortCode}`],
  };

  const url = 'https://api.apify.com/v2/acts/xMc5Ga1oCONPmWJIa/run-sync-get-dataset-items?timeout=120';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${APIFY_API_TOKEN}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(150_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Apify Reel Scraper error: ${response.status} ${text.slice(0, 200)}`);
  }

  const items = await response.json();
  return Array.isArray(items) ? items : [];
}

// n8n "ig_post_metrics UPSERT"
async function upsertMetrics(item: {
  ig_code: string; owner_id: string; owner_username: string; owner_full_name: string;
  likes_count: number | null; comments_count: number; video_view_count: number;
  video_play_count: number; video_duration_sec: number; posted_at: string | null;
  fetched_at: string;
}): Promise<void> {
  await pool.query(`
    INSERT INTO public.ig_post_metrics (
      ig_code, owner_id, owner_username, owner_full_name,
      likes_count, comments_count, video_view_count, video_play_count,
      video_duration_sec, posted_at, fetched_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
    ON CONFLICT (ig_code) DO UPDATE SET
      owner_id = EXCLUDED.owner_id,
      owner_username = EXCLUDED.owner_username,
      owner_full_name = EXCLUDED.owner_full_name,
      likes_count = EXCLUDED.likes_count,
      comments_count = EXCLUDED.comments_count,
      video_view_count = EXCLUDED.video_view_count,
      video_play_count = EXCLUDED.video_play_count,
      video_duration_sec = EXCLUDED.video_duration_sec,
      posted_at = EXCLUDED.posted_at,
      fetched_at = EXCLUDED.fetched_at,
      updated_at = now();
  `, [
    item.ig_code, item.owner_id, item.owner_username, item.owner_full_name,
    item.likes_count, item.comments_count, item.video_view_count, item.video_play_count,
    item.video_duration_sec, item.posted_at || null, item.fetched_at,
  ]);
}

// n8n "ig_jobs（queued）" — upsert job with owner_id
async function upsertJobQueued(igCode: string, ownerId: string): Promise<void> {
  await pool.query(`
    INSERT INTO public.ig_jobs (ig_code, canonical_url, owner_id, status, created_at, updated_at)
    VALUES ($1, 'https://www.instagram.com/reel/' || $1 || '/', $2, 'queued', now(), now())
    ON CONFLICT (ig_code) DO UPDATE SET
      canonical_url = EXCLUDED.canonical_url,
      owner_id = EXCLUDED.owner_id,
      updated_at = now()
    RETURNING ig_code, owner_id, status;
  `, [igCode, ownerId]);
}

// n8n "audio_url" — update audio_url on ig_jobs
async function updateAudioUrl(igCode: string, audioUrl: string): Promise<void> {
  await pool.query(`
    UPDATE public.ig_jobs SET audio_url = $2, updated_at = now() WHERE ig_code = $1;
  `, [igCode, audioUrl]);
}

// n8n "HTTP Request" + "Upload a file1" + "Edit Fields" + "update"
async function downloadAndUploadAudio(igCode: string, audioUrl: string): Promise<boolean> {
  try {
    const response = await fetch(audioUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) return false;

    const audioData = Buffer.from(await response.arrayBuffer());
    const r2Key = `ig/${igCode}/audio.mp3`;

    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      Body: audioData,
      ContentType: 'audio/mpeg',
    }));

    await pool.query(`
      UPDATE public.ig_jobs SET
        r2_bucket = $2, r2_key = $3, updated_at = now(), error_message = NULL
      WHERE ig_code = $1;
    `, [igCode, R2_BUCKET, r2Key]);

    return true;
  } catch (err: any) {
    console.error(`[Audio] ${igCode}: ${err.message}`);
    return false;
  }
}

// Process a single Instagram URL (mirrors full n8n flow)
async function processReelUrl(chatId: number, text: string): Promise<void> {
  // Step 1: Extract shortcode
  const parsed = extractShortcode(text);
  if (!parsed.ok || !parsed.ig_code) return;

  const igCode = parsed.ig_code;
  const canonicalUrl = parsed.ig_canonical_url!;

  // Step 2: Initial ig_jobs insert
  const insertedCode = await initialJobInsert(igCode, canonicalUrl);
  if (!insertedCode) {
    // n8n "If" false → already processed
    await sendMessage(chatId, '処理済みのためスキップされました');
    return;
  }

  console.log(`[START] ${igCode}`);

  // Step 3: Apify Instagram Scraper (get profile data + ownerId/ownerUsername)
  let scraperItems: any[];
  try {
    scraperItems = await apifyInstagramScraper(canonicalUrl);
  } catch (err: any) {
    console.error(`[Scraper] ${igCode}: ${err.message}`);
    await sendMessage(chatId, `Apify Scraper error: ${err.message}`);
    return;
  }

  if (scraperItems.length === 0 || scraperItems[0].error) {
    await sendMessage(chatId, `No data from Apify for ${igCode}`);
    return;
  }

  const firstItem = scraperItems[0];
  const ownerId = firstItem.ownerId;
  const ownerUsername = firstItem.ownerUsername;

  if (!ownerId || !ownerUsername) {
    await sendMessage(chatId, `Missing owner data for ${igCode}`);
    return;
  }

  // Step 4: Upsert ig_accounts
  await upsertAccount(ownerId, ownerUsername);

  // Step 5: Apify Reel Scraper (detailed reel info including audioUrl)
  let reelItems: any[];
  try {
    reelItems = await apifyReelScraper(ownerId, firstItem.shortCode || igCode);
  } catch (err: any) {
    console.error(`[ReelScraper] ${igCode}: ${err.message}`);
    await sendMessage(chatId, `Reel Scraper error: ${err.message}`);
    return;
  }

  // n8n "Edit Fields1" — normalize fields from reel scraper result
  // Use first item that matches our shortcode, or fall back to first item
  const reelItem = reelItems.find(r => r.shortCode === igCode) || reelItems[0];
  if (!reelItem) {
    await sendMessage(chatId, `No reel data for ${igCode}`);
    return;
  }

  const normalized = {
    ig_code: reelItem.shortCode || igCode,
    owner_id: reelItem.ownerId || ownerId,
    owner_username: reelItem.ownerUsername || ownerUsername,
    owner_full_name: reelItem.ownerFullName || '',
    audio_url: reelItem.audioUrl || null,
    likes_count: reelItem.likesCount === -1 ? null : Number(reelItem.likesCount || 0),
    comments_count: Number(reelItem.commentsCount || 0),
    video_view_count: Number(reelItem.videoViewCount || 0),
    video_play_count: Number(reelItem.videoPlayCount || 0),
    video_duration_sec: Number(reelItem.videoDuration || 0),
    posted_at: reelItem.timestamp || null,
    fetched_at: new Date().toISOString(),
  };

  // n8n "If1" — validate: ig_code/owner_id not empty/undefined, owner matches, audio_url not null
  const isValid =
    normalized.ig_code && normalized.ig_code !== 'undefined' &&
    normalized.owner_id && normalized.owner_id !== 'undefined' &&
    normalized.owner_id === ownerId &&
    normalized.audio_url && normalized.audio_url !== 'null';

  if (!isValid) {
    console.log(`[SKIP] ${igCode}: validation failed (owner_id=${normalized.owner_id}, audio=${normalized.audio_url})`);
    await sendMessage(chatId, `Registered ${igCode} but audio not available`);
    return;
  }

  // Step 6: Parallel — ig_post_metrics UPSERT + ig_jobs（queued） + audio_url update
  await Promise.all([
    upsertMetrics(normalized),
    upsertJobQueued(normalized.ig_code, normalized.owner_id),
    updateAudioUrl(normalized.ig_code, normalized.audio_url!),
  ]);

  // Step 7: Download audio → R2 upload → update ig_jobs
  const audioUploaded = await downloadAndUploadAudio(normalized.ig_code, normalized.audio_url!);

  const msg = [
    `<b>${normalized.ig_code}</b> registered`,
    `@${normalized.owner_username}`,
    `Views: ${normalized.video_view_count} | Likes: ${normalized.likes_count ?? '?'}`,
    audioUploaded ? 'Audio: uploaded' : 'Audio: queued for retry',
  ].join('\n');

  await sendMessage(chatId, msg);
  console.log(`[OK] ${normalized.ig_code} @${normalized.owner_username} views=${normalized.video_view_count} audio=${audioUploaded}`);
}

// Main long polling loop
async function main() {
  console.log('DOOMSCROLL Bot starting (long polling)...');

  // Delete any existing webhook so long polling works
  await fetch(`${TG_API}/deleteWebhook`);

  let offset = 0;
  let running = true;
  process.on('SIGTERM', () => { running = false; console.log('SIGTERM received, shutting down...'); });
  process.on('SIGINT', () => { running = false; console.log('SIGINT received, shutting down...'); });

  while (running) {
    try {
      const updates = await getUpdates(offset);

      for (const update of updates) {
        offset = update.update_id + 1;
        const message = update.message;
        if (!message?.text) continue;

        const chatId = message.chat.id;
        const text = message.text.trim();

        if (text === '/start') {
          await sendMessage(chatId, 'Instagram Reel URLを送ってください。');
          continue;
        }

        const parsed = extractShortcode(text);
        if (!parsed.ok) continue;

        // Process async (don't block polling loop)
        processReelUrl(chatId, text).catch(err => {
          console.error(`[ERR] ${parsed.ig_code}: ${err.message}`);
          sendMessage(chatId, `Error: ${err.message}`).catch(() => {});
        });
      }
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') continue;
      console.error(`[POLL ERR] ${err.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log('Bot stopped.');
  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
