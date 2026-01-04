'use client';

import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  onClose: () => void;
}

export default function Toast({ message, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // フェードイン
    setIsVisible(true);

    // 3秒後にフェードアウトして閉じる
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // アニメーション完了後に削除
    }, 3000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="bg-white rounded-xl shadow-lg border border-gray-200/60 px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
        {message}
      </div>
    </div>
  );
}
