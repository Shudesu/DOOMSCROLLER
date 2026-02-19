import { config } from 'dotenv';
config({ path: '.env.local' });
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL!;
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN!;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=disable') ? undefined : { rejectUnauthorized: false },
});

const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '20');
const DRY_RUN = process.argv.includes('--dry-run');

interface AccountRow {
  owner_id: string;
  username: string;
  profile_url: string;
  tier: string;
  results_limit: number;
  newest_posted_at: string;
  last_fetched_at: string;
  last_collected_at: string | null;
}

// n8n "Execute a SQL query" — tier/snooze/last_collected_at考慮で対象アカウント選定
async function getTargetAccounts(limit: number): Promise<AccountRow[]> {
  const result = await pool.query(`
    WITH newest_posted AS (
      SELECT DISTINCT ON (owner_id)
        owner_id,
        posted_at AS newest_posted_at
      FROM public.ig_post_metrics
      WHERE owner_id IS NOT NULL
        AND owner_id <> 'undefined'
      ORDER BY owner_id, posted_at DESC
    ),
    newest_fetched AS (
      SELECT DISTINCT ON (owner_id)
        owner_id,
        fetched_at AS last_fetched_at
      FROM public.ig_post_metrics
      WHERE owner_id IS NOT NULL
        AND owner_id <> 'undefined'
      ORDER BY owner_id, fetched_at DESC
    )
    SELECT
      a.owner_id,
      a.username,
      COALESCE(
        a.canonical_url,
        'https://www.instagram.com/' || a.username || '/'
      ) AS profile_url,
      a.tier,
      CASE
        WHEN a.tier = 'active' THEN 5
        WHEN a.tier = 'watch'  THEN 5
        ELSE 3
      END AS results_limit,
      COALESCE(np.newest_posted_at, '1970-01-01'::timestamptz) AS newest_posted_at,
      COALESCE(nf.last_fetched_at,  '1970-01-01'::timestamptz) AS last_fetched_at,
      a.last_collected_at
    FROM public.ig_accounts a
    LEFT JOIN newest_posted  np ON np.owner_id = a.owner_id
    LEFT JOIN newest_fetched nf ON nf.owner_id = a.owner_id
    WHERE
      a.owner_id IS NOT NULL
      AND a.owner_id <> 'undefined'
      AND a.username IS NOT NULL
      AND COALESCE(a.scrape_status, 'active') NOT IN ('no_items', 'disabled')
      AND (
        a.tier IN ('active', 'watch')
        OR (
          a.tier = 'snoozed'
          AND a.snooze_until IS NOT NULL
          AND a.snooze_until <= now()
        )
      )
      AND (
        np.newest_posted_at IS NULL
        OR np.newest_posted_at <= now() - interval '60 hours'
      )
    ORDER BY
      CASE
        WHEN a.tier = 'active' THEN 0
        WHEN a.tier = 'watch'  THEN 1
        WHEN a.tier = 'snoozed' THEN 2
        ELSE 9
      END ASC,
      COALESCE(a.last_collected_at, '1970-01-01'::timestamptz) ASC,
      COALESCE(nf.last_fetched_at,  '1970-01-01'::timestamptz) ASC
    LIMIT $1;
  `, [limit]);
  return result.rows;
}

