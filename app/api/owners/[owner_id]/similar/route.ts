import { NextRequest, NextResponse } from 'next/server';
import { queryEmbedding, query } from '@/lib/db';
import { unstable_cache } from 'next/cache';

async function getCachedSimilarOwners(owner_id: string) {
  try {
    // 1. Neon DBから類似アカウントを検索
    const similarSql = `
      SELECT
        b.owner_id,
        1 - (a.embedding <=> b.embedding) AS similarity
      FROM owner_embedding_centroid a
      JOIN owner_embedding_centroid b
        ON a.owner_id <> b.owner_id
      WHERE a.owner_id = $1
      ORDER BY a.embedding <=> b.embedding
      LIMIT 20
    `;

    const similarResult = await queryEmbedding<{
      owner_id: string;
      similarity: number;
    }>(similarSql, [owner_id]);

    // 類似アカウントが見つからない場合は空配列を返す
    if (similarResult.rows.length === 0) {
      return [];
    }

    // 2. n8nPGから詳細情報を一括取得
    const ownerIds = similarResult.rows.map((row) => row.owner_id);
    const detailsSql = `
      SELECT
        owner_id,
        owner_username,
        total_posts,
        avg_views,
        avg_likes,
        avg_comments
      FROM public.owner_stats
      WHERE owner_id = ANY($1)
    `;

    const detailsResult = await query<{
      owner_id: string;
      owner_username: string | null;
      total_posts: string;
      avg_views: string | null;
      avg_likes: string | null;
      avg_comments: string | null;
    }>(detailsSql, [ownerIds]);

    // 3. similarityをmergeして返す
    const detailsMap = new Map(
      detailsResult.rows.map((row) => [row.owner_id, row])
    );

    const similarOwners = similarResult.rows
      .map((row) => {
        const details = detailsMap.get(row.owner_id);
        if (!details) return null;

        return {
          owner_id: row.owner_id,
          owner_username: details.owner_username,
          similarity: row.similarity,
          total_posts: parseInt(details.total_posts, 10),
          avg_views: details.avg_views ? parseFloat(details.avg_views) : null,
          avg_likes: details.avg_likes ? parseFloat(details.avg_likes) : null,
          avg_comments: details.avg_comments ? parseFloat(details.avg_comments) : null,
        };
      })
      .filter((owner): owner is NonNullable<typeof owner> => owner !== null);

    return similarOwners;
  } catch (error) {
    console.error('Error fetching similar owners:', error);
    throw error;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner_id: string }> }
) {
  try {
    const { owner_id } = await params;

    const cachedSimilarOwners = unstable_cache(
      async (id: string) => getCachedSimilarOwners(id),
      ['similar-owners', owner_id],
      {
        revalidate: 300, // 5分間キャッシュ
        tags: [`similar-owners-${owner_id}`],
      }
    );

    const similarOwners = await cachedSimilarOwners(owner_id);

    return NextResponse.json(similarOwners, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Error fetching similar owners:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch similar owners', details: errorMessage },
      { status: 500 }
    );
  }
}
