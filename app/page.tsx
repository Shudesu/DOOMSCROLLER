'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PostCard from '@/components/TopicCard';
import type { ClassifiedPost } from '@/components/TopicCard';
import ReelDetailModal from '@/components/ReelDetailModal';
import LoadingSpinner from '@/components/LoadingSpinner';

interface GenreGroup {
  genre: string;
  label: string;
  posts: ClassifiedPost[];
}

interface RecommendationsResponse {
  generated_at: string;
  genres: GenreGroup[];
}

export default function Home() {
  const [selectedReel, setSelectedReel] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeGenre, setActiveGenre] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<RecommendationsResponse>({
    queryKey: ['recommendations'],
    queryFn: async () => {
      const res = await fetch('/api/recommendations');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  const handleReelClick = (igCode: string) => {
    setSelectedReel(igCode);
    setIsModalOpen(true);
  };

  // Set default active genre once data loads
  const genres = data?.genres || [];
  const currentGenre = activeGenre || genres[0]?.genre || null;
  const currentGroup = genres.find((g) => g.genre === currentGenre);

  const selectedOwnerId = (() => {
    if (!selectedReel || !data) return null;
    for (const g of data.genres) {
      const post = g.posts.find((p) => p.ig_code === selectedReel);
      if (post) return post.owner_username || 'unknown';
    }
    return null;
  })();

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-4xl mx-auto px-4 py-6 md:px-8 md:py-10">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            今日これ撮れ
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            直近30日のバズ投稿をジャンル別に整理
            {data?.generated_at && (
              <span className="text-gray-400">
                {' · '}
                {new Date(data.generated_at).toLocaleDateString('ja-JP', {
                  month: 'short',
                  day: 'numeric',
                })}
                更新
              </span>
            )}
          </p>
        </div>

        {isLoading && <LoadingSpinner />}

        {error && (
          <div className="bg-red-50/80 border border-red-200/60 rounded-2xl p-6 shadow-sm">
            <p className="text-red-800 text-sm font-medium">取得に失敗しました</p>
            <p className="text-red-600 text-xs mt-1">
              しばらくしてからもう一度お試しください
            </p>
          </div>
        )}

        {data && genres.length > 0 && (
          <>
            {/* Genre Tabs */}
            <div className="flex gap-1 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
              {genres.map((g) => (
                <button
                  key={g.genre}
                  onClick={() => setActiveGenre(g.genre)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    g.genre === currentGenre
                      ? 'bg-slate-700 text-white'
                      : 'bg-white text-gray-600 border border-gray-200/60 hover:bg-gray-50'
                  }`}
                >
                  {g.label}
                  <span
                    className={`ml-1.5 ${
                      g.genre === currentGenre
                        ? 'text-gray-300'
                        : 'text-gray-400'
                    }`}
                  >
                    {g.posts.length}
                  </span>
                </button>
              ))}
            </div>

            {/* Post List */}
            {currentGroup && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 overflow-hidden divide-y divide-gray-200/60">
                {currentGroup.posts.map((post, i) => (
                  <PostCard
                    key={post.ig_code}
                    post={post}
                    rank={i + 1}
                    onClick={() => handleReelClick(post.ig_code)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

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
