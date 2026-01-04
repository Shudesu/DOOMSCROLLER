export default function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-3 border-slate-200 border-t-slate-700"></div>
        <p className="text-sm text-gray-500">読み込み中...</p>
      </div>
    </div>
  );
}
