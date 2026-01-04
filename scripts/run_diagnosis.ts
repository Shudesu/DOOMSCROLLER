import { readFileSync } from 'fs';
import { join } from 'path';
// @ts-ignore - 相対パスでインポート
import { query } from '../lib/db.js';

interface QueryResult {
  queryName: string;
  rows: any[];
  error?: string;
}

// SQLファイルを読み込んでクエリを分割
function parseSQLFile(filePath: string): Array<{ name: string; sql: string }> {
  const content = readFileSync(filePath, 'utf-8');
  const queries: Array<{ name: string; sql: string }> = [];
  
  // セミコロンでクエリを分割
  const sqlBlocks = content.split(';').filter(block => block.trim());
  
  for (const block of sqlBlocks) {
    const lines = block.split('\n');
    let queryName = '';
    let sqlLines: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
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
      queries.push({ name: queryName, sql });
    }
  }
  
  return queries;
}

// 結果を整形表示
function displayResult(queryName: string, rows: any[], error?: string) {
  console.log('\n' + '='.repeat(80));
  console.log(`📊 ${queryName}`);
  console.log('='.repeat(80));
  
  if (error) {
    console.error(`❌ エラー: ${error}`);
    return;
  }
  
  if (rows.length === 0) {
    console.log('⚠️  結果なし');
    return;
  }
  
  // カラム名を取得
  const columns = Object.keys(rows[0]);
  
  // ヘッダーを表示
  const header = columns.join(' | ');
  console.log(header);
  console.log('-'.repeat(header.length));
  
  // データを表示（最大50行）
  const maxRows = 50;
  rows.slice(0, maxRows).forEach((row) => {
    const values = columns.map(col => {
      const value = row[col];
      if (value === null || value === undefined) {
        return 'NULL';
      }
      if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      const str = String(value);
      // 長すぎる文字列は切り詰め
      return str.length > 50 ? str.substring(0, 47) + '...' : str;
    });
    console.log(values.join(' | '));
  });
  
  if (rows.length > maxRows) {
    console.log(`\n... 他 ${rows.length - maxRows} 行`);
  }
  
  console.log(`\n合計: ${rows.length} 行`);
}

async function main() {
  try {
    // スクリプトのディレクトリを取得
    const scriptDir = process.cwd();
    const sqlFilePath = join(scriptDir, 'scripts', 'diagnose_db.sql');
    const queries = parseSQLFile(sqlFilePath);
    
    console.log('🔍 データベース診断を開始します...\n');
    console.log(`📝 ${queries.length} 個のクエリを実行します\n`);
    
    const results: QueryResult[] = [];
    
    for (const { name, sql } of queries) {
      try {
        const result = await query(sql);
        results.push({
          queryName: name,
          rows: result.rows,
        });
        displayResult(name, result.rows);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          queryName: name,
          rows: [],
          error: errorMessage,
        });
        displayResult(name, [], errorMessage);
      }
    }
    
    // サマリー
    console.log('\n' + '='.repeat(80));
    console.log('📋 診断サマリー');
    console.log('='.repeat(80));
    
    const successCount = results.filter(r => !r.error).length;
    const errorCount = results.filter(r => r.error).length;
    const totalRows = results.reduce((sum, r) => sum + r.rows.length, 0);
    
    console.log(`✅ 成功: ${successCount} クエリ`);
    console.log(`❌ エラー: ${errorCount} クエリ`);
    console.log(`📊 合計行数: ${totalRows} 行`);
    
    // 不整合があるowner_idを特定
    const inconsistencyQuery = results.find(r => 
      r.queryName.includes('不整合') || r.queryName.includes('集計')
    );
    
    if (inconsistencyQuery && inconsistencyQuery.rows.length > 0) {
      console.log('\n⚠️  不整合が検出されました:');
      inconsistencyQuery.rows.forEach((row: any) => {
        if (row.owner_id) {
          console.log(`  - Owner ID: ${row.owner_id}`);
          if (row.not_transcribed_count) {
            console.log(`    未transcribed: ${row.not_transcribed_count} 件`);
          }
          if (row.transcribed_but_no_ja_count) {
            console.log(`    transcribedだが日本語訳なし: ${row.transcribed_but_no_ja_count} 件`);
          }
        }
      });
    }
    
  } catch (error) {
    console.error('❌ 診断スクリプトの実行中にエラーが発生しました:');
    console.error(error);
    process.exit(1);
  }
}

main();
