'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import LoadingSpinner from '@/components/LoadingSpinner';
import InlineSpinner from '@/components/InlineSpinner';
import ReelDetailModal from '@/components/ReelDetailModal';
import { useToast } from '@/components/ToastProvider';

interface FavoriteItem {
  ig_code: string;
  favorited_at: string;
  owner_id: string | null;
  owner_username: string | null;
  likes_count: number | null;
  video_view_count: number | null;
  comments_count: number | null;
  posted_at: string | null;
  engagement_rate: number | null;
  canonical_url: string | null;
  transcript_text: string | null;
  transcript_ja: string | null;
  transcribed_at: string | null;
  updated_at: string | null;
}

interface SimilarReel {
  ig_code: string;
  owner_id: string | null;
  owner_username: string | null;
  similarity: number;
  likes_count: number | null;
  video_view_count: number | null;
  comments_count: number | null;
  engagement_rate: number | null;
  canonical_url: string | null;
  transcript_preview: string | null;
}

interface SimilarFavoritesResponse {
  favorite_count: number;
  results: SimilarReel[];
}

type SortField = 'created_at' | 'posted_at' | 'likes_count' | 'comments_count' | 'video_view_count' | 'engagement_rate';

export default function FavoritesPage() {
  const [selectedReel, setSelectedReel] = useState<string | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // モーダルを閉じた後も選択状態を保持
  const [lastSelectedReel, setLastSelectedReel] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [showSimilar, setShowSimilar] = useState(false);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: favorites = [], isLoading: loading, isFetching, error } = useQuery({
    queryKey: ['favorites', sortField],
    queryFn: async () => {
      const response = await fetch(`/api/favorites?sort=${sortField}`);
      if (!response.ok) {
        throw new Error('Failed to fetch favorites');
      }
      return response.json() as Promise<FavoriteItem[]>;
    },
    staleTime: 1 * 60 * 1000, // 1分間キャッシュ
    placeholderData: (previousData) => previousData, // 既存のデータを保持
  });

  const { data: similarData, isLoading: loadingSimilar, refetch: refetchSimilar } = useQuery({
    queryKey: ['similar-favorites'],
    queryFn: async () => {
      const response = await fetch('/api/favorites/similar?limit=20');
      if (!response.ok) {
        throw new Error('Failed to fetch similar favorites');
      }
      return response.json() as Promise<SimilarFavoritesResponse>;
    },
    enabled: false, // 手動で実行
    staleTime: 5 * 60 * 1000, // 5分間キャッシュ
  });

  const removeFavoriteMutation = useMutation({
    mutationFn: async (ig_code: string) => {
      const response = await fetch(`/api/favorites/${ig_code}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to remove favorite');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      queryClient.invalidateQueries({ queryKey: ['reel-detail'] });
      showToast('お気に入りから削除しました');
    },
    onError: () => {
      showToast('削除に失敗しました');
    },
  });

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

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  };

  const formatEngagementRate = (rate: number | null): string => {
    if (rate === null) return '—';
    return `${(rate * 100).toFixed(2)}%`;
  };

  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 0) {
      return `${diffDays}日前`;
    } else if (diffHours > 0) {
      return `${diffHours}時間前`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes}分前`;
    } else {
      return 'たった今';
    }
  };

  const formatSimilarity = (similarity: number): string => {
    return `${(similarity * 100).toFixed(1)}%`;
  };

  const handleFindSimilar = () => {
    if (favorites.length === 0) {
      showToast('お気に入りがありません');
      return;
    }
    setShowSimilar(true);
    refetchSimilar();
  };

  const handleReelClick = (igCode: string, ownerId: string | null) => {
    setSelectedReel(igCode);
    setSelectedOwnerId(ownerId || '');
    setIsModalOpen(true);
  };

  const handleRemoveFavorite = (e: React.MouseEvent, igCode: string) => {
    e.stopPropagation();
    if (confirm('お気に入りから削除しますか？')) {
      removeFavoriteMutation.mutate(igCode);
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setLastSelectedReel(selectedReel); // 閉じた時に選択状態を保持
    setSelectedReel(null);
    setSelectedOwnerId(null);
  };

  const handleDecisionChange = () => {
    // お気に入りページでは特に何もしない
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-10">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50/80 border border-red-200/60 rounded-2xl p-6 shadow-sm">
            <p className="text-red-800 font-semibold text-base mb-2">エラーが発生しました</p>
            <p className="text-red-600 text-sm">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">お気に入り</h1>
              {isFetching && !loading && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <InlineSpinner size="sm" />
                  <span>更新中...</span>
                </div>
              )}
            </div>
            {favorites.length > 0 && (
              <button
                onClick={handleFindSimilar}
                disabled={loadingSimilar}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loadingSimilar ? (
                  <>
                    <InlineSpinner size="sm" />
                    <span>検索中...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <span>類似投稿を探す</span>
                  </>
                )}
              </button>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-2">
            {favorites.length}件のお気に入り
          </p>
        </div>

        {/* Sort Controls */}
        <div className="mb-6 flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-600">並び替え:</span>
          {(['created_at', 'posted_at', 'likes_count', 'comments_count', 'video_view_count', 'engagement_rate'] as SortField[]).map((field) => {
            const labels: Record<SortField, string> = {
              created_at: '追加日時',
              posted_at: '投稿日',
              likes_count: 'いいね数',
              comments_count: 'コメント数',
              video_view_count: '再生数',
              engagement_rate: 'エンゲージメント率',
            };
            return (
              <button
                key={field}
                onClick={() => setSortField(field)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  sortField === field
                    ? 'bg-slate-700 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {labels[field]}
              </button>
            );
          })}
        </div>

        {/* Similar Reels Section */}
        {showSimilar && similarData && (
          <div className="mb-8 bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200/60 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">類似投稿</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {similarData.favorite_count}件のお気に入りから{similarData.results.length}件の類似投稿を発見
                </p>
              </div>
              <button
                onClick={() => setShowSimilar(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {similarData.results.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-gray-600">類似投稿が見つかりませんでした</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200/60">
                  <thead className="bg-gray-50/80">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        IG Code
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        アカウント
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        類似度
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        いいね数
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        コメント数
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        再生数
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        エンゲージメント率
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200/60">
                    {similarData.results.map((item) => (
                      <tr
                        key={item.ig_code}
                        onClick={() => handleReelClick(item.ig_code, item.owner_id)}
                        className={`cursor-pointer transition-colors ${
                          lastSelectedReel === item.ig_code
                            ? 'bg-blue-50/80 hover:bg-blue-100/80'
                            : 'hover:bg-gray-50/80'
                        }`}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900">
                          {item.ig_code}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {item.owner_username ? `@${item.owner_username}` : (item.owner_id || '—')}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                            {formatSimilarity(item.similarity)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                          {formatNumber(item.likes_count)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                          {formatNumber(item.comments_count)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                          {formatNumber(item.video_view_count)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                          {formatEngagementRate(item.engagement_rate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Favorites List */}
        {favorites.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <p className="text-gray-600 text-lg mb-2">お気に入りがありません</p>
            <p className="text-gray-500 text-sm">投稿詳細からお気に入りに追加できます</p>
          </div>
        ) : (
          <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200/60">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      IG Code
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      アカウント
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      いいね数
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      コメント数
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      再生数
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      エンゲージメント率
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      投稿日
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      追加日時
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      アクション
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200/60">
                  {favorites.map((item) => (
                    <tr
                      key={item.ig_code}
                      onClick={() => handleReelClick(item.ig_code, item.owner_id)}
                      className={`cursor-pointer transition-colors ${
                        lastSelectedReel === item.ig_code
                          ? 'bg-blue-50/80 hover:bg-blue-100/80'
                          : 'hover:bg-gray-50/80'
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900">
                        {item.ig_code}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {item.owner_username ? `@${item.owner_username}` : (item.owner_id || '—')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                        {formatNumber(item.likes_count)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                        {formatNumber(item.comments_count)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                        {formatNumber(item.video_view_count)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                        {formatEngagementRate(item.engagement_rate)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(item.posted_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {formatRelativeTime(item.favorited_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <button
                          onClick={(e) => handleRemoveFavorite(e, item.ig_code)}
                          disabled={removeFavoriteMutation.isPending}
                          className="text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                          title="お気に入りから削除"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {favorites.map((item) => (
              <div
                key={item.ig_code}
                onClick={() => handleReelClick(item.ig_code, item.owner_id)}
                className={`bg-white rounded-xl border shadow-sm p-4 cursor-pointer transition-colors ${
                  lastSelectedReel === item.ig_code
                    ? 'border-blue-300 bg-blue-50/50'
                    : 'border-gray-200/60 active:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {item.owner_username ? `@${item.owner_username}` : (item.owner_id || '—')}
                  </span>
                  <button
                    onClick={(e) => handleRemoveFavorite(e, item.ig_code)}
                    disabled={removeFavoriteMutation.isPending}
                    className="text-red-500 hover:text-red-700 transition-colors disabled:opacity-50 p-1"
                    title="お気に入りから削除"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-600">
                  <span>いいね {formatNumber(item.likes_count)}</span>
                  <span>再生 {formatNumber(item.video_view_count)}</span>
                  <span>{formatDate(item.posted_at)}</span>
                </div>
              </div>
            ))}
          </div>
          </>
        )}

        {/* Reel Detail Modal */}
        {selectedReel && selectedOwnerId && (
          <ReelDetailModal
            igCode={selectedReel}
            ownerId={selectedOwnerId}
            isOpen={isModalOpen}
            onClose={handleModalClose}
            onDecisionChange={handleDecisionChange}
          />
        )}
      </div>
    </div>
  );
}
