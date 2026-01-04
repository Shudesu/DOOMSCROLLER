import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getUserId } from '@/lib/user';

/**
 * お気に入り状態をチェックするAPI
 * キャッシュを使わず、常に最新の状態を返す
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ig_code: string }> }
) {
  try {
    const { ig_code } = await params;
    const user_id = getUserId();

    const sql = `
      SELECT EXISTS(
        SELECT 1 FROM public.favorites
        WHERE user_id = $1 AND ig_code = $2
      ) as is_favorite
    `;

    const result = await query<{
      is_favorite: boolean;
    }>(sql, [user_id, ig_code]);

    return NextResponse.json({
      ig_code,
      is_favorite: result.rows[0]?.is_favorite || false,
    });
  } catch (error) {
    console.error('Error checking favorite status:', error);
    return NextResponse.json(
      { error: 'Failed to check favorite status' },
      { status: 500 }
    );
  }
}
