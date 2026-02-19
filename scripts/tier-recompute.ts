import { config } from 'dotenv';
config({ path: '.env.local' });
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL!;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=disable') ? undefined : { rejectUnauthorized: false },
  statement_timeout: 60_000,
});

const DRY_RUN = process.argv.includes('--dry-run');

// n8n "Account Tier Refresh" — single massive SQL
async function recomputeTiers(): Promise<number> {
  const result = await pool.query(`
    WITH last20 AS (
      SELECT DISTINCT ON (owner_id, ig_code)
        owner_id,
        ig_code,
        video_view_count,
        video_play_count,
        posted_at
      FROM public.ig_post_metrics
      WHERE owner_id IS NOT NULL AND owner_id <> 'undefined'
      ORDER BY owner_id, ig_code, fetched_at DESC
    ),
    ranked AS (
      SELECT
        owner_id,
        video_view_count,
        video_play_count,
        posted_at,
        row_number() OVER (PARTITION BY owner_id ORDER BY posted_at DESC NULLS LAST) AS rn
      FROM last20
    ),
    agg AS (
      SELECT
        owner_id,
        COUNT(*) AS n_last20,
        AVG(video_view_count) AS avg_view_last20,
        AVG(video_play_count) AS avg_play_last20,
        MAX(posted_at) AS newest_posted_at
      FROM ranked
      WHERE rn <= 20
      GROUP BY owner_id
    ),
    decide AS (
      SELECT
        a.owner_id,
        agg.n_last20,
        agg.avg_view_last20,
        agg.avg_play_last20,
        agg.newest_posted_at,
        CASE
          WHEN agg.n_last20 IS NULL OR agg.n_last20 < 3 THEN 'watch'
          WHEN agg.avg_play_last20 >= 1000000 THEN 'active'
          WHEN agg.avg_play_last20 >= 300000  THEN 'watch'
          ELSE 'snoozed'
        END AS new_tier,
        CASE
          WHEN agg.n_last20 IS NULL OR agg.n_last20 < 3 THEN NULL
          WHEN agg.avg_play_last20 < 300000 THEN now() + interval '7 days'
          ELSE NULL
        END AS new_snooze_until
      FROM public.ig_accounts a
      LEFT JOIN agg ON agg.owner_id = a.owner_id
      WHERE a.owner_id IS NOT NULL AND a.owner_id <> 'undefined'
    )
    UPDATE public.ig_accounts a
    SET
      tier            = d.new_tier,
      snooze_until    = d.new_snooze_until,
      avg_play_last20 = d.avg_play_last20,
      avg_view_last20 = d.avg_view_last20,
      newest_posted_at = d.newest_posted_at,
      updated_at      = now()
    FROM decide d
    WHERE a.owner_id = d.owner_id;
  `);
  return result.rowCount || 0;
}

// Dry run: show what tiers would be assigned
async function previewTiers(): Promise<void> {
  const result = await pool.query(`
    WITH last20 AS (
      SELECT DISTINCT ON (owner_id, ig_code)
        owner_id, ig_code, video_play_count, posted_at
      FROM public.ig_post_metrics
      WHERE owner_id IS NOT NULL AND owner_id <> 'undefined'
      ORDER BY owner_id, ig_code, fetched_at DESC
    ),
    ranked AS (
      SELECT owner_id, video_play_count, posted_at,
        row_number() OVER (PARTITION BY owner_id ORDER BY posted_at DESC NULLS LAST) AS rn
      FROM last20
    ),
    agg AS (
      SELECT owner_id, COUNT(*) AS n, AVG(video_play_count) AS avg_play
      FROM ranked WHERE rn <= 20 GROUP BY owner_id
    )
    SELECT a.owner_id, a.username, a.tier AS current_tier,
      CASE
        WHEN agg.n IS NULL OR agg.n < 3 THEN 'watch'
        WHEN agg.avg_play >= 1000000 THEN 'active'
        WHEN agg.avg_play >= 300000  THEN 'watch'
        ELSE 'snoozed'
      END AS new_tier,
      agg.avg_play::bigint AS avg_play_last20
    FROM public.ig_accounts a
    LEFT JOIN agg ON agg.owner_id = a.owner_id
    WHERE a.owner_id IS NOT NULL AND a.owner_id <> 'undefined'
    ORDER BY agg.avg_play DESC NULLS LAST;
  `);
  console.log('[DRY RUN] Tier preview:');
  for (const row of result.rows) {
    const changed = row.current_tier !== row.new_tier ? ' ← CHANGED' : '';
    console.log(`  @${row.username || row.owner_id}: ${row.current_tier} → ${row.new_tier} (avg_play=${row.avg_play_last20 || 'N/A'})${changed}`);
  }
}

async function main() {
  if (DRY_RUN) {
    await previewTiers();
    await pool.end();
    return;
  }

  console.log('Recomputing account tiers...');
  const count = await recomputeTiers();
  console.log(`Done: ${count} accounts updated`);
  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
