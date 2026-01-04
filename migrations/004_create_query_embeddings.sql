-- Create query_embeddings table for caching query embeddings
CREATE TABLE IF NOT EXISTS public.query_embeddings (
  query_norm TEXT NOT NULL,
  model TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  hits INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (query_norm, model)
);

-- Create index for vector similarity search (HNSW for better performance)
CREATE INDEX IF NOT EXISTS query_embeddings_embedding_idx 
  ON public.query_embeddings 
  USING hnsw (embedding vector_cosine_ops);

-- Create index for query lookups
CREATE INDEX IF NOT EXISTS query_embeddings_query_norm_idx 
  ON public.query_embeddings(query_norm);

-- Create index for model lookups
CREATE INDEX IF NOT EXISTS query_embeddings_model_idx 
  ON public.query_embeddings(model);
