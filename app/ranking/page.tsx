'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import LoadingSpinner from '@/components/LoadingSpinner';
import ReelDetailModal from '@/components/ReelDetailModal';
import { useToast } from '@/components/ToastProvider';

interface RankingItem {
  ig_code: string;
  owner_id: string | null;
  owner_username: string | null;
  likes_count: number;
  video_view_count: number;
  posted_at: string;
  engagement_rate: number;
  total_score: number | null;
}

type SortField = 'likes_count' | 'video_view_count' | 'posted_at' | 'engagement_rate' | 'total_score';
type SortOrder = 'asc' | 'desc';

export default function RankingPage() {
  const router = useRouter();
  const [selectedReel, setSelectedReel] = useState<string | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copying, setCopying] = useState<'en' | 'ja' | null>(null);
  const [sortField, setSortField] = useState<SortField>('total_score');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const { showToast } = useToast();

  const { data: rankings = [], isLoading: loading, error } = useQuery({
    queryKey: ['rankings'],
    queryFn: async () => {
      const response = await fetch('/api/ranking');
      if (!response.ok) {
        throw new Error('Failed to fetch rankings');
      }
      return response.json() as Promise<RankingItem[]>;
    },
    staleTime: 5 * 60 * 1000, // 5分間キャッシュ
  });

  const copyAllTranscripts = async (type: 'en' | 'ja') => {
    setCopying(type);
    try {
      const response = await fetch('/api/ranking/transcripts');
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // アカウント単位でランクイン数を集計
  const getAccountStats = () => {
    const accountMap = new Map<string, { name: string; ownerId: string | null; count: number }>();
    
    rankings.forEach((item) => {
      const identifier = item.owner_username || item.owner_id || '不明';
      if (accountMap.has(identifier)) {
        accountMap.get(identifier)!.count += 1;
      } else {
        accountMap.set(identifier, { 
          name: identifier, 
          ownerId: item.owner_id,
          count: 1 
        });
      }
    });
    
    return Array.from(accountMap.values())
      .sort((a, b) => b.count - a.count);
  };

  const getSortedRankings = () => {
    const sorted = [...rankings].sort((a, b) => {
      let aVal: number | string | null = a[sortField];
      let bVal: number | string | null = b[sortField];
      
      if (sortField === 'posted_at') {
        aVal = new Date(a.posted_at).getTime();
        bVal = new Date(b.posted_at).getTime();
      }

      // null値の処理: nullは常に最後に来るようにする
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    return sorted;
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

  const formatRelativeTime = (dateString: string) => {
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  };

  const formatEngagementRate = (rate: number): string => {
    return `${(rate * 100).toFixed(2)}%`;
  };

  const formatScore = (score: number | null): string => {
    if (score === null) return '—';
    return score.toFixed(1);
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
      <div className="px-8 py-10">
        <div className="max-w-2xl mx-auto bg-red-50/80 border border-red-200/60 rounded-2xl p-6 shadow-sm">
          <p className="text-red-800 font-semibold text-base mb-2">エラーが発生しました</p>
          <p className="text-red-600 text-sm mb-4">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  const accountStats = getAccountStats();

  return (
    <div className="px-8 py-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 tracking-tight mb-1">トレンドランキング</h1>
            <p className="text-sm text-gray-500">過去30日間でエンゲージメント率が高い投稿 (上位50件)</p>
          </div>
        </div>

        <div className="flex gap-6 items-start">
          {/* 左側: 投稿ランキング表 */}
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200/60 overflow-hidden">
            <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
              <table className="w-full divide-y divide-gray-200/60 table-fixed">
                <colgroup>
                  <col className="w-16" />
                  <col className="w-auto" />
                  <col className="w-24" />
                  <col className="w-24" />
                  <col className="w-28" />
                  <col className="w-28" />
                </colgroup>
                <thead className="bg-gray-50/80 sticky top-0 z-20">
                  <tr className="divide-x divide-gray-200/60">
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      順位
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      アカウント名
                    </th>
                    <th 
                      className="px-2 py-2 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100/80 transition-colors"
                      onClick={() => handleSort('likes_count')}
                    >
                      いいね数 {getSortIcon('likes_count')}
                    </th>
                    <th 
                      className="px-2 py-2 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100/80 transition-colors"
                      onClick={() => handleSort('video_view_count')}
                    >
                      再生数 {getSortIcon('video_view_count')}
                    </th>
                    <th 
                      className="px-2 py-2 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100/80 transition-colors whitespace-nowrap"
                      onClick={() => handleSort('total_score')}
                    >
                      <div className="flex items-center justify-end gap-1 group relative whitespace-nowrap z-30">
                        <span>総合スコア</span>
                        <div 
                          className="relative"
                          onMouseEnter={(e) => {
                            const tooltip = e.currentTarget.querySelector('.tooltip') as HTMLElement;
                            if (tooltip) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              tooltip.style.left = `${rect.right - 256}px`;
                              tooltip.style.top = `${rect.top - tooltip.offsetHeight - 8}px`;
                            }
                          }}
                        >
                          <svg className="w-3.5 h-3.5 text-gray-400 cursor-help flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div className="tooltip fixed w-64 p-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[9999] whitespace-normal pointer-events-none">
                            複数の指標を組み合わせた総合的な評価スコア
                          </div>
                        </div>
                        {getSortIcon('total_score')}
                      </div>
                    </th>
                    <th 
                      className="px-2 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100/80 transition-colors"
                      onClick={() => handleSort('posted_at')}
                    >
                      投稿日 {getSortIcon('posted_at')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200/60">
                  {getSortedRankings().map((item, index) => (
                    <tr
                      key={item.ig_code}
                      onClick={() => handleRowClick(item.ig_code, item.owner_id)}
                      className={`cursor-pointer transition-colors divide-x divide-gray-100/60 ${
                        selectedReel === item.ig_code
                          ? 'bg-blue-50/80 hover:bg-blue-100/80'
                          : 'hover:bg-gray-50/80'
                      }`}
                    >
                      <td className="px-2 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                        {index + 1}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-700">
                        <div className="flex items-center gap-1">
                          <span>{item.owner_username || item.owner_id || '—'}</span>
                          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                        {formatNumber(item.likes_count)}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                        {formatNumber(item.video_view_count)}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-right font-bold text-slate-700">
                        {formatScore(item.total_score)}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(item.posted_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 右側: アカウントパワー表 */}
          <div className="w-64 bg-white rounded-2xl shadow-sm border border-gray-200/60 overflow-hidden">
            <div className="overflow-y-auto max-h-[700px]">
              <table className="w-full divide-y divide-gray-200/60 table-fixed">
                <colgroup>
                  <col className="w-12" />
                  <col className="w-auto" />
                  <col className="w-16" />
                </colgroup>
                <thead className="bg-gray-50/80 sticky top-0">
                  <tr className="divide-x divide-gray-200/60">
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      順位
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      アカウント名
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      回数
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200/60">
                  {accountStats.map((account, index) => (
                    <tr key={account.name} className="divide-x divide-gray-100/60 hover:bg-gray-50/80 transition-colors">
                      <td className="px-2 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                        {index + 1}
                      </td>
                      <td 
                        className={`px-2 py-2 whitespace-nowrap text-sm text-gray-700 ${
                          account.ownerId ? 'cursor-pointer hover:text-slate-700' : ''
                        }`}
                        onClick={() => {
                          if (account.ownerId) {
                            router.push(`/owners/${account.ownerId}`);
                          }
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <span className="truncate">{account.name}</span>
                          {account.ownerId && (
                            <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-center text-gray-900 font-medium">
                        {account.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {rankings.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-500 text-base">ランキングデータが見つかりませんでした</p>
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
            // selectedReelは保持して、色分けを維持
            // setSelectedReel(null);
            // setSelectedOwnerId(null);
          }}
          onDecisionChange={() => {
            // ランキングページでは特に何もしない
          }}
        />
      )}
    </div>
  );
}
