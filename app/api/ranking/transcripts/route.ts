import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    // ランキング上位50件の投稿のig_codeを取得
    const rankingSql = `
      SELECT ig_code
      FROM public.ranking_30d
      ORDER BY total_score DESC
      LIMIT 50
    `;

    const rankingResult = await query<{ ig_code: string }>(rankingSql);
    const igCodes = rankingResult.rows.map((row) => row.ig_code);

    if (igCodes.length === 0) {
      return NextResponse.json({
        english: '',
        japanese: '',
      });
    }

    // ig_jobsから台本を取得
    const transcriptsSql = `
      SELECT
        ig_code,
        transcript_text,
        transcript_ja
      FROM public.ig_jobs
      WHERE ig_code = ANY($1)
        AND transcript_text IS NOT NULL
        AND transcript_text <> ''
      ORDER BY updated_at DESC
    `;

    const result = await query<{
      ig_code: string;
      transcript_text: string | null;
      transcript_ja: string | null;
    }>(transcriptsSql, [igCodes]);

    const englishTranscripts = result.rows
      .map((row) => row.transcript_text)
      .filter((text) => text !== null && text !== '')
      .join('\n\n---\n\n');

    const japaneseTranscripts = result.rows
      .map((row) => row.transcript_ja)
      .filter((text) => text !== null && text !== '')
      .join('\n\n---\n\n');

    return NextResponse.json({
      english: englishTranscripts,
      japanese: japaneseTranscripts,
    });
  } catch (error) {
    console.error('Error fetching transcripts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcripts' },
      { status: 500 }
    );
  }
}
