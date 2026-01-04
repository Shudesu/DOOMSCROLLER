import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const search = searchParams.get('search') || '';
    const sort = searchParams.get('sort') || 'avg_likes';
    const order = searchParams.get('order') || 'desc';

    // ソートフィールドのバリデーション（SQLインジェクション対策）
    const allowedSortFields = ['avg_likes', 'max_likes', 'avg_comments', 'avg_views', 'total_posts', 'last_updated_at'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'avg_likes';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // SQLで使用するカラム名（フロントエンドからはtotal_postsとして送信される）
    const sortColumn = sortField;

    let sql: string;
    let params: any[];

    if (search.trim().length >= 2) {
      // 検索クエリがある場合
      sql = `
        SELECT
          owner_id,
          owner_username,
          total_posts AS total,
          transcribed,
          has_ja,
          avg_likes,
          max_likes,
          avg_comments,
          avg_views,
          first_collected_at,
          last_updated_at
        FROM public.owner_stats
        WHERE owner_username ILIKE $1
           OR owner_id ILIKE $1
        ORDER BY 
          CASE 
            WHEN owner_username ILIKE $2 THEN 1
            WHEN owner_id ILIKE $2 THEN 2
            ELSE 3
          END,
          ${sortColumn} ${sortOrder} NULLS LAST
        LIMIT $3 OFFSET $4
      `;
      params = [`%${search}%`, `${search}%`, limit, offset];
    } else {
      // 検索クエリがない場合
      sql = `
        SELECT
          owner_id,
          owner_username,
          total_posts AS total,
          transcribed,
          has_ja,
          avg_likes,
          max_likes,
          avg_comments,
          avg_views,
          first_collected_at,
          last_updated_at
        FROM public.owner_stats
        ORDER BY ${sortColumn} ${sortOrder} NULLS LAST
        LIMIT $1 OFFSET $2
      `;
      params = [limit, offset];
    }

    const result = await query<{
      owner_id: string;
      owner_username: string | null;
      total: string;
      transcribed: string;
      has_ja: string;
      avg_likes: string | null;
      max_likes: number | null;
      avg_comments: string | null;
      avg_views: string | null;
      first_collected_at: Date | null;
      last_updated_at: Date | null;
    }>(sql, params);

    // 数値を文字列から数値に変換し、日時をISO文字列に変換
    const owners = result.rows.map((row) => ({
      owner_id: row.owner_id,
      owner_username: row.owner_username,
      total: parseInt(row.total, 10),
      transcribed: parseInt(row.transcribed, 10),
      has_ja: parseInt(row.has_ja, 10),
      avg_likes: row.avg_likes ? parseFloat(row.avg_likes) : null,
      max_likes: row.max_likes,
      avg_comments: row.avg_comments ? parseFloat(row.avg_comments) : null,
      avg_views: row.avg_views ? parseFloat(row.avg_views) : null,
      first_collected_at: row.first_collected_at?.toISOString() || null,
      last_updated_at: row.last_updated_at?.toISOString() || null,
    }));

    const response = NextResponse.json(owners);
    
    // キャッシュヘッダーを追加（30分間キャッシュ）
    response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');

    return response;
  } catch (error) {
    console.error('Error fetching owners:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch owners', details: errorMessage },
      { status: 500 }
    );
  }
}
