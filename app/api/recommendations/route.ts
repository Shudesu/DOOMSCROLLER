import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { unstable_cache } from 'next/cache';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface RankingRow {
  ig_code: string;
  owner_id: string | null;
  owner_username: string | null;
  likes_count: number;
  video_view_count: number;
  engagement_rate: string;
  total_score: string;
  posted_at: Date;
  transcript_ja: string;
}

interface Topic {
  title: string;
  hook: string;
  outline: string;
  why: string;
  reference_codes: string[];
  estimated_engagement: 'high' | 'medium';
}

async function generateRecommendations() {
  const sql = `
    SELECT r.ig_code, r.owner_id, r.owner_username, r.likes_count,
           r.video_view_count, r.engagement_rate, r.total_score, r.posted_at,
           j.transcript_ja
    FROM ranking_30d r
    JOIN ig_jobs j ON r.ig_code = j.ig_code
    WHERE j.transcript_ja IS NOT NULL AND j.transcript_ja != ''
    ORDER BY r.total_score DESC
    LIMIT 30
  `;

  const result = await query<RankingRow>(sql);

  const postsForLLM = result.rows.map((row, i) => ({
    index: i + 1,
    ig_code: row.ig_code,
    likes: row.likes_count,
    views: row.video_view_count,
    engagement_rate: parseFloat(row.engagement_rate),
    script_preview: row.transcript_ja.slice(0, 200),
  }));

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.7,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `あなたはInstagram Reelsのコンテンツ戦略アドバイザーです。
バズっているReelの台本データを分析し、今日撮影すべきトピックを提案してください。

以下のJSON形式で3〜5個のトピックを返してください:
{
  "topics": [
    {
      "title": "15文字以内の短いタイトル",
      "hook": "冒頭の掴みセリフ例（視聴者の注意を引く一言）",
      "outline": "動画の構成概要（3〜4ステップ）",
      "why": "なぜ今このトピックが伸びるのか（1〜2文）",
      "reference_codes": ["参考にした投稿のig_codeを1〜3個"],
      "estimated_engagement": "high または medium"
    }
  ]
}

ルール:
- 台本のトレンドやパターンを分析し、独自の切り口を提案する
- 同じジャンルに偏らず、多様なトピックを提案する
- 具体的で実行可能な提案にする
- reference_codesには実際に渡されたig_codeのみを使用する`,
      },
      {
        role: 'user',
        content: `以下は直近30日間でスコアが高いInstagram Reelの台本データです。これを分析して、今日撮影すべきトピックを提案してください。\n\n${JSON.stringify(postsForLLM, null, 2)}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('LLM returned empty response');
  }

  const parsed = JSON.parse(content) as { topics: Topic[] };

  const sourcePosts = result.rows
    .filter((row) =>
      parsed.topics.some((t) => t.reference_codes.includes(row.ig_code))
    )
    .map((row) => ({
      ig_code: row.ig_code,
      owner_username: row.owner_username,
      likes_count: row.likes_count,
      video_view_count: row.video_view_count,
    }));

  return {
    generated_at: new Date().toISOString(),
    topics: parsed.topics,
    source_posts: sourcePosts,
  };
}

export async function GET() {
  try {
    const cachedRecommendations = unstable_cache(
      generateRecommendations,
      ['recommendations'],
      {
        revalidate: 86400, // 24時間
        tags: ['recommendations'],
      }
    );

    const data = await cachedRecommendations();

    const response = NextResponse.json(data);
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=86400, stale-while-revalidate=3600'
    );
    return response;
  } catch (error) {
    console.error('Error generating recommendations:', error);
    return NextResponse.json(
      { error: 'Failed to generate recommendations' },
      { status: 500 }
    );
  }
}
