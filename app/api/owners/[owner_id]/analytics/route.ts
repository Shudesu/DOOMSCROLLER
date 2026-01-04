import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { unstable_cache } from 'next/cache';

// キャッシュされた関数を定義
async function getCachedAnalytics(owner_id: string) {
  try {
    // 基本統計情報を取得（owner_statsから1発で取得）
    const statsSql = `
      SELECT
        total_posts,
        posts_with_transcript,
        posts_with_ja,
        avg_likes,
        avg_comments,
        avg_views,
        avg_plays,
        max_likes,
        max_comments,
        max_views,
        first_post_date,
        last_post_date
      FROM public.owner_stats
      WHERE owner_id = $1
    `;

    const statsResult = await query<{
      total_posts: string;
      posts_with_transcript: string;
      posts_with_ja: string;
      avg_likes: string | null;
      avg_comments: string | null;
      avg_views: string | null;
      avg_plays: string | null;
      max_likes: number | null;
      max_comments: number | null;
      max_views: number | null;
      first_post_date: Date | null;
      last_post_date: Date | null;
    }>(statsSql, [owner_id]);

    // 判定の分布（ig_reviewsテーブルは不要なので常に空）
    const decisionDistribution: { decision: string; count: number }[] = [];

    // 時系列データ（マテリアライズドビューから取得）
    const timeSeriesSql = `
      SELECT
        month,
        post_count,
        avg_likes,
        avg_comments,
        avg_views
      FROM owner_time_series_cache
      WHERE owner_id = $1
      ORDER BY month DESC
      LIMIT 12
    `;

    const timeSeriesResult = await query<{
      month: Date;
      post_count: string;
      avg_likes: string | null;
      avg_comments: string | null;
      avg_views: string | null;
    }>(timeSeriesSql, [owner_id]);

    // トップパフォーマンス投稿（マテリアライズドビューから取得）
    const topPostsSql = `
      SELECT
        ig_code,
        likes_count,
        comments_count,
        video_view_count,
        posted_at,
        has_transcript,
        has_ja
      FROM owner_top_posts_cache
      WHERE owner_id = $1
        AND rank_by_likes <= 10
      ORDER BY rank_by_likes
    `;

    const topPostsResult = await query<{
      ig_code: string;
      likes_count: number | null;
      comments_count: number | null;
      video_view_count: number | null;
      posted_at: Date | null;
      has_transcript: boolean;
      has_ja: boolean;
    }>(topPostsSql, [owner_id]);

    // 台本のキーワード分析（マテリアライズドビューから取得）
    const transcriptsSql = `
      SELECT transcript_text
      FROM owner_transcripts_cache
      WHERE owner_id = $1
      LIMIT 100
    `;

    const transcriptsResult = await query<{
      transcript_text: string;
    }>(transcriptsSql, [owner_id]);

    // 簡単なキーワード抽出（英語の頻出単語）
    const extractKeywords = (texts: string[]): { word: string; count: number }[] => {
      const wordCount: Record<string, number> = {};
      const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
        'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
        'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
        'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
        'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
        'if', 'then', 'else', 'because', 'so', 'than', 'as', 'from', 'up', 'about', 'into', 'through',
        'during', 'before', 'after', 'above', 'below', 'out', 'off', 'over', 'under', 'again', 'further',
        'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'both', 'few',
        'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
        'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now'
      ]);

      texts.forEach((text) => {
        // 英語の単語分割
        const words = text
          .toLowerCase()
          .replace(/[^\w\s]/g, ' ') // 記号を削除
          .split(/\s+/) // 空白で分割
          .filter((word) => word.length > 2 && !stopWords.has(word)); // 2文字以下とストップワードを除外

        words.forEach((word) => {
          wordCount[word] = (wordCount[word] || 0) + 1;
        });
      });

      return Object.entries(wordCount)
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);
    };

    const keywords = extractKeywords(
      transcriptsResult.rows.map((row) => row.transcript_text)
    );

    if (!statsResult.rows[0]) {
      throw new Error('Owner stats not found');
    }

    const stats = statsResult.rows[0];
    const analytics = {
      overview: {
        total_posts: parseInt(stats.total_posts, 10),
        posts_with_transcript: parseInt(stats.posts_with_transcript, 10),
        posts_with_ja: parseInt(stats.posts_with_ja, 10),
        transcript_rate: stats.total_posts
          ? (parseInt(stats.posts_with_transcript, 10) / parseInt(stats.total_posts, 10)) * 100
          : 0,
        ja_translation_rate: stats.posts_with_transcript
          ? (parseInt(stats.posts_with_ja, 10) / parseInt(stats.posts_with_transcript, 10)) * 100
          : 0,
      },
      performance: {
        avg_likes: stats.avg_likes ? parseFloat(stats.avg_likes) : null,
        avg_comments: stats.avg_comments ? parseFloat(stats.avg_comments) : null,
        avg_views: stats.avg_views ? parseFloat(stats.avg_views) : null,
        avg_plays: stats.avg_plays ? parseFloat(stats.avg_plays) : null,
        max_likes: stats.max_likes,
        max_comments: stats.max_comments,
        max_views: stats.max_views,
      },
      decision_distribution: decisionDistribution,
      time_series: timeSeriesResult.rows.map((row) => ({
        month: row.month.toISOString().split('T')[0],
        post_count: parseInt(row.post_count, 10),
        avg_likes: row.avg_likes ? parseFloat(row.avg_likes) : null,
        avg_comments: row.avg_comments ? parseFloat(row.avg_comments) : null,
        avg_views: row.avg_views ? parseFloat(row.avg_views) : null,
      })),
      top_posts: topPostsResult.rows.map((row) => ({
        ig_code: row.ig_code,
        likes_count: row.likes_count,
        comments_count: row.comments_count,
        video_view_count: row.video_view_count,
        posted_at: row.posted_at?.toISOString() || null,
        has_transcript: row.has_transcript,
        has_ja: row.has_ja,
      })),
      keywords: keywords,
      date_range: {
        first_post: stats.first_post_date?.toISOString() || null,
        last_post: stats.last_post_date?.toISOString() || null,
      },
    };

    return analytics;
  } catch (error) {
    console.error('Error fetching analytics:', error);
    throw error;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner_id: string }> }
) {
  try {
    const { owner_id } = await params;

    // キャッシュ無効化パラメータをチェック
    const searchParams = request.nextUrl.searchParams;
    const noCache = searchParams.get('noCache') === 'true';

    let analytics;
    if (noCache) {
      // キャッシュをバイパスして直接取得
      analytics = await getCachedAnalytics(owner_id);
    } else {
      // unstable_cacheでキャッシュ
      const cachedAnalytics = unstable_cache(
        async (id: string) => getCachedAnalytics(id),
        ['analytics', owner_id],
        {
          revalidate: 60, // 1分間キャッシュ
          tags: [`analytics-${owner_id}`],
        }
      );
      analytics = await cachedAnalytics(owner_id);
    }

    return NextResponse.json(analytics, {
      headers: {
        'Cache-Control': noCache 
          ? 'no-cache, no-store, must-revalidate' 
          : 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
