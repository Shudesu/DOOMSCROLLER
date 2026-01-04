-- ============================================
-- データベース不整合診断クエリ
-- ============================================

-- ============================================
-- A. テーブル基本統計
-- ============================================

-- 1. 全テーブルの行数とサイズ
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = schemaname AND table_name = tablename) as exists
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 2. 各テーブルの行数（実際のカウント）
SELECT 
    'ig_accounts' as table_name,
    COUNT(*) as row_count,
    COUNT(*) FILTER (WHERE owner_id IS NULL) as null_owner_id,
    COUNT(*) FILTER (WHERE last_collected_at IS NULL) as null_last_collected_at,
    MAX(updated_at) as last_updated_at
FROM public.ig_accounts
UNION ALL
SELECT 
    'ig_jobs' as table_name,
    COUNT(*) as row_count,
    COUNT(*) FILTER (WHERE owner_id IS NULL) as null_owner_id,
    COUNT(*) FILTER (WHERE transcribed_at IS NULL) as null_transcribed_at,
    MAX(updated_at) as last_updated_at
FROM public.ig_jobs
UNION ALL
SELECT 
    'ig_post_metrics' as table_name,
    COUNT(*) as row_count,
    COUNT(*) FILTER (WHERE owner_id IS NULL) as null_owner_id,
    COUNT(*) FILTER (WHERE posted_at IS NULL) as null_posted_at,
    MAX(updated_at) as last_updated_at
FROM public.ig_post_metrics
UNION ALL
SELECT 
    'ig_apify_reels_raw_history' as table_name,
    COUNT(*) as row_count,
    COUNT(*) FILTER (WHERE owner_id IS NULL) as null_owner_id,
    COUNT(*) FILTER (WHERE fetched_at IS NULL) as null_fetched_at,
    MAX(fetched_at) as last_updated_at
FROM public.ig_apify_reels_raw_history
UNION ALL
SELECT 
    'ig_apify_reels_raw_latest' as table_name,
    COUNT(*) as row_count,
    COUNT(*) FILTER (WHERE owner_id IS NULL) as null_owner_id,
    COUNT(*) FILTER (WHERE fetched_at IS NULL) as null_fetched_at,
    MAX(updated_at) as last_updated_at
FROM public.ig_apify_reels_raw_latest
UNION ALL
SELECT 
    'owner_stats' as table_name,
    COUNT(*) as row_count,
    0 as null_owner_id,
    COUNT(*) FILTER (WHERE last_updated_at IS NULL) as null_last_updated_at,
    MAX(updated_at) as last_updated_at
FROM public.owner_stats
UNION ALL
SELECT 
    'owner_monthly' as table_name,
    COUNT(*) as row_count,
    0 as null_owner_id,
    COUNT(*) FILTER (WHERE updated_at IS NULL) as null_updated_at,
    MAX(updated_at) as last_updated_at
FROM public.owner_monthly
UNION ALL
SELECT 
    'ranking_30d' as table_name,
    COUNT(*) as row_count,
    COUNT(*) FILTER (WHERE owner_id IS NULL) as null_owner_id,
    COUNT(*) FILTER (WHERE posted_at IS NULL) as null_posted_at,
    MAX(updated_at) as last_updated_at
FROM public.ranking_30d
UNION ALL
SELECT 
    'favorites' as table_name,
    COUNT(*) as row_count,
    COUNT(*) FILTER (WHERE user_id IS NULL) as null_user_id,
    COUNT(*) FILTER (WHERE ig_code IS NULL) as null_ig_code,
    MAX(created_at) as last_updated_at
FROM public.favorites
UNION ALL
SELECT 
    'embedding_cursor' as table_name,
    COUNT(*) as row_count,
    0 as null_owner_id,
    COUNT(*) FILTER (WHERE last_updated_at IS NULL) as null_last_updated_at,
    MAX(updated_at) as last_updated_at
