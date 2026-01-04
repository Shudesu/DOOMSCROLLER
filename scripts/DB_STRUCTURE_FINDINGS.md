# データベース構造調査結果

## Neon DB（embedding用）の構造

### テーブル一覧
1. `owner_embedding_centroid` - アカウント単位のembedding（centroid）
2. `script_vectors` - 投稿単位のembedding（chunk単位）
3. `ig_embed_state` - embedding処理の状態管理

### owner_embedding_centroid
- **構造**:
  - `owner_id` (text, nullable)
  - `embedding` (vector, nullable)
  - `post_count` (bigint, nullable)
- **データ件数**: 73件（73ユニークオーナー）
- **用途**: アカウント単位の類似検索に使用

### script_vectors
- **構造**:
  - `id` (text, NOT NULL) - プライマリキー
  - `ig_code` (text, NOT NULL) - 投稿コード
  - `chunk_index` (integer, NOT NULL) - chunkのインデックス
  - `transcript_text` (text, NOT NULL) - 台本テキスト（chunk）
  - `metadata` (jsonb, nullable) - メタデータ
  - `embedding` (vector, nullable) - embeddingベクトル
  - `created_at` (timestamp with time zone, default now())
- **重要な特徴**:
  - **1つの`ig_code`に対して複数のchunkが存在する可能性がある**
  - chunk単位でembeddingが保存されている
  - 投稿単位の類似検索には、chunkの集約または選択が必要

### ig_embed_state
- **構造**:
  - `ig_code` (text, NOT NULL)
  - `owner_id` (text, nullable)
  - `embedded_at` (timestamp with time zone, nullable)
  - `updated_at` (timestamp with time zone, default now())
  - `run_id` (text, nullable)
- **用途**: embedding処理の状態管理（どの投稿がembedding済みか）

## 実装方針

### 投稿単位の類似検索（`/api/reels/[ig_code]/similar`）

`script_vectors`テーブルはchunk単位なので、以下のいずれかの方法で実装する必要があります：

#### 方法1: 最初のchunk（chunk_index=0）を使用
```sql
SELECT
    b.ig_code,
    1 - (a.embedding <=> b.embedding) AS similarity
FROM script_vectors a
JOIN script_vectors b
  ON a.ig_code <> b.ig_code
WHERE a.ig_code = $1
  AND a.chunk_index = 0
  AND b.chunk_index = 0
ORDER BY a.embedding <=> b.embedding
LIMIT 20
```

#### 方法2: 全chunkの平均（centroid）を使用
```sql
WITH source_centroid AS (
    SELECT AVG(embedding::float[])::vector as centroid
    FROM script_vectors
    WHERE ig_code = $1
),
target_centroids AS (
    SELECT 
        ig_code,
        AVG(embedding::float[])::vector as centroid
    FROM script_vectors
    WHERE ig_code <> $1
    GROUP BY ig_code
)
SELECT
    t.ig_code,
    1 - (s.centroid <=> t.centroid) AS similarity
FROM source_centroid s
CROSS JOIN target_centroids t
ORDER BY s.centroid <=> t.centroid
LIMIT 20
```

#### 方法3: 最も近いchunkを選択（推奨）
各投稿の全chunkと比較し、最も近いchunkの距離を使用：
```sql
WITH source_chunks AS (
    SELECT embedding
    FROM script_vectors
    WHERE ig_code = $1
),
target_chunks AS (
    SELECT 
        ig_code,
        embedding
    FROM script_vectors
    WHERE ig_code <> $1
),
distances AS (
    SELECT DISTINCT ON (t.ig_code)
        t.ig_code,
        MIN(s.embedding <=> t.embedding) as min_distance
    FROM source_chunks s
    CROSS JOIN target_chunks t
    GROUP BY t.ig_code
)
SELECT
    ig_code,
    1 - min_distance AS similarity
FROM distances
ORDER BY min_distance
LIMIT 20
```

**推奨**: 方法1（最初のchunkを使用）が最もシンプルで高速です。実装が簡単で、パフォーマンスも良好です。

### アカウント単位の類似検索（`/api/owners/[owner_id]/similar`）

既に実装済み。`owner_embedding_centroid`テーブルを使用。

## n8nPGの構造

### owner_stats
- `owner_id`, `owner_username`, `total_posts`, `avg_views`, `avg_likes`, `avg_comments`など
- アカウント詳細情報の取得に使用

### ig_post_metrics
- `ig_code`, `owner_id`, `likes_count`, `video_view_count`, `comments_count`, `engagement_rate`など
- 投稿メトリクス情報の取得に使用

### ig_jobs
- `ig_code`, `owner_id`, `canonical_url`, `transcript_text`, `transcript_ja`など
- 台本情報の取得に使用

## 実装時の注意点

1. **script_vectorsはchunk単位**: 投稿単位の類似検索には、chunkの選択または集約が必要
2. **ANY配列クエリ**: n8nPG側で`WHERE ig_code = ANY($1)`を使用して一括取得
3. **similarityの計算**: `1 - (embedding <=> embedding)`で類似度を計算（0に近いほど類似）
4. **パフォーマンス**: chunk_index=0でフィルタすることで、インデックスが効きやすくなる
