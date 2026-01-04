import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '@/lib/db';

type QueryCategory = 'table_stats' | 'integrity' | 'freshness' | 'materialized_views' | 'anomalies' | 'performance';
type Severity = 'critical' | 'warning' | 'info';

interface QueryMetadata {
  name: string;
  sql: string;
  category: QueryCategory;
  severity: Severity;
  description: string;
}

// カテゴリマッピング
const categoryMap: Record<string, QueryCategory> = {
  'A. テーブル基本統計': 'table_stats',
  'B. テーブル間整合性チェック': 'integrity',
  'C. データ鮮度チェック': 'freshness',
  'D. マテリアライズドビューの状態': 'materialized_views',
  'E. 異常値・不整合の検出': 'anomalies',
  'F. パフォーマンス関連': 'performance',
};

// クエリ名から重要度を判定
function determineSeverity(queryName: string, rowCount: number, hasError: boolean): Severity {
  if (hasError) return 'critical';
  
  const name = queryName.toLowerCase();
  
  // 整合性エラー、重複、異常値は critical
  if (name.includes('存在しない') || name.includes('重複') || name.includes('異常') || 
      name.includes('負の値') || name.includes('exceeds') || name.includes('invalid')) {
    return rowCount > 0 ? 'critical' : 'info';
  }
  
  // 古いデータ、統計情報の不整合は warning
  if (name.includes('古い') || name.includes('stale') || name.includes('整合性') || 
      name.includes('不整合') || name.includes('鮮度')) {
    return rowCount > 0 ? 'warning' : 'info';
  }
  
  // その他は info
  return 'info';
}

// クエリ名から説明を生成
function generateDescription(queryName: string, category: QueryCategory): string {
  const name = queryName.toLowerCase();
  
  if (name.includes('行数') || name.includes('サイズ')) {
    return 'テーブルの基本統計情報（行数、サイズ、更新日時）を表示します';
  }
  if (name.includes('スキーマ')) {
    return 'テーブルのスキーマ情報（カラム名、データ型、制約）を確認します';
  }
  if (name.includes('存在しない') || name.includes('整合性')) {
    return 'テーブル間の参照整合性をチェックします。外部キー制約の違反を検出します';
  }
  if (name.includes('鮮度') || name.includes('stale') || name.includes('古い')) {
    return 'データの鮮度を確認します。古いデータや更新されていないレコードを検出します';
  }
  if (name.includes('マテリアライズドビュー') || name.includes('cache')) {
    return 'マテリアライズドビューの状態と整合性を確認します';
  }
  if (name.includes('異常') || name.includes('負の値') || name.includes('重複')) {
    return '異常値や不整合を検出します。データ品質の問題を特定します';
  }
  if (name.includes('インデックス') || name.includes('統計') || name.includes('パフォーマンス')) {
    return 'パフォーマンス関連の情報（インデックス、統計情報、テーブルサイズ）を確認します';
  }
  
  return 'データベースの状態を診断します';
}

// SQLファイルを読み込んでクエリを分割
function parseSQLFile(filePath: string): QueryMetadata[] {
  const content = readFileSync(filePath, 'utf-8');
  const queries: QueryMetadata[] = [];
  
  let currentCategory: QueryCategory = 'table_stats';
  
  // セミコロンでクエリを分割
  const sqlBlocks = content.split(';').filter(block => block.trim());
  
  for (const block of sqlBlocks) {
    const lines = block.split('\n');
    let queryName = '';
    let sqlLines: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // カテゴリの検出（-- A. など）
      if (trimmed.match(/^--\s*[A-F]\.\s*(.+)$/)) {
        const categoryKey = trimmed.replace(/^--\s*[A-F]\.\s*/, '').trim();
        if (categoryMap[categoryKey]) {
          currentCategory = categoryMap[categoryKey];
        }
        continue;
      }
      
      // クエリ名の抽出（-- 数字. で始まる行）
      if (trimmed.match(/^--\s*\d+\.\s*(.+)$/)) {
        queryName = trimmed.replace(/^--\s*\d+\.\s*/, '').trim();
        continue;
      }
      
      // 区切り線やその他のコメントをスキップ
      if (trimmed.startsWith('--') || trimmed === '') {
        continue;
      }
      
      // SQL文を追加
      sqlLines.push(line);
    }
    
    const sql = sqlLines.join('\n').trim();
    if (sql && queryName) {
      queries.push({
        name: queryName,
        sql,
        category: currentCategory,
        severity: 'info', // 実行後に更新
        description: generateDescription(queryName, currentCategory),
      });
    }
  }
  
  return queries;
}

