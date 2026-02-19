'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import LoadingSpinner from '@/components/LoadingSpinner';
import InlineSpinner from '@/components/InlineSpinner';
import ReelDetailModal from '@/components/ReelDetailModal';
import { useToast } from '@/components/ToastProvider';

interface SimilarOwner {
  owner_id: string;
  owner_username: string | null;
  similarity: number;
  total_posts: number;
  avg_views: number | null;
  avg_likes: number | null;
  avg_comments: number | null;
}

interface Reel {
  ig_code: string;
  owner_username: string | null;
  likes_count: number | null;
  comments_count: number | null;
  video_view_count: number | null;
  video_play_count: number | null;
  engagement_rate: number | null;
  posted_at: string | null;
  fetched_at: string | null;
  canonical_url: string | null;
  decision: string | null;
}

interface Analytics {
  overview: {
    total_posts: number;
    posts_with_transcript: number;
    posts_with_ja: number;
    transcript_rate: number;
    ja_translation_rate: number;
  };
  performance: {
    avg_likes: number | null;
    avg_comments: number | null;
    avg_views: number | null;
    avg_plays: number | null;
    max_likes: number | null;
    max_comments: number | null;
    max_views: number | null;
  };
  decision_distribution: { decision: string; count: number }[];
  time_series: {
    month: string;
    post_count: number;
    avg_likes: number | null;
    avg_comments: number | null;
    avg_views: number | null;
  }[];
  top_posts: {
    ig_code: string;
    likes_count: number | null;
    comments_count: number | null;
    video_view_count: number | null;
    posted_at: string | null;
    has_transcript: boolean;
    has_ja: boolean;
  }[];
  keywords: { word: string; count: number }[];
  date_range: {
    first_post: string | null;
    last_post: string | null;
  };
}

