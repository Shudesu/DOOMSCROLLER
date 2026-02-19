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
  onReelClick: (igCode: string) => void;
}

function formatNumber(num: number): string {
  if (num >= 100_000_000) return `${(num / 100_000_000).toFixed(1)}億`;
  if (num >= 10_000) return `${(num / 10_000).toFixed(1)}万`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}千`;
  return num.toLocaleString();
}

export default function PostCard({ post, onReelClick }: PostCardProps) {
  return (
    <button
      onClick={() => onReelClick(post.ig_code)}
      className="w-full text-left bg-white rounded-2xl border border-gray-200/60 shadow-sm p-4 hover:shadow-md hover:border-gray-300/60 transition-all"
    >
      {/* Header: username + metrics */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700">
          @{post.owner_username || post.ig_code.slice(0, 8)}
        </span>
        <div className="flex items-center gap-2.5 text-[10px] text-gray-400">
          <span>♡ {formatNumber(post.likes_count)}</span>
          <span>▶ {formatNumber(post.video_view_count)}</span>
          <span>ER {post.engagement_rate.toFixed(1)}%</span>
        </div>
      </div>

      {/* Summary */}
      <p className="text-sm text-gray-900 leading-relaxed mb-2">
        {post.summary}
      </p>

      {/* Transcript preview */}
      <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
        {post.transcript_ja}
      </p>
    </button>
  );
}
