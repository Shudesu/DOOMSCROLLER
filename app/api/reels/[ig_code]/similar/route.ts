import { NextRequest, NextResponse } from 'next/server';
import { queryEmbedding, query } from '@/lib/db';
import { unstable_cache } from 'next/cache';

async function getCachedSimilarReels(ig_code: string) {
  try {
    // 1. Neon DBから類似投稿を検索（chunk_index=0の最初のchunkを使用）
    const similarSql = `
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
    `;

    const similarResult = await queryEmbedding<{
      ig_code: string;
      similarity: number;
    }>(similarSql, [ig_code]);

    // 類似投稿が見つからない場合は空配列を返す
    if (similarResult.rows.length === 0) {
      return [];
    }

    // 2. n8nPGから詳細情報を一括取得
    const igCodes = similarResult.rows.map((row) => row.ig_code);
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
      LEFT JOIN public.ig_jobs j
        ON j.ig_code = m.ig_code
      WHERE m.ig_code = ANY($1)
    `;

    const detailsResult = await query<{
      ig_code: string;
      owner_id: string | null;
      owner_username: string | null;
      likes_count: number | null;
      video_view_count: number | null;
      comments_count: number | null;
      engagement_rate: number | null;
      canonical_url: string | null;
      transcript_preview: string | null;
    }>(detailsSql, [igCodes]);

    // 3. similarityをmergeして返す
    const detailsMap = new Map(
      detailsResult.rows.map((row) => [row.ig_code, row])
    );
    const similarityMap = new Map(
      similarResult.rows.map((row) => [row.ig_code, row.similarity])
    );

    const similarReels = similarResult.rows
      .map((row) => {
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
          engagement_rate: details.engagement_rate,
          canonical_url: details.canonical_url,
          transcript_preview: details.transcript_preview,
        };
      })
      .filter((reel): reel is NonNullable<typeof reel> => reel !== null);

    return similarReels;
  } catch (error) {
    console.error('Error fetching similar reels:', error);
    throw error;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ig_code: string }> }
) {
  try {
    const { ig_code } = await params;

    const cachedSimilarReels = unstable_cache(
      async (code: string) => getCachedSimilarReels(code),
      ['similar-reels', ig_code],
      {
        revalidate: 300, // 5分間キャッシュ
        tags: [`similar-reels-${ig_code}`],
      }
    );

    const similarReels = await cachedSimilarReels(ig_code);

    return NextResponse.json(similarReels, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Error fetching similar reels:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch similar reels', details: errorMessage },
      { status: 500 }
    );
  }
}
