import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { unstable_cache } from 'next/cache';

const getCachedCount = unstable_cache(
  async () => {
    const countSql = `
      SELECT COUNT(*) as total
      FROM public.ig_jobs j
      LEFT JOIN public.ig_post_metrics m ON j.ig_code = m.ig_code
      LEFT JOIN public.ig_accounts a ON j.owner_id = a.owner_id
    `;
    const countResult = await query<{ total: string }>(countSql);
    return parseInt(countResult.rows[0].total, 10);
  },
  ['new-posts-count'],
  { revalidate: 300 }
);

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const sort = searchParams.get('sort') || 'created_at';
    const order = searchParams.get('order') || 'desc';

    // ソートフィールドのバリデーション（SQLインジェクション対策）
    const allowedSortFields = ['created_at', 'posted_at', 'likes_count', 'video_view_count', 'engagement_rate'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const offset = (page - 1) * limit;

    // ソートカラムのマッピング（ig_jobsテーブルとig_post_metricsテーブルのカラム）
    let orderByClause: string;
    if (sortField === 'created_at') {
      orderByClause = `j.created_at ${sortOrder} NULLS LAST`;
    } else if (sortField === 'posted_at') {
      orderByClause = `m.posted_at ${sortOrder} NULLS LAST, j.created_at DESC`;
    } else {
      // likes_count, video_view_count, engagement_rate
      orderByClause = `m.${sortField} ${sortOrder} NULLS LAST, j.created_at DESC`;
    }

    // データ取得クエリ
    const dataSql = `
      SELECT
        j.ig_code,
        j.owner_id,
        COALESCE(m.owner_username, a.username) as owner_username,
        m.likes_count,
        m.video_view_count,
        m.comments_count,
        m.posted_at,
        m.engagement_rate,
        j.created_at,
        j.canonical_url
      FROM public.ig_jobs j
      LEFT JOIN public.ig_post_metrics m ON j.ig_code = m.ig_code
      LEFT JOIN public.ig_accounts a ON j.owner_id = a.owner_id
      ORDER BY ${orderByClause}
      LIMIT $1 OFFSET $2
    `;

    const [dataResult, totalCount] = await Promise.all([
      query<{
        ig_code: string;
        owner_id: string | null;
        owner_username: string | null;
        likes_count: number | null;
        video_view_count: number | null;
        comments_count: number | null;
        posted_at: Date | null;
        engagement_rate: number | null;
        created_at: Date;
        canonical_url: string;
      }>(dataSql, [limit, offset]),
      getCachedCount()
    ]);

    const posts = dataResult.rows.map((row) => ({
      ig_code: row.ig_code,
      owner_id: row.owner_id,
      owner_username: row.owner_username,
      likes_count: row.likes_count,
      video_view_count: row.video_view_count,
      comments_count: row.comments_count,
      posted_at: row.posted_at?.toISOString() || null,
      engagement_rate: row.engagement_rate,
      created_at: row.created_at.toISOString(),
      canonical_url: row.canonical_url,
    }));

    const response = NextResponse.json({
      posts,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    });

    // キャッシュヘッダーを追加（5分間キャッシュ）
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    return response;
  } catch (error) {
    console.error('Error fetching new posts:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch new posts', details: errorMessage },
      { status: 500 }
    );
  }
}
