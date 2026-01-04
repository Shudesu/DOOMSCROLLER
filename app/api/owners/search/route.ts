import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    if (!q || q.trim().length === 0) {
      return NextResponse.json([]);
    }

    const searchQuery = q.trim();

    // owner_usernameまたはowner_idで部分一致検索
    const sql = `
      SELECT
        owner_id,
        owner_username
      FROM public.owner_stats
      WHERE owner_username ILIKE $1
         OR owner_id ILIKE $1
      ORDER BY 
        CASE 
          WHEN owner_username ILIKE $2 THEN 1
          WHEN owner_id ILIKE $2 THEN 2
          ELSE 3
        END,
        owner_username NULLS LAST
      LIMIT $3
    `;

    const result = await query<{
      owner_id: string;
      owner_username: string | null;
    }>(sql, [`%${searchQuery}%`, `${searchQuery}%`, limit]);

    const suggestions = result.rows.map((row) => ({
      owner_id: row.owner_id,
      owner_username: row.owner_username,
      display: row.owner_username ? `@${row.owner_username} (${row.owner_id})` : row.owner_id,
    }));

    return NextResponse.json(suggestions, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('Error searching owners:', error);
    return NextResponse.json(
      { error: 'Failed to search owners' },
      { status: 500 }
    );
  }
}
