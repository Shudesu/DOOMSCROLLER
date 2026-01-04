-- ============================================
-- データベース構造調査クエリ
-- ============================================
-- 
-- このファイルは、Neon DB（embedding用）とn8nPGのテーブル構造を調査するためのクエリ集です。
-- 実装に必要な情報を収集するために使用します。
--
-- 実行方法:
-- 1. Neon DB: psql 'postgresql://neondb_owner:npg_3BGPxLRavZ5z@ep-withered-fire-a1wfz8ob-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
-- 2. n8nPG: 既存のDATABASE_URLを使用
-- ============================================

-- ============================================
-- PART 1: Neon DB（embedding用）の調査
-- ============================================

-- 1.1 テーブル一覧を取得
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 1.2 embedding関連のテーブルを検索（複数の可能性のあるテーブル名をチェック）
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables
WHERE schemaname = 'public'
  AND (
    tablename LIKE '%embedding%' 
    OR tablename LIKE '%reel%'
    OR tablename LIKE '%post%'
    OR tablename LIKE '%centroid%'
  )
ORDER BY tablename;

-- 1.3 owner_embedding_centroidテーブルの構造確認（既知のテーブル）
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'owner_embedding_centroid'
ORDER BY ordinal_position;

-- 1.4 投稿単位のembeddingテーブル候補の構造確認
-- テーブル名が不明なため、複数の候補をチェック
-- 実行前に実際のテーブル名に置き換えてください

-- 候補1: reel_embedding
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'reel_embedding'
ORDER BY ordinal_position;

-- 候補2: ig_post_embedding
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'ig_post_embedding'
ORDER BY ordinal_position;

-- 候補3: post_embedding
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'post_embedding'
ORDER BY ordinal_position;

-- 候補4: ig_reel_embedding
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'ig_reel_embedding'
ORDER BY ordinal_position;

-- 1.4.5 script_vectorsテーブルの構造確認（実際に存在するテーブル）
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'script_vectors'
ORDER BY ordinal_position;

-- 1.4.6 ig_embed_stateテーブルの構造確認（実際に存在するテーブル）
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'ig_embed_state'
ORDER BY ordinal_position;

-- 1.5 owner_embedding_centroidのサンプルデータ（構造確認用）
-- vector型の次元数は直接取得できないため、型情報のみ確認
SELECT 
    owner_id,
    pg_typeof(embedding) as embedding_type,
    post_count
FROM public.owner_embedding_centroid
LIMIT 1;

-- 1.6 owner_embedding_centroidのデータ件数確認
SELECT 
    COUNT(*) as total_count,
    COUNT(DISTINCT owner_id) as unique_owners
FROM public.owner_embedding_centroid;

-- 1.7 script_vectorsテーブルのサンプルデータ（実際に存在するテーブル）
SELECT 
    *,
    pg_typeof(embedding) as embedding_type
FROM public.script_vectors
LIMIT 5;

-- 1.7.1 script_vectorsテーブルのデータ件数確認
SELECT 
    COUNT(*) as total_count,
    COUNT(DISTINCT ig_code) as unique_reels
FROM public.script_vectors;

-- 1.7.2 ig_embed_stateテーブルのサンプルデータ
SELECT *
FROM public.ig_embed_state
LIMIT 5;

-- 1.7.3 ig_embed_stateテーブルのデータ件数確認
SELECT 
    COUNT(*) as total_count,
    COUNT(DISTINCT ig_code) as unique_reels
FROM public.ig_embed_state;

-- 1.9 embeddingテーブルのインデックス確認
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    tablename LIKE '%embedding%'
    OR tablename LIKE '%centroid%'
    OR tablename LIKE '%vector%'
    OR tablename LIKE '%embed_state%'
  )
ORDER BY tablename, indexname;

-- ============================================
-- PART 2: n8nPGの調査
-- ============================================

-- 2.1 owner_statsテーブルの完全な構造確認
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    numeric_precision,
    numeric_scale,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'owner_stats'
ORDER BY ordinal_position;

-- 2.2 owner_statsのサンプルデータ（構造確認用）
SELECT *
FROM public.owner_stats
LIMIT 5;

-- 2.3 owner_statsのデータ件数と基本統計
SELECT 
    COUNT(*) as total_count,
    COUNT(DISTINCT owner_id) as unique_owners,
    COUNT(DISTINCT owner_username) as unique_usernames,
    AVG(total_posts::numeric) as avg_total_posts,
    AVG(avg_views::numeric) as avg_avg_views
FROM public.owner_stats;

