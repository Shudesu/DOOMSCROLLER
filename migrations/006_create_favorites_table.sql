-- Create favorites table for user's favorite reels
CREATE TABLE IF NOT EXISTS public.favorites (
  user_id TEXT NOT NULL,
  ig_code TEXT NOT NULL REFERENCES public.ig_jobs(ig_code) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ig_code)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS favorites_user_id_idx ON public.favorites(user_id);
CREATE INDEX IF NOT EXISTS favorites_ig_code_idx ON public.favorites(ig_code);
CREATE INDEX IF NOT EXISTS favorites_created_at_idx ON public.favorites(created_at DESC);
