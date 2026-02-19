'use client';

export interface SourcePost {
  ig_code: string;
  owner_username: string | null;
  likes_count: number;
  video_view_count: number;
  engagement_rate: number;
  total_score: number;
}

interface TopicCardProps {
  title: string;
  hook: string;
  outline: string;
  why: string;
  reference_codes: string[];
  estimated_engagement: 'high' | 'medium';
  source_posts: SourcePost[];
  onReelClick: (igCode: string) => void;
}

function formatNumber(num: number): string {
  if (num >= 100_000_000) return `${(num / 100_000_000).toFixed(1)}億`;
  if (num >= 10_000) return `${(num / 10_000).toFixed(1)}万`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}千`;
  return num.toLocaleString();
}

export default function TopicCard({
  title,
  hook,
  outline,
  why,
  reference_codes,
  estimated_engagement,
  source_posts,
  onReelClick,
}: TopicCardProps) {
  const refs = source_posts.filter((p) => reference_codes.includes(p.ig_code));

  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span
          className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${
            estimated_engagement === 'high'
              ? 'bg-orange-100 text-orange-700'
              : 'bg-blue-100 text-blue-700'
          }`}
        >
          {estimated_engagement === 'high' ? 'HIGH' : 'MEDIUM'}
        </span>
      </div>

      {/* Hook */}
      <div className="mb-2.5 p-2.5 bg-amber-50 rounded-xl border border-amber-100">
        <p className="text-[10px] text-amber-600 font-medium mb-0.5">掴みセリフ</p>
        <p className="text-xs text-gray-800 leading-relaxed">「{hook}」</p>
      </div>

      {/* Outline */}
      <div className="mb-2.5">
        <p className="text-[10px] text-gray-500 font-medium mb-0.5">構成</p>
        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">
          {outline}
        </p>
      </div>

      {/* Why */}
      <div className="mb-3">
        <p className="text-[10px] text-gray-500 font-medium mb-0.5">なぜ今伸びるか</p>
        <p className="text-xs text-gray-600 leading-relaxed">{why}</p>
      </div>

      {/* Reference Posts with Engagement */}
      {refs.length > 0 && (
        <div className="border-t border-gray-100 pt-2.5">
          <p className="text-[10px] text-gray-500 font-medium mb-2">参考投稿</p>
          <div className="space-y-1.5">
            {refs.map((post) => (
              <button
                key={post.ig_code}
                onClick={() => onReelClick(post.ig_code)}
                className="w-full flex items-center justify-between px-2.5 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-xs text-gray-600 hover:text-gray-900 transition-colors border border-gray-200/60"
              >
                <div className="flex items-center gap-1.5">
                  <svg
                    className="w-3.5 h-3.5 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="font-medium">
                    {post.owner_username || post.ig_code.slice(0, 8)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-400">
                  <span>♡ {formatNumber(post.likes_count)}</span>
                  <span>▶ {formatNumber(post.video_view_count)}</span>
                  <span>ER {post.engagement_rate.toFixed(1)}%</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
