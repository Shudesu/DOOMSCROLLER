import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner_id: string }> }
) {
  try {
    const { owner_id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get('format') || 'json'; // json or csv

    // アカウントの全リールデータを取得（台本と数値を含む）
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
        j.canonical_url,
        j.transcript_text,
        j.transcript_ja,
        j.transcribed_at,
        r.decision,
        r.note
      FROM public.ig_post_metrics m
      LEFT JOIN public.ig_jobs j
        ON j.ig_code = m.ig_code
      LEFT JOIN public.ig_reviews r
        ON r.owner_id = m.owner_id AND r.ig_code = m.ig_code
      WHERE m.owner_id = $1
      ORDER BY m.posted_at DESC NULLS LAST, m.fetched_at DESC
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
      transcript_text: string | null;
      transcript_ja: string | null;
      transcribed_at: Date | null;
      decision: string | null;
      note: string | null;
    }>(sql, [owner_id]);

    const data = result.rows.map((row) => ({
      ig_code: row.ig_code,
      owner_username: row.owner_username,
      canonical_url: row.canonical_url,
      likes_count: row.likes_count,
      comments_count: row.comments_count,
      video_view_count: row.video_view_count,
      video_play_count: row.video_play_count,
      engagement_rate: row.engagement_rate,
      posted_at: row.posted_at?.toISOString() || null,
      fetched_at: row.fetched_at?.toISOString() || null,
      transcript_text: row.transcript_text,
      transcript_ja: row.transcript_ja,
      transcribed_at: row.transcribed_at?.toISOString() || null,
      decision: row.decision,
      note: row.note,
    }));

    if (format === 'csv') {
      // CSV形式で出力
      const headers = [
        'IG Code',
        'Owner Username',
        'Canonical URL',
        'Likes',
        'Comments',
        'Video Views',
        'Video Plays',
        'Engagement Rate',
        'Posted At',
        'Fetched At',
        'Transcript (EN)',
        'Transcript (JA)',
        'Transcribed At',
        'Decision',
        'Note',
      ];

      const csvRows = [
        headers.join(','),
        ...data.map((row) => {
          const escapeCSV = (value: any) => {
            if (value === null || value === undefined) return '';
            const str = String(value);
            // カンマ、改行、ダブルクォートを含む場合はエスケープ
            if (str.includes(',') || str.includes('\n') || str.includes('"')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          };

          return [
            escapeCSV(row.ig_code),
            escapeCSV(row.owner_username),
            escapeCSV(row.canonical_url),
            escapeCSV(row.likes_count),
            escapeCSV(row.comments_count),
            escapeCSV(row.video_view_count),
            escapeCSV(row.video_play_count),
            escapeCSV(row.engagement_rate),
            escapeCSV(row.posted_at),
            escapeCSV(row.fetched_at),
            escapeCSV(row.transcript_text),
            escapeCSV(row.transcript_ja),
            escapeCSV(row.transcribed_at),
            escapeCSV(row.decision),
            escapeCSV(row.note),
          ].join(',');
        }),
      ];

      const csv = csvRows.join('\n');
      const filename = `owner_${owner_id}_export_${new Date().toISOString().split('T')[0]}.csv`;

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    } else {
      // JSON形式で出力（デフォルト）
      const filename = `owner_${owner_id}_export_${new Date().toISOString().split('T')[0]}.json`;
      
      return new NextResponse(JSON.stringify(data, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }
  } catch (error) {
    console.error('Error exporting data:', error);
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    );
  }
}
