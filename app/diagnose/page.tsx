'use client';

import { useState, useEffect } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';

type QueryCategory = 'table_stats' | 'integrity' | 'freshness' | 'materialized_views' | 'anomalies' | 'performance';
type Severity = 'critical' | 'warning' | 'info';

interface DiagnosisResult {
  queryName: string;
  category: QueryCategory;
  severity: Severity;
  description: string;
  rowCount: number;
  error?: string;
  executionTime?: number;
  sampleRows: any[];
  hasMore: boolean;
}

interface CategoryStats {
  total: number;
  critical: number;
  warning: number;
  info: number;
}

interface DiagnosisResponse {
  summary: {
    totalQueries: number;
    successCount: number;
    errorCount: number;
    totalRows: number;
    criticalCount: number;
    warningCount: number;
    infoCount: number;
    integrityErrors: number;
    anomalyCount: number;
    categoryStats: Record<QueryCategory, CategoryStats>;
    inconsistencies: Array<{
      owner_id: string;
      total: number;
      transcribed: number;
      has_ja: number;
      not_transcribed_count?: number;
      transcribed_but_no_ja?: number;
      statuses_present?: string;
    }>;
  };
  results: DiagnosisResult[];
}

const categoryLabels: Record<QueryCategory, string> = {
  table_stats: 'テーブル基本統計',
  integrity: '整合性チェック',
  freshness: 'データ鮮度',
  materialized_views: 'マテリアライズドビュー',
  anomalies: '異常値・不整合',
  performance: 'パフォーマンス',
};

const severityColors = {
  critical: 'bg-red-50/80 border-red-200/60 text-red-800',
  warning: 'bg-yellow-50/80 border-yellow-200/60 text-yellow-800',
  info: 'bg-blue-50/80 border-blue-200/60 text-blue-800',
};

const severityBadgeColors = {
  critical: 'bg-red-100 text-red-800 border-red-300',
  warning: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  info: 'bg-blue-100 text-blue-800 border-blue-300',
};

