import { NextRequest, NextResponse } from 'next/server';
import { queryEmbedding, query } from '@/lib/db';

// 副ソート用の比較関数
function getSecondarySortComparison(
  a: { likes_count: number | null; comments_count: number | null; video_view_count: number | null; engagement_rate: number | null; posted_at: string | null; similarity?: number },
  b: { likes_count: number | null; comments_count: number | null; video_view_count: number | null; engagement_rate: number | null; posted_at: string | null; similarity?: number },
  secondarySort: string
): number {
  switch (secondarySort) {
    case 'likes':
      return (b.likes_count || 0) - (a.likes_count || 0);
    case 'comments':
      return (b.comments_count || 0) - (a.comments_count || 0);
    case 'engagement':
      return (b.engagement_rate || 0) - (a.engagement_rate || 0);
    case 'posted_at':
      const dateA = a.posted_at ? new Date(a.posted_at).getTime() : 0;
      const dateB = b.posted_at ? new Date(b.posted_at).getTime() : 0;
      return dateB - dateA;
    case 'similarity':
      // 類似度でソート（降順）
      return (b.similarity || 0) - (a.similarity || 0);
    case 'views':
    default:
      return (b.video_view_count || 0) - (a.video_view_count || 0);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner_id: string }> }
) {
  try {
    const { owner_id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const sort = searchParams.get('sort') || 'similarity';
    const secondarySort = searchParams.get('secondary_sort') || 'views';
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const topPercentage = sort === 'similarity' 
      ? parseFloat(searchParams.get('top_percentage') || '20')
      : 100; // 類似度順の場合のみパーセンテージ制限を適用
    const defaultPostsPerOwner = 10; // パーセンテージ制限がない場合のデフォルト値

    // 1. Neon DBから類似アカウントを検索（類似度順）
    const similarSql = `
      SELECT
        b.owner_id,
        1 - (a.embedding <=> b.embedding) AS similarity
      FROM owner_embedding_centroid a
      JOIN owner_embedding_centroid b
        ON a.owner_id <> b.owner_id
      WHERE a.owner_id = $1
      ORDER BY a.embedding <=> b.embedding
      LIMIT 20
    `;

    const similarResult = await queryEmbedding<{
      owner_id: string;
      similarity: number;
    }>(similarSql, [owner_id]);

    // 類似アカウントが見つからない場合
    if (similarResult.rows.length === 0) {
      return NextResponse.json({
        group_owner_id: owner_id,
        group_owner_username: null,
        similar_owners_count: 0,
        total_posts: 0,
        sort: sort,
        results: [],
      });
    }

    // 2. グループオーナーのユーザー名を取得
    const groupOwnerSql = `
      SELECT owner_username
      FROM public.owner_stats
      WHERE owner_id = $1
    `;
    const groupOwnerResult = await query<{
      owner_username: string | null;
    }>(groupOwnerSql, [owner_id]);
    const groupOwnerUsername = groupOwnerResult.rows[0]?.owner_username || null;

    // 3. 類似度マップを作成（元のオーナーは類似度1.0として扱う）
    const similarityMap = new Map<string, number>();
    similarityMap.set(owner_id, 1.0);
    similarResult.rows.forEach((row) => {
      similarityMap.set(row.owner_id, row.similarity);
    });

    // 4. 各アカウントの投稿数を取得（パーセンテージ制限用）
    const allOwnerIds = [owner_id, ...similarResult.rows.map((row) => row.owner_id)];
    let ownerPostCounts = new Map<string, number>();
    
    if (sort === 'similarity' && topPercentage < 100) {
      const postCountSql = `
        SELECT owner_id, COUNT(*) as total_posts
        FROM public.ig_post_metrics
        WHERE owner_id = ANY($1)
        GROUP BY owner_id
      `;
      const postCountResult = await query<{
        owner_id: string;
        total_posts: string;
      }>(postCountSql, [allOwnerIds]);
      
      postCountResult.rows.forEach((row) => {
        ownerPostCounts.set(row.owner_id, parseInt(row.total_posts, 10));
      });
    }
    
    // ソートカラムの検証と構築（各アカウント内でのソート用）
    // similarityの場合はsecondary_sortを使用、それ以外はsortを使用
    // ただし、secondary_sortがsimilarityの場合は、各アカウント内では再生数順を使用（類似度は全アカウント間で比較するため）
    const sortField = sort === 'similarity' ? (secondarySort === 'similarity' ? 'views' : secondarySort) : sort;
    let orderByClause: string;
    switch (sortField) {
      case 'likes':
        orderByClause = 'm.likes_count DESC NULLS LAST, m.ig_code DESC';
        break;
      case 'comments':
        orderByClause = 'm.comments_count DESC NULLS LAST, m.ig_code DESC';
        break;
      case 'engagement':
        orderByClause = 'm.engagement_rate DESC NULLS LAST, m.ig_code DESC';
        break;
      case 'posted_at':
        orderByClause = 'm.posted_at DESC NULLS LAST, m.ig_code DESC';
        break;
      case 'views':
      default:
        orderByClause = 'm.video_view_count DESC NULLS LAST, m.ig_code DESC';
        break;
    }

    // 各アカウントから上位投稿を取得（並列処理）
    const postsPromises = allOwnerIds.map(async (ownerId) => {
      // パーセンテージ制限を計算
      let limitCount = defaultPostsPerOwner;
      if (sort === 'similarity' && topPercentage < 100) {
        const totalPosts = ownerPostCounts.get(ownerId) || 0;
        if (totalPosts > 0) {
          limitCount = Math.max(1, Math.floor(totalPosts * (topPercentage / 100)));
        }
      }

      const postsSql = `
        SELECT
          m.ig_code,
          m.owner_id,
          m.owner_username,
          m.likes_count,
          m.comments_count,
          m.video_view_count,
          m.posted_at,
          m.engagement_rate
        FROM public.ig_post_metrics m
        WHERE m.owner_id = $1
        ORDER BY ${orderByClause}
        LIMIT $2
      `;

      const postsResult = await query<{
        ig_code: string;
        owner_id: string | null;
        owner_username: string | null;
        likes_count: number | null;
        comments_count: number | null;
        video_view_count: number | null;
        posted_at: Date | null;
        engagement_rate: number | null;
      }>(postsSql, [ownerId, limitCount]);

      const similarity = similarityMap.get(ownerId) || 0;

      return postsResult.rows.map((row) => ({
        ig_code: row.ig_code,
        owner_id: row.owner_id,
        owner_username: row.owner_username,
        similarity: similarity,
        likes_count: row.likes_count,
        comments_count: row.comments_count,
        video_view_count: row.video_view_count,
        posted_at: row.posted_at?.toISOString() || null,
        engagement_rate: row.engagement_rate,
      }));
    });

    const allPostsArrays = await Promise.all(postsPromises);
    let allPosts = allPostsArrays.flat();

    // 5. 最終的なソート
    if (sort === 'similarity') {
      // 類似度順の場合：主アカウントを最優先 → その後類似度順 → 各アカウント内でsecondary_sortでソート
      allPosts.sort((a, b) => {
        const aIsMainOwner = a.owner_id === owner_id;
        const bIsMainOwner = b.owner_id === owner_id;
        
        // 主アカウントを最優先
        if (aIsMainOwner && !bIsMainOwner) return -1;
        if (!aIsMainOwner && bIsMainOwner) return 1;
        
        // 両方とも主アカウント、または両方とも主アカウントでない場合
        if (aIsMainOwner && bIsMainOwner) {
          // 主アカウント内でsecondary_sortでソート
          return getSecondarySortComparison(a, b, secondarySort);
        }
        
        // 類似度でソート
        if (a.similarity !== b.similarity) {
          return b.similarity - a.similarity;
        }
        
        // 同じ類似度の場合はsecondary_sortでソート
        return getSecondarySortComparison(a, b, secondarySort);
      });
    } else {
      // その他のソートの場合：主ソート → 副ソート → 類似度順
      allPosts.sort((a, b) => {
        let comparison = 0;
        switch (sort) {
          case 'likes':
            comparison = (b.likes_count || 0) - (a.likes_count || 0);
            break;
          case 'comments':
            comparison = (b.comments_count || 0) - (a.comments_count || 0);
            break;
          case 'engagement':
            comparison = (b.engagement_rate || 0) - (a.engagement_rate || 0);
            break;
          case 'posted_at':
            const dateA = a.posted_at ? new Date(a.posted_at).getTime() : 0;
            const dateB = b.posted_at ? new Date(b.posted_at).getTime() : 0;
            comparison = dateB - dateA;
            break;
          case 'views':
          default:
            comparison = (b.video_view_count || 0) - (a.video_view_count || 0);
            break;
        }
        if (comparison !== 0) return comparison;
        
        // 同値の場合は副ソートでソート
        // 副ソートがsimilarityの場合は類似度でソート
        if (secondarySort === 'similarity') {
          const similarityComparison = b.similarity - a.similarity;
          if (similarityComparison !== 0) return similarityComparison;
        } else {
          const secondaryComparison = getSecondarySortComparison(a, b, secondarySort);
          if (secondaryComparison !== 0) return secondaryComparison;
        }
        
        // それでも同値の場合は類似度でソート
        return b.similarity - a.similarity;
      });
    }

    // 6. 制限を適用
    const results = allPosts.slice(0, limit);

    // キャッシュヘッダーを追加（5分間キャッシュ）
    return NextResponse.json({
      group_owner_id: owner_id,
      group_owner_username: groupOwnerUsername,
      similar_owners_count: similarResult.rows.length,
      total_posts: results.length,
      sort: sort,
      secondary_sort: secondarySort,
      results: results,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Error fetching group ranking:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch group ranking', details: errorMessage },
      { status: 500 }
    );
  }
}