FROM public.embedding_cursor
ORDER BY table_name;

-- 3. ig_jobsテーブルのスキーマ確認
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'ig_jobs'
ORDER BY ordinal_position;

-- 2. 各owner_idごとのstatus値の分布
SELECT 
    owner_id,
    status,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY owner_id), 2) as percentage
FROM public.ig_jobs
WHERE owner_id IS NOT NULL AND owner_id <> ''
GROUP BY owner_id, status
ORDER BY owner_id, status;

-- 3. transcribed状態でないレコードの詳細（問題のあるレコード）
SELECT 
    owner_id,
    ig_code,
    status,
    transcript_text IS NOT NULL as has_transcript_text,
    transcript_ja IS NOT NULL AND transcript_ja <> '' as has_transcript_ja,
    transcribed_at,
    updated_at
FROM public.ig_jobs
WHERE owner_id IS NOT NULL 
  AND owner_id <> ''
  AND status != 'transcribed'
ORDER BY owner_id, updated_at DESC;

-- 4. 各owner_idごとの集計（現在のAPIと同じロジック）
SELECT
    owner_id,
    COUNT(*) as total,
    SUM((status = 'transcribed')::int) as transcribed,
    SUM((transcript_ja IS NOT NULL AND transcript_ja <> '')::int) as has_ja,
    COUNT(*) - SUM((status = 'transcribed')::int) as not_transcribed_count,
    SUM((status = 'transcribed')::int) - SUM((transcript_ja IS NOT NULL AND transcript_ja <> '')::int) as transcribed_but_no_ja
FROM public.ig_jobs
WHERE owner_id IS NOT NULL AND owner_id <> ''
GROUP BY owner_id
HAVING COUNT(*) != SUM((status = 'transcribed')::int)  -- 不整合があるowner_idのみ
ORDER BY not_transcribed_count DESC;

-- 5. transcript_jaがNULLまたは空のtranscribedレコード
SELECT 
    owner_id,
    ig_code,
    status,
    CASE 
        WHEN transcript_ja IS NULL THEN 'NULL'
        WHEN transcript_ja = '' THEN 'EMPTY'
        ELSE 'HAS_VALUE'
    END as transcript_ja_status,
    LENGTH(transcript_ja) as transcript_ja_length,
    updated_at
FROM public.ig_jobs
WHERE owner_id IS NOT NULL 
  AND owner_id <> ''
  AND status = 'transcribed'
  AND (transcript_ja IS NULL OR transcript_ja = '')
ORDER BY owner_id, updated_at DESC;

-- 6. 最近更新されたレコードの状態（更新履歴の確認）
SELECT 
    owner_id,
    ig_code,
    status,
    transcript_ja IS NOT NULL AND transcript_ja <> '' as has_ja,
    updated_at,
    transcribed_at
FROM public.ig_jobs
WHERE owner_id IS NOT NULL 
  AND owner_id <> ''
  AND updated_at >= NOW() - INTERVAL '7 days'
ORDER BY updated_at DESC
LIMIT 50;

-- 7. 各owner_idの不整合サマリー
SELECT 
    owner_id,
    COUNT(*) as total,
    SUM((status = 'transcribed')::int) as transcribed_count,
    COUNT(*) - SUM((status = 'transcribed')::int) as not_transcribed_count,
    SUM((status = 'transcribed')::int) - SUM((transcript_ja IS NOT NULL AND transcript_ja <> '')::int) as transcribed_but_no_ja_count,
    STRING_AGG(DISTINCT status, ', ' ORDER BY status) as statuses_present
FROM public.ig_jobs
WHERE owner_id IS NOT NULL AND owner_id <> ''
GROUP BY owner_id
HAVING COUNT(*) != SUM((status = 'transcribed')::int) 
    OR SUM((status = 'transcribed')::int) != SUM((transcript_ja IS NOT NULL AND transcript_ja <> '')::int)