export default function DiagnosePage() {
  const [data, setData] = useState<DiagnosisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedQueries, setExpandedQueries] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<QueryCategory | 'all'>('all');

  useEffect(() => {
    fetchDiagnosis();
  }, []);

  const fetchDiagnosis = async () => {
    try {
      setError(null);
      setLoading(true);
      const response = await fetch('/api/diagnose');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || `HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error('Error fetching diagnosis:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const toggleQuery = (queryName: string) => {
    const newExpanded = new Set(expandedQueries);
    if (newExpanded.has(queryName)) {
      newExpanded.delete(queryName);
    } else {
      newExpanded.add(queryName);
    }
    setExpandedQueries(newExpanded);
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="px-8 py-10">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight mb-6">データベース診断</h1>
          <div className="bg-red-50/80 border border-red-200/60 rounded-2xl p-6 shadow-sm">
            <p className="text-red-800 font-semibold text-base mb-2">エラーが発生しました</p>
            <p className="text-red-600 text-sm mb-4">{error}</p>
            <button
              onClick={fetchDiagnosis}
              className="px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-all duration-200 shadow-sm"
            >
              再試行
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-8 py-10">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight mb-6">データベース診断</h1>
          <div className="text-center py-16">
            <p className="text-gray-500 text-base">データがありません</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 tracking-tight mb-1">データベース診断</h1>
            <p className="text-sm text-gray-500">データベースの状態を確認・診断</p>
          </div>
          <button
            onClick={fetchDiagnosis}
            className="px-6 py-2.5 bg-slate-700 text-white text-sm font-medium rounded-xl hover:bg-slate-800 transition-all duration-200 shadow-sm"
          >
            再実行
          </button>
        </div>

        {/* サマリー */}
        <div className="bg-white border border-gray-200/60 rounded-2xl p-8 mb-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-6 text-gray-900 tracking-tight">診断サマリー</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
            <div className="bg-gray-50/80 rounded-xl p-5 border border-gray-200/60">
              <p className="text-sm text-gray-600 mb-2 font-medium">総クエリ数</p>
              <p className="text-3xl font-bold text-gray-900">{data.summary.totalQueries}</p>
            </div>
            <div className="bg-green-50/80 rounded-xl p-5 border border-green-200/60">
              <p className="text-sm text-green-700 mb-2 font-medium">成功</p>
              <p className="text-3xl font-bold text-green-700">{data.summary.successCount}</p>
            </div>
            <div className="bg-red-50/80 rounded-xl p-5 border border-red-200/60">
              <p className="text-sm text-red-700 mb-2 font-medium">Critical</p>
              <p className="text-3xl font-bold text-red-700">{data.summary.criticalCount}</p>
            </div>
            <div className="bg-yellow-50/80 rounded-xl p-5 border border-yellow-200/60">
              <p className="text-sm text-yellow-700 mb-2 font-medium">Warning</p>
              <p className="text-3xl font-bold text-yellow-700">{data.summary.warningCount}</p>
            </div>
            <div className="bg-blue-50/80 rounded-xl p-5 border border-blue-200/60">
              <p className="text-sm text-blue-700 mb-2 font-medium">Info</p>
              <p className="text-3xl font-bold text-blue-700">{data.summary.infoCount}</p>
            </div>
            <div className="bg-gray-50/80 rounded-xl p-5 border border-gray-200/60">
              <p className="text-sm text-gray-600 mb-2 font-medium">総行数</p>
              <p className="text-3xl font-bold text-gray-900">{data.summary.totalRows}</p>
            </div>
          </div>
          
          {/* カテゴリ別統計 */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">カテゴリ別統計</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(Object.keys(data.summary.categoryStats) as QueryCategory[]).map((category) => {
                const stats = data.summary.categoryStats[category];
                return (
                  <div key={category} className="bg-gray-50/80 rounded-xl p-4 border border-gray-200/60">
                    <p className="text-sm font-semibold text-gray-900 mb-2">{categoryLabels[category]}</p>
                    <div className="flex gap-2 text-xs">
                      <span className="px-2 py-1 rounded bg-red-100 text-red-800">
                        Critical: {stats.critical}
                      </span>
                      <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800">
                        Warning: {stats.warning}
                      </span>
                      <span className="px-2 py-1 rounded bg-blue-100 text-blue-800">
                        Info: {stats.info}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* 整合性エラーと異常値のサマリー */}
          {(data.summary.integrityErrors > 0 || data.summary.anomalyCount > 0) && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.summary.integrityErrors > 0 && (
                <div className="bg-red-50/80 rounded-xl p-4 border border-red-200/60">
                  <p className="text-sm font-semibold text-red-800 mb-1">整合性エラー</p>
                  <p className="text-2xl font-bold text-red-700">{data.summary.integrityErrors} 件</p>
                </div>
              )}
              {data.summary.anomalyCount > 0 && (
                <div className="bg-yellow-50/80 rounded-xl p-4 border border-yellow-200/60">
                  <p className="text-sm font-semibold text-yellow-800 mb-1">異常値検出</p>
                  <p className="text-2xl font-bold text-yellow-700">{data.summary.anomalyCount} 件</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 不整合の検出 */}
        {data.summary.inconsistencies.length > 0 && (
          <div className="bg-yellow-50/80 border border-yellow-200/60 rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4 text-yellow-800 tracking-tight">⚠️ 不整合が検出されました</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200/60 rounded-xl overflow-hidden">
                <thead className="bg-yellow-100/80">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Owner ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Transcribed</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Has JA</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">未Transcribed</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">JAなし</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status一覧</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200/60">
                  {data.summary.inconsistencies.map((inc) => (
                    <tr key={inc.owner_id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{inc.owner_id}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{inc.total}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{inc.transcribed}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{inc.has_ja}</td>
                      <td className="px-4 py-3 text-sm text-red-600 font-medium">
                        {inc.not_transcribed_count || 0}
                      </td>
                      <td className="px-4 py-3 text-sm text-orange-600 font-medium">
                        {inc.transcribed_but_no_ja || 0}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {inc.statuses_present || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* カテゴリフィルター */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                selectedCategory === 'all'
                  ? 'bg-slate-700 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              すべて
            </button>
            {(Object.keys(categoryLabels) as QueryCategory[]).map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  selectedCategory === category
                    ? 'bg-slate-700 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {categoryLabels[category]}
              </button>
            ))}
          </div>
        </div>

        {/* クエリ結果 */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 tracking-tight">クエリ結果</h2>
          {data.results
            .filter((result) => selectedCategory === 'all' || result.category === selectedCategory)
            .map((result, index) => {
              const severityColor = severityColors[result.severity];
              const badgeColor = severityBadgeColors[result.severity];
              
              return (
                <div
                  key={index}
                  className={`bg-white border rounded-2xl p-6 shadow-sm ${severityColor}`}
                >
                  <div
                    className="flex justify-between items-start cursor-pointer"
                    onClick={() => toggleQuery(result.queryName)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg text-gray-900">{result.queryName}</h3>
                        <span className={`px-2 py-1 rounded text-xs font-medium border ${badgeColor}`}>
                          {result.severity.toUpperCase()}
                        </span>
                        <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300">
                          {categoryLabels[result.category]}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{result.description}</p>
                      <div className="flex gap-4 text-sm">
                        {result.error ? (
                          <span className="text-red-600 font-medium">エラー: {result.error}</span>
                        ) : (
                          <>
                            <span className="text-gray-700">行数: {result.rowCount}</span>
                            {result.executionTime && (
                              <span className="text-gray-500">実行時間: {result.executionTime}ms</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-gray-400 text-xl ml-4">
                      {expandedQueries.has(result.queryName) ? '▼' : '▶'}
                    </span>
                  </div>
                  {expandedQueries.has(result.queryName) && result.sampleRows.length > 0 && (
                    <div className="mt-4 overflow-x-auto">
                      <table className="min-w-full bg-white border border-gray-200/60 rounded-xl overflow-hidden">
                        <thead className="bg-gray-100/80">
                          <tr>
                            {Object.keys(result.sampleRows[0]).map((key) => (
                              <th
                                key={key}
                                className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase"
                              >
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200/60">
                          {result.sampleRows.map((row, rowIndex) => (
                            <tr key={rowIndex} className="hover:bg-gray-50/50 transition-colors">
                              {Object.values(row).map((value: any, colIndex) => (
                                <td key={colIndex} className="px-4 py-3 text-sm text-gray-700">
                                  {value === null || value === undefined
                                    ? <span className="text-gray-400 italic">NULL</span>
                                    : typeof value === 'boolean'
                                    ? (
                                        <span className={value ? 'text-green-600' : 'text-red-600'}>
                                          {value.toString()}
                                        </span>
                                      )
                                    : typeof value === 'object'
                                    ? <pre className="text-xs">{JSON.stringify(value, null, 2)}</pre>
                                    : String(value)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {result.hasMore && (
                        <p className="mt-3 text-sm text-gray-500 text-center">
                          ... 他 {result.rowCount - result.sampleRows.length} 行
                        </p>
                      )}
                    </div>
                  )}
                  {expandedQueries.has(result.queryName) && result.sampleRows.length === 0 && !result.error && (
                    <div className="mt-4 text-center py-8 text-gray-500">
                      <p>データがありません</p>
                    </div>
                  )}
                </div>
              );
            })}
          {data.results.filter((result) => selectedCategory === 'all' || result.category === selectedCategory).length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <p>選択されたカテゴリに結果がありません</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
