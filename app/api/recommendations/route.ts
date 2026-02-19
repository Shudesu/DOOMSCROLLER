import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { unstable_cache } from 'next/cache';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Content strategy に不向きなアカウント（ペット紹介など）
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

interface Topic {
  title: string;
  hook: string;
  outline: string;
  why: string;
  reference_codes: string[];
  estimated_engagement: 'high' | 'medium';
}

interface HARMCategory {
  category: 'health' | 'ambition' | 'relationship' | 'money';
  label: string;
  topics: Topic[];
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
    likes: row.likes_count,
    views: row.video_view_count,
    engagement_rate: parseFloat(row.engagement_rate),
    score: parseFloat(row.total_score),
    script_preview: row.transcript_ja.slice(0, 300),
  }));

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.7,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `あなたはInstagram Reelsのコンテンツ戦略アドバイザーです。
バズっているReelの台本データを分析し、HARMの法則に基づいてジャンル分類し、各ジャンルごとに撮影すべきトピックを提案してください。

ユーザーはバズ投稿の台本を参考にして、同じテーマ・構成で自分の動画を作ります。
台本の内容をしっかり分析し、そのまま使える具体的な提案をしてください。

## HARMの法則
- Health（健康・美容・フィットネス・メンタルヘルス）
- Ambition（夢・キャリア・自己成長・スキルアップ・テクノロジー）
- Relationship（人間関係・恋愛・コミュニケーション・人生の教訓）
- Money（お金・投資・副業・ビジネス・節約）

以下のJSON形式で返してください:
{
  "categories": [
    {
      "category": "health | ambition | relationship | money",
      "label": "日本語のジャンル名（例: 健康・美容）",
      "topics": [
        {
          "title": "15文字以内の短いタイトル",
          "hook": "冒頭の掴みセリフ例（そのまま使える一言）",
          "outline": "動画の構成概要（3〜4ステップ、箇条書き）",
          "why": "なぜ今このトピックが伸びるのか（1〜2文）",
          "reference_codes": ["参考にした投稿のig_codeを1〜3個"],
          "estimated_engagement": "high または medium"
        }
      ]
    }
  ]
}

ルール:
- 4つのHARMカテゴリすべてにトピックを出す
- 各カテゴリ2〜4個のトピック
- 台本の内容に基づいた具体的な提案にする（抽象的な提案は不要）
- hookはそのままカメラの前で言えるセリフにする
- outlineは実際の撮影手順として使える具体性にする
- reference_codesには実際に渡されたig_codeのみを使用する
- 該当する台本がないカテゴリでも、他の台本のパターン（構成・hook手法）を応用して提案する`,
      },
      {
        role: 'user',
        content: `以下は直近30日間でスコアが高いInstagram Reel TOP50の台本データです。これをHARMジャンルごとに分析して、撮影トピックを提案してください。\n\n${JSON.stringify(postsForLLM, null, 2)}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('LLM returned empty response');
  }

  const parsed = JSON.parse(content) as { categories: HARMCategory[] };

  // Collect all referenced ig_codes
  const allRefCodes = new Set<string>();
  for (const cat of parsed.categories) {
    for (const topic of cat.topics) {
      for (const code of topic.reference_codes) {
        allRefCodes.add(code);
      }
    }
  }

  const sourcePosts = result.rows
    .filter((row) => allRefCodes.has(row.ig_code))
    .map((row) => ({
      ig_code: row.ig_code,
      owner_username: row.owner_username,
      likes_count: row.likes_count,
      video_view_count: row.video_view_count,
      engagement_rate: parseFloat(row.engagement_rate),
      total_score: parseFloat(row.total_score),
    }));

  return {
    generated_at: new Date().toISOString(),
    categories: parsed.categories,
    source_posts: sourcePosts,
  };
}

export async function GET() {
  try {
    const cachedRecommendations = unstable_cache(
      generateRecommendations,
      ['recommendations-v2'],
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