ORDER BY not_transcribed_count DESC, transcribed_but_no_ja_count DESC;

-- ============================================
-- B. テーブル間整合性チェック
-- ============================================

-- 8. favorites.ig_code が ig_jobs に存在しないレコード
SELECT 
    f.user_id,
    f.ig_code,
    f.created_at
FROM public.favorites f
LEFT JOIN public.ig_jobs j ON f.ig_code = j.ig_code
WHERE j.ig_code IS NULL;

-- 9. ig_jobs.owner_id が ig_accounts に存在しないレコード
SELECT 
    j.ig_code,
    j.owner_id,
    j.status,
    j.updated_at
FROM public.ig_jobs j
LEFT JOIN public.ig_accounts a ON j.owner_id = a.owner_id
WHERE j.owner_id IS NOT NULL 
  AND j.owner_id <> ''
  AND a.owner_id IS NULL;

-- 10. ig_post_metrics.ig_code が ig_jobs に存在しないレコード
SELECT 
    m.ig_code,
    m.owner_id,
    m.posted_at,
    m.updated_at
FROM public.ig_post_metrics m
LEFT JOIN public.ig_jobs j ON m.ig_code = j.ig_code
WHERE j.ig_code IS NULL
LIMIT 100;

-- 11. ig_jobs.ig_code が ig_post_metrics に存在しないレコード
SELECT 
    j.ig_code,
    j.owner_id,
    j.status,
    j.updated_at
FROM public.ig_jobs j
LEFT JOIN public.ig_post_metrics m ON j.ig_code = m.ig_code
WHERE m.ig_code IS NULL
  AND j.owner_id IS NOT NULL
LIMIT 100;

-- 12. owner_stats と実際のデータの整合性チェック
SELECT 
    s.owner_id,
    s.total_posts as stats_total,
    (SELECT COUNT(*) FROM public.ig_jobs WHERE owner_id = s.owner_id) as actual_total,
    s.transcribed as stats_transcribed,
    (SELECT COUNT(*) FROM public.ig_jobs WHERE owner_id = s.owner_id AND status = 'transcribed') as actual_transcribed,
    s.posts_with_ja as stats_has_ja,
    (SELECT COUNT(*) FROM public.ig_jobs WHERE owner_id = s.owner_id AND transcript_ja IS NOT NULL AND transcript_ja <> '') as actual_has_ja,
    ABS(s.total_posts - (SELECT COUNT(*) FROM public.ig_jobs WHERE owner_id = s.owner_id)) as total_diff,
    ABS(s.transcribed - (SELECT COUNT(*) FROM public.ig_jobs WHERE owner_id = s.owner_id AND status = 'transcribed')) as transcribed_diff
FROM public.owner_stats s
WHERE ABS(s.total_posts - (SELECT COUNT(*) FROM public.ig_jobs WHERE owner_id = s.owner_id)) > 0
   OR ABS(s.transcribed - (SELECT COUNT(*) FROM public.ig_jobs WHERE owner_id = s.owner_id AND status = 'transcribed')) > 0
ORDER BY total_diff DESC, transcribed_diff DESC
LIMIT 50;

-- ============================================
-- C. データ鮮度チェック
-- ============================================

-- 13. 各テーブルの最新更新日時サマリー
SELECT 
    'ig_accounts' as table_name,
    MAX(updated_at) as last_updated,
    MIN(updated_at) as first_updated,
    COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '30 days') as stale_count_30d,
    COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '7 days') as stale_count_7d
FROM public.ig_accounts
UNION ALL
SELECT 
    'ig_jobs' as table_name,
    MAX(updated_at) as last_updated,
    MIN(updated_at) as first_updated,
    COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '30 days') as stale_count_30d,
    COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '7 days') as stale_count_7d
FROM public.ig_jobs
UNION ALL
SELECT 
    'ig_post_metrics' as table_name,
    MAX(updated_at) as last_updated,
    MIN(updated_at) as first_updated,
    COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '30 days') as stale_count_30d,
    COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '7 days') as stale_count_7d
