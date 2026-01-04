import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getUserId } from '@/lib/user';

export async function GET(request: NextRequest) {
  try {
    const user_id = getUserId();
    const searchParams = request.nextUrl.searchParams;
    const sort = searchParams.get('sort') || 'created_at'; // created_at, posted_at, likes_count, etc.

    // ソート順の決定
    let orderBy = 'f.created_at DESC';
    switch (sort) {
      case 'posted_at':
        orderBy = 'm.posted_at DESC NULLS LAST, f.created_at DESC';
        break;
      case 'likes_count':
        orderBy = 'm.likes_count DESC NULLS LAST, f.created_at DESC';
        break;
      case 'comments_count':
        orderBy = 'm.comments_count DESC NULLS LAST, f.created_at DESC';
        break;
      case 'video_view_count':
        orderBy = 'm.video_view_count DESC NULLS LAST, f.created_at DESC';
        break;
      case 'engagement_rate':
        orderBy = 'm.engagement_rate DESC NULLS LAST, f.created_at DESC';
        break;
      case 'created_at':
      default:
        orderBy = 'f.created_at DESC';
        break;
    }

    // お気に入り一覧を取得（投稿情報と台本を含む）
    const sql = `
      SELECT
        f.ig_code,
        f.created_at as favorited_at,
        m.owner_id,
        m.owner_username,
        m.likes_count,
        m.video_view_count,
        m.comments_count,
        m.posted_at,
        m.engagement_rate,
        j.canonical_url,
        j.transcript_text,
        j.transcript_ja,
        j.transcribed_at,
        j.updated_at
      FROM public.favorites f
      JOIN public.ig_jobs j ON j.ig_code = f.ig_code
      LEFT JOIN public.ig_post_metrics m ON m.ig_code = f.ig_code
      WHERE f.user_id = $1
      ORDER BY ${orderBy}
    `;

    const result = await query<{
      ig_code: string;
      favorited_at: Date;
      owner_id: string | null;
      owner_username: string | null;
      likes_count: number | null;
      video_view_count: number | null;
      comments_count: number | null;
      posted_at: Date | null;
      engagement_rate: string | null;
      canonical_url: string | null;
      transcript_text: string | null;
      transcript_ja: string | null;
      transcribed_at: Date | null;
      updated_at: Date | null;
    }>(sql, [user_id]);

    const favorites = result.rows.map((row) => ({
      ig_code: row.ig_code,
      favorited_at: row.favorited_at.toISOString(),
      owner_id: row.owner_id,
      owner_username: row.owner_username,
      likes_count: row.likes_count,
      video_view_count: row.video_view_count,
      comments_count: row.comments_count,
      posted_at: row.posted_at?.toISOString() || null,
      engagement_rate: row.engagement_rate ? parseFloat(row.engagement_rate) : null,
      canonical_url: row.canonical_url,
      transcript_text: row.transcript_text,
      transcript_ja: row.transcript_ja,
      transcribed_at: row.transcribed_at?.toISOString() || null,
      updated_at: row.updated_at?.toISOString() || null,
    }));

    return NextResponse.json(favorites, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    return NextResponse.json(
      { error: 'Failed to fetch favorites' },
      { status: 500 }
    );
  }
}