export default function OwnerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const ownerId = params.owner_id as string;

  const [selectedReel, setSelectedReel] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // モーダルを閉じた後も選択状態を保持
  const [lastSelectedReel, setLastSelectedReel] = useState<string | null>(null);
  const [copying, setCopying] = useState<'en' | 'ja' | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { showToast } = useToast();
  const pageSize = 50;

  // Analytics を React Query で取得
  const { data: analytics, isLoading: analyticsLoading, error: analyticsError, refetch: refetchAnalytics } = useQuery({
    queryKey: ['analytics', ownerId],
    queryFn: async () => {
      // キャッシュを無効化して最新データを取得
      const response = await fetch(`/api/owners/${ownerId}/analytics?noCache=true`);
      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }
      return response.json() as Promise<Analytics>;
    },
    staleTime: 1 * 60 * 1000, // 1分間キャッシュ（短縮）
    enabled: !!ownerId,
  });

  // Reels を React Query で取得（時系列順に並べる：最新が上、古いものが下）
  const { data: currentReels = [], isLoading: reelsLoading } = useQuery<Reel[]>({
    queryKey: ['reels', ownerId, currentPage, 'posted_at', 'desc'],
    queryFn: async () => {
      const offset = (currentPage - 1) * pageSize;
      const response = await fetch(`/api/owners/${ownerId}/reels?limit=${pageSize}&offset=${offset}&sort=posted_at&order=desc`);
      if (!response.ok) {
        throw new Error('Failed to fetch reels');
      }
      const data = await response.json() as Reel[];
      // クライアント側でも念のためソート（posted_atがNULLの場合はfetched_atでソート）
      return data.sort((a, b) => {
        const aDate = a.posted_at ? new Date(a.posted_at).getTime() : (a.fetched_at ? new Date(a.fetched_at).getTime() : 0);
        const bDate = b.posted_at ? new Date(b.posted_at).getTime() : (b.fetched_at ? new Date(b.fetched_at).getTime() : 0);
        return bDate - aDate; // DESC: 新しいものが上
      });
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!ownerId,
  });

  // ownerIdが変更されたら、ページをリセット
  useEffect(() => {
    setCurrentPage(1);
  }, [ownerId]);

  // 総ページ数を計算
  const totalPosts = analytics?.overview.total_posts || 0;
  const totalPages = Math.ceil(totalPosts / pageSize);

  // Similar Owners を React Query で取得
  const { data: similarOwners = [], isLoading: loadingSimilar } = useQuery<SimilarOwner[]>({
    queryKey: ['similar-owners', ownerId],
    queryFn: async () => {
      const response = await fetch(`/api/owners/${ownerId}/similar`);
      if (!response.ok) {
        return [];
      }
      return response.json() as Promise<SimilarOwner[]>;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!ownerId,
  });

  // Owner Username を取得
  const { data: ownerUsername } = useQuery({
    queryKey: ['owner-username', ownerId],
    queryFn: async () => {
      const response = await fetch(`/api/owners/${ownerId}/reels?limit=1`);
      if (!response.ok) return null;
      const data = await response.json();
      return data[0]?.owner_username || null;
    },
    staleTime: 10 * 60 * 1000, // 10分間キャッシュ（ユーザー名は変更されにくい）
    enabled: !!ownerId,
  });


  const formatSimilarity = (similarity: number): string => {
    return `${(similarity * 100).toFixed(1)}%`;
  };

  const formatNumber = (value: number | null): string => {
    if (value === null) return '—';
    const intValue = Math.floor(value);
    
    if (intValue >= 100000000) {
      const oku = Math.floor(intValue / 100000000);
      return `${oku}億`;
    }
    if (intValue >= 10000) {
      const man = Math.floor(intValue / 10000);
      return `${man}万`;
    }
    if (intValue >= 1000) {
      const sen = Math.floor(intValue / 1000);
      return `${sen}千`;
    }
    return intValue.toLocaleString('ja-JP');
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  };

  const copyAllTranscripts = async (type: 'en' | 'ja') => {
    setCopying(type);
    try {
      const response = await fetch(`/api/owners/${ownerId}/transcripts`);
      if (!response.ok) {
        throw new Error('Failed to fetch transcripts');
      }
      const data = await response.json();
      const text = type === 'en' ? data.english : data.japanese;
      
      if (!text || text.trim() === '') {
        showToast(`${type === 'en' ? '英語' : '日本語'}の台本が見つかりませんでした`);
        return;
      }

      await navigator.clipboard.writeText(text);
      showToast(`${type === 'en' ? '英語' : '日本語'}の台本をすべてコピーしました`);
    } catch (error) {
      console.error('Error copying transcripts:', error);
      showToast('コピーに失敗しました');
    } finally {
      setCopying(null);
    }
  };

  if (analyticsLoading) {
    return <LoadingSpinner />;
  }

  if (analyticsError) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-10">
        <div className="max-w-2xl mx-auto bg-red-50/80 border border-red-200/60 rounded-2xl p-6 shadow-sm">
          <p className="text-red-800 font-semibold text-base mb-2">エラーが発生しました</p>
          <p className="text-red-600 text-sm mb-4">
            {analyticsError instanceof Error ? analyticsError.message : 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-10">
        <div className="text-center py-16">
          <p className="text-gray-500 text-base">データが見つかりませんでした</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => router.push(`/owners?highlight=${ownerId}`)}
            className="text-slate-600 hover:text-slate-800 text-sm mb-4 font-medium transition-colors flex items-center gap-1"
          >
            ← アカウント一覧に戻る
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1">
                {ownerUsername || ownerId}
              </h1>
              <p className="text-sm text-gray-500">アカウントの詳細情報と分析</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push(`/group-ranking/${ownerId}`)}
                className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200 shadow-sm"
              >
                グループランキング
              </button>
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="px-5 py-2.5 bg-slate-700 text-white text-sm font-medium rounded-xl hover:bg-slate-800 transition-all duration-200 shadow-sm flex items-center gap-2"
                >
                  <span>アクション</span>
                  <svg
                    className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              
              {dropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200/60 z-20 overflow-hidden">
                    <div className="py-1">
                      <button
                        onClick={() => {
                          copyAllTranscripts('en');
                          setDropdownOpen(false);
                        }}
                        disabled={copying !== null}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-between"
                      >
                        <span>{copying === 'en' ? 'コピー中...' : '英語台本を一括コピー'}</span>
                        {copying === 'en' && <InlineSpinner size="sm" />}
                      </button>
                      <button
                        onClick={() => {
                          copyAllTranscripts('ja');
                          setDropdownOpen(false);
                        }}
                        disabled={copying !== null}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-between"
                      >
                        <span>{copying === 'ja' ? 'コピー中...' : '日本語台本を一括コピー'}</span>
                        {copying === 'ja' && <InlineSpinner size="sm" />}
                      </button>
                      <div className="border-t border-gray-200/60 my-1" />
                      <button
                        onClick={() => {
                          const url = `/api/owners/${ownerId}/export?format=json`;
                          window.open(url, '_blank');
                          setDropdownOpen(false);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        JSONでエクスポート
                      </button>
                      <button
                        onClick={() => {
                          const url = `/api/owners/${ownerId}/export?format=csv`;
                          window.open(url, '_blank');
                          setDropdownOpen(false);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        CSVでエクスポート
                      </button>
                    </div>
                  </div>
                </>
              )}
              </div>
            </div>
          </div>
        </div>

        {/* 2カラムレイアウト */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* 左カラム（40%） */}
          <div className="lg:col-span-2 space-y-6">
            {/* パフォーマンス指標 */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200/60">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-200/60">
                  <h3 className="text-xs font-medium text-gray-600 mb-2">平均いいね数</h3>
                  <p className="text-xl font-semibold text-gray-900">{formatNumber(analytics.performance.avg_likes)}</p>
                </div>
                <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-200/60">
                  <h3 className="text-xs font-medium text-gray-600 mb-2">平均コメント数</h3>
                  <p className="text-xl font-semibold text-gray-900">{formatNumber(analytics.performance.avg_comments)}</p>
                </div>
                <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-200/60">
                  <h3 className="text-xs font-medium text-gray-600 mb-2">平均再生数</h3>
                  <p className="text-xl font-semibold text-gray-900">{formatNumber(analytics.performance.avg_views)}</p>
                </div>
                <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-200/60">
                  <h3 className="text-xs font-medium text-gray-600 mb-2">最大いいね数</h3>
                  <p className="text-xl font-semibold text-gray-900">{formatNumber(analytics.performance.max_likes)}</p>
                </div>
              </div>
            </div>

            {/* 近いアカウント */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200/60">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 tracking-tight">近いアカウント</h2>
              {loadingSimilar ? (
                <div className="flex items-center justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : similarOwners.length > 0 ? (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {similarOwners.map((owner) => (
                    <div
                      key={owner.owner_id}
                      onClick={() => router.push(`/owners/${owner.owner_id}`)}
                      className="bg-gray-50/80 p-4 rounded-lg border border-gray-200/60 hover:border-slate-400 hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-gray-900">
                              {owner.owner_username || owner.owner_id}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded">
                              類似度: {formatSimilarity(owner.similarity)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-600">
                        <span>投稿数: {formatNumber(owner.total_posts)}</span>
                        {owner.avg_views !== null && (
                          <span>平均再生: {formatNumber(owner.avg_views)}</span>
                        )}
                        {owner.avg_likes !== null && (
                          <span>平均いいね: {formatNumber(owner.avg_likes)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 text-sm">
                  類似するアカウントが見つかりませんでした
                </div>
              )}
            </div>

            {/* 判定分布 */}
            {analytics.decision_distribution.length > 0 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200/60">
                <h2 className="text-lg font-semibold mb-4 text-gray-900 tracking-tight">判定分布</h2>
                <div className="flex gap-4">
                  {analytics.decision_distribution.map((item) => (
                    <div key={item.decision} className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-700 capitalize">
                          {item.decision === 'keep' ? 'Keep' : item.decision === 'skip' ? 'Skip' : 'Later'}
                        </span>
                        <span className="text-sm font-bold text-gray-900">{item.count}</span>
                      </div>
                      <div className="w-full bg-gray-200/60 rounded-full h-2.5">
                        <div
                          className={`h-2.5 rounded-full transition-all ${
                            item.decision === 'keep'
                              ? 'bg-green-500'
                              : item.decision === 'skip'
                              ? 'bg-red-500'
                              : 'bg-yellow-500'
                          }`}
                          style={{
                            width: `${
                              (item.count /
                                analytics.decision_distribution.reduce(
                                  (sum, d) => sum + d.count,
                                  0
                                )) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 時系列データ */}
            {analytics.time_series.length > 0 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200/60">
                <h2 className="text-lg font-semibold mb-4 text-gray-900 tracking-tight">月別パフォーマンス</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200/60">
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">月</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 uppercase">投稿数</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 uppercase">いいね</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 uppercase">コメント</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 uppercase">再生</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.time_series.map((item, index) => (
                        <tr key={index} className="border-b border-gray-200/60 hover:bg-gray-50/50 transition-colors">
                          <td className="px-3 py-2.5 text-gray-900">{item.month}</td>
                          <td className="px-3 py-2.5 text-right text-gray-900 font-medium">{item.post_count}</td>
                          <td className="px-3 py-2.5 text-right text-gray-900 font-medium">
                            {formatNumber(item.avg_likes)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-900 font-medium">
                            {formatNumber(item.avg_comments)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-900 font-medium">
                            {formatNumber(item.avg_views)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* キーワード */}
            {analytics.keywords.length > 0 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200/60">
                <h2 className="text-lg font-semibold mb-4 text-gray-900 tracking-tight">頻出キーワード</h2>
                <div className="flex flex-wrap gap-2">
                  {analytics.keywords.map((keyword, index) => (
                    <span
                      key={index}
                      className="px-3 py-1.5 bg-gray-50/80 text-gray-700 rounded-xl text-xs border border-gray-200/60 font-medium"
                    >
                      {keyword.word} ({keyword.count})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 右カラム（60%） */}
          <div className="lg:col-span-3 space-y-6">
            {/* トップパフォーマンス投稿 */}
            {analytics.top_posts.length > 0 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200/60">
                <h2 className="text-lg font-semibold mb-4 text-gray-900 tracking-tight">トップパフォーマンス投稿</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200/60">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">IG Code</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">いいね数</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">コメント数</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">再生数</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">投稿日</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">台本</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.top_posts.map((post) => (
                        <tr
                          key={post.ig_code}
                          className={`border-b border-gray-200/60 cursor-pointer transition-colors ${
                            lastSelectedReel === post.ig_code
                              ? 'bg-blue-50/80 hover:bg-blue-100/80'
                              : 'hover:bg-gray-50/80'
                          }`}
                          onClick={() => {
                            setSelectedReel(post.ig_code);
                            setIsModalOpen(true);
                          }}
                        >
                          <td className="px-4 py-3 text-sm font-mono text-gray-900">{post.ig_code}</td>
                          <td className="px-4 py-3 text-right text-gray-900 font-medium">
                            {formatNumber(post.likes_count)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-900 font-medium">
                            {formatNumber(post.comments_count)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-900 font-medium">
                            {formatNumber(post.video_view_count)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {formatDate(post.posted_at)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {post.has_ja ? (
                              <span className="text-green-600 font-semibold">✓</span>
                            ) : post.has_transcript ? (
                              <span className="text-yellow-600 font-medium">EN</span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* すべての投稿 */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200/60">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 tracking-tight">すべての投稿</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200/60">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">IG Code</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">いいね数</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">コメント数</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">再生数</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">投稿日</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentReels.map((reel) => (
                      <tr
                        key={reel.ig_code}
                        className={`border-b border-gray-200/60 cursor-pointer transition-colors ${
                          lastSelectedReel === reel.ig_code
                            ? 'bg-blue-50/80 hover:bg-blue-100/80'
                            : 'hover:bg-gray-50/80'
                        }`}
                        onClick={() => {
                          setSelectedReel(reel.ig_code);
                          setIsModalOpen(true);
                        }}
                      >
                        <td className="px-4 py-3 text-sm font-mono text-gray-900">{reel.ig_code}</td>
                        <td className="px-4 py-3 text-right text-gray-900 font-medium">
                          {formatNumber(reel.likes_count)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 font-medium">
                          {formatNumber(reel.comments_count)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 font-medium">
                          {formatNumber(reel.video_view_count)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatDate(reel.posted_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* ページネーション */}
              {totalPosts > 0 && (
                <div className="mt-6 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    {((currentPage - 1) * pageSize + 1)} - {Math.min(currentPage * pageSize, totalPosts)} / {totalPosts} 件
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const newPage = Math.max(1, currentPage - 1);
                        setCurrentPage(newPage);
                      }}
                      disabled={currentPage === 1 || reelsLoading}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-xl bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                    >
                      前へ
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        
                        return (
                          <button
                            key={pageNum}
                            onClick={() => {
                              setCurrentPage(pageNum);
                            }}
                            disabled={reelsLoading}
                            className={`px-3 py-2 text-sm rounded-xl transition-all ${
                              currentPage === pageNum
                                ? 'bg-slate-700 text-white font-medium'
                                : 'border border-gray-300 bg-white hover:bg-gray-50 text-gray-700'
                            } disabled:opacity-50 disabled:cursor-not-allowed shadow-sm`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => {
                        const newPage = currentPage + 1;
                        setCurrentPage(newPage);
                      }}
                      disabled={currentPage >= totalPages || reelsLoading}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-xl bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                    >
                      次へ
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reel Detail Modal */}
      {selectedReel && (
        <ReelDetailModal
          igCode={selectedReel}
          ownerId={ownerId}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setLastSelectedReel(selectedReel); // 閉じた時に選択状態を保持
            setSelectedReel(null);
          }}
          onDecisionChange={() => {
            queryClient.invalidateQueries({ queryKey: ['analytics', ownerId] });
            refetchAnalytics();
          }}
        />
      )}
    </div>
  );
}