FROM public.ig_post_metrics
UNION ALL
SELECT 
    'owner_stats' as table_name,
    MAX(updated_at) as last_updated,
    MIN(updated_at) as first_updated,
    COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '30 days') as stale_count_30d,
    COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '7 days') as stale_count_7d
FROM public.owner_stats
ORDER BY table_name;

-- 14. ig_accounts の last_collected_at が古いアカウント
SELECT 
    owner_id,
    username,
    last_collected_at,
    NOW() - last_collected_at as age,
    CASE 
        WHEN last_collected_at < NOW() - INTERVAL '30 days' THEN 'CRITICAL'
        WHEN last_collected_at < NOW() - INTERVAL '7 days' THEN 'WARNING'
        ELSE 'OK'
    END as status
FROM public.ig_accounts
WHERE last_collected_at IS NOT NULL
  AND last_collected_at < NOW() - INTERVAL '7 days'
ORDER BY last_collected_at ASC
LIMIT 50;

-- 15. 30日以上更新されていない ig_jobs レコード
SELECT 
    owner_id,
    COUNT(*) as stale_count,
    MIN(updated_at) as oldest_update,
    MAX(updated_at) as newest_update,
    STRING_AGG(DISTINCT status, ', ' ORDER BY status) as statuses
FROM public.ig_jobs
WHERE updated_at < NOW() - INTERVAL '30 days'
  AND owner_id IS NOT NULL
GROUP BY owner_id
ORDER BY stale_count DESC
LIMIT 20;

-- ============================================
-- D. マテリアライズドビューの状態
-- ============================================

-- 16. マテリアライズドビューの存在と行数確認
SELECT 
    schemaname,
    matviewname,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) AS size,
    (SELECT COUNT(*) FROM pg_class WHERE relname = matviewname) as exists
FROM pg_matviews
WHERE schemaname = 'public'
ORDER BY matviewname;

-- 17. owner_time_series_cache の状態と整合性
SELECT 
    'owner_time_series_cache' as view_name,
    COUNT(*) as row_count,
    COUNT(DISTINCT owner_id) as unique_owners,
    MIN(month) as earliest_month,
    MAX(month) as latest_month,
    COUNT(*) FILTER (WHERE post_count IS NULL) as null_post_count,
    COUNT(*) FILTER (WHERE avg_likes IS NULL) as null_avg_likes
FROM public.owner_time_series_cache;

-- 18. owner_top_posts_cache の状態と整合性
SELECT 
    'owner_top_posts_cache' as view_name,
    COUNT(*) as row_count,
    COUNT(DISTINCT owner_id) as unique_owners,
    COUNT(*) FILTER (WHERE has_transcript = false) as without_transcript,
    COUNT(*) FILTER (WHERE has_ja = false) as without_ja,
    AVG(rank_by_likes) as avg_rank
FROM public.owner_top_posts_cache;

-- 19. owner_transcripts_cache の状態と整合性
SELECT 
    'owner_transcripts_cache' as view_name,
    COUNT(*) as row_count,
    COUNT(DISTINCT owner_id) as unique_owners,
    COUNT(*) FILTER (WHERE transcript_text IS NULL OR transcript_text = '') as empty_transcripts,
    AVG(LENGTH(transcript_text)) as avg_transcript_length
FROM public.owner_transcripts_cache;

-- 20. マテリアライズドビューと元テーブルの整合性チェック（owner_time_series_cache）
SELECT 
    'owner_time_series_cache' as view_name,
    COUNT(DISTINCT c.owner_id) as cache_owners,
    COUNT(DISTINCT m.owner_id) as metrics_owners,
    COUNT(DISTINCT c.owner_id) - COUNT(DISTINCT m.owner_id) as owner_diff
