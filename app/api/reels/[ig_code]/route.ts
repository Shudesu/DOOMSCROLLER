import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { unstable_cache } from 'next/cache';

async function getCachedReelDetail(ig_code: string) {
  // 1つのJOINクエリでメトリクスと台本情報を取得（高速化）
  // お気に入り状態は別APIで取得するため、ここでは含めない
  const sql = `
    SELECT
      COALESCE(m.ig_code, j.ig_code) as ig_code,
      COALESCE(m.owner_id, j.owner_id) as owner_id,
      m.owner_username,
      m.likes_count,
      m.video_view_count,
      m.comments_count,
      m.posted_at,
      m.engagement_rate,
      j.canonical_url,
      j.status,
      j.transcript_text,
      j.transcript_ja,
      j.transcribed_at,
      j.updated_at,
      j.video_r2_key
    FROM public.ig_jobs j
    FULL OUTER JOIN public.ig_post_metrics m ON m.ig_code = j.ig_code
    WHERE COALESCE(m.ig_code, j.ig_code) = $1
    LIMIT 1
  `;

  const result = await query<{
    ig_code: string;
    owner_id: string | null;
    owner_username: string | null;
    likes_count: number | null;
    video_view_count: number | null;
    comments_count: number | null;
    posted_at: Date | null;
    engagement_rate: string | null;
    canonical_url: string | null;
    status: string | null;
    transcript_text: string | null;
    transcript_ja: string | null;
    transcribed_at: Date | null;
    updated_at: Date | null;
    video_r2_key: string | null;
  }>(sql, [ig_code]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    ig_code: row.ig_code,
    owner_id: row.owner_id,
    owner_username: row.owner_username,
    canonical_url: row.canonical_url,
    status: row.status || 'not_processed',
    transcript_text: row.transcript_text,
    transcript_ja: row.transcript_ja,
    transcribed_at: row.transcribed_at?.toISOString() || null,
    updated_at: row.updated_at?.toISOString() || null,
    likes_count: row.likes_count,
    video_view_count: row.video_view_count,
    comments_count: row.comments_count,
    posted_at: row.posted_at?.toISOString() || null,
    engagement_rate: row.engagement_rate ? parseFloat(row.engagement_rate) : null,
    video_r2_key: row.video_r2_key,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ig_code: string }> }
) {
  try {
    const { ig_code } = await params;

    const cachedReel = unstable_cache(
      async (code: string) => getCachedReelDetail(code),
      ['reel-detail', ig_code],
      {
        revalidate: 600, // 10分間キャッシュ
        tags: [`reel-${ig_code}`],
      }
    );

    const reel = await cachedReel(ig_code);

    if (!reel) {
      return NextResponse.json(
        { error: 'Reel not found in ig_jobs or ig_post_metrics' },
        { status: 404 }
      );
    }

    const response = NextResponse.json(reel);
    response.headers.set('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
    return response;
  } catch (error) {
    console.error('Error fetching reel detail:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reel detail' },
      { status: 500 }
    );
  }
}
