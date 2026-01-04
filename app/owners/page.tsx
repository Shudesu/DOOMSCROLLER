'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';

interface OwnerSuggestion {
  owner_id: string;
  owner_username: string | null;
  display: string;
}

interface Owner {
  owner_id: string;
  owner_username: string | null;
  total: number;
  transcribed: number;
  has_ja: number;
  avg_likes: number | null;
  max_likes: number | null;
  avg_comments: number | null;
  avg_views: number | null;
  first_collected_at: string | null;
  last_updated_at: string | null;
}

type SortField = 'avg_likes' | 'max_likes' | 'avg_comments' | 'avg_views' | 'total';
type SortOrder = 'asc' | 'desc';

function OwnersPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // URLパラメータから初期状態を読み取る
  const getInitialSortField = (): SortField => {
    const sort = searchParams.get('sort');
    const validFields: SortField[] = ['avg_likes', 'max_likes', 'avg_comments', 'avg_views', 'total'];
    return sort && validFields.includes(sort as SortField) ? (sort as SortField) : 'avg_likes';
  };
  
  const getInitialSortOrder = (): SortOrder => {
    const order = searchParams.get('order');
    return order === 'asc' || order === 'desc' ? (order as SortOrder) : 'desc';
  };
  
  const getInitialPage = (): number => {
    const page = searchParams.get('page');
    return page ? Math.max(1, parseInt(page, 10)) : 1;
  };

  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>(getInitialSortField());
  const [sortOrder, setSortOrder] = useState<SortOrder>(getInitialSortOrder());
  const [currentPage, setCurrentPage] = useState(getInitialPage());
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<OwnerSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement | null>(null);
  const pageSize = 20;
  
  // ハイライトするowner_idを取得
  const highlightOwnerId = searchParams.get('highlight');

  // URLパラメータを更新する関数
  const updateURLParams = (updates: { sort?: SortField; order?: SortOrder; page?: number; search?: string }) => {
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
    if (updates.search !== undefined) {
      if (updates.search === '') {
        params.delete('search');
      } else {
        params.set('search', updates.search);
      }
    }
    
    router.push(`/owners?${params.toString()}`, { scroll: false });
  };

  const extractOwnerId = (query: string): string => {
    // @username (owner_id) 形式から owner_id を抽出
    const match = query.match(/\((\d+)\)$/);
    if (match) {
      return match[1];
    }
    // そのまま返す
    return query;
  };

  const fetchOwners = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const offset = (currentPage - 1) * pageSize;
      
      // 検索クエリからowner_idを抽出（@username (owner_id) 形式から）
      const searchTerm = searchQuery.trim().length >= 2 ? extractOwnerId(searchQuery.trim()) : '';
      
      // APIに送信するソートフィールド（totalの場合はtotal_postsに変換）
      const apiSortField = sortField === 'total' ? 'total_posts' : sortField;
      
      const urlParams = new URLSearchParams({
        limit: pageSize.toString(),
        offset: offset.toString(),
        sort: apiSortField,
        order: sortOrder,
      });
      
      if (searchTerm) {
        urlParams.set('search', searchTerm);
      }
      
      const url = `/api/owners?${urlParams.toString()}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.details || errorData.error || `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }
      const data = await response.json();
      setOwners(data);
      // 全件数を取得するために1件だけ取得してtotalCountを推定
      // 実際の実装では、APIからtotalCountを返すのが理想
      if (data.length === pageSize) {
        setTotalCount((currentPage + 1) * pageSize);
      } else {
        setTotalCount((currentPage - 1) * pageSize + data.length);
      }
    } catch (error) {
      console.error('Error fetching owners:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery, sortField, sortOrder, pageSize]);

  // URLパラメータの変更を監視（ブラウザの戻る/進むボタン対応）
  useEffect(() => {
    const sort = searchParams.get('sort');
    const order = searchParams.get('order');
    const page = searchParams.get('page');
    
    const validFields: SortField[] = ['avg_likes', 'max_likes', 'avg_comments', 'avg_views', 'total'];
    const urlSort = sort && validFields.includes(sort as SortField) ? (sort as SortField) : 'avg_likes';
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
    fetchOwners();
  }, [fetchOwners]);

  // ハイライトされた行にスクロール
  useEffect(() => {
    if (highlightOwnerId && highlightedRowRef.current && !loading) {
      // 少し遅延を入れて、レンダリングが完了してからスクロール
      setTimeout(() => {
        highlightedRowRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 100);
    }
  }, [highlightOwnerId, loading, owners]);

  useEffect(() => {
    // クリックアウトサイドで候補を閉じる
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (searchQuery.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const response = await fetch(`/api/owners/search?q=${encodeURIComponent(searchQuery)}&limit=10`);
        if (response.ok) {
          const data: OwnerSuggestion[] = await response.json();
          setSuggestions(data);
          setShowSuggestions(data.length > 0);
        }
      } catch (error) {
        console.error('Error fetching suggestions:', error);
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery]);

  const handleSuggestionClick = (suggestion: OwnerSuggestion) => {
    setSearchQuery(suggestion.display);
    setShowSuggestions(false);
    setCurrentPage(1);
    updateURLParams({ page: 1 });
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="px-8 py-10">
        <div className="max-w-2xl mx-auto bg-red-50/80 border border-red-200/60 rounded-2xl p-6 shadow-sm">
          <p className="text-red-800 font-semibold text-base mb-2">エラーが発生しました</p>
          <p className="text-red-600 text-sm mb-4">{error}</p>
          <button
            onClick={fetchOwners}
            className="px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-all duration-200 shadow-sm"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return '-';
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


  return (
    <div className="px-8 py-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight mb-1">アカウント一覧</h1>
          <p className="text-sm text-gray-500">管理されているアカウントの一覧と統計情報</p>
        </div>

        {/* 検索とソートコントロール */}
        <div className="mb-6 flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[300px] relative">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSuggestions(true);
                setCurrentPage(1);
                updateURLParams({ page: 1 });
              }}
              onFocus={() => {
                if (suggestions.length > 0) {
                  setShowSuggestions(true);
                }
              }}
              placeholder="オーナーIDまたはユーザー名で検索"
              className="w-full px-5 py-3 border border-gray-300/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-400 transition-all shadow-sm text-base"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-20 w-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200/60 overflow-hidden"
              >
                <div className="max-h-60 overflow-y-auto">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={`${suggestion.owner_id}-${index}`}
                      type="button"
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-medium">{suggestion.display}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {loadingSuggestions && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <svg className="w-5 h-5 animate-spin text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-3.357-5.357M20 15v5h-5" />
                </svg>
              </div>
            )}
          </div>
          
          {/* ソートコントロール */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 font-medium">並び替え:</span>
            <select
              value={sortField}
              onChange={(e) => handleSort(e.target.value as SortField)}
              className="px-4 py-2.5 text-sm border border-gray-300/80 rounded-xl bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-400 transition-all shadow-sm"
            >
              <option value="avg_likes">平均いいね数</option>
              <option value="max_likes">最大いいね数</option>
              <option value="avg_comments">平均コメント数</option>
              <option value="avg_views">平均再生数</option>
              <option value="total">投稿数</option>
            </select>
            <button
              onClick={() => {
                const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
                setSortOrder(newOrder);
                updateURLParams({ sort: sortField, order: newOrder, page: 1 });
                setCurrentPage(1);
              }}
              className="px-4 py-2.5 text-sm border border-gray-300/80 rounded-xl bg-white hover:border-gray-400 hover:bg-gray-50/80 transition-all shadow-sm"
              title={sortOrder === 'asc' ? '昇順' : '降順'}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {/* テーブル表示 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200/60">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">ユーザーID</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">投稿数</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">文字起こし完了</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">平均いいね数</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">最大いいね数</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">平均コメント数</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">平均再生数</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">最終更新</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">アクション</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200/60">
                {owners.map((owner) => {
                  const isHighlighted = highlightOwnerId === owner.owner_id;
                  return (
                  <tr
                    key={owner.owner_id}
                    ref={isHighlighted ? highlightedRowRef : null}
                    className={`hover:bg-gray-50/80 transition-colors ${
                      isHighlighted ? 'bg-yellow-50/80 border-l-4 border-yellow-400' : ''
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {owner.owner_username ? `@${owner.owner_username}` : owner.owner_id}
                        </div>
                        {owner.owner_username && (
                          <div className="text-xs text-gray-500 font-mono">{owner.owner_id}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                      {owner.total}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                      {owner.transcribed} / {owner.total}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                      {formatNumber(owner.avg_likes)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                      {formatNumber(owner.max_likes)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                      {formatNumber(owner.avg_comments)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                      {formatNumber(owner.avg_views)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {formatRelativeTime(owner.last_updated_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/owners/${owner.owner_id}`);
                        }}
                        className="px-4 py-2 text-sm bg-slate-700 text-white font-medium rounded-lg hover:bg-slate-800 transition-all duration-200 shadow-sm"
                      >
                        詳細
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {owners.length === 0 && !loading && (
          <div className="text-center py-16">
            <p className="text-gray-500 text-base">アカウントが見つかりませんでした</p>
          </div>
        )}

        {/* ページネーション */}
        {totalCount > 0 && (
          <div className="mt-8 flex items-center justify-between">
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
    </div>
  );
}

export default function OwnersPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <OwnersPageContent />
    </Suspense>
  );
}
