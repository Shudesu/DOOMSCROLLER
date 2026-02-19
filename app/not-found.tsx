import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-6 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
          <span className="text-3xl font-bold text-gray-400">404</span>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">ページが見つかりません</h2>
          <p className="text-sm text-gray-500 max-w-md">
            お探しのページは存在しないか、移動された可能性があります。
          </p>
        </div>
        <Link
          href="/ranking"
          className="px-6 py-2.5 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors"
        >
          ランキングに戻る
        </Link>
      </div>
    </div>
  );
}
