import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { unstable_cache } from 'next/cache';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EXCLUDED_ACCOUNTS = ['weratedogs'];

const GENRES = [
  'knowledge',
  'business',
  'mindset',
  'lifestyle',
  'entertainment',
] as const;

type Genre = (typeof GENRES)[number];

const GENRE_LABELS: Record<Genre, string> = {
  knowledge: '知識・雑学',
  business: 'ビジネス・副業',
  mindset: 'マインド・自己啓発',
  lifestyle: 'ライフスタイル',
  entertainment: 'エンタメ・ストーリー',
};

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

export interface ClassifiedPost {
  ig_code: string;
  owner_username: string | null;
  likes_count: number;
  video_view_count: number;
  engagement_rate: number;
  total_score: number;
  posted_at: string;
  summary: string;
  transcript_ja: string;
}

export interface GenreGroup {
  genre: Genre;
  label: string;
  posts: ClassifiedPost[];
}

async function generateRecommendations() {
  const excludePlaceholders = EXCLUDED_ACCOUNTS.map(
    (_, i) => `$${i + 1}`
  ).join(', ');

  const sql = `
    SELECT r.ig_code, r.owner_id, r.owner_username, r.likes_count,
           r.video_view_count, r.engagement_rate, r.total_score, r.posted_at,
           j.transcript_ja
    FROM ranking_30d r
    JOIN ig_jobs j ON r.ig_code = j.ig_code
    WHERE j.transcript_ja IS NOT NULL AND j.transcript_ja != ''
      AND (r.owner_username IS NULL OR r.owner_username NOT IN (${excludePlaceholders}))
    ORDER BY r.total_score DESC
    LIMIT 50
  `;

  const result = await query<RankingRow>(sql, EXCLUDED_ACCOUNTS);

  const postsForLLM = result.rows.map((row, i) => ({
    i: i + 1,
    c: row.ig_code,
    s: row.transcript_ja.slice(0, 300),
  }));

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `台本を読み、ジャンル分類と1行要約をJSON出力。

ジャンル:
- knowledge: 知識・雑学・科学・歴史・語学・教育・トリビア
- business: ビジネス・副業・マーケ・投資・お金・テック・AI
- mindset: マインド・自己啓発・成功哲学・習慣・モチベーション
- lifestyle: 健康・美容・フィットネス・料理・旅行・日常
- entertainment: エンタメ・ストーリー・コメディ・人間関係・恋愛・心理

出力: {"r":[{"c":"ig_code","g":"genre","s":"台本の内容を30文字以内で要約"}]}
全件分類。迷ったらentertainment。`,
      },
      {
        role: 'user',
        content: JSON.stringify(postsForLLM),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('LLM returned empty response');

  const parsed = JSON.parse(content) as {
    r: { c: string; g: string; s: string }[];
  };

  const llmMap = new Map(parsed.r.map((p) => [p.c, p]));

  const genreMap: Record<string, ClassifiedPost[]> = {};
  for (const g of GENRES) genreMap[g] = [];

  for (const row of result.rows) {
    const llm = llmMap.get(row.ig_code);
    const genre = llm?.g && genreMap[llm.g] ? llm.g : 'entertainment';

    genreMap[genre].push({
      ig_code: row.ig_code,
      owner_username: row.owner_username,
      likes_count: row.likes_count,
      video_view_count: row.video_view_count,
      engagement_rate: parseFloat(row.engagement_rate),
      total_score: parseFloat(row.total_score),
      posted_at: row.posted_at.toISOString(),
      summary: llm?.s || '',
      transcript_ja: row.transcript_ja.slice(0, 150),
    });
  }

  const genres: GenreGroup[] = GENRES.map((g) => ({
    genre: g,
    label: GENRE_LABELS[g],
    posts: genreMap[g].slice(0, 10),
  })).filter((g) => g.posts.length > 0);

  return {
    generated_at: new Date().toISOString(),
    genres,
  };
}

export async function GET() {
  try {
    const cached = unstable_cache(
      generateRecommendations,
      ['recommendations-v4'],
      { revalidate: 86400, tags: ['recommendations'] }
    );

    const data = await cached();
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
