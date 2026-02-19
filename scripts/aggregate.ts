import { config } from 'dotenv';
config({ path: '.env.local' });
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL!;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=disable') ? undefined : { rejectUnauthorized: false },
  statement_timeout: 120_000, // 2 min for heavy aggregations
});

const DRY_RUN = process.argv.includes('--dry-run');

// n8n "engagement_rate" — recalculate engagement_rate
async function updateEngagementRate(): Promise<number> {
  const result = await pool.query(`
    UPDATE public.ig_post_metrics
    SET engagement_rate =
      CASE
        WHEN video_view_count > 0 AND likes_count IS NOT NULL
        THEN (likes_count::double precision / video_view_count::double precision)
        ELSE NULL
      END
    WHERE engagement_rate IS NULL
       OR engagement_rate <> CASE
        WHEN video_view_count > 0 AND likes_count IS NOT NULL
        THEN (likes_count::double precision / video_view_count::double precision)
        ELSE NULL
      END;
  `);
  return result.rowCount || 0;
}

// n8n "update_owner_stats"
async function updateOwnerStats(): Promise<number> {
  const result = await pool.query(`
    INSERT INTO public.owner_stats (
      owner_id, owner_username, total_posts, transcribed, has_ja,
      posts_with_transcript, posts_with_ja,
      avg_likes, max_likes, avg_comments, avg_views, avg_plays,
      max_comments, max_views,
      first_post_date, last_post_date, first_collected_at, last_updated_at, updated_at
    )
    SELECT
      m.owner_id,
      MAX(m.owner_username) AS owner_username,
      COUNT(DISTINCT m.ig_code) AS total_posts,
      COALESCE(SUM((j.status = 'transcribed')::int), 0) AS transcribed,
      COALESCE(SUM((j.transcript_ja IS NOT NULL AND j.transcript_ja <> '')::int), 0) AS has_ja,
      COALESCE(COUNT(DISTINCT CASE WHEN j.transcript_text IS NOT NULL AND j.transcript_text <> '' THEN m.ig_code END), 0) AS posts_with_transcript,
      COALESCE(COUNT(DISTINCT CASE WHEN j.transcript_ja IS NOT NULL AND j.transcript_ja <> '' THEN m.ig_code END), 0) AS posts_with_ja,
      AVG(m.likes_count) AS avg_likes,
      MAX(m.likes_count) AS max_likes,
      AVG(m.comments_count) AS avg_comments,
      AVG(m.video_view_count) AS avg_views,
      AVG(m.video_play_count) AS avg_plays,
      MAX(m.comments_count) AS max_comments,
      MAX(m.video_view_count) AS max_views,
      MIN(m.posted_at) AS first_post_date,
      MAX(m.posted_at) AS last_post_date,
      MIN(m.fetched_at) AS first_collected_at,
      MAX(COALESCE(j.updated_at, m.fetched_at)) AS last_updated_at,
      now()
    FROM public.ig_post_metrics m
    LEFT JOIN public.ig_jobs j ON j.ig_code = m.ig_code
    WHERE m.owner_id IS NOT NULL AND m.owner_id <> ''
    GROUP BY m.owner_id
    ON CONFLICT (owner_id) DO UPDATE SET
      owner_username = EXCLUDED.owner_username,
      total_posts = EXCLUDED.total_posts,
      transcribed = EXCLUDED.transcribed,
      has_ja = EXCLUDED.has_ja,
      posts_with_transcript = EXCLUDED.posts_with_transcript,
      posts_with_ja = EXCLUDED.posts_with_ja,
      avg_likes = EXCLUDED.avg_likes,
      max_likes = EXCLUDED.max_likes,
      avg_comments = EXCLUDED.avg_comments,
      avg_views = EXCLUDED.avg_views,
      avg_plays = EXCLUDED.avg_plays,
      max_comments = EXCLUDED.max_comments,
      max_views = EXCLUDED.max_views,
      first_post_date = EXCLUDED.first_post_date,
      last_post_date = EXCLUDED.last_post_date,
      first_collected_at = EXCLUDED.first_collected_at,
      last_updated_at = EXCLUDED.last_updated_at,
      updated_at = now();
  `);
  return result.rowCount || 0;
}

