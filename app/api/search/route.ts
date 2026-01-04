import { NextRequest, NextResponse } from 'next/server';
import { queryEmbedding, query } from '@/lib/db';
import OpenAI from 'openai';

// OpenAIクライアントの初期化
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// query_type推定関数
function inferQueryType(query: string): 'theme' | 'claim' | 'phrasing' | 'structure' {
  const normalized = query.toLowerCase();
  
  const structureKeywords = ['構成', '導入', 'まとめ', '章', 'スライド', '流れ', 'テンプレ'];
  const phrasingKeywords = ['言い回し', '表現', 'セリフ', 'トーン', '語尾', 'コピー', 'タイトル案'];
  const claimKeywords = ['主張', '結論', '言いたいこと', 'ポイント', '何が言える'];
  
  if (structureKeywords.some(kw => normalized.includes(kw))) {
    return 'structure';
  }
  if (phrasingKeywords.some(kw => normalized.includes(kw))) {
    return 'phrasing';
  }
  if (claimKeywords.some(kw => normalized.includes(kw))) {
    return 'claim';
  }
  return 'theme';
}

// クエリ正規化関数
function normalizeQuery(query: string): string {
  return query
    .trim()
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .normalize('NFKC');
}

// embeddingを取得（キャッシュ確認 → なければ生成）
async function getQueryEmbedding(
  queryNorm: string,
  model: string
): Promise<number[]> {
  // キャッシュから取得を試みる
  const cacheSql = `
    SELECT embedding::text as embedding, hits
    FROM public.query_embeddings
    WHERE query_norm = $1 AND model = $2
  `;
  
  const cacheResult = await queryEmbedding<{
    embedding: string;
    hits: number;
  }>(cacheSql, [queryNorm, model]);
  
  if (cacheResult.rows.length > 0) {
    // キャッシュヒット: hitsとlast_used_atを更新
    const updateCacheSql = `
      UPDATE public.query_embeddings
      SET hits = hits + 1, last_used_at = NOW()
      WHERE query_norm = $1 AND model = $2
    `;
    await queryEmbedding(updateCacheSql, [queryNorm, model]);
    
    // vector型の文字列表現をパース（例: "[0.1,0.2,0.3]"）
    const embeddingStr = cacheResult.rows[0].embedding;
    // 角括弧を削除してカンマで分割
    const embedding = embeddingStr
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(parseFloat);
    return embedding;
  }
  
  // キャッシュがない場合: OpenAI APIで生成
  const response = await openai.embeddings.create({
    model: model,
    input: queryNorm,
  });
  
  const embedding = response.data[0].embedding;
  
  // キャッシュに保存
  // vector型に変換するために配列を文字列形式に変換
  const embeddingStr = '[' + embedding.join(',') + ']';
  const insertCacheSql = `
    INSERT INTO public.query_embeddings (query_norm, model, embedding, hits, created_at, last_used_at)
    VALUES ($1, $2, $3::vector, 1, NOW(), NOW())
    ON CONFLICT (query_norm, model) DO UPDATE
    SET hits = query_embeddings.hits + 1, last_used_at = NOW()
  `;
  
  await queryEmbedding(insertCacheSql, [queryNorm, model, embeddingStr]);
  
  return embedding;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q');
    const k = parseInt(searchParams.get('k') || '20', 10);
    const sort = searchParams.get('sort') || 'distance'; // distance, likes, comments, views, posted_at
    
    // クエリバリデーション
    if (!q || q.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required and cannot be empty' },
        { status: 400 }
      );
    }
    
    if (q.trim().length < 2) {
      return NextResponse.json(
        { error: 'Query must be at least 2 characters long' },
        { status: 400 }
      );
    }
    
    // クエリ正規化
    const queryNorm = normalizeQuery(q);
    const queryRaw = q.trim();
    
    // query_type推定
    const queryType = inferQueryType(queryRaw);
    
    // embeddingモデル名を取得
    const embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
    
    // embeddingを取得
    const queryEmbeddingVector = await getQueryEmbedding(queryNorm, embeddingModel);
    
    // vector型の文字列表現を作成（PostgreSQLのvector型に変換）
    const embeddingStr = '[' + queryEmbeddingVector.join(',') + ']';
    
    // 類似検索を実行（距離順で取得、後でソート）
    // scoreは距離（小さいほど近い）を使用
    // ウィンドウ関数で各ig_codeごとに最も近いchunkのみを取得（重複排除）
    const searchSql = `
      WITH ranked_results AS (
        SELECT
          sv.ig_code,
          ies.owner_id,
          sv.transcript_text as text,
          sv.embedding <=> $1::vector as distance,
          ROW_NUMBER() OVER (PARTITION BY sv.ig_code ORDER BY sv.embedding <=> $1::vector) as rn
        FROM script_vectors sv
        LEFT JOIN ig_embed_state ies ON sv.ig_code = ies.ig_code
        WHERE sv.embedding IS NOT NULL
      )
      SELECT
        ig_code,
        owner_id,
        text,
        distance
      FROM ranked_results
      WHERE rn = 1
      ORDER BY distance
      LIMIT $2
    `;
    
    const searchResult = await queryEmbedding<{
      ig_code: string;
      owner_id: string | null;
      text: string;
      distance: number;
    }>(searchSql, [embeddingStr, k]);
    
    if (searchResult.rows.length === 0) {
      return NextResponse.json({
        query_raw: queryRaw,
        query_norm: queryNorm,
        query_type: queryType,
        k: k,
        sort: sort,
        results: [],
      });
    }
    
    // ig_codeのリストを取得
    const igCodes = searchResult.rows.map(row => row.ig_code);
    
    // n8nPGからメトリクス情報を一括取得
    const metricsSql = `
      SELECT
        m.ig_code,
        m.owner_id,
        m.owner_username,
        m.likes_count,
        m.comments_count,
        m.video_view_count,
        m.posted_at,
        m.engagement_rate
      FROM public.ig_post_metrics m
      WHERE m.ig_code = ANY($1)
    `;
    
    const metricsResult = await query<{
      ig_code: string;
      owner_id: string | null;
      owner_username: string | null;
      likes_count: number | null;
      comments_count: number | null;
      video_view_count: number | null;
      posted_at: Date | null;
      engagement_rate: number | null;
    }>(metricsSql, [igCodes]);
    
    // メトリクスをマップに変換
    const metricsMap = new Map(
      metricsResult.rows.map(row => [row.ig_code, row])
    );
    
    // 検索結果とメトリクスをマージ
    let results = searchResult.rows.map(row => {
      const metrics = metricsMap.get(row.ig_code);
      return {
        ig_code: row.ig_code,
        owner_id: metrics?.owner_id || row.owner_id,
        owner_username: metrics?.owner_username || null,
        score: row.distance, // 距離（小さいほど近い）
        text: row.text,
        likes_count: metrics?.likes_count || null,
        comments_count: metrics?.comments_count || null,
        video_view_count: metrics?.video_view_count || null,
        posted_at: metrics?.posted_at?.toISOString() || null,
        engagement_rate: metrics?.engagement_rate || null,
      };
    });
    
    // ソート処理
    if (sort !== 'distance') {
      results.sort((a, b) => {
        let aVal: number | string | null = null;
        let bVal: number | string | null = null;
        
        switch (sort) {
          case 'likes':
            aVal = a.likes_count;
            bVal = b.likes_count;
            break;
          case 'comments':
            aVal = a.comments_count;
            bVal = b.comments_count;
            break;
          case 'views':
            aVal = a.video_view_count;
            bVal = b.video_view_count;
            break;
          case 'posted_at':
            aVal = a.posted_at;
            bVal = b.posted_at;
            break;
          default:
            return 0;
        }
        
        // null値の処理（nullは最後に）
        if (aVal === null && bVal === null) return 0;
        if (aVal === null) return 1;
        if (bVal === null) return -1;
        
        // 降順でソート（大きい値/新しい日付が先）
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return bVal.localeCompare(aVal);
        }
        return (bVal as number) - (aVal as number);
      });
    }
    
    return NextResponse.json({
      query_raw: queryRaw,
      query_norm: queryNorm,
      query_type: queryType,
      k: k,
      sort: sort,
      results: results,
    });
  } catch (error) {
    console.error('Error in search API:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to perform search', details: errorMessage },
      { status: 500 }
    );
  }
}
