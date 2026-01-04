-- Create ig_reviews table for screening decisions
CREATE TABLE IF NOT EXISTS public.ig_reviews (
  id BIGSERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL,
  ig_code TEXT NOT NULL REFERENCES public.ig_jobs(ig_code) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('keep','skip','later')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id, ig_code)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS ig_reviews_owner_id_idx ON public.ig_reviews(owner_id);
CREATE INDEX IF NOT EXISTS ig_reviews_decision_idx ON public.ig_reviews(decision);
