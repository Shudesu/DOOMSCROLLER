'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PostCard from '@/components/TopicCard';
import type { ClassifiedPost } from '@/components/TopicCard';
import ReelDetailModal from '@/components/ReelDetailModal';
import LoadingSpinner from '@/components/LoadingSpinner';

interface HARMCategory {
  category: 'health' | 'ambition' | 'relationship' | 'money';
  label: string;
  posts: ClassifiedPost[];
}

interface RecommendationsResponse {
  generated_at: string;
  categories: HARMCategory[];
}

const CATEGORY_CONFIG: Record<
  string,
  { emoji: string; color: string; border: string; bg: string }
> = {
  health: {
    emoji: '💪',
    color: 'text-emerald-700',
    border: 'border-emerald-200',
    bg: 'bg-emerald-50',
  },
  ambition: {
    emoji: '🚀',
    color: 'text-purple-700',
    border: 'border-purple-200',
    bg: 'bg-purple-50',
  },
  relationship: {
    emoji: '💬',
    color: 'text-pink-700',
    border: 'border-pink-200',
    bg: 'bg-pink-50',
  },
  money: {
    emoji: '💰',
    color: 'text-amber-700',
    border: 'border-amber-200',
    bg: 'bg-amber-50',
  },
};

export default function Home() {
  const [selectedReel, setSelectedReel] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data, isLoading, error } = useQuery<RecommendationsResponse>({
    queryKey: ['recommendations'],
    queryFn: async () => {
      const res = await fetch('/api/recommendations');
      if (!res.ok) throw new Error('Failed to fetch recommendations');
      return res.json();
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  const handleReelClick = (igCode: string) => {
    setSelectedReel(igCode);
    setIsModalOpen(true);
  };

  // Find owner_id from the categories data
  const selectedOwnerId = (() => {
    if (!selectedReel || !data) return null;
    for (const cat of data.categories) {
      const post = cat.posts.find((p) => p.ig_code === selectedReel);
      if (post) return post.owner_username || 'unknown';
    }
    return null;
  })();

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-2">
            <svg
              className="w-6 h-6 text-amber-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            <h1 className="text-xl font-bold text-gray-900">今日これ撮れ</h1>
          </div>
          <p className="text-sm text-gray-500">
            バズ投稿をHARMジャンル別に分類。タップして台本を確認、そのまま撮影へ
          </p>
          {data?.generated_at && (
            <p className="text-xs text-gray-400 mt-1">
              最終更新:{' '}
              {new Date(data.generated_at).toLocaleString('ja-JP', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </div>

        {/* Content */}
        {isLoading && <LoadingSpinner />}

        {error && (
          <div className="text-center py-16">
            <p className="text-red-500 text-sm">
              おすすめの取得に失敗しました
            </p>
            <p className="text-gray-400 text-xs mt-1">
              しばらくしてからもう一度お試しください
            </p>
          </div>
        )}

        {data && (
          <div className="space-y-8">
            {data.categories.map((cat) => {
              const config =
                CATEGORY_CONFIG[cat.category] || CATEGORY_CONFIG.ambition;
              return (
                <section key={cat.category}>
                  {/* Category Header */}
                  <div
                    className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-xl ${config.bg} border ${config.border}`}
                  >
                    <span className="text-lg">{config.emoji}</span>
                    <h2 className={`text-sm font-bold ${config.color}`}>
                      {cat.label}
                    </h2>
                    <span className="text-xs text-gray-400 ml-auto">
                      {cat.posts.length}件
                    </span>
                  </div>

                  {/* Post Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {cat.posts.map((post) => (
                      <PostCard
                        key={post.ig_code}
                        post={post}
                        onReelClick={handleReelClick}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Reel Detail Modal */}
      {selectedReel && selectedOwnerId && (
        <ReelDetailModal
          igCode={selectedReel}
          ownerId={selectedOwnerId}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onDecisionChange={() => {}}
        />
      )}
    </div>
  );
}
