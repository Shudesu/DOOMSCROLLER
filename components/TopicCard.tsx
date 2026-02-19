'use client';

export interface ClassifiedPost {
  ig_code: string;
  owner_username: string | null;
  likes_count: number;
  video_view_count: number;
  engagement_rate: number;
  total_score: number;
  posted_at: string;
  summary: string;
  transcript_ja: string;
}

interface PostCardProps {
  post: ClassifiedPost;
  rank: number;
  onClick: () => void;
}

function fmt(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}億`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}千`;
  return n.toLocaleString();
}

export default function PostCard({ post, rank, onClick }: PostCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 hover:bg-gray-50/80 transition-colors group"
    >
      <div className="flex items-start gap-3">
        {/* Rank */}
        <span className="text-xs font-medium text-gray-400 mt-0.5 w-5 shrink-0 text-right">
          {rank}
        </span>

        <div className="flex-1 min-w-0">
          {/* Summary */}
          <p className="text-sm text-gray-900 leading-snug mb-1">
            {post.summary}
          </p>

          {/* Meta */}
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="font-medium text-gray-500">
              @{post.owner_username || '—'}
            </span>
            <span>{fmt(post.video_view_count)} 再生</span>
            <span>{fmt(post.likes_count)} いいね</span>
            <span>ER {post.engagement_rate.toFixed(1)}%</span>
          </div>
        </div>

        {/* Arrow */}
        <svg
          className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors mt-1 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
    </button>
  );
}
