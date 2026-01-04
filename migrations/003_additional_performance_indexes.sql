-- Additional performance indexes for improved query speed
-- This migration adds covering indexes and specialized indexes for common query patterns

-- Covering index for ig_jobs table (optimizes lookups)
-- Note: transcript columns are too large to include, so we only include smaller columns
CREATE INDEX IF NOT EXISTS ig_jobs_ig_code_covering_idx 
  ON public.ig_jobs(ig_code) 
  INCLUDE (owner_id, canonical_url, status, transcribed_at, updated_at);

-- Covering index for ig_post_metrics table (optimizes lookups)
CREATE INDEX IF NOT EXISTS ig_post_metrics_ig_code_covering_idx 
  ON public.ig_post_metrics(ig_code) 
  INCLUDE (owner_id, likes_count, video_view_count, comments_count, posted_at);

-- Index for ranking queries (without partial index to avoid NOW() issue)
-- This index helps with sorting and filtering for trending posts
CREATE INDEX IF NOT EXISTS ig_post_metrics_ranking_likes_views_idx 
  ON public.ig_post_metrics(posted_at DESC, video_view_count DESC, likes_count DESC)
  WHERE likes_count IS NOT NULL 
    AND video_view_count IS NOT NULL 
    AND video_view_count > 0;

-- Additional composite index for owner_id + ig_code lookups
CREATE INDEX IF NOT EXISTS ig_post_metrics_owner_ig_code_idx 
  ON public.ig_post_metrics(owner_id, ig_code);