FROM public.owner_time_series_cache c
FULL OUTER JOIN (
    SELECT DISTINCT owner_id 
    FROM public.ig_post_metrics 
    WHERE posted_at IS NOT NULL
) m ON c.owner_id = m.owner_id;

-- ============================================
-- E. 異常値・不整合の検出
-- ============================================

-- 21. ig_post_metrics の異常な数値（負の値、極端に大きい値）
WITH issues AS (
    SELECT 
        ig_code,
        owner_id,
        likes_count,
        comments_count,
        video_view_count,
        video_play_count,
        engagement_rate,
        CASE 
            WHEN likes_count < 0 THEN 'NEGATIVE_LIKES'
            WHEN comments_count < 0 THEN 'NEGATIVE_COMMENTS'
            WHEN video_view_count < 0 THEN 'NEGATIVE_VIEWS'
            WHEN video_play_count < 0 THEN 'NEGATIVE_PLAYS'
            WHEN video_view_count > 100000000 THEN 'EXTREME_VIEWS'
            WHEN likes_count > 10000000 THEN 'EXTREME_LIKES'
            WHEN engagement_rate < 0 OR engagement_rate > 1 THEN 'INVALID_ENGAGEMENT'
            ELSE 'OK'
        END as issue_type
    FROM public.ig_post_metrics
    WHERE likes_count < 0 
       OR comments_count < 0
       OR video_view_count < 0
       OR video_play_count < 0
       OR video_view_count > 100000000
       OR likes_count > 10000000
       OR engagement_rate < 0 
       OR engagement_rate > 1
)
SELECT 
    ig_code,
    owner_id,
    likes_count,
    comments_count,
    video_view_count,
    video_play_count,
    engagement_rate,
    issue_type
FROM issues
ORDER BY 
    CASE issue_type
        WHEN 'NEGATIVE_LIKES' THEN 1
        WHEN 'NEGATIVE_COMMENTS' THEN 2
        WHEN 'NEGATIVE_VIEWS' THEN 3
        WHEN 'NEGATIVE_PLAYS' THEN 4
        WHEN 'INVALID_ENGAGEMENT' THEN 5
        ELSE 6
    END
LIMIT 100;

-- 22. ig_jobs の重複 ig_code チェック（主キー制約があるので通常は0件）
SELECT 
    ig_code,
    COUNT(*) as duplicate_count,
    STRING_AGG(owner_id::text, ', ' ORDER BY owner_id) as owner_ids,
    STRING_AGG(status, ', ' ORDER BY status) as statuses
FROM public.ig_jobs
GROUP BY ig_code
HAVING COUNT(*) > 1;

-- 23. ig_post_metrics の重複 ig_code チェック
SELECT 
    ig_code,
    COUNT(*) as duplicate_count,
    STRING_AGG(owner_id::text, ', ' ORDER BY owner_id) as owner_ids,
    MIN(posted_at) as earliest_post,
    MAX(posted_at) as latest_post
FROM public.ig_post_metrics
GROUP BY ig_code
HAVING COUNT(*) > 1
LIMIT 50;

-- 24. owner_stats の計算値の妥当性チェック
WITH issues AS (
    SELECT 
        owner_id,
        total_posts,
        transcribed,
        has_ja,
        posts_with_transcript,
        posts_with_ja,
        CASE 
            WHEN transcribed > total_posts THEN 'TRANSCRIBED_EXCEEDS_TOTAL'
            WHEN has_ja > transcribed THEN 'HAS_JA_EXCEEDS_TRANSCRIBED'
            WHEN posts_with_transcript > total_posts THEN 'POSTS_WITH_TRANSCRIPT_EXCEEDS_TOTAL'
            WHEN posts_with_ja > posts_with_transcript THEN 'POSTS_WITH_JA_EXCEEDS_TRANSCRIPT'
            ELSE 'OK'
        END as issue_type
    FROM public.owner_stats
    WHERE transcribed > total_posts
       OR has_ja > transcribed
       OR posts_with_transcript > total_posts
       OR posts_with_ja > posts_with_transcript
)
SELECT 
    owner_id,
    total_posts,
    transcribed,
    has_ja,
    posts_with_transcript,
    posts_with_ja,
    issue_type
