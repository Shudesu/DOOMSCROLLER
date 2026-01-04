'use client';

import { useState } from 'react';

interface VideoMiniPlayerProps {
  embedUrl: string;
  igCode: string;
  onClose: () => void;
}

export default function VideoMiniPlayer({
  embedUrl,
  igCode,
  onClose,
}: VideoMiniPlayerProps) {
  const [isMinimized, setIsMinimized] = useState(false);

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-[100] bg-white rounded-lg shadow-2xl border border-gray-300">
        <div className="flex items-center gap-2 p-2">
          <button
            onClick={() => setIsMinimized(false)}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            展開
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            閉じる
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100] bg-white rounded-lg shadow-2xl border border-gray-300 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-gray-100 px-3 py-2 border-b">
        <span className="text-sm font-medium text-gray-700">{igCode}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMinimized(true)}
            className="text-gray-600 hover:text-gray-800 text-lg"
            title="最小化"
          >
            −
          </button>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-800 text-lg"
            title="閉じる"
          >
            ×
          </button>
        </div>
      </div>

      {/* Video Player */}
      <div className="w-80 bg-black" style={{ height: '569px' }}>
        <iframe
          src={embedUrl}
          className="w-full h-full border-0"
          allow="encrypted-media"
          loading="lazy"
          title="Instagram embed"
        />
      </div>
    </div>
  );
}
