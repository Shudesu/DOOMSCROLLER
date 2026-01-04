-- Add performance indexes for analytics queries
-- This migration improves query performance for owner analytics and listing pages

-- Indexes for ig_post_metrics table
CREATE INDEX IF NOT EXISTS ig_post_metrics_owner_id_idx ON public.ig_post_metrics(owner_id);
CREATE INDEX IF NOT EXISTS ig_post_metrics_posted_at_idx ON public.ig_post_metrics(posted_at);
CREATE INDEX IF NOT EXISTS ig_post_metrics_ig_code_idx ON public.ig_post_metrics(ig_code);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS ig_post_metrics_owner_id_posted_at_idx ON public.ig_post_metrics(owner_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS ig_post_metrics_owner_id_likes_count_idx ON public.ig_post_metrics(owner_id, likes_count DESC NULLS LAST);

-- Indexes for ig_jobs table (if ig_code is not already a primary key)
CREATE INDEX IF NOT EXISTS ig_jobs_ig_code_idx ON public.ig_jobs(ig_code);
CREATE INDEX IF NOT EXISTS ig_jobs_owner_id_idx ON public.ig_jobs(owner_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS ig_jobs_status_idx ON public.ig_jobs(status) WHERE status = 'transcribed';
