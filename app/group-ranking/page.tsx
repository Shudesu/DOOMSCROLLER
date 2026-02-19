'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import InlineSpinner from '@/components/InlineSpinner';

interface OwnerSuggestion {
  owner_id: string;
  owner_username: string | null;
  display: string;
}

export default function GroupRankingSearchPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<OwnerSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // クリックアウトサイドで候補を閉じる
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (searchQuery.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/owners/search?q=${encodeURIComponent(searchQuery)}&limit=10`);
        if (response.ok) {
          const data: OwnerSuggestion[] = await response.json();
          setSuggestions(data);
          setShowSuggestions(data.length > 0);
        }
      } catch (error) {
        console.error('Error fetching suggestions:', error);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      return;
    }
    // owner_idを抽出（@username (owner_id) 形式から owner_id を取得、またはそのまま）
    const ownerId = extractOwnerId(searchQuery.trim());
    router.push(`/group-ranking/${encodeURIComponent(ownerId)}`);
  };

  const extractOwnerId = (query: string): string => {
    // @username (owner_id) 形式から owner_id を抽出
    const match = query.match(/\((\d+)\)$/);
    if (match) {
      return match[1];
    }
    // そのまま返す
    return query;
  };

  const handleSuggestionClick = (suggestion: OwnerSuggestion) => {
    setSearchQuery(suggestion.display);
    setShowSuggestions(false);
    router.push(`/group-ranking/${encodeURIComponent(suggestion.owner_id)}`);
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-10">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1">グループランキング</h1>
          <p className="text-sm text-gray-500">似ているアカウント群の投稿をランキング表示</p>
        </div>

        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative flex gap-3">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => {
                  if (suggestions.length > 0) {
                    setShowSuggestions(true);
                  }
                }}
                placeholder="オーナーIDまたはユーザー名を入力"
                className="w-full px-5 py-3 border border-gray-300/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-400 transition-all shadow-sm text-base"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute z-20 w-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200/60 overflow-hidden"
                >
                  <div className="max-h-60 overflow-y-auto">
                    {suggestions.map((suggestion, index) => (
                      <button
                        key={`${suggestion.owner_id}-${index}`}
                        type="button"
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                      >
                        <div className="font-medium">{suggestion.display}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <InlineSpinner />
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={!searchQuery.trim()}
              className="px-8 py-3 bg-slate-700 text-white text-base font-medium rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
            >
              検索
            </button>
          </div>
        </form>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 p-8">
          <p className="text-gray-600 text-center">
            オーナーIDまたはユーザー名を入力して、似ているアカウント群の投稿ランキングを表示します
          </p>
        </div>
      </div>
    </div>
  );
}
