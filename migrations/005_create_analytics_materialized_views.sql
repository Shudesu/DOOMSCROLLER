-- オーナー統計のマテリアライズドビュー（既存のowner_statsを補完）
-- 時系列データのマテリアライズドビュー
CREATE MATERIALIZED VIEW IF NOT EXISTS owner_time_series_cache AS
SELECT
  owner_id,
  DATE_TRUNC('month', posted_at) as month,
  COUNT(*) as post_count,
  AVG(likes_count) as avg_likes,
  AVG(comments_count) as avg_comments,
  AVG(video_view_count) as avg_views
FROM public.ig_post_metrics
WHERE posted_at IS NOT NULL
GROUP BY owner_id, DATE_TRUNC('month', posted_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_time_series_cache 
ON owner_time_series_cache(owner_id, month);

-- トップパフォーマンス投稿のマテリアライズドビュー
CREATE MATERIALIZED VIEW IF NOT EXISTS owner_top_posts_cache AS
SELECT
  m.owner_id,
  m.ig_code,
  m.likes_count,
  m.comments_count,
  m.video_view_count,
  m.posted_at,
  CASE WHEN j.transcript_text IS NOT NULL THEN true ELSE false END as has_transcript,
  CASE WHEN j.transcript_ja IS NOT NULL THEN true ELSE false END as has_ja,
  ROW_NUMBER() OVER (
    PARTITION BY m.owner_id 
    ORDER BY m.likes_count DESC NULLS LAST
  ) as rank_by_likes
FROM public.ig_post_metrics m
LEFT JOIN public.ig_jobs j ON j.ig_code = m.ig_code
WHERE m.likes_count IS NOT NULL;

-- UNIQUEインデックス（CONCURRENTLYリフレッシュに必要）
CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_top_posts_cache_unique 
ON owner_top_posts_cache(owner_id, ig_code);

-- パフォーマンス用のインデックス
CREATE INDEX IF NOT EXISTS idx_owner_top_posts_cache_owner_rank 
ON owner_top_posts_cache(owner_id, rank_by_likes);

-- キーワード分析用のマテリアライズドビュー（台本テキストのみ）
-- 注意: このビューはUNIQUEインデックスを作成できないため、CONCURRENTLYリフレッシュは使用しない
CREATE MATERIALIZED VIEW IF NOT EXISTS owner_transcripts_cache AS
SELECT
  m.owner_id,
  j.transcript_text,
  j.ig_code  -- UNIQUEインデックス用に追加
FROM public.ig_jobs j
JOIN public.ig_post_metrics m ON m.ig_code = j.ig_code
WHERE j.transcript_text IS NOT NULL
  AND j.transcript_text <> '';

-- UNIQUEインデックス（CONCURRENTLYリフレッシュに必要）
CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_transcripts_cache_unique 
ON owner_transcripts_cache(owner_id, ig_code);

-- パフォーマンス用のインデックス
CREATE INDEX IF NOT EXISTS idx_owner_transcripts_cache_owner 
ON owner_transcripts_cache(owner_id);

-- リフレッシュ関数（n8nから呼び出す）
CREATE OR REPLACE FUNCTION refresh_analytics_cache()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY owner_time_series_cache;
  REFRESH MATERIALIZED VIEW CONCURRENTLY owner_top_posts_cache;
  REFRESH MATERIALIZED VIEW CONCURRENTLY owner_transcripts_cache;
END;
$$ LANGUAGE plpgsql;
