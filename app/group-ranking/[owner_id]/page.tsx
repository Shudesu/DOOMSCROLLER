'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';
import InlineSpinner from '@/components/InlineSpinner';
import ReelDetailModal from '@/components/ReelDetailModal';

interface OwnerSuggestion {
  owner_id: string;
  owner_username: string | null;
  display: string;
}

interface GroupRankingItem {
  ig_code: string;
  owner_id: string | null;
  owner_username: string | null;
  similarity: number;
  likes_count: number | null;
  comments_count: number | null;
  video_view_count: number | null;
  posted_at: string | null;
  engagement_rate: number | null;
}

interface GroupRankingResponse {
  group_owner_id: string;
  group_owner_username: string | null;
  similar_owners_count: number;
  total_posts: number;
  sort: string;
  secondary_sort: string | null;
  results: GroupRankingItem[];
}

type SortField = 'similarity' | 'views' | 'likes' | 'comments' | 'engagement' | 'posted_at';
type SecondarySortField = 'similarity' | 'views' | 'likes' | 'comments' | 'engagement' | 'posted_at';

export default function GroupRankingPage() {
  const router = useRouter();
  const params = useParams();
  const ownerIdFromUrl = params.owner_id as string;

  const [searchQuery, setSearchQuery] = useState(ownerIdFromUrl || '');
  const [groupRanking, setGroupRanking] = useState<GroupRankingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortField>('similarity');
  const [secondarySortBy, setSecondarySortBy] = useState<SecondarySortField>('views');
  const [topPercentage, setTopPercentage] = useState<number>(20);
  const [selectedReel, setSelectedReel] = useState<string | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [selectedReelIgCode, setSelectedReelIgCode] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // モーダルを閉じた後も選択状態を保持
  const [lastSelectedReel, setLastSelectedReel] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<OwnerSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ownerIdFromUrl) {
      setSearchQuery(ownerIdFromUrl);
      fetchGroupRanking(ownerIdFromUrl, 'similarity', 'views', 20);
    }
  }, [ownerIdFromUrl]);

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

  const fetchGroupRanking = async (ownerId: string, sort: string = 'similarity', secondarySort: string = 'views', percentage: number = 20, showLoading: boolean = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    try {
      let url = `/api/owners/${ownerId}/group-ranking?sort=${sort}&secondary_sort=${secondarySort}&limit=100`;
      if (sort === 'similarity') {
        url += `&top_percentage=${percentage}`;
      }
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch group ranking');
      }
      const data: GroupRankingResponse = await response.json();
      setGroupRanking(data);
    } catch (error) {
      console.error('Error fetching group ranking:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
      if (showLoading) {
        setGroupRanking(null);
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setError('オーナーIDまたはユーザー名を入力してください');
      return;
    }
    const ownerId = extractOwnerId(searchQuery.trim());
    await fetchGroupRanking(ownerId, sortBy, secondarySortBy, topPercentage);
  };

  const handleSuggestionClick = (suggestion: OwnerSuggestion) => {
    setSearchQuery(suggestion.display);
    setShowSuggestions(false);
    fetchGroupRanking(suggestion.owner_id, sortBy, secondarySortBy, topPercentage);
  };

  const handleSortChange = (newSort: SortField) => {
    setSortBy(newSort);
    if (groupRanking) {
      // ソート変更時は既存データを保持（ローディング表示しない）
      fetchGroupRanking(groupRanking.group_owner_id, newSort, secondarySortBy, topPercentage, false);
    }
  };

  const handleSecondarySortChange = (newSecondarySort: SecondarySortField) => {
    setSecondarySortBy(newSecondarySort);
    if (groupRanking) {
      // 副ソート変更時も既存データを保持（ローディング表示しない）
      fetchGroupRanking(groupRanking.group_owner_id, sortBy, newSecondarySort, topPercentage, false);
    }
  };

  const handleTopPercentageChange = (newPercentage: number) => {
    setTopPercentage(newPercentage);
    if (groupRanking && sortBy === 'similarity') {
      // パーセンテージ変更時も既存データを保持（ローディング表示しない）
      fetchGroupRanking(groupRanking.group_owner_id, sortBy, secondarySortBy, newPercentage, false);
    }
  };

  const handleReelClick = async (igCode: string, ownerId: string | null) => {
    setSelectedReel(igCode);
    setSelectedOwnerId(ownerId);
    setSelectedReelIgCode(igCode);
    setIsModalOpen(true);
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
    return new Date(dateString).toLocaleDateString('ja-JP');
  };

  const formatEngagementRate = (rate: number | null): string => {
    if (rate === null) return '—';
    return `${(rate * 100).toFixed(2)}%`;
  };

  const formatSimilarity = (similarity: number): string => {
    return `${(similarity * 100).toFixed(1)}%`;
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-10">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={() => router.push('/owners')}
          className="text-slate-600 hover:text-slate-800 text-sm mb-4 font-medium transition-colors flex items-center gap-1"
        >
          ← アカウント一覧に戻る
        </button>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1">グループランキング</h1>
          <p className="text-sm text-gray-500">似ているアカウント群の投稿をランキング表示</p>
        </div>

        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative flex gap-3">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => {
                  if (suggestions.length > 0) {
                    setShowSuggestions(true);
                  }
                }}
                placeholder="オーナーIDまたはユーザー名を入力"
                className="w-full px-5 py-3 border border-gray-300/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-400 transition-all shadow-sm text-base"
                disabled={loading}
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
                  <InlineSpinner />
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !searchQuery.trim()}
              className="px-8 py-3 bg-slate-700 text-white text-base font-medium rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
            >
              {loading ? '検索中...' : '検索'}
            </button>
          </div>
        </form>

        {loading && (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        )}

        {error && (
          <div className="bg-red-50/80 border border-red-200/60 rounded-2xl p-6 mb-6 shadow-sm">
            <p className="text-red-800 font-semibold text-base mb-1">エラー</p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {groupRanking && !loading && (
          <div className="space-y-6">
            {/* グループ情報 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 tracking-tight mb-1">
                    {groupRanking.group_owner_username ? `@${groupRanking.group_owner_username}` : groupRanking.group_owner_id}
                  </h2>
                  <p className="text-sm text-gray-500">
                    似ているアカウント: {groupRanking.similar_owners_count}件 | 投稿数: {groupRanking.total_posts}件
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600">ソート:</label>
                  <select
                    value={sortBy}
                    onChange={(e) => handleSortChange(e.target.value as SortField)}
                    className="px-3 py-2 text-sm border border-gray-300/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-400"
                  >
                    <option value="similarity">類似度順</option>
                    <option value="views">再生数順</option>
                    <option value="likes">いいね数順</option>
                    <option value="comments">コメント数順</option>
                    <option value="engagement">エンゲージメント率順</option>
                    <option value="posted_at">投稿日順</option>
                  </select>
                  <label className="text-sm text-gray-600">副ソート:</label>
                  <select
                    value={secondarySortBy}
                    onChange={(e) => handleSecondarySortChange(e.target.value as SecondarySortField)}
                    className="px-3 py-2 text-sm border border-gray-300/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-400"
                  >
                    <option value="similarity">類似度順</option>
                    <option value="views">再生数順</option>
                    <option value="likes">いいね数順</option>
                    <option value="comments">コメント数順</option>
                    <option value="engagement">エンゲージメント率順</option>
                    <option value="posted_at">投稿日順</option>
                  </select>
                  {sortBy === 'similarity' && (
                    <>
                      <label className="text-sm text-gray-600">上位:</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={topPercentage}
                          onChange={(e) => {
                            const value = parseInt(e.target.value, 10);
                            if (!isNaN(value) && value >= 1 && value <= 100) {
                              handleTopPercentageChange(value);
                            }
                          }}
                          className="w-16 px-2 py-2 text-sm border border-gray-300/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-400"
                        />
                        <span className="text-sm text-gray-600">%</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ランキングテーブル */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 overflow-hidden">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full divide-y divide-gray-200/60">
                  <thead className="bg-gray-50/80 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">順位</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">ユーザーID</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">類似度</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">いいね数</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">コメント数</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">再生数</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">エンゲージメント率</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">投稿日</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200/60">
                    {groupRanking.results.map((item, index) => (
                      <tr
                        key={item.ig_code}
                        onClick={() => handleReelClick(item.ig_code, item.owner_id)}
                        className={`cursor-pointer transition-colors ${
                          lastSelectedReel === item.ig_code || selectedReelIgCode === item.ig_code
                            ? 'bg-blue-50/80 hover:bg-blue-100/80'
                            : 'hover:bg-gray-50/80'
                        }`}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {index + 1}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {item.owner_username ? `@${item.owner_username}` : (item.owner_id || '—')}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                          {formatSimilarity(item.similarity)}
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedReel && (
        <ReelDetailModal
          igCode={selectedReel}
          ownerId={selectedOwnerId || ''}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setLastSelectedReel(selectedReelIgCode); // 閉じた時に選択状態を保持
            setSelectedReel(null);
            setSelectedOwnerId(null);
            setSelectedReelIgCode(null);
          }}
          onDecisionChange={() => {
            // グループランキングページでは特に何もしない
          }}
        />
      )}
    </div>
  );
}
