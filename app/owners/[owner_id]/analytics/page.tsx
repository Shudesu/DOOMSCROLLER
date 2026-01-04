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
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-semibold">エラーが発生しました</p>
          <p className="text-red-600 mt-2">{error}</p>
          <button
            onClick={fetchAnalytics}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-500">データが見つかりませんでした</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <button
          onClick={() => router.push(`/owners`)}
          className="text-indigo-600 hover:text-indigo-700 text-sm mb-4"
        >
          ← アカウント一覧に戻る
        </button>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">アカウント分析</h1>
          <div className="flex gap-2">
            <button
              onClick={() => copyAllTranscripts('en')}
              disabled={copying !== null}
              className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {copying === 'en' ? 'コピー中...' : '英語台本を一括コピー'}
            </button>
            <button
              onClick={() => copyAllTranscripts('ja')}
              disabled={copying !== null}
              className="px-3 py-1.5 bg-slate-600 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50"
            >
              {copying === 'ja' ? 'コピー中...' : '日本語台本を一括コピー'}
            </button>
          </div>
        </div>
      </div>

      {/* 概要 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <h3 className="text-sm font-medium text-gray-600 mb-1">総投稿数</h3>
          <p className="text-3xl font-semibold text-gray-900">{analytics.overview.total_posts}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <h3 className="text-sm font-medium text-gray-600 mb-1">平均いいね数</h3>
          <p className="text-3xl font-semibold text-gray-900">
            {formatNumber(analytics.performance.avg_likes)}
          </p>
        </div>
      </div>

      {/* パフォーマンス */}
      <div className="bg-white p-4 rounded-lg shadow mb-6 border border-gray-200">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">パフォーマンス指標</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded p-3 border border-gray-200">
            <h3 className="text-xs font-medium text-gray-600 mb-1">平均いいね数</h3>
            <p className="text-lg font-semibold text-gray-900">{formatNumber(analytics.performance.avg_likes)}</p>
          </div>
          <div className="bg-gray-50 rounded p-3 border border-gray-200">
            <h3 className="text-xs font-medium text-gray-600 mb-1">平均コメント数</h3>
            <p className="text-lg font-semibold text-gray-900">{formatNumber(analytics.performance.avg_comments)}</p>
          </div>
          <div className="bg-gray-50 rounded p-3 border border-gray-200">
            <h3 className="text-xs font-medium text-gray-600 mb-1">平均再生数</h3>
            <p className="text-lg font-semibold text-gray-900">{formatNumber(analytics.performance.avg_views)}</p>
          </div>
          <div className="bg-gray-50 rounded p-3 border border-gray-200">
            <h3 className="text-xs font-medium text-gray-600 mb-1">最大いいね数</h3>
            <p className="text-lg font-semibold text-gray-900">{formatNumber(analytics.performance.max_likes)}</p>
          </div>
        </div>
      </div>

      {/* 判定分布 */}
      {analytics.decision_distribution.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow mb-6 border border-gray-200">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">判定分布</h2>
          <div className="flex gap-4">
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
        <div className="bg-white p-4 rounded-lg shadow mb-6 border border-gray-200">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">月別パフォーマンス</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-2 text-left">月</th>
                  <th className="px-4 py-2 text-right">投稿数</th>
                  <th className="px-4 py-2 text-right">平均いいね数</th>
                  <th className="px-4 py-2 text-right">平均コメント数</th>
                  <th className="px-4 py-2 text-right">平均再生数</th>
                </tr>
              </thead>
              <tbody>
                {analytics.time_series.map((item, index) => (
                  <tr key={index} className="border-b">
                    <td className="px-4 py-2">{item.month}</td>
                    <td className="px-4 py-2 text-right">{item.post_count}</td>
                    <td className="px-4 py-2 text-right">
                      {formatNumber(item.avg_likes)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatNumber(item.avg_comments)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatNumber(item.avg_views)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* トップ投稿 */}
      {analytics.top_posts.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow mb-6 border border-gray-200">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">トップパフォーマンス投稿</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-2 text-left">IG Code</th>
                  <th className="px-4 py-2 text-right">いいね数</th>
                  <th className="px-4 py-2 text-right">コメント数</th>
                  <th className="px-4 py-2 text-right">再生数</th>
                  <th className="px-4 py-2 text-left">投稿日</th>
                  <th className="px-4 py-2 text-center">台本</th>
                </tr>
              </thead>
              <tbody>
                {analytics.top_posts.map((post) => (
                  <tr
                    key={post.ig_code}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      setSelectedReel(post.ig_code);
                      setIsModalOpen(true);
                    }}
                  >
                    <td className="px-4 py-2 text-sm font-mono">{post.ig_code}</td>
                    <td className="px-4 py-2 text-right">
                      {formatNumber(post.likes_count)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatNumber(post.comments_count)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatNumber(post.video_view_count)}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {formatDate(post.posted_at)}
                    </td>
                    <td className="px-4 py-2 text-center">
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
        </div>
      )}

      {/* キーワード */}
      {analytics.keywords.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">頻出キーワード</h2>
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
