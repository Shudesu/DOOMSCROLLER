import { NextRequest, NextResponse } from 'next/server';
import { queryEmbedding, query } from '@/lib/db';
import { getUserId } from '@/lib/user';
import { unstable_cache } from 'next/cache';

async function getCachedSimilarFavorites(user_id: string, limit: number) {
  try {
    // 1. お気に入り投稿のig_codeを取得
    const favoritesSql = `
      SELECT f.ig_code
      FROM public.favorites f
      WHERE f.user_id = $1
    `;
    const favoritesResult = await query<{ ig_code: string }>(favoritesSql, [user_id]);
    
    if (favoritesResult.rows.length === 0) {
      return {
        favorite_count: 0,
        results: [],
      };
    }

    const favoriteIgCodes = favoritesResult.rows.map(row => row.ig_code);

    // 2. お気に入り投稿のembeddingを取得
    const embeddingsSql = `
      SELECT embedding::text as embedding
      FROM script_vectors
      WHERE ig_code = ANY($1::text[])
        AND chunk_index = 0
        AND embedding IS NOT NULL
    `;

    const embeddingsResult = await queryEmbedding<{ embedding: string }>(
      embeddingsSql,
      [favoriteIgCodes]
    );

    if (embeddingsResult.rows.length === 0) {
      return {
        favorite_count: favoriteIgCodes.length,
        results: [],
      };
    }

    // 3. JavaScript側でcentroid（平均ベクトル）を計算
    const embeddings = embeddingsResult.rows.map(row => {
      // vector型の文字列表現をパース（例: "[0.1,0.2,0.3]"）
      const embeddingStr = row.embedding;
      return embeddingStr
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map(parseFloat);
    });

    // 各次元の平均を計算
    const dimension = embeddings[0].length;
    const centroid = Array.from({ length: dimension }, (_, i) => {
      const sum = embeddings.reduce((acc, emb) => acc + (emb[i] || 0), 0);
      return sum / embeddings.length;
    });

    // PostgreSQLのvector型に変換するための文字列形式
    const centroidStr = '[' + centroid.join(',') + ']';

    // 4. centroidに類似する投稿を検索（お気に入り投稿は除外）
    const similarSql = `
      SELECT
        sv.ig_code,
        1 - ($1::vector <=> sv.embedding) AS similarity
      FROM script_vectors sv
      WHERE sv.chunk_index = 0
        AND sv.embedding IS NOT NULL
        AND sv.ig_code <> ALL($2::text[])
      ORDER BY $1::vector <=> sv.embedding
      LIMIT $3
    `;

    const similarResult = await queryEmbedding<{
      ig_code: string;
      similarity: number;
    }>(similarSql, [centroidStr, favoriteIgCodes, limit]);

    // 類似投稿が見つからない場合
    if (similarResult.rows.length === 0) {
      return {
        favorite_count: favoriteIgCodes.length,
        results: [],
      };
    }

    // 5. 詳細情報を取得
    const igCodes = similarResult.rows.map(row => row.ig_code);
    const detailsSql = `
      SELECT
        m.ig_code,
        m.owner_id,
        m.owner_username,
        m.likes_count,
        m.video_view_count,
        m.comments_count,
        m.engagement_rate,
        j.canonical_url,
        LEFT(j.transcript_text, 100) as transcript_preview
      FROM public.ig_post_metrics m
      LEFT JOIN public.ig_jobs j ON j.ig_code = m.ig_code
      WHERE m.ig_code = ANY($1)
    `;

    const detailsResult = await query<{
      ig_code: string;
      owner_id: string | null;
      owner_username: string | null;
      likes_count: number | null;
      video_view_count: number | null;
      comments_count: number | null;
      engagement_rate: string | null;
      canonical_url: string | null;
      transcript_preview: string | null;
    }>(detailsSql, [igCodes]);

    // 6. 結果をマージ
    const detailsMap = new Map(
      detailsResult.rows.map(row => [row.ig_code, row])
    );

    const results = similarResult.rows
      .map(row => {
        const details = detailsMap.get(row.ig_code);
        if (!details) return null;

        return {
          ig_code: row.ig_code,
          owner_id: details.owner_id,
          owner_username: details.owner_username,
          similarity: row.similarity,
          likes_count: details.likes_count,
          video_view_count: details.video_view_count,
          comments_count: details.comments_count,
          engagement_rate: details.engagement_rate ? parseFloat(details.engagement_rate) : null,
          canonical_url: details.canonical_url,
          transcript_preview: details.transcript_preview,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      favorite_count: favoriteIgCodes.length,
      results,
    };
  } catch (error) {
    console.error('Error fetching similar favorites:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user_id = getUserId();
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20', 10);

    const cachedSimilarFavorites = unstable_cache(
      async (uid: string, lim: number) => getCachedSimilarFavorites(uid, lim),
      ['similar-favorites', user_id, limit.toString()],
      {
        revalidate: 300, // 5分間キャッシュ
        tags: [`similar-favorites-${user_id}`],
      }
    );

    const data = await cachedSimilarFavorites(user_id, limit);

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Error fetching similar favorites:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch similar favorites', details: errorMessage },
      { status: 500 }
    );
  }
}
