'use client';

import { useState } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import ReelDetailModal from '@/components/ReelDetailModal';

interface ReelDetail {
  ig_code: string;
  owner_id: string | null;
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
}

interface ReelListItem {
  ig_code: string;
  owner_username: string | null;
  likes_count: number | null;
  comments_count: number | null;
  video_view_count: number | null;
  posted_at: string | null;
  fetched_at: string | null;
  canonical_url: string | null;
}

interface SemanticSearchResult {
  ig_code: string;
  owner_id: string | null;
  owner_username: string | null;
  score: number;
  text: string;
  likes_count: number | null;
  comments_count: number | null;
  video_view_count: number | null;
  posted_at: string | null;
  engagement_rate: number | null;
}

interface SemanticSearchResponse {
  query_raw: string;
  query_norm: string;
  query_type: 'theme' | 'claim' | 'phrasing' | 'structure';
  k: number;
  sort: string;
  results: SemanticSearchResult[];
}

type SearchType = 'ig_code' | 'owner_id' | 'semantic';

export default function SearchPage() {
  const [searchType, setSearchType] = useState<SearchType>('ig_code');
  const [searchQuery, setSearchQuery] = useState('');
  const [reel, setReel] = useState<ReelDetail | null>(null);
  const [reels, setReels] = useState<ReelListItem[]>([]);
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResponse | null>(null);
  const [sortBy, setSortBy] = useState<string>('distance');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedReel, setSelectedReel] = useState<string | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);

  // セマンティック検索の実行
  // distanceソートの場合はサーバー側でソートが必要なため、sortパラメータを渡す
  // それ以外のソートはクライアント側で行うため、常にdistanceで取得
  const performSemanticSearch = async (query: string, sort: string = 'distance') => {
    if (!query.trim() || query.trim().length < 2) {
      setSemanticResults(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // distanceソートの場合はサーバー側でソートが必要
      // それ以外はクライアント側でソートするため、常にdistanceで取得
      const apiSort = sort === 'distance' ? 'distance' : 'distance';
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&k=20&sort=${apiSort}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.error || '検索に失敗しました');
        setSemanticResults(null);
        return;
      }

      const data: SemanticSearchResponse = await response.json();
      
      // distance以外のソートはクライアント側で実行
      if (sort !== 'distance') {
        const sortedResults = sortResults(data.results, sort);
        setSemanticResults({
          ...data,
          results: sortedResults,
          sort: sort,
        });
      } else {
        setSemanticResults(data);
      }
    } catch (error) {
      console.error('Error searching:', error);
      setError('検索中にエラーが発生しました');
      setSemanticResults(null);
    } finally {
      setLoading(false);
    }
  };

  // セマンティック検索の自動実行は削除（ボタンクリックのみで実行）

  // クライアント側でソート（distance以外はクライアント側でソート可能）
  const sortResults = (results: SemanticSearchResult[], sort: string): SemanticSearchResult[] => {
    if (sort === 'distance') {
      // distanceは既にサーバー側でソート済み
      return results;
    }

    const sorted = [...results];
    sorted.sort((a, b) => {
      let aVal: number | string | null = null;
      let bVal: number | string | null = null;

      switch (sort) {
        case 'likes':
          aVal = a.likes_count;
          bVal = b.likes_count;
          break;
        case 'comments':
          aVal = a.comments_count;
          bVal = b.comments_count;
          break;
        case 'views':
          aVal = a.video_view_count;
          bVal = b.video_view_count;
          break;
        case 'posted_at':
          aVal = a.posted_at;
          bVal = b.posted_at;
          break;
        default:
          return 0;
      }

      // null値の処理（nullは最後に）
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      // 降順でソート（大きい値/新しい日付が先）
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return bVal.localeCompare(aVal);
      }
      return (bVal as number) - (aVal as number);
    });

    return sorted;
  };

  const handleSearch = async () => {
    if (searchType === 'semantic') {
      // セマンティック検索は手動実行のみ
      if (!searchQuery.trim() || searchQuery.trim().length < 2) {
        setError('検索クエリを2文字以上入力してください');
        return;
      }
      setLoading(true);
      setError(null);
      await performSemanticSearch(searchQuery, sortBy);
      return;
    }
    
    if (!searchQuery.trim()) {
      setError(`${searchType === 'ig_code' ? 'IG Code' : 'Owner ID'}を入力してください`);
      return;
    }

    setLoading(true);
    setError(null);
    setReel(null);
    setReels([]);
    setSemanticResults(null);

    try {
      if (searchType === 'ig_code') {
        // IG Codeで検索
        const response = await fetch(`/api/reels/${searchQuery.trim()}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            setError('指定されたIG Codeの投稿が見つかりませんでした');
          } else {
            const errorData = await response.json().catch(() => ({}));
            setError(errorData.error || '検索に失敗しました');
          }
          return;
        }

        const data = await response.json();
        setReel(data);
        setIsModalOpen(true);
        setSelectedReel(data.ig_code);
        setSelectedOwnerId(data.owner_id);
      } else {
        // Owner IDで検索
        const response = await fetch(`/api/owners/${searchQuery.trim()}/reels?limit=100`);
        
        if (!response.ok) {
          if (response.status === 404) {
            setError('指定されたOwner IDの投稿が見つかりませんでした');
          } else {
            const errorData = await response.json().catch(() => ({}));
            setError(errorData.error || '検索に失敗しました');
          }
          return;
        }

        const data = await response.json();
        if (data.length === 0) {
          setError('指定されたOwner IDの投稿が見つかりませんでした');
          return;
        }
        setReels(data);
        setSelectedOwnerId(searchQuery.trim());
      }
    } catch (error) {
      console.error('Error searching:', error);
      setError('検索中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleReelClick = async (igCode: string, ownerId: string | null) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/reels/${igCode}`);
      if (response.ok) {
        const data = await response.json();
        setReel(data);
        setSelectedReel(igCode);
        setSelectedOwnerId(ownerId);
        setIsModalOpen(true);
      }
    } catch (error) {
      console.error('Error fetching reel:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSemanticResultClick = async (igCode: string, ownerId: string | null) => {
    await handleReelClick(igCode, ownerId);
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

  return (
    <div className="px-8 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight mb-1">検索</h1>
          <p className="text-sm text-gray-500">IG Code、Owner ID、またはセマンティック検索</p>
        </div>

        <div className="mb-8">
          <div className="flex gap-3 mb-3">
            <div className="flex gap-2 bg-gray-100/80 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setSearchType('ig_code');
                  setSearchQuery('');
                  setError(null);
                  setReel(null);
                  setReels([]);
                  setSemanticResults(null);
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  searchType === 'ig_code'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                IG Code
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchType('owner_id');
                  setSearchQuery('');
                  setError(null);
                  setReel(null);
                  setReels([]);
                  setSemanticResults(null);
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  searchType === 'owner_id'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Owner ID
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchType('semantic');
                  setSearchQuery('');
                  setError(null);
                  setReel(null);
                  setReels([]);
                  setSemanticResults(null);
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  searchType === 'semantic'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                セマンティック
              </button>
            </div>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enterキーでの検索を無効化
                if (e.key === 'Enter') {
                  e.preventDefault();
                }
              }}
              placeholder={
                searchType === 'ig_code' 
                  ? 'IG Codeを入力してください' 
                  : searchType === 'owner_id'
                  ? 'Owner IDを入力してください'
                  : '日本語で検索クエリを入力してください（例: 成功の秘訣、面白い言い回し）'
              }
              className="flex-1 px-5 py-3 border border-gray-300/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-400 transition-all shadow-sm text-base"
              disabled={loading && searchType !== 'semantic'}
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={loading || !searchQuery.trim()}
              className="px-8 py-3 bg-slate-700 text-white text-base font-medium rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
            >
              {loading ? '検索中...' : '検索'}
            </button>
          </div>
        </div>

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


        {reels.length > 0 && !loading && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 overflow-hidden">
            <div className="p-6 border-b border-gray-200/60">
              <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
                検索結果 ({reels.length}件)
              </h2>
              {selectedOwnerId && (
                <p className="text-sm text-gray-500 mt-1">Owner ID: {selectedOwnerId}</p>
              )}
            </div>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full divide-y divide-gray-200/60">
                <thead className="bg-gray-50/80 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">IG Code</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">いいね数</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">コメント数</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">再生数</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">投稿日</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200/60">
                  {reels.map((item) => (
                    <tr
                      key={item.ig_code}
                      onClick={() => handleReelClick(item.ig_code, selectedOwnerId)}
                      className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900">{item.ig_code}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                        {formatNumber(item.likes_count)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                        {formatNumber(item.comments_count)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                        {formatNumber(item.video_view_count)}
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
        )}

        {semanticResults && !loading && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 overflow-hidden">
            <div className="p-6 border-b border-gray-200/60">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
                  検索結果 ({semanticResults.results.length}件)
                </h2>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600">ソート:</label>
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      const newSort = e.target.value;
                      setSortBy(newSort);
                      // 既に検索結果がある場合、ソート変更時にクライアント側でソート
                      if (semanticResults && searchQuery.trim().length >= 2) {
                        if (newSort === 'distance') {
                          // distanceソートの場合はサーバー側で再検索が必要
                          performSemanticSearch(searchQuery, newSort);
                        } else {
                          // それ以外はクライアント側でソート（APIコール不要）
                          const sortedResults = sortResults(semanticResults.results, newSort);
                          setSemanticResults({
                            ...semanticResults,
                            results: sortedResults,
                            sort: newSort,
                          });
                        }
                      }
                    }}
                    className="px-3 py-2 text-sm border border-gray-300/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-400"
                  >
                    <option value="distance">距離順</option>
                    <option value="likes">いいね数順</option>
                    <option value="comments">コメント数順</option>
                    <option value="views">再生数順</option>
                    <option value="posted_at">投稿日順</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-gray-600">クエリ:</span>
                  <span className="ml-2 font-medium text-gray-900">{semanticResults.query_raw}</span>
                </div>
                <div>
                  <span className="text-gray-600">タイプ:</span>
                  <span className="ml-2 font-medium text-gray-900">
                    {semanticResults.query_type === 'theme' && 'テーマ'}
                    {semanticResults.query_type === 'claim' && '主張'}
                    {semanticResults.query_type === 'phrasing' && '表現'}
                    {semanticResults.query_type === 'structure' && '構成'}
                  </span>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full divide-y divide-gray-200/60">
                <thead className="bg-gray-50/80 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">ユーザーID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">テキスト</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">いいね数</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">コメント数</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">再生数</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">投稿日</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">距離</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200/60">
                  {semanticResults.results.map((item, index) => (
                    <tr
                      key={`${item.ig_code}-${index}`}
                      onClick={() => handleSemanticResultClick(item.ig_code, item.owner_id)}
                      className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {item.owner_username ? `@${item.owner_username}` : (item.owner_id || '—')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 max-w-md">
                        <div className="line-clamp-2">{item.text}</div>
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
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(item.posted_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                        {item.score.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            setSelectedReel(null);
            setSelectedOwnerId(null);
          }}
          onDecisionChange={() => {
            // 検索ページでは特に何もしない
          }}
        />
      )}
    </div>
  );
}