export async function GET() {
  try {
    const sqlFilePath = join(process.cwd(), 'scripts', 'diagnose_db.sql');
    const queries = parseSQLFile(sqlFilePath);
    
    const results: Array<{
      queryName: string;
      category: QueryCategory;
      severity: Severity;
      description: string;
      rows: any[];
      error?: string;
      rowCount: number;
      executionTime?: number;
    }> = [];
    
    for (const queryMeta of queries) {
      const startTime = Date.now();
      try {
        const result = await query(queryMeta.sql);
        const executionTime = Date.now() - startTime;
        const severity = determineSeverity(queryMeta.name, result.rowCount, false);
        
        results.push({
          queryName: queryMeta.name,
          category: queryMeta.category,
          severity,
          description: queryMeta.description,
          rows: result.rows,
          rowCount: result.rowCount,
          executionTime,
        });
      } catch (error) {
        const executionTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          queryName: queryMeta.name,
          category: queryMeta.category,
          severity: 'critical',
          description: queryMeta.description,
          rows: [],
          rowCount: 0,
          error: errorMessage,
          executionTime,
        });
      }
    }
    
    // カテゴリ別の集計
    const categoryStats: Record<QueryCategory, { total: number; critical: number; warning: number; info: number }> = {
      table_stats: { total: 0, critical: 0, warning: 0, info: 0 },
      integrity: { total: 0, critical: 0, warning: 0, info: 0 },
      freshness: { total: 0, critical: 0, warning: 0, info: 0 },
      materialized_views: { total: 0, critical: 0, warning: 0, info: 0 },
      anomalies: { total: 0, critical: 0, warning: 0, info: 0 },
      performance: { total: 0, critical: 0, warning: 0, info: 0 },
    };
    
    results.forEach(r => {
      const stats = categoryStats[r.category];
      stats.total++;
      if (r.error) {
        stats.critical++;
      } else {
        stats[r.severity]++;
      }
    });
    
    // 不整合があるowner_idを特定
    const inconsistencyQuery = results.find(r => 
      r.queryName.includes('不整合') || r.queryName.includes('集計')
    );
    
    // 整合性エラーの集計
    const integrityErrors = results
      .filter(r => r.category === 'integrity' && !r.error && r.rowCount > 0)
      .reduce((sum, r) => sum + r.rowCount, 0);
    
    // 異常値の集計
    const anomalyCount = results
      .filter(r => r.category === 'anomalies' && !r.error && r.rowCount > 0)
      .reduce((sum, r) => sum + r.rowCount, 0);
    
    // 全体の重要度を判定
    const criticalCount = results.filter(r => r.severity === 'critical' || r.error).length;
    const warningCount = results.filter(r => r.severity === 'warning').length;
    
    const summary = {
      totalQueries: queries.length,
      successCount: results.filter(r => !r.error).length,
      errorCount: results.filter(r => r.error).length,
      totalRows: results.reduce((sum, r) => sum + r.rowCount, 0),
      criticalCount,
      warningCount,
      infoCount: results.filter(r => r.severity === 'info' && !r.error).length,
      integrityErrors,
      anomalyCount,
      categoryStats,
      inconsistencies: inconsistencyQuery && inconsistencyQuery.rows.length > 0 
        ? inconsistencyQuery.rows.map((row: any) => ({
            owner_id: row.owner_id,
            total: row.total,
            transcribed: row.transcribed || row.transcribed_count,
            has_ja: row.has_ja,
            not_transcribed_count: row.not_transcribed_count,
            transcribed_but_no_ja: row.transcribed_but_no_ja || row.transcribed_but_no_ja_count,
            statuses_present: row.statuses_present,
          }))
        : [],
    };
    
    return NextResponse.json({
      summary,
      results: results.map(r => ({
        queryName: r.queryName,
        category: r.category,
        severity: r.severity,
        description: r.description,
        rowCount: r.rowCount,
        error: r.error,
        executionTime: r.executionTime,
        // 大きな結果セットの場合は最初の10行のみ返す
        sampleRows: r.rows.slice(0, 10),
        hasMore: r.rows.length > 10,
      })),
    });
  } catch (error) {
    console.error('診断スクリプトの実行中にエラーが発生しました:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: '診断の実行に失敗しました', details: errorMessage },
      { status: 500 }
    );
  }
}