FROM issues
ORDER BY 
    CASE issue_type
        WHEN 'TRANSCRIBED_EXCEEDS_TOTAL' THEN 1
        WHEN 'HAS_JA_EXCEEDS_TRANSCRIBED' THEN 2
        WHEN 'POSTS_WITH_TRANSCRIPT_EXCEEDS_TOTAL' THEN 3
        WHEN 'POSTS_WITH_JA_EXCEEDS_TRANSCRIPT' THEN 4
        ELSE 5
    END
LIMIT 50;

-- 25. ranking_30d のデータ鮮度と整合性
SELECT 
    COUNT(*) as total_rows,
    COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '1 day') as stale_1d,
    COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '7 days') as stale_7d,
    COUNT(*) FILTER (WHERE total_score IS NULL) as null_score,
    COUNT(*) FILTER (WHERE engagement_rate IS NULL) as null_engagement,
    MAX(updated_at) as last_updated,
    MIN(updated_at) as first_updated
FROM public.ranking_30d;

-- ============================================
-- F. パフォーマンス関連
-- ============================================

-- 26. 主要テーブルのインデックス確認
SELECT 
    i.tablename,
    i.indexname,
    i.indexdef,
    pg_size_pretty(pg_relation_size(i.indexname::regclass)) as index_size
FROM pg_indexes i
WHERE i.schemaname = 'public'
  AND i.tablename IN ('ig_jobs', 'ig_post_metrics', 'ig_accounts', 'owner_stats', 'ranking_30d', 'favorites')
ORDER BY i.tablename, i.indexname;

-- 27. テーブル統計情報の最終更新日時
WITH stats AS (
    SELECT 
        schemaname,
        tablename,
        last_analyze,
        last_autoanalyze,
        n_live_tup as live_rows,
        n_dead_tup as dead_rows,
        CASE 
            WHEN last_analyze IS NULL AND last_autoanalyze IS NULL THEN 'NEVER_ANALYZED'
            WHEN last_analyze < NOW() - INTERVAL '7 days' AND last_autoanalyze < NOW() - INTERVAL '7 days' THEN 'STALE'
            ELSE 'OK'
        END as stats_status
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
      AND tablename IN ('ig_jobs', 'ig_post_metrics', 'ig_accounts', 'owner_stats', 'ranking_30d', 'favorites', 'ig_apify_reels_raw_history', 'ig_apify_reels_raw_latest')
)
SELECT 
    schemaname,
    tablename,
    last_analyze,
    last_autoanalyze,
    live_rows,
    dead_rows,
    stats_status
FROM stats
ORDER BY 
    CASE stats_status
        WHEN 'NEVER_ANALYZED' THEN 1
        WHEN 'STALE' THEN 2
        ELSE 3
    END,
    tablename;

-- 28. 大きなテーブルのサイズ確認（パフォーマンス影響）
SELECT 
    t.schemaname,
    t.tablename,
    pg_size_pretty(pg_total_relation_size(t.schemaname||'.'||t.tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(t.schemaname||'.'||t.tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(t.schemaname||'.'||t.tablename) - pg_relation_size(t.schemaname||'.'||t.tablename)) AS indexes_size,
    COALESCE(s.n_live_tup, 0) as estimated_rows
FROM pg_tables t
LEFT JOIN pg_stat_user_tables s ON s.schemaname = t.schemaname AND s.relname = t.tablename
WHERE t.schemaname = 'public'
  AND pg_total_relation_size(t.schemaname||'.'||t.tablename) > 100 * 1024 * 1024  -- 100MB以上
ORDER BY pg_total_relation_size(t.schemaname||'.'||t.tablename) DESC;
