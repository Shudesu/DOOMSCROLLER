'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';
import ReelDetailModal from '@/components/ReelDetailModal';
import { useToast } from '@/components/ToastProvider';

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

export default function AnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const ownerId = params.owner_id as string;

  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReel, setSelectedReel] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copying, setCopying] = useState<'en' | 'ja' | null>(null);
  const { showToast } = useToast();

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/owners/${ownerId}/analytics`);
      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }
      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    if (ownerId) {
      fetchAnalytics();
    }
  }, [ownerId, fetchAnalytics]);

  const formatNumber = (value: number | null): string => {
    if (value === null) return '—';
    // 小数点以下を切り捨て
    const intValue = Math.floor(value);
    
    if (intValue >= 100000000) {
      // 1億以上
      const oku = Math.floor(intValue / 100000000);
      return `${oku}億`;
    }
    if (intValue >= 10000) {
      // 1万以上
      const man = Math.floor(intValue / 10000);
      return `${man}万`;
    }
    if (intValue >= 1000) {
      // 1千以上
      const sen = Math.floor(intValue / 1000);
      return `${sen}千`;
    }
    return intValue.toLocaleString('ja-JP');
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ja-JP');
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

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-10 max-w-7xl mx-auto">
        <div className="bg-red-50/80 border border-red-200/60 rounded-2xl p-6 shadow-sm">
          <p className="text-red-800 font-semibold">エラーが発生しました</p>
          <p className="text-red-600 mt-2">{error}</p>
          <button
            onClick={fetchAnalytics}
            className="mt-4 px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-all shadow-sm"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-10 max-w-7xl mx-auto">
        <p className="text-center text-gray-500">データが見つかりませんでした</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-10 max-w-7xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.push(`/owners`)}
          className="text-slate-600 hover:text-slate-800 text-sm mb-4 font-medium transition-colors"
        >
          ← アカウント一覧に戻る
        </button>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">アカウント分析</h1>
          <div className="flex gap-2">
            <button
              onClick={() => copyAllTranscripts('en')}
              disabled={copying !== null}
              className="px-3 py-2 bg-slate-700 text-white text-xs md:text-sm font-medium rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-all shadow-sm"
            >
              {copying === 'en' ? 'コピー中...' : '英語台本を一括コピー'}
            </button>
            <button
              onClick={() => copyAllTranscripts('ja')}
              disabled={copying !== null}
              className="px-3 py-2 bg-slate-600 text-white text-xs md:text-sm font-medium rounded-xl hover:bg-slate-700 disabled:opacity-50 transition-all shadow-sm"
            >
              {copying === 'ja' ? 'コピー中...' : '日本語台本を一括コピー'}
            </button>
          </div>
        </div>
      </div>

      {/* 概要 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200/60">
          <h3 className="text-xs font-medium text-gray-500 mb-1">総投稿数</h3>
          <p className="text-2xl font-bold text-gray-900">{analytics.overview.total_posts}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200/60">
          <h3 className="text-xs font-medium text-gray-500 mb-1">平均いいね数</h3>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(analytics.performance.avg_likes)}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200/60">
          <h3 className="text-xs font-medium text-gray-500 mb-1">平均コメント数</h3>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(analytics.performance.avg_comments)}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200/60">
          <h3 className="text-xs font-medium text-gray-500 mb-1">平均再生数</h3>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(analytics.performance.avg_views)}</p>
        </div>
      </div>

      {/* 判定分布 */}
      {analytics.decision_distribution.length > 0 && (
        <div className="bg-white p-5 rounded-2xl shadow-sm mb-6 border border-gray-200/60">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 tracking-tight">判定分布</h2>
          <div className="flex flex-col md:flex-row gap-4">
            {analytics.decision_distribution.map((item) => (
              <div key={item.decision} className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 capitalize">
                    {item.decision === 'keep' ? 'Keep' : item.decision === 'skip' ? 'Skip' : 'Later'}
                  </span>
                  <span className="text-lg font-bold">{item.count}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      item.decision === 'keep'
                        ? 'bg-green-600'
                        : item.decision === 'skip'
                        ? 'bg-red-600'
                        : 'bg-yellow-600'
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
        <div className="bg-white p-5 rounded-2xl shadow-sm mb-6 border border-gray-200/60">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 tracking-tight">月別パフォーマンス</h2>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200/60">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">月</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">投稿数</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">平均いいね</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">平均コメント</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">平均再生</th>
                </tr>
              </thead>
              <tbody>
                {analytics.time_series.map((item, index) => (
                  <tr key={index} className="border-b border-gray-200/60">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.month}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">{item.post_count}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">{formatNumber(item.avg_likes)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">{formatNumber(item.avg_comments)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">{formatNumber(item.avg_views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {analytics.time_series.map((item, index) => (
              <div key={index} className="bg-gray-50/80 rounded-xl p-4 border border-gray-200/60">
                <div className="text-sm font-semibold text-gray-900 mb-2">{item.month}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-gray-500">投稿数:</span> <span className="font-medium">{item.post_count}</span></div>
                  <div><span className="text-gray-500">平均いいね:</span> <span className="font-medium">{formatNumber(item.avg_likes)}</span></div>
                  <div><span className="text-gray-500">平均コメント:</span> <span className="font-medium">{formatNumber(item.avg_comments)}</span></div>
                  <div><span className="text-gray-500">平均再生:</span> <span className="font-medium">{formatNumber(item.avg_views)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* トップ投稿 */}
      {analytics.top_posts.length > 0 && (
        <div className="bg-white p-5 rounded-2xl shadow-sm mb-6 border border-gray-200/60">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 tracking-tight">トップパフォーマンス投稿</h2>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full">
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
                    className="border-b border-gray-200/60 hover:bg-gray-50/80 cursor-pointer transition-colors"
                    onClick={() => {
                      setSelectedReel(post.ig_code);
                      setIsModalOpen(true);
                    }}
                  >
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">{post.ig_code}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{formatNumber(post.likes_count)}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{formatNumber(post.comments_count)}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{formatNumber(post.video_view_count)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(post.posted_at)}</td>
                    <td className="px-4 py-3 text-center">
                      {post.has_ja ? (
                        <span className="text-green-600">✓</span>
                      ) : post.has_transcript ? (
                        <span className="text-yellow-600">EN</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {analytics.top_posts.map((post) => (
              <div
                key={post.ig_code}
                className="bg-gray-50/80 rounded-xl p-4 border border-gray-200/60 cursor-pointer active:bg-gray-100 transition-colors"
                onClick={() => {
                  setSelectedReel(post.ig_code);
                  setIsModalOpen(true);
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-gray-600">{post.ig_code}</span>
                  <span className="text-xs text-gray-500">{formatDate(post.posted_at)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-gray-500">いいね</span><div className="font-bold text-gray-900">{formatNumber(post.likes_count)}</div></div>
                  <div><span className="text-gray-500">コメント</span><div className="font-bold text-gray-900">{formatNumber(post.comments_count)}</div></div>
                  <div><span className="text-gray-500">再生</span><div className="font-bold text-gray-900">{formatNumber(post.video_view_count)}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* キーワード */}
      {analytics.keywords.length > 0 && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200/60">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 tracking-tight">頻出キーワード</h2>
          <div className="flex flex-wrap gap-2">
            {analytics.keywords.map((keyword, index) => (
              <span
                key={index}
                className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm border border-gray-300"
              >
                {keyword.word} ({keyword.count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Reel Detail Modal */}
      {selectedReel && (
        <ReelDetailModal
          igCode={selectedReel}
          ownerId={ownerId}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedReel(null);
          }}
          onDecisionChange={() => {
            // 判定が変更されたら分析データを再取得
            fetchAnalytics();
          }}
        />
      )}
    </div>
  );
}
