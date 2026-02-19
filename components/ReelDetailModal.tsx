'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import LoadingSpinner from './LoadingSpinner';
import { useToast } from './ToastProvider';

interface ReelDetailModalProps {
  igCode: string;
  ownerId: string;
  isOpen: boolean;
  onClose: () => void;
  onDecisionChange: () => void;
}

interface ReelDetail {
  ig_code: string;
  owner_id: string | null;
  owner_username: string | null;
  canonical_url: string | null;
  status: string;
  transcript_text: string | null;
  transcript_ja: string | null;
  transcribed_at: string | null;
  updated_at: string | null;
  likes_count: number | null;
  video_view_count: number | null;
  comments_count: number | null;
  posted_at: string | null;
  engagement_rate: number | null;
  video_r2_key: string | null;
  is_favorite?: boolean;
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

export default function ReelDetailModal({
  igCode,
  ownerId,
  isOpen,
  onClose,
  onDecisionChange,
}: ReelDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'original' | 'ja'>('original');
  const [selectedSimilarReel, setSelectedSimilarReel] = useState<SimilarReel | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'compare'>('list');
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Reel Detail を React Query で取得
  const { data: reel, isLoading: loading, refetch: refetchReel } = useQuery({
    queryKey: ['reel-detail', igCode],
    queryFn: async () => {
      const response = await fetch(`/api/reels/${igCode}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }
      return response.json() as Promise<ReelDetail>;
    },
    staleTime: 0,
    enabled: isOpen && !!igCode,
  });

  // お気に入り状態を別APIで取得（キャッシュを使わず、常に最新の状態を取得）
  const { data: favoriteStatus, refetch: refetchFavorite } = useQuery({
    queryKey: ['favorite-status', igCode],
    queryFn: async () => {
      const response = await fetch(`/api/favorites/${igCode}/check`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        return { is_favorite: false };
      }
      return response.json() as Promise<{ is_favorite: boolean }>;
    },
    staleTime: 0, // 常に最新データを取得
    enabled: isOpen && !!igCode,
  });

  // reelとfavoriteStatusをマージ
  const reelWithFavorite = reel
    ? { ...reel, is_favorite: favoriteStatus?.is_favorite ?? false }
    : undefined;

  // Similar Reels を React Query で取得
  const { data: similarReels = [], isLoading: loadingSimilar } = useQuery({
    queryKey: ['similar-reels', igCode],
    queryFn: async () => {
      const response = await fetch(`/api/reels/${igCode}/similar`);
      if (!response.ok) {
        return [];
      }
      return response.json() as Promise<SimilarReel[]>;
    },
    staleTime: 5 * 60 * 1000,
    enabled: isOpen && !!igCode,
  });

  // Selected Similar Reel Detail を取得
  const { data: selectedSimilarReelDetail, isLoading: loadingSimilarDetail } = useQuery({
    queryKey: ['reel-detail', selectedSimilarReel?.ig_code],
    queryFn: async () => {
      if (!selectedSimilarReel?.ig_code) return null;
      const response = await fetch(`/api/reels/${selectedSimilarReel.ig_code}`);
      if (!response.ok) {
        throw new Error('Failed to fetch similar reel detail');
      }
      return response.json() as Promise<ReelDetail>;
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!selectedSimilarReel?.ig_code && viewMode === 'compare',
  });

  // 比較対象の投稿のお気に入り状態を取得
  const { data: selectedSimilarFavoriteStatus } = useQuery({
    queryKey: ['favorite-status', selectedSimilarReel?.ig_code],
    queryFn: async () => {
      if (!selectedSimilarReel?.ig_code) return null;
      const response = await fetch(`/api/favorites/${selectedSimilarReel.ig_code}/check`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        return { is_favorite: false };
      }
      return response.json() as Promise<{ is_favorite: boolean }>;
    },
    staleTime: 0,
    enabled: !!selectedSimilarReel?.ig_code && viewMode === 'compare',
  });

  // 比較対象の投稿とお気に入り状態をマージ
  const selectedSimilarReelWithFavorite = selectedSimilarReelDetail
    ? { ...selectedSimilarReelDetail, is_favorite: selectedSimilarFavoriteStatus?.is_favorite ?? false }
    : undefined;

  // お気に入り追加/削除のMutation（楽観的更新を実装）
  const favoriteMutation = useMutation({
    mutationFn: async ({ ig_code, isFavorite }: { ig_code: string; isFavorite: boolean }) => {
      const method = isFavorite ? 'DELETE' : 'POST';
      const response = await fetch(`/api/favorites/${ig_code}`, {
        method,
      });
      if (!response.ok) {
        throw new Error(`Failed to ${isFavorite ? 'remove' : 'add'} favorite`);
      }
      return response.json();
    },
    // 楽観的更新：UIを即座に反映
    onMutate: async ({ ig_code, isFavorite }) => {
      // 進行中のクエリをキャンセル
      await queryClient.cancelQueries({ queryKey: ['favorite-status', ig_code] });
      
      // 現在の値を保存（ロールバック用）
      const previousStatus = queryClient.getQueryData(['favorite-status', ig_code]);
      const previousReel = queryClient.getQueryData<ReelDetail>(['reel-detail', ig_code]);
      
      // 楽観的に新しい値を設定
      const newFavoriteStatus = {
        ig_code,
        is_favorite: !isFavorite, // 反転した値を設定
      };
      queryClient.setQueryData(['favorite-status', ig_code], newFavoriteStatus);
      
      // reel-detailのキャッシュも更新（reelWithFavoriteが即座に反映されるように）
      if (previousReel) {
        queryClient.setQueryData(['reel-detail', ig_code], {
          ...previousReel,
          is_favorite: !isFavorite,
        });
      }
      
      // コンテキストを返す（ロールバック用）
      return { previousStatus, previousReel };
    },
    onSuccess: (data, variables) => {
      // 成功時は楽観的更新を確定
      queryClient.setQueryData(['favorite-status', variables.ig_code], {
        ig_code: variables.ig_code,
        is_favorite: !variables.isFavorite,
      });
      // 他のクエリも無効化（バックグラウンドで更新）
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      showToast(variables.isFavorite ? 'お気に入りから削除しました' : 'お気に入りに追加しました');
    },
    onError: (error, variables, context) => {
      // エラー時は楽観的更新をロールバック
      if (context?.previousStatus) {
        queryClient.setQueryData(['favorite-status', variables.ig_code], context.previousStatus);
      }
      if (context?.previousReel) {
        queryClient.setQueryData(['reel-detail', variables.ig_code], context.previousReel);
      }
      showToast(`お気に入りの${variables.isFavorite ? '削除' : '追加'}に失敗しました`);
    },
  });

  // Escapeキーでモーダルを閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      // モーダルを開くときにviewModeをリセット
      setViewMode('list');
      setSelectedSimilarReel(null);
      // 背景のスクロールを無効化
      document.body.style.overflow = 'hidden';
      // モーダルを開いた時に最新データを取得
      if (igCode) {
        refetchReel();
        refetchFavorite(); // お気に入り状態も最新のものを取得
      }
    } else {
      // モーダルを閉じるときに背景のスクロールを有効化
      document.body.style.overflow = '';
    }

    // クリーンアップ関数：コンポーネントがアンマウントされた時にもスクロールを復元
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, igCode, refetchReel, refetchFavorite]);

  const formatSimilarity = (similarity: number): string => {
    return `${(similarity * 100).toFixed(1)}%`;
  };

  const handleSimilarReelClick = (similarReel: SimilarReel) => {
    setSelectedSimilarReel(similarReel);
    setViewMode('compare');
    // React Queryが自動的にデータを取得する
  };

  const handleBackToList = () => {
    setViewMode('list');
    setSelectedSimilarReel(null);
    // selectedSimilarReelDetailはReact Queryで管理されているため、
    // selectedSimilarReelをnullにすることで自動的にクリアされる
  };

  const copyToClipboard = (text: string | null) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast('コピーしました');
  };

  const getInstagramShortcode = (url: string | null): string | null => {
    if (!url) return null;
    const match = url.match(/instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  };

  const getEmbedUrl = (url: string | null): string | null => {
    const shortcode = getInstagramShortcode(url);
    if (!shortcode) return null;
    return `https://www.instagram.com/p/${shortcode}/embed/`;
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

  const formatEngagementRate = (rate: number | null): string => {
    if (rate === null) return '—';
    return `${(rate * 100).toFixed(2)}%`;
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return '—';
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  };

  if (!isOpen) return null;

  const embedUrl = getEmbedUrl(reelWithFavorite?.canonical_url || null);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 背景をクリックした時だけモーダルを閉じる
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-8"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reel-detail-title"
    >
      <div
        className="bg-white shadow-2xl w-full h-full md:h-auto md:max-w-6xl md:max-h-[90vh] md:rounded-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 md:px-6 md:py-5 border-b border-gray-200/60 gap-2">
          <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
            {viewMode === 'compare' ? (
              <button
                onClick={handleBackToList}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                一覧に戻る
              </button>
            ) : (
              <>
                <h2 id="reel-detail-title" className="text-xl font-semibold text-gray-900 tracking-tight">投稿詳細</h2>
                {reelWithFavorite && (
                  <>
                    <div className="hidden md:flex items-center gap-3 text-sm text-gray-600">
                      <span className="font-mono">{reelWithFavorite.ig_code}</span>
                      {reelWithFavorite.owner_username && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span className="font-medium">@{reelWithFavorite.owner_username}</span>
                        </>
                      )}
                      {reelWithFavorite.owner_id && !reelWithFavorite.owner_username && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span>{reelWithFavorite.owner_id}</span>
                        </>
                      )}
                      {reelWithFavorite.posted_at && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span>{formatDate(reelWithFavorite.posted_at)}</span>
                        </>
                      )}
                    </div>
                    <div className="flex md:hidden items-center gap-2 text-xs text-gray-500 truncate">
                      {reelWithFavorite.owner_username ? (
                        <span className="font-medium">@{reelWithFavorite.owner_username}</span>
                      ) : (
                        <span className="font-mono truncate">{reelWithFavorite.ig_code}</span>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {reelWithFavorite && viewMode === 'list' && (
              <button
                onClick={() => {
                  if (reelWithFavorite.is_favorite !== undefined) {
                    favoriteMutation.mutate({
                      ig_code: reelWithFavorite.ig_code,
                      isFavorite: reelWithFavorite.is_favorite,
                    });
                  }
                }}
                disabled={favoriteMutation.isPending || reelWithFavorite.is_favorite === undefined}
                className={`p-2 rounded-lg transition-colors ${
                  reelWithFavorite.is_favorite
                    ? 'text-red-500 hover:bg-red-50'
                    : 'text-gray-400 hover:text-red-500 hover:bg-gray-100'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={reelWithFavorite.is_favorite ? 'お気に入りから削除' : 'お気に入りに追加'}
              >
                <svg
                  className="w-5 h-5"
                  fill={reelWithFavorite.is_favorite ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"
              aria-label="閉じる"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : reelWithFavorite ? (
            viewMode === 'compare' && selectedSimilarReel ? (
              /* Compare View: 2カラム表示 */
              <>
                {/* Left: Original Reel */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 border-b md:border-b-0 md:border-r border-gray-200/60">
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs text-gray-500">元の投稿</div>
                      <div className="w-24"></div> {/* Spacer to align with similarity badge */}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-gray-900">{reelWithFavorite.ig_code}</span>
                      {reelWithFavorite.owner_username && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span className="text-sm text-gray-600">@{reelWithFavorite.owner_username}</span>
                        </>
                      )}
                      {reelWithFavorite.owner_id && !reelWithFavorite.owner_username && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span className="text-sm text-gray-600">{reelWithFavorite.owner_id}</span>
                        </>
                      )}
                      {reelWithFavorite.posted_at && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span className="text-sm text-gray-600">{formatDate(reelWithFavorite.posted_at)}</span>
                        </>
                      )}
                      {/* 元の投稿のお気に入りボタン */}
                      <button
                        onClick={() => {
                          if (reelWithFavorite.is_favorite !== undefined) {
                            favoriteMutation.mutate({
                              ig_code: reelWithFavorite.ig_code,
                              isFavorite: reelWithFavorite.is_favorite,
                            });
                          }
                        }}
                        disabled={favoriteMutation.isPending || reelWithFavorite.is_favorite === undefined}
                        className={`ml-auto p-1.5 rounded-lg transition-colors ${
                          reelWithFavorite.is_favorite
                            ? 'text-red-500 hover:bg-red-50'
                            : 'text-gray-400 hover:text-red-500 hover:bg-gray-100'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        title={reelWithFavorite.is_favorite ? 'お気に入りから削除' : 'お気に入りに追加'}
                      >
                        <svg
                          className="w-4 h-4"
                          fill={reelWithFavorite.is_favorite ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  {/* Video Player */}
                  {reelWithFavorite?.video_r2_key ? (
                    <div className="mb-6 w-full bg-black rounded-xl overflow-hidden shadow-lg flex items-center justify-center">
                      <video
                        src={`/api/video/${reelWithFavorite.ig_code}`}
                        controls
                        playsInline
                        className="w-full h-[400px] object-contain"
                        preload="metadata"
                      />
                    </div>
                  ) : embedUrl ? (
                    <div className="mb-6 w-full bg-black rounded-xl overflow-hidden shadow-lg">
                      <iframe
                        src={embedUrl}
                        className="w-full h-[400px] border-0"
                        allow="encrypted-media"
                        loading="lazy"
                        title="Instagram embed - Original"
                      />
                    </div>
                  ) : null}

                  {/* Engagement Info - Compact Unified Design */}
                  <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="bg-white rounded-lg p-3 border border-gray-200/60 shadow-sm">
                      <div className="text-[10px] text-gray-500 font-medium mb-1">いいね数</div>
                      <div className="text-base font-bold text-gray-900">
                        {formatNumber(reelWithFavorite.likes_count)}
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200/60 shadow-sm">
                      <div className="text-[10px] text-gray-500 font-medium mb-1">再生数</div>
                      <div className="text-base font-bold text-gray-900">
                        {formatNumber(reelWithFavorite.video_view_count)}
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200/60 shadow-sm">
                      <div className="text-[10px] text-gray-500 font-medium mb-1">エンゲージメント率</div>
                      <div className="text-base font-bold text-slate-700">
                        {formatEngagementRate(reelWithFavorite.engagement_rate)}
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200/60 shadow-sm">
                      <div className="text-[10px] text-gray-500 font-medium mb-1">コメント数</div>
                      <div className="text-base font-bold text-gray-900">
                        {formatNumber(reelWithFavorite.comments_count)}
                      </div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex border-b border-gray-200/60 mb-4">
                    <button
                      onClick={() => setActiveTab('original')}
                      className={`px-5 py-3 text-sm font-medium transition-colors rounded-t-xl ${
                        activeTab === 'original'
                          ? 'border-b-2 border-slate-700 text-slate-900 bg-slate-50/50'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      原文
                    </button>
                    <button
                      onClick={() => setActiveTab('ja')}
                      className={`px-5 py-3 text-sm font-medium transition-colors rounded-t-xl ${
                        activeTab === 'ja'
                          ? 'border-b-2 border-slate-700 text-slate-900 bg-slate-50/50'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      日本語
                    </button>
                  </div>
                  {/* Transcript */}
                  <div className="bg-gray-50/80 p-5 rounded-xl min-h-[300px] relative border border-gray-200/60">
                    {activeTab === 'original' ? (
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-sm font-semibold text-gray-700">原文</span>
                          <button
                            onClick={() => copyToClipboard(reelWithFavorite.transcript_text)}
                            className="text-gray-500 hover:text-gray-700 transition-colors p-2 rounded-lg hover:bg-gray-200/60"
                            title="コピー"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
                          {reelWithFavorite.transcript_text || '（未取得）'}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-sm font-semibold text-gray-700">日本語</span>
                          <button
                            onClick={() => copyToClipboard(reelWithFavorite.transcript_ja)}
                            className="text-gray-500 hover:text-gray-700 transition-colors p-2 rounded-lg hover:bg-gray-200/60"
                            title="コピー"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
                          {reelWithFavorite.transcript_ja || '（未取得）'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Similar Reel */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs text-gray-500">比較対象の投稿</div>
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-medium">
                        類似度: {formatSimilarity(selectedSimilarReel.similarity)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-gray-900">{selectedSimilarReel.ig_code}</span>
                      {selectedSimilarReel.owner_username && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span className="text-sm text-gray-600">@{selectedSimilarReel.owner_username}</span>
                        </>
                      )}
                      {selectedSimilarReel.owner_id && !selectedSimilarReel.owner_username && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span className="text-sm text-gray-600">{selectedSimilarReel.owner_id}</span>
                        </>
                      )}
                      {selectedSimilarReelWithFavorite?.posted_at && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span className="text-sm text-gray-600">{formatDate(selectedSimilarReelWithFavorite.posted_at)}</span>
                        </>
                      )}
                      {/* 比較対象の投稿のお気に入りボタン */}
                      {selectedSimilarReelWithFavorite && (
                        <button
                          onClick={() => {
                            if (selectedSimilarReelWithFavorite.is_favorite !== undefined) {
                              favoriteMutation.mutate({
                                ig_code: selectedSimilarReelWithFavorite.ig_code,
                                isFavorite: selectedSimilarReelWithFavorite.is_favorite,
                              });
                            }
                          }}
                          disabled={favoriteMutation.isPending || selectedSimilarReelWithFavorite.is_favorite === undefined}
                          className={`ml-auto p-1.5 rounded-lg transition-colors ${
                            selectedSimilarReelWithFavorite.is_favorite
                              ? 'text-red-500 hover:bg-red-50'
                              : 'text-gray-400 hover:text-red-500 hover:bg-gray-100'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                          title={selectedSimilarReelWithFavorite.is_favorite ? 'お気に入りから削除' : 'お気に入りに追加'}
                        >
                          <svg
                            className="w-4 h-4"
                            fill={selectedSimilarReelWithFavorite.is_favorite ? 'currentColor' : 'none'}
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  {loadingSimilarDetail ? (
                    <div className="flex items-center justify-center py-8">
                      <LoadingSpinner />
                    </div>
                  ) : selectedSimilarReelWithFavorite ? (
                    <div>
                      {/* Video Player */}
                      {selectedSimilarReelWithFavorite.video_r2_key ? (
                        <div className="mb-6 w-full bg-black rounded-xl overflow-hidden shadow-lg flex items-center justify-center">
                          <video
                            src={`/api/video/${selectedSimilarReelWithFavorite.ig_code}`}
                            controls
                            playsInline
                            className="w-full h-[400px] object-contain"
                            preload="metadata"
                          />
                        </div>
                      ) : (() => {
                        const similarEmbedUrl = getEmbedUrl(selectedSimilarReelWithFavorite.canonical_url || null);
                        return similarEmbedUrl ? (
                          <div className="mb-6 w-full bg-black rounded-xl overflow-hidden shadow-lg">
                            <iframe
                              src={similarEmbedUrl}
                              className="w-full h-[400px] border-0"
                              allow="encrypted-media"
                              loading="lazy"
                              title="Instagram embed - Similar"
                            />
                          </div>
                        ) : null;
                      })()}

                      {/* Engagement Info - Compact Unified Design */}
                      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="bg-white rounded-lg p-3 border border-gray-200/60 shadow-sm">
                          <div className="text-[10px] text-gray-500 font-medium mb-1">いいね数</div>
                          <div className="text-base font-bold text-gray-900">
                            {formatNumber(selectedSimilarReelWithFavorite.likes_count)}
                          </div>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-gray-200/60 shadow-sm">
                          <div className="text-[10px] text-gray-500 font-medium mb-1">再生数</div>
                          <div className="text-base font-bold text-gray-900">
                            {formatNumber(selectedSimilarReelWithFavorite.video_view_count)}
                          </div>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-gray-200/60 shadow-sm">
                          <div className="text-[10px] text-gray-500 font-medium mb-1">エンゲージメント率</div>
                          <div className="text-base font-bold text-slate-700">
                            {formatEngagementRate(selectedSimilarReelWithFavorite.engagement_rate)}
                          </div>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-gray-200/60 shadow-sm">
                          <div className="text-[10px] text-gray-500 font-medium mb-1">コメント数</div>
                          <div className="text-base font-bold text-gray-900">
                            {formatNumber(selectedSimilarReelWithFavorite.comments_count)}
                          </div>
                        </div>
                      </div>

                      {/* Tabs */}
                      <div className="flex border-b border-gray-200/60 mb-4">
                        <button
                          onClick={() => setActiveTab('original')}
                          className={`px-5 py-3 text-sm font-medium transition-colors rounded-t-xl ${
                            activeTab === 'original'
                              ? 'border-b-2 border-slate-700 text-slate-900 bg-slate-50/50'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          原文
                        </button>
                        <button
                          onClick={() => setActiveTab('ja')}
                          className={`px-5 py-3 text-sm font-medium transition-colors rounded-t-xl ${
                            activeTab === 'ja'
                              ? 'border-b-2 border-slate-700 text-slate-900 bg-slate-50/50'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          日本語
                        </button>
                      </div>
                      {/* Transcript */}
                      <div className="bg-gray-50/80 p-5 rounded-xl min-h-[300px] relative border border-gray-200/60">
                        {activeTab === 'original' ? (
                          <div>
                            <div className="flex justify-between items-center mb-3">
                              <span className="text-sm font-semibold text-gray-700">原文</span>
                              <button
                                onClick={() => copyToClipboard(selectedSimilarReelWithFavorite.transcript_text)}
                                className="text-gray-500 hover:text-gray-700 transition-colors p-2 rounded-lg hover:bg-gray-200/60"
                                title="コピー"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </button>
                            </div>
                            <p className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
                              {selectedSimilarReelWithFavorite.transcript_text || '（未取得）'}
                            </p>
                          </div>
                        ) : (
                          <div>
                            <div className="flex justify-between items-center mb-3">
                              <span className="text-sm font-semibold text-gray-700">日本語</span>
                              <button
                                onClick={() => copyToClipboard(selectedSimilarReelWithFavorite.transcript_ja)}
                                className="text-gray-500 hover:text-gray-700 transition-colors p-2 rounded-lg hover:bg-gray-200/60"
                                title="コピー"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </button>
                            </div>
                            <p className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
                              {selectedSimilarReelWithFavorite.transcript_ja || '（未取得）'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      投稿の詳細を取得できませんでした
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* List View: 通常の表示 */
              <>
              {/* Left side: Transcript */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 md:border-r border-gray-200/60 order-2 md:order-1">
                {/* Engagement Info - Unified Compact Design */}
                <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="bg-white rounded-lg p-3 border border-gray-200/60 shadow-sm">
                    <div className="text-[10px] text-gray-500 font-medium mb-1">いいね数</div>
                    <div className="text-base font-bold text-gray-900">
                      {formatNumber(reelWithFavorite.likes_count)}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-200/60 shadow-sm">
                    <div className="text-[10px] text-gray-500 font-medium mb-1">再生数</div>
                    <div className="text-base font-bold text-gray-900">
                      {formatNumber(reelWithFavorite.video_view_count)}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-200/60 shadow-sm">
                    <div className="text-[10px] text-gray-500 font-medium mb-1">エンゲージメント率</div>
                    <div className="text-base font-bold text-slate-700">
                      {formatEngagementRate(reelWithFavorite.engagement_rate)}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-200/60 shadow-sm">
                    <div className="text-[10px] text-gray-500 font-medium mb-1">コメント数</div>
                    <div className="text-base font-bold text-gray-900">
                      {formatNumber(reelWithFavorite.comments_count)}
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200/60 mb-4">
                  <button
                    onClick={() => setActiveTab('original')}
                    className={`px-5 py-3 text-sm font-medium transition-colors rounded-t-xl ${
                      activeTab === 'original'
                        ? 'border-b-2 border-slate-700 text-slate-900 bg-slate-50/50'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    原文
                  </button>
                  <button
                    onClick={() => setActiveTab('ja')}
                    className={`px-5 py-3 text-sm font-medium transition-colors rounded-t-xl ${
                      activeTab === 'ja'
                        ? 'border-b-2 border-slate-700 text-slate-900 bg-slate-50/50'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    日本語
                  </button>
                </div>

                {/* Transcript */}
                <div className="bg-gray-50/80 p-5 rounded-xl min-h-[300px] relative border border-gray-200/60">
                  {activeTab === 'original' ? (
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-semibold text-gray-700">原文</span>
                        <button
                          onClick={() => copyToClipboard(reelWithFavorite.transcript_text)}
                          className="text-gray-500 hover:text-gray-700 transition-colors p-2 rounded-lg hover:bg-gray-200/60"
                          title="コピー"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
                        {reelWithFavorite.transcript_text || '（未取得）'}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-semibold text-gray-700">日本語</span>
                        <button
                          onClick={() => copyToClipboard(reelWithFavorite.transcript_ja)}
                          className="text-gray-500 hover:text-gray-700 transition-colors p-2 rounded-lg hover:bg-gray-200/60"
                          title="コピー"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
                        {reelWithFavorite.transcript_ja || '（未取得）'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Similar Reels Section */}
                {viewMode === 'list' && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">似てる台本</h3>
                    {loadingSimilar ? (
                      <div className="flex items-center justify-center py-8">
                        <LoadingSpinner />
                      </div>
                    ) : similarReels.length > 0 ? (
                      <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {similarReels.map((similarReel) => (
                          <div
                            key={similarReel.ig_code}
                            onClick={() => handleSimilarReelClick(similarReel)}
                            className="bg-white p-4 rounded-lg border-2 border-gray-200/60 hover:border-slate-500 hover:shadow-lg transition-all cursor-pointer group"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-mono text-xs text-gray-600">{similarReel.ig_code}</span>
                                  <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded">
                                    類似度: {formatSimilarity(similarReel.similarity)}
                                  </span>
                                </div>
                                {similarReel.owner_username && (
                                  <div className="text-sm font-medium text-gray-900 mb-1">
                                    @{similarReel.owner_username}
                                  </div>
                                )}
                                {similarReel.transcript_preview && (
                                  <p className="text-sm text-gray-700 line-clamp-2 mb-2">
                                    {similarReel.transcript_preview}...
                                  </p>
                                )}
                              </div>
                              <svg 
                                className="w-5 h-5 text-gray-400 group-hover:text-slate-600 transition-colors flex-shrink-0 ml-2" 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-600">
                              <span>いいね: {formatNumber(similarReel.likes_count)}</span>
                              <span>再生: {formatNumber(similarReel.video_view_count)}</span>
                              {similarReel.engagement_rate !== null && (
                                <span>エンゲージ: {formatEngagementRate(similarReel.engagement_rate)}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500 text-sm">
                        類似する投稿が見つかりませんでした
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Video Player (only in list view) */}
              {viewMode === 'list' && (
                <div className="w-full md:w-96 flex-shrink-0 bg-gray-100/80 flex items-center justify-center p-4 md:p-6 order-1 md:order-2">
                  {reelWithFavorite?.video_r2_key ? (
                    <div className="w-full h-[300px] md:h-[600px] bg-black rounded-xl overflow-hidden shadow-lg flex items-center justify-center">
                      <video
                        src={`/api/video/${reelWithFavorite.ig_code}`}
                        controls
                        playsInline
                        className="w-full h-full object-contain"
                        preload="metadata"
                      />
                    </div>
                  ) : embedUrl ? (
                    <div className="w-full h-[300px] md:h-[600px] bg-black rounded-xl overflow-hidden shadow-lg">
                      <iframe
                        src={embedUrl}
                        className="w-full h-full border-0"
                        allow="encrypted-media"
                        loading="lazy"
                        title="Instagram embed"
                      />
                    </div>
                  ) : (
                    <div className="text-center text-gray-500">
                      <p className="text-sm">動画が利用できません</p>
                    </div>
                  )}
                </div>
              )}
            </>
            )
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-500">データの取得に失敗しました</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