// n8n "APIFY" node — Apify Instagram Scraper でReels取得
async function fetchReels(account: AccountRow): Promise<any[]> {
  const onlyPostsNewerThan = account.last_collected_at
    ? new Date(new Date(account.last_collected_at).getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : '1970-01-01';

  const body = {
    addParentData: false,
    directUrls: [account.profile_url],
    onlyPostsNewerThan,
    resultsLimit: Math.max(account.results_limit, 5),
    resultsType: 'reels',
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
    signal: AbortSignal.timeout(150_000), // 150s client timeout (Apify 120s + buffer)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Apify API error: ${response.status} ${response.statusText} ${text.slice(0, 200)}`);
  }

  const items = await response.json();
  if (!Array.isArray(items)) {
    throw new Error(`Apify returned non-array: ${JSON.stringify(items).slice(0, 200)}`);
  }
  return items;
}

// n8n "Upsert Reel Raw, Latest Metrics, and Job Queue" — 3テーブル一括CTE
async function upsertReel(item: any): Promise<{ inserted_raw: number; upserted_metrics: number; upserted_job: number }> {
  const result = await pool.query(`
    WITH inserted AS (
      INSERT INTO public.ig_apify_reels_raw_history (
        ig_code, owner_id, owner_username, posted_at,
        likes_count, comments_count, video_view_count, video_play_count, video_duration_sec,
        payload, fetched_at, apify_actor_id
      )
      VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9,
        $10::jsonb,
        COALESCE($11, now()),
        'shu8hvrXbJbY3Eb9W'
      )
      RETURNING
        ig_code, owner_id, owner_username, posted_at,
        likes_count, comments_count, video_view_count, video_play_count, video_duration_sec,
        fetched_at, apify_actor_id
    ),
    upsert_metrics AS (
      INSERT INTO public.ig_post_metrics (
        ig_code, owner_id, owner_username, posted_at,
        likes_count, comments_count, video_view_count, video_play_count, video_duration_sec,
        fetched_at, updated_at, engagement_rate
      )
      SELECT
        ig_code,
        owner_id,
        owner_username,
        posted_at,
        likes_count,
        comments_count,
        video_view_count,
        video_play_count,
        video_duration_sec::numeric,
        fetched_at,
        now(),
        CASE
          WHEN video_view_count IS NOT NULL AND video_view_count > 0
          THEN (likes_count::numeric + COALESCE(comments_count, 0)::numeric) / video_view_count::numeric
          ELSE NULL
        END
      FROM inserted
      ON CONFLICT (ig_code) DO UPDATE
      SET
        owner_id = EXCLUDED.owner_id,
        owner_username = EXCLUDED.owner_username,
        posted_at = EXCLUDED.posted_at,
        likes_count = EXCLUDED.likes_count,
        comments_count = EXCLUDED.comments_count,
        video_view_count = EXCLUDED.video_view_count,
        video_play_count = EXCLUDED.video_play_count,
        video_duration_sec = EXCLUDED.video_duration_sec,
        fetched_at = EXCLUDED.fetched_at,
        updated_at = now(),
        engagement_rate = EXCLUDED.engagement_rate
      RETURNING ig_code
    ),
    upsert_job AS (
      INSERT INTO public.ig_jobs (
        ig_code,
        canonical_url,
        owner_id,
        apify_actor_id,
        status,
        updated_at
      )
      SELECT
        i.ig_code,
        'https://www.instagram.com/reel/' || i.ig_code || '/',
        i.owner_id,
        i.apify_actor_id,
        'queued',
        now()
      FROM inserted i
      ON CONFLICT (ig_code) DO UPDATE
      SET
        owner_id = COALESCE(EXCLUDED.owner_id, public.ig_jobs.owner_id),
        apify_actor_id = EXCLUDED.apify_actor_id,
        updated_at = now()
      WHERE public.ig_jobs.status IN ('queued','awaiting_audio_url')
      RETURNING ig_code
    )
    SELECT
      (SELECT count(*) FROM inserted)       AS inserted_raw,
      (SELECT count(*) FROM upsert_metrics) AS upserted_metrics,
      (SELECT count(*) FROM upsert_job)     AS upserted_job;
  `, [
    item.shortCode,          // $1
    item.ownerId,            // $2
    item.ownerUsername,       // $3
    item.timestamp || null, // $4 — ISO string from Apify
    item.likesCount ?? null, // $5
    item.commentsCount ?? null, // $6
    item.videoViewCount ?? null, // $7
    item.videoPlayCount ?? null, // $8
    item.videoDuration ?? null,  // $9
    JSON.stringify(item),    // $10
    new Date().toISOString(), // $11
  ]);
  return result.rows[0];
}

// n8n "audioUrl（payload→jobs）" — payloadのaudioUrlをig_jobsに反映
async function updateAudioUrl(igCode: string): Promise<void> {
  await pool.query(`
    WITH latest_raw AS (
      SELECT DISTINCT ON (h.ig_code)
        h.ig_code,
        h.payload,
        h.fetched_at
      FROM public.ig_apify_reels_raw_history h
      WHERE h.ig_code = $1
      ORDER BY h.ig_code, h.fetched_at DESC
    )
    UPDATE public.ig_jobs j
    SET
      audio_url = (r.payload->>'audioUrl'),
      updated_at = now(),
      error_message = NULL
    FROM latest_raw r
    WHERE j.ig_code = r.ig_code
      AND (j.audio_url IS NULL OR btrim(j.audio_url) = '')
      AND (r.payload->>'audioUrl') IS NOT NULL
      AND btrim(r.payload->>'audioUrl') <> '';
  `, [igCode]);
}

// n8n "last_collected_at" — アカウントの最終収集時刻を更新
async function updateLastCollectedAt(ownerId: string): Promise<void> {
  await pool.query(`
    WITH ensured AS (
      INSERT INTO public.ig_accounts (owner_id, created_at, updated_at)
      VALUES ($1, now(), now())
      ON CONFLICT (owner_id) DO UPDATE
        SET updated_at = EXCLUDED.updated_at
      RETURNING owner_id
    )
    UPDATE public.ig_accounts
    SET
      last_collected_at = now(),
      updated_at = now(),
      error_message = NULL
    WHERE owner_id = (SELECT owner_id FROM ensured);
  `, [ownerId]);
}

// n8n "no_item_update" — エラー/0件時にscrape_statusを更新
async function markNoItems(ownerId: string): Promise<void> {
  await pool.query(`
    UPDATE public.ig_accounts
    SET
      scrape_status = 'no_items',
      scrape_error_code = 'apify_no_items',
      scrape_error_at = now(),
      updated_at = now()
    WHERE owner_id = $1;
  `, [ownerId]);
}

async function main() {
  console.log(`Fetching up to ${LIMIT} accounts to collect...`);
  const accounts = await getTargetAccounts(LIMIT);
  console.log(`Found ${accounts.length} accounts`);

  if (accounts.length === 0) {
    console.log('No accounts to process.');
    await pool.end();
    return;
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Target accounts:');
    for (const acc of accounts) {
      console.log(`  ${acc.username} (${acc.owner_id}) tier=${acc.tier} limit=${acc.results_limit} last_collected=${acc.last_collected_at || 'never'}`);
    }
    await pool.end();
    return;
  }

  let totalReels = 0;
  let accountsProcessed = 0;
  let accountsError = 0;

  for (const acc of accounts) {
    console.log(`\n[${accountsProcessed + 1}/${accounts.length}] @${acc.username} (tier=${acc.tier})`);

    try {
      const items = await fetchReels(acc);

      // n8n "If" node: error check — Apify returns items with error field, or empty array
      const hasError = items.length > 0 && items[0].error;
      if (hasError || items.length === 0) {
        const reason = hasError ? `error: ${items[0].error}` : 'no items returned';
        console.log(`  → ${reason}, marking as no_items`);
        await markNoItems(acc.owner_id);
        accountsError++;
        continue;
      }

      console.log(`  → ${items.length} reels found`);

      // Process each reel
      for (const item of items) {
        if (!item.shortCode) {
          console.log(`  [SKIP] item missing shortCode`);
          continue;
        }
        try {
          const counts = await upsertReel(item);
          console.log(`  [OK] ${item.shortCode}: raw=${counts.inserted_raw} metrics=${counts.upserted_metrics} job=${counts.upserted_job}`);

          // Update audio_url from payload
          await updateAudioUrl(item.shortCode);
          totalReels++;
        } catch (err: any) {
          // Duplicate key errors are expected (unique constraint on apify_run_id + ig_code)
          if (err.code === '23505') {
            console.log(`  [DUP] ${item.shortCode} already exists`);
          } else {
            console.error(`  [ERR] ${item.shortCode}: ${err.message}`);
          }
        }
      }

      // Update last_collected_at
      await updateLastCollectedAt(acc.owner_id);
      accountsProcessed++;

    } catch (err: any) {
      console.error(`  [ERR] Apify call failed: ${err.message}`);
      accountsError++;
    }
  }

  console.log(`\nDone: ${accountsProcessed} accounts processed, ${accountsError} errors, ${totalReels} reels upserted`);
  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