-- 2.4 owner_statsのインデックス情報
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'owner_stats'
ORDER BY indexname;

-- 2.5 ig_post_metricsテーブルの構造確認（投稿詳細情報取得用）
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    numeric_precision,
    numeric_scale,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'ig_post_metrics'
ORDER BY ordinal_position;

-- 2.6 ig_jobsテーブルの構造確認（台本情報取得用）
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'ig_jobs'
ORDER BY ordinal_position;

-- 2.7 ig_post_metricsとig_jobsのJOIN確認（サンプル）
SELECT 
    m.ig_code,
    m.owner_id,
    m.likes_count,
    m.video_view_count,
    m.engagement_rate,
    j.canonical_url,
    j.transcript_text IS NOT NULL as has_transcript,
    LEFT(j.transcript_text, 100) as transcript_preview
FROM public.ig_post_metrics m
LEFT JOIN public.ig_jobs j
    ON j.ig_code = m.ig_code
LIMIT 5;

-- 2.8 ANY配列クエリのテスト（owner_id配列で一括取得）
-- 例: 複数のowner_idを一度に取得
SELECT 
    owner_id,
    owner_username,
    total_posts,
    avg_views,
    avg_likes,
    avg_comments
FROM public.owner_stats
WHERE owner_id = ANY(ARRAY['owner1', 'owner2', 'owner3']::text[]);

-- 2.9 ANY配列クエリのテスト（ig_code配列で一括取得）
-- 例: 複数のig_codeを一度に取得
SELECT 
    m.ig_code,
    m.owner_id,
    m.likes_count,
    m.video_view_count,
    m.engagement_rate,
    j.canonical_url,
    LEFT(j.transcript_text, 100) as transcript_preview
FROM public.ig_post_metrics m
LEFT JOIN public.ig_jobs j
    ON j.ig_code = m.ig_code
WHERE m.ig_code = ANY(ARRAY['code1', 'code2', 'code3']::text[]);

-- ============================================
-- PART 3: 実装に必要な情報の確認
-- ============================================

-- 3.1 owner_embedding_centroidからsimilar ownerを取得するクエリ（動作確認）
-- 実際のowner_idに置き換えて実行
-- SELECT
--     b.owner_id,
--     1 - (a.embedding <=> b.embedding) AS similarity
-- FROM owner_embedding_centroid a
-- JOIN owner_embedding_centroid b
--   ON a.owner_id <> b.owner_id
-- WHERE a.owner_id = '実際のowner_idをここに入力'
-- ORDER BY a.embedding <=> b.embedding
-- LIMIT 20;

-- 3.2 投稿単位のsimilar検索クエリ（script_vectorsテーブルを使用）
-- 実際のig_codeに置き換えて実行
-- SELECT
--     b.ig_code,
--     1 - (a.embedding <=> b.embedding) AS similarity
-- FROM script_vectors a
-- JOIN script_vectors b
--   ON a.ig_code <> b.ig_code
-- WHERE a.ig_code = '実際のig_codeをここに入力'
-- ORDER BY a.embedding <=> b.embedding
-- LIMIT 20;

-- 3.2.1 script_vectorsテーブルでsimilar検索のテスト（サンプルig_codeで実行）
-- まず、存在するig_codeを1つ取得してから実行
-- SELECT ig_code FROM script_vectors LIMIT 1;
-- 上記で取得したig_codeを使用して以下を実行:
-- SELECT
--     b.ig_code,
--     1 - (a.embedding <=> b.embedding) AS similarity
-- FROM script_vectors a
-- JOIN script_vectors b
--   ON a.ig_code <> b.ig_code
-- WHERE a.ig_code = (SELECT ig_code FROM script_vectors LIMIT 1)
-- ORDER BY a.embedding <=> b.embedding
-- LIMIT 20;

-- ============================================
-- 実行メモ
-- ============================================
-- 
-- Neon DB接続:
-- psql 'postgresql://neondb_owner:npg_3BGPxLRavZ5z@ep-withered-fire-a1wfz8ob-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
--
-- n8nPG接続:
-- 既存のDATABASE_URLを使用（.env.localを参照）
--
-- 注意事項:
-- 1. 調査結果: script_vectorsテーブルが投稿単位のembeddingテーブルとして存在します
-- 2. ig_embed_stateテーブルも存在しますが、用途は要確認です
-- 3. vector型は直接配列にキャストできないため、次元数の取得は別の方法が必要です
-- 4. 3.1, 3.2のクエリは実際のowner_idやig_codeに置き換えて動作確認してください