// n8n "ranking_30d"
async function updateRanking30d(): Promise<number> {
  await pool.query(`TRUNCATE public.ranking_30d;`);
  const result = await pool.query(`
    INSERT INTO public.ranking_30d (
      ig_code, owner_id, owner_username,
      likes_count, video_view_count, posted_at,
      engagement_rate, total_score, updated_at
    )
    SELECT
      m.ig_code,
      m.owner_id,
      m.owner_username,
      m.likes_count,
      m.video_view_count,
      m.posted_at,
      m.engagement_rate,
      (
        m.engagement_rate
        * log(m.video_view_count + 1)
        * sqrt(m.likes_count)
      ) AS total_score,
      now()
    FROM public.ig_post_metrics m
    WHERE
      m.posted_at >= NOW() - INTERVAL '30 days'
      AND m.likes_count IS NOT NULL AND m.likes_count > 0
      AND m.video_view_count IS NOT NULL AND m.video_view_count > 0
      AND m.engagement_rate IS NOT NULL;
  `);
  return result.rowCount || 0;
}

// n8n "owner_monthly"
async function updateOwnerMonthly(): Promise<number> {
  const result = await pool.query(`
    INSERT INTO public.owner_monthly (
      owner_id, month, post_count, avg_likes, avg_comments, avg_views, updated_at
    )
    SELECT
      m.owner_id,
      DATE_TRUNC('month', m.posted_at) AS month,
      COUNT(*) AS post_count,
      AVG(m.likes_count) AS avg_likes,
      AVG(m.comments_count) AS avg_comments,
      AVG(m.video_view_count) AS avg_views,
      now()
    FROM public.ig_post_metrics m
    WHERE m.posted_at IS NOT NULL
      AND m.owner_id IS NOT NULL AND m.owner_id <> ''
    GROUP BY m.owner_id, DATE_TRUNC('month', m.posted_at)
    ON CONFLICT (owner_id, month) DO UPDATE SET
      post_count = EXCLUDED.post_count,
      avg_likes = EXCLUDED.avg_likes,
      avg_comments = EXCLUDED.avg_comments,
      avg_views = EXCLUDED.avg_views,
      updated_at = now();
  `);
  return result.rowCount || 0;
}

// n8n "Execute a SQL query" — refresh materialized views
async function refreshAnalyticsCache(): Promise<void> {
  await pool.query(`SELECT refresh_analytics_cache();`);
}

async function main() {
  if (DRY_RUN) {
    console.log('[DRY RUN] Would run: engagement_rate, owner_stats, ranking_30d, owner_monthly, refresh_analytics_cache');
    await pool.end();
    return;
  }

  console.log('Running aggregations...');

  // Run all 4 aggregations in parallel (same as n8n)
  const [erCount, osCount, r30Count, omCount] = await Promise.all([
    updateEngagementRate().then(n => { console.log(`  engagement_rate: ${n} rows updated`); return n; }),
    updateOwnerStats().then(n => { console.log(`  owner_stats: ${n} rows upserted`); return n; }),
    updateRanking30d().then(n => { console.log(`  ranking_30d: ${n} rows inserted`); return n; }),
    updateOwnerMonthly().then(n => { console.log(`  owner_monthly: ${n} rows upserted`); return n; }),
  ]);

  // Refresh materialized views
  console.log('  Refreshing analytics cache...');
  await refreshAnalyticsCache();
  console.log('  Analytics cache refreshed');

  console.log(`\nDone: engagement_rate=${erCount}, owner_stats=${osCount}, ranking_30d=${r30Count}, owner_monthly=${omCount}`);
  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
