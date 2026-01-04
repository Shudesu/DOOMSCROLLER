import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { unstable_cache } from 'next/cache';

async function getCachedReels(
  owner_id: string,
  limit: number,
  offset: number,
  sortBy: string,
  sortOrder: string
) {
  // ソートカラムの検証
  const validSortColumns = ['fetched_at', 'posted_at', 'likes_count', 'comments_count'];
  const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'fetched_at';
  const sortDirection = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  // ソートカラムを安全に構築（SQLインジェクション対策）
  const orderByClause = `m.${sortColumn} ${sortDirection} NULLS LAST, m.ig_code DESC`;
  
  try {
    const sql = `
      SELECT
        m.ig_code,
        m.owner_username,
        m.likes_count,
        m.comments_count,
        m.video_view_count,
        m.video_play_count,
        m.engagement_rate,
        m.posted_at,
        m.fetched_at,
        j.canonical_url
      FROM public.ig_post_metrics m
      LEFT JOIN public.ig_jobs j
        ON j.ig_code = m.ig_code
      WHERE m.owner_id = $1
      ORDER BY ${orderByClause}
      LIMIT $2 OFFSET $3
    `;
    
    const result = await query<{
      ig_code: string;
      owner_username: string | null;
      likes_count: number | null;
      comments_count: number | null;
      video_view_count: number | null;
      video_play_count: number | null;
      engagement_rate: number | null;
      posted_at: Date | null;
      fetched_at: Date;
      canonical_url: string | null;
    }>(sql, [owner_id, limit, offset]);

    return result.rows.map((row) => ({
      ig_code: row.ig_code,
      owner_username: row.owner_username,
      likes_count: row.likes_count,
      comments_count: row.comments_count,
      video_view_count: row.video_view_count,
      video_play_count: row.video_play_count,
      engagement_rate: row.engagement_rate,
      posted_at: row.posted_at?.toISOString() || null,
      fetched_at: row.fetched_at?.toISOString() || null,
      canonical_url: row.canonical_url || null,
      decision: null,
    }));
  } catch (error: any) {
    // テーブルが存在しない場合のエラーハンドリング
    if (error?.code === '42P01') {
      console.warn('Table does not exist:', error.message);
      return [];
    } else {
      throw error;
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner_id: string }> }
) {
  try {
    const { owner_id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const sortBy = searchParams.get('sort') || 'fetched_at';
    const sortOrder = searchParams.get('order') || 'desc';

    const cachedReels = unstable_cache(
      async (id: string, lim: number, off: number, sort: string, order: string) =>
        getCachedReels(id, lim, off, sort, order),
      ['reels', owner_id, limit.toString(), offset.toString(), sortBy, sortOrder],
      {
        revalidate: 300, // 5分間キャッシュ
        tags: [`reels-${owner_id}`],
      }
    );

    const reels = await cachedReels(owner_id, limit, offset, sortBy, sortOrder);

    const response = NextResponse.json(reels);
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return response;
  } catch (error) {
    console.error('Error fetching reels:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reels' },
      { status: 500 }
    );
  }
}
