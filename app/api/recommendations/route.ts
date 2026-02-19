import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { unstable_cache } from 'next/cache';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EXCLUDED_ACCOUNTS = ['weratedogs'];

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

interface ClassifiedPost {
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

interface HARMCategory {
  category: 'health' | 'ambition' | 'relationship' | 'money';
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
    index: i + 1,
    ig_code: row.ig_code,
    owner: row.owner_username,
    script: row.transcript_ja.slice(0, 400),
  }));

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Instagram Reelsの台本データを分析し、各投稿をHARMジャンルに分類し、台本の要約を付けてください。

## HARMの法則
- health: 健康・美容・フィットネス・メンタルヘルス・ダイエット
- ambition: 夢・キャリア・自己成長・スキルアップ・テクノロジー・教育
- relationship: 人間関係・恋愛・コミュニケーション・人生の教訓・心理学
- money: お金・投資・副業・ビジネス・節約・マーケティング

以下のJSON形式で返してください:
{
  "posts": [
    {
      "ig_code": "元のig_code",
      "category": "health | ambition | relationship | money",
      "summary": "台本の内容を1〜2文で要約（何について話しているか、どんな主張か）"
    }
  ]
}

ルール:
- 全投稿を分類する（スキップしない）
- summaryは台本の実際の内容に基づく（捏造しない）
- どのカテゴリにも当てはまらない場合はambitionに入れる`,
      },
      {
        role: 'user',
        content: JSON.stringify(postsForLLM),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('LLM returned empty response');
  }

  const parsed = JSON.parse(content) as {
    posts: { ig_code: string; category: string; summary: string }[];
  };

  // Build a lookup map from LLM results
  const llmMap = new Map(parsed.posts.map((p) => [p.ig_code, p]));

  // Group posts by HARM category
  const categoryMap: Record<string, ClassifiedPost[]> = {
    health: [],
    ambition: [],
    relationship: [],
    money: [],
  };

  for (const row of result.rows) {
    const llmResult = llmMap.get(row.ig_code);
    const category = llmResult?.category || 'ambition';
    const validCategory = categoryMap[category] ? category : 'ambition';

    categoryMap[validCategory].push({
      ig_code: row.ig_code,
      owner_username: row.owner_username,
      likes_count: row.likes_count,
      video_view_count: row.video_view_count,
      engagement_rate: parseFloat(row.engagement_rate),
      total_score: parseFloat(row.total_score),
      posted_at: row.posted_at.toISOString(),
      summary: llmResult?.summary || '',
      transcript_ja: row.transcript_ja.slice(0, 200),
    });
  }

  const LABELS: Record<string, string> = {
    health: '健康・美容',
    ambition: '野心・成長',
    relationship: '人間関係',
    money: 'お金・ビジネス',
  };

  const categories: HARMCategory[] = ['health', 'ambition', 'relationship', 'money']
    .map((key) => ({
      category: key as HARMCategory['category'],
      label: LABELS[key],
      posts: categoryMap[key].slice(0, 8), // max 8 per category
    }))
    .filter((cat) => cat.posts.length > 0);

  return {
    generated_at: new Date().toISOString(),
    categories,
  };
}

export async function GET() {
  try {
    const cachedRecommendations = unstable_cache(
      generateRecommendations,
      ['recommendations-v3'],
      {
        revalidate: 86400,
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
