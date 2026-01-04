import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner_id: string }> }
) {
  try {
    const { owner_id } = await params;

    // すべての投稿の台本を取得
    const sql = `
      SELECT
        j.transcript_text,
        j.transcript_ja
      FROM public.ig_jobs j
      JOIN public.ig_post_metrics m
        ON m.ig_code = j.ig_code
      WHERE m.owner_id = $1
        AND j.transcript_text IS NOT NULL
        AND j.transcript_text <> ''
      ORDER BY m.posted_at DESC NULLS LAST, m.fetched_at DESC
    `;

    const result = await query<{
      transcript_text: string;
      transcript_ja: string | null;
    }>(sql, [owner_id]);

    const transcripts = {
      english: result.rows
        .map((row) => row.transcript_text)
        .filter((text) => text && text.trim() !== '')
        .join('\n\n---\n\n'),
      japanese: result.rows
        .map((row) => row.transcript_ja)
        .filter((text) => text && text.trim() !== '')
        .join('\n\n---\n\n'),
    };

    return NextResponse.json(transcripts);
  } catch (error) {
    console.error('Error fetching transcripts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcripts' },
      { status: 500 }
    );
  }
}
