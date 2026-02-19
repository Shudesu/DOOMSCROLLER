'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';
import ReelDetailModal from '@/components/ReelDetailModal';
import { useToast } from '@/components/ToastProvider';

interface NewPostItem {
  ig_code: string;
  owner_id: string | null;
  owner_username: string | null;
  likes_count: number | null;
  video_view_count: number | null;
  comments_count: number | null;
  posted_at: string | null;
  engagement_rate: number | null;
  created_at: string;
  canonical_url: string;
}

interface NewPostsResponse {
  posts: NewPostItem[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

type SortField = 'created_at' | 'posted_at' | 'likes_count' | 'video_view_count' | 'engagement_rate';
type SortOrder = 'asc' | 'desc';

function NewPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const getInitialSortField = (): SortField => {
    const sort = searchParams.get('sort');
    const validFields: SortField[] = ['created_at', 'posted_at', 'likes_count', 'video_view_count', 'engagement_rate'];
    return sort && validFields.includes(sort as SortField) ? (sort as SortField) : 'created_at';
  };
  
  const getInitialSortOrder = (): SortOrder => {
    const order = searchParams.get('order');
    return order === 'asc' || order === 'desc' ? (order as SortOrder) : 'desc';
  };
  
  const getInitialPage = (): number => {
    const page = searchParams.get('page');
    return page ? Math.max(1, parseInt(page, 10)) : 1;
  };

  const [posts, setPosts] = useState<NewPostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>(getInitialSortField());
  const [sortOrder, setSortOrder] = useState<SortOrder>(getInitialSortOrder());
  const [currentPage, setCurrentPage] = useState(getInitialPage());
  const [totalCount, setTotalCount] = useState(0);
  const [selectedReel, setSelectedReel] = useState<string | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { showToast } = useToast();
  const pageSize = 20;

  const updateURLParams = (updates: { sort?: SortField; order?: SortOrder; page?: number }) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (updates.sort !== undefined) {
      params.set('sort', updates.sort);
    }
    if (updates.order !== undefined) {
      params.set('order', updates.order);
    }
    if (updates.page !== undefined) {
      if (updates.page === 1) {
        params.delete('page');
      } else {
        params.set('page', updates.page.toString());
      }
    }
    
    router.push(`/new?${params.toString()}`, { scroll: false });
  };

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const urlParams = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
        sort: sortField,
        order: sortOrder,
      });
      
      const url = `/api/new?${urlParams.toString()}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.details || errorData.error || `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }
      const data: NewPostsResponse = await response.json();
      setPosts(data.posts);
      setTotalCount(data.totalCount);
    } catch (error) {
      console.error('Error fetching new posts:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [currentPage, sortField, sortOrder]);

  useEffect(() => {
    const sort = searchParams.get('sort');
    const order = searchParams.get('order');
    const page = searchParams.get('page');
    
    const validFields: SortField[] = ['created_at', 'posted_at', 'likes_count', 'video_view_count', 'engagement_rate'];
    const urlSort = sort && validFields.includes(sort as SortField) ? (sort as SortField) : 'created_at';
    const urlOrder = order === 'asc' || order === 'desc' ? (order as SortOrder) : 'desc';
    const urlPage = page ? Math.max(1, parseInt(page, 10)) : 1;
    
    if (urlSort !== sortField) {
      setSortField(urlSort);
    }
    if (urlOrder !== sortOrder) {
      setSortOrder(urlOrder);
    }
    if (urlPage !== currentPage) {
      setCurrentPage(urlPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
      setSortOrder(newOrder);
      updateURLParams({ sort: field, order: newOrder, page: 1 });
      setCurrentPage(1);
    } else {
      setSortField(field);
      setSortOrder('desc');
      updateURLParams({ sort: field, order: 'desc', page: 1 });
      setCurrentPage(1);
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? '↑' : '↓';
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

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
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

  const formatEngagementRate = (rate: number | null): string => {
    if (rate === null) return '—';
    return `${(rate * 100).toFixed(2)}%`;
  };

  const handleRowClick = (igCode: string, ownerId: string | null) => {
    if (!ownerId) return;
    setSelectedReel(igCode);
    setSelectedOwnerId(ownerId);
    setIsModalOpen(true);
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-10">
        <div className="max-w-2xl mx-auto bg-red-50/80 border border-red-200/60 rounded-2xl p-6 shadow-sm">
          <p className="text-red-800 font-semibold text-base mb-2">エラーが発生しました</p>
          <p className="text-red-600 text-sm mb-4">{error}</p>
          <button
            onClick={fetchPosts}
            className="px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-all duration-200 shadow-sm"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1">新着投稿</h1>
            <p className="text-sm text-gray-500">新規で収集した投稿一覧</p>
          </div>
        </div>

        <div className="mb-8">
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-200/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full divide-y divide-gray-200/60">
                <thead className="bg-gray-50/80">
                  <tr className="divide-x divide-gray-200/60">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      IG Code
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      アカウント名
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100/80 transition-colors"
                      onClick={() => handleSort('likes_count')}
                    >
                      いいね数 {getSortIcon('likes_count')}
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100/80 transition-colors"
                      onClick={() => handleSort('video_view_count')}
                    >
                      再生数 {getSortIcon('video_view_count')}
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100/80 transition-colors"
                      onClick={() => handleSort('engagement_rate')}
                    >
                      エンゲージメント率 {getSortIcon('engagement_rate')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100/80 transition-colors"
                      onClick={() => handleSort('posted_at')}
                    >
                      投稿日 {getSortIcon('posted_at')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100/80 transition-colors"
                      onClick={() => handleSort('created_at')}
                    >
                      取得日時 {getSortIcon('created_at')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200/60">
                  {posts.map((item) => (
                    <tr
                      key={item.ig_code}
                      onClick={() => handleRowClick(item.ig_code, item.owner_id)}
                      className={`cursor-pointer transition-colors divide-x divide-gray-100/60 ${
                        selectedReel === item.ig_code
                          ? 'bg-blue-50/80 hover:bg-blue-100/80'
                          : 'hover:bg-gray-50/80'
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900">
                        {item.ig_code}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                        <div className="flex items-center gap-1">
                          <span>{item.owner_username || item.owner_id || '—'}</span>
                          {item.owner_id && (
                            <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                        {formatNumber(item.likes_count)}
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
                        {formatRelativeTime(item.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {posts.map((item) => (
              <div
                key={item.ig_code}
                onClick={() => handleRowClick(item.ig_code, item.owner_id)}
                className={`bg-white rounded-xl border shadow-sm p-4 cursor-pointer transition-colors ${
                  selectedReel === item.ig_code
                    ? 'border-blue-300 bg-blue-50/50'
                    : 'border-gray-200/60 active:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {item.owner_username || item.owner_id || '—'}
                  </span>
                  <span className="text-xs text-gray-500">{formatDate(item.posted_at)}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-600">
                  <span>いいね {formatNumber(item.likes_count)}</span>
                  <span>再生 {formatNumber(item.video_view_count)}</span>
                  <span>{formatEngagementRate(item.engagement_rate)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {posts.length === 0 && !loading && (
          <div className="text-center py-16">
            <p className="text-gray-500 text-base">新着投稿が見つかりませんでした</p>
          </div>
        )}

        {/* ページネーション */}
        {totalCount > 0 && (
          <div className="mt-8 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="text-sm text-gray-600">
              {((currentPage - 1) * pageSize + 1)} - {Math.min(currentPage * pageSize, totalCount)} / {totalCount} 件
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const newPage = Math.max(1, currentPage - 1);
                  setCurrentPage(newPage);
                  updateURLParams({ page: newPage });
                }}
                disabled={currentPage === 1 || loading}
                className="px-4 py-2 text-sm border border-gray-300 rounded-xl bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                前へ
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, Math.ceil(totalCount / pageSize)) }, (_, i) => {
                  const totalPages = Math.ceil(totalCount / pageSize);
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
                        updateURLParams({ page: pageNum });
                      }}
                      disabled={loading}
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
                  updateURLParams({ page: newPage });
                }}
                disabled={currentPage * pageSize >= totalCount || loading}
                className="px-4 py-2 text-sm border border-gray-300 rounded-xl bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                次へ
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedReel && selectedOwnerId && (
        <ReelDetailModal
          igCode={selectedReel}
          ownerId={selectedOwnerId}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
          }}
          onDecisionChange={() => {
            // 新着ページでは特に何もしない
          }}
        />
      )}
    </div>
  );
}

export default function NewPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <NewPageContent />
    </Suspense>
  );
}
