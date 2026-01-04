import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { unstable_cache } from 'next/cache';

async function getCachedRankings() {
  const sql = `
    SELECT
      ig_code,
      owner_id,
      owner_username,
      likes_count,
      video_view_count,
      posted_at,
      engagement_rate,
      total_score
    FROM public.ranking_30d
    ORDER BY total_score DESC
    LIMIT 50
  `;

  const result = await query<{
    ig_code: string;
    owner_id: string | null;
    owner_username: string | null;
    likes_count: number;
    video_view_count: number;
    posted_at: Date;
    engagement_rate: string;
    total_score: string;
  }>(sql);

  return result.rows.map((row) => ({
    ig_code: row.ig_code,
    owner_id: row.owner_id,
    owner_username: row.owner_username,
    likes_count: row.likes_count,
    video_view_count: row.video_view_count,
    posted_at: row.posted_at.toISOString(),
    engagement_rate: parseFloat(row.engagement_rate),
    total_score: parseFloat(row.total_score),
  }));
}

export async function GET() {
  try {
    const cachedRankings = unstable_cache(
      getCachedRankings,
      ['rankings'],
      {
        revalidate: 300, // 5分間キャッシュ
        tags: ['rankings'],
      }
    );

    const rankings = await cachedRankings();

    const response = NextResponse.json(rankings);
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return response;
  } catch (error) {
    console.error('Error fetching ranking:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ranking' },
      { status: 500 }
    );
  }
}
