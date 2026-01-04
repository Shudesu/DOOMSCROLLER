import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getUserId } from '@/lib/user';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ig_code: string }> }
) {
  try {
    const { ig_code } = await params;
    const user_id = getUserId();

    // お気に入りに追加（ON CONFLICTで1クエリで処理）
    const sql = `
      INSERT INTO public.favorites(user_id, ig_code)
      VALUES ($1, $2)
      ON CONFLICT (user_id, ig_code)
      DO NOTHING
      RETURNING created_at
    `;

    const result = await query<{
      created_at: Date;
    }>(sql, [user_id, ig_code]);

    if (result.rows.length === 0) {
      // 既に存在する場合
      return NextResponse.json(
        { message: 'Already favorited', favorited: true },
        { status: 200 }
      );
    }

    // revalidateTagは削除（お気に入り状態は別APIで取得するため不要）
    // 非同期で実行すると遅延の原因になるため削除

    return NextResponse.json({
      user_id,
      ig_code,
      created_at: result.rows[0].created_at.toISOString(),
      favorited: true,
    });
  } catch (error: any) {
    console.error('Error adding favorite:', error);
    
    // 外部キー制約違反の場合は404を返す
    if (error.code === '23503' || error.message?.includes('foreign key')) {
      return NextResponse.json(
        { error: 'Reel not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to add favorite' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ ig_code: string }> }
) {
  try {
    const { ig_code } = await params;
    const user_id = getUserId();

    // お気に入りから削除
    const sql = `
      DELETE FROM public.favorites
      WHERE user_id = $1 AND ig_code = $2
      RETURNING *
    `;

    const result = await query<{
      user_id: string;
      ig_code: string;
      created_at: Date;
    }>(sql, [user_id, ig_code]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { message: 'Not favorited', favorited: false },
        { status: 200 }
      );
    }

    // revalidateTagは削除（お気に入り状態は別APIで取得するため不要）

    return NextResponse.json({
      message: 'Favorite removed',
      favorited: false,
    });
  } catch (error) {
    console.error('Error removing favorite:', error);
    return NextResponse.json(
      { error: 'Failed to remove favorite' },
      { status: 500 }
    );
  }
}
