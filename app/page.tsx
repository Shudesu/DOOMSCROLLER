'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import TopicCard from '@/components/TopicCard';
import ReelDetailModal from '@/components/ReelDetailModal';
import LoadingSpinner from '@/components/LoadingSpinner';

interface SourcePost {
  ig_code: string;
  owner_username: string | null;
  likes_count: number;
  video_view_count: number;
}

interface Topic {
  title: string;
  hook: string;
  outline: string;
  why: string;
  reference_codes: string[];
  estimated_engagement: 'high' | 'medium';
}

interface RecommendationsResponse {
  generated_at: string;
  topics: Topic[];
  source_posts: SourcePost[];
}

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
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const handleReelClick = (igCode: string) => {
    setSelectedReel(igCode);
    setIsModalOpen(true);
  };

  // Find owner_id for the selected reel from source_posts
  const selectedOwnerId = selectedReel
    ? data?.source_posts.find((p) => p.ig_code === selectedReel)
        ?.owner_username || 'unknown'
    : null;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
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
            <h1 className="text-xl font-bold text-gray-900">
              今日これ撮れ
            </h1>
          </div>
          <p className="text-sm text-gray-500">
            直近30日間のバズ投稿を分析し、今日撮影すべきトピックを提案します
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
          <div className="space-y-4">
            {data.topics.map((topic, i) => (
              <TopicCard
                key={i}
                {...topic}
                source_posts={data.source_posts}
                onReelClick={handleReelClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reel Detail Modal */}
      {selectedReel && selectedOwnerId && (
        <ReelDetailModal
          igCode={selectedReel}
          ownerId={selectedOwnerId}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
          }}
          onDecisionChange={() => {}}
        />
      )}
    </div>
  );
}
