import * as fs from 'fs';
import * as path from 'path';

interface SchemaExport {
  timestamp: string;
  database_url: string;
  extensions: any[];
  tables: any[];
  columns: any[];
  primary_keys: any[];
  foreign_keys: any[];
  unique_constraints: any[];
  check_constraints: any[];
  indexes: any[];
  index_details: any[];
  views: any[];
  materialized_views: any[];
  materialized_view_definitions: any[];
  functions: any[];
  function_definitions: any[];
  triggers: any[];
  sequences: any[];
  sequence_list: any[];
}

function escapeMarkdown(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

function formatDataType(column: any): string {
  let type = column.data_type || column.udt_name || '';
  
  if (column.character_maximum_length) {
    type += `(${column.character_maximum_length})`;
  } else if (column.numeric_precision) {
    type += `(${column.numeric_precision}`;
    if (column.numeric_scale) {
      type += `,${column.numeric_scale}`;
    }
    type += ')';
  }
  
  return type;
}

function generateMarkdown(data: SchemaExport): string {
  const lines: string[] = [];
  
  // ヘッダー
  lines.push('# データベース構造ドキュメント');
  lines.push('');
  lines.push(`**取得日時:** ${new Date(data.timestamp).toLocaleString('ja-JP')}`);
  lines.push(`**データベース:** ${data.database_url}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // 目次
  lines.push('## 目次');
  lines.push('');
  lines.push('- [拡張機能](#拡張機能)');
  lines.push('- [テーブル一覧](#テーブル一覧)');
  lines.push('- [テーブル構造](#テーブル構造)');
  lines.push('- [制約](#制約)');
  lines.push('- [インデックス](#インデックス)');
  lines.push('- [ビュー](#ビュー)');
  lines.push('- [マテリアライズドビュー](#マテリアライズドビュー)');
  lines.push('- [関数とプロシージャ](#関数とプロシージャ)');
  lines.push('- [トリガー](#トリガー)');
  lines.push('- [シーケンス](#シーケンス)');
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // 拡張機能
  lines.push('## 拡張機能');
  lines.push('');
  if (data.extensions.length > 0) {
    lines.push('| 拡張機能名 | バージョン |');
    lines.push('|-----------|----------|');
    for (const ext of data.extensions) {
      lines.push(`| ${escapeMarkdown(ext.extension_name)} | ${escapeMarkdown(ext.version)} |`);
    }
  } else {
    lines.push('拡張機能は見つかりませんでした。');
  }
  lines.push('');
  
  // テーブル一覧
  lines.push('## テーブル一覧');
  lines.push('');
  if (data.tables.length > 0) {
    lines.push('| テーブル名 | オーナー |');
    lines.push('|-----------|---------|');
    for (const table of data.tables) {
      lines.push(`| ${escapeMarkdown(table.tablename)} | ${escapeMarkdown(table.tableowner)} |`);
    }
  } else {
    lines.push('テーブルは見つかりませんでした。');
  }
  lines.push('');
  
  // テーブル構造
  lines.push('## テーブル構造');
  lines.push('');
  
  const tablesByName = new Map<string, any[]>();
  for (const column of data.columns) {
    const tableName = column.table_name;
    if (!tablesByName.has(tableName)) {
      tablesByName.set(tableName, []);
    }
    tablesByName.get(tableName)!.push(column);
  }
  
  for (const [tableName, columns] of Array.from(tablesByName.entries()).sort()) {
    lines.push(`### ${escapeMarkdown(tableName)}`);
    lines.push('');
    lines.push('| カラム名 | データ型 | NULL許可 | デフォルト値 |');
    lines.push('|---------|---------|---------|------------|');
    
    for (const col of columns.sort((a, b) => a.ordinal_position - b.ordinal_position)) {
      const dataType = formatDataType(col);
      const nullable = col.is_nullable === 'YES' ? 'YES' : 'NO';
      const defaultValue = col.column_default ? escapeMarkdown(col.column_default) : '';
      lines.push(`| ${escapeMarkdown(col.column_name)} | ${dataType} | ${nullable} | ${defaultValue} |`);
    }
    lines.push('');
    
    // 主キー
    const pk = data.primary_keys.filter(p => p.table_name === tableName);
    if (pk.length > 0) {
      lines.push('**主キー:**');
      const pkColumns = pk
        .sort((a, b) => a.ordinal_position - b.ordinal_position)
        .map(p => p.column_name)
        .join(', ');
      lines.push(`- ${pkColumns}`);
      lines.push('');
    }
    
    // 外部キー
    const fk = data.foreign_keys.filter(f => f.table_name === tableName);
    if (fk.length > 0) {
      lines.push('**外部キー:**');
      const fkByConstraint = new Map<string, any[]>();
      for (const f of fk) {
        if (!fkByConstraint.has(f.constraint_name)) {
          fkByConstraint.set(f.constraint_name, []);
        }
        fkByConstraint.get(f.constraint_name)!.push(f);
      }
      for (const [constraintName, fks] of fkByConstraint.entries()) {
        const fkCols = fks.map(f => f.column_name).join(', ');
        const refTable = fks[0].foreign_table_name;
        const refCols = fks.map(f => f.foreign_column_name).join(', ');
        const onDelete = fks[0].delete_rule;
        const onUpdate = fks[0].update_rule;
        lines.push(`- ${fkCols} → ${refTable}(${refCols}) [ON DELETE ${onDelete}, ON UPDATE ${onUpdate}]`);
      }
      lines.push('');
    }
    
    // ユニーク制約
    const unique = data.unique_constraints.filter(u => u.table_name === tableName);
    if (unique.length > 0) {
      lines.push('**ユニーク制約:**');
      const uniqueByConstraint = new Map<string, any[]>();
      for (const u of unique) {
        if (!uniqueByConstraint.has(u.constraint_name)) {
          uniqueByConstraint.set(u.constraint_name, []);
        }
        uniqueByConstraint.get(u.constraint_name)!.push(u);
      }
      for (const [constraintName, uniques] of uniqueByConstraint.entries()) {
        const uniqueCols = uniques
          .sort((a, b) => a.ordinal_position - b.ordinal_position)
          .map(u => u.column_name)
          .join(', ');
        lines.push(`- ${constraintName}: (${uniqueCols})`);
      }
      lines.push('');
    }
    
    // チェック制約
    const checks = data.check_constraints.filter(c => c.table_name === tableName);
    if (checks.length > 0) {
      lines.push('**チェック制約:**');
      for (const check of checks) {
        lines.push(`- ${check.constraint_name}: ${escapeMarkdown(check.check_clause)}`);
      }
      lines.push('');
    }
  }
  
  // 制約セクション（全体の概要）
  lines.push('---');
  lines.push('');
  lines.push('## 制約');
  lines.push('');
  
  // 外部キー一覧
  if (data.foreign_keys.length > 0) {
    lines.push('### 外部キー一覧');
    lines.push('');
    lines.push('| テーブル | 制約名 | カラム | 参照先テーブル | 参照先カラム | ON DELETE | ON UPDATE |');
    lines.push('|---------|--------|--------|--------------|------------|----------|----------|');
    const fkByConstraint = new Map<string, any[]>();
    for (const fk of data.foreign_keys) {
      if (!fkByConstraint.has(fk.constraint_name)) {
        fkByConstraint.set(fk.constraint_name, []);
      }
      fkByConstraint.get(fk.constraint_name)!.push(fk);
    }
    for (const [constraintName, fks] of fkByConstraint.entries()) {
      const fk = fks[0];
      const columns = fks.map(f => f.column_name).join(', ');
      const refColumns = fks.map(f => f.foreign_column_name).join(', ');
      lines.push(`| ${escapeMarkdown(fk.table_name)} | ${escapeMarkdown(constraintName)} | ${columns} | ${escapeMarkdown(fk.foreign_table_name)} | ${refColumns} | ${fk.delete_rule} | ${fk.update_rule} |`);
    }
    lines.push('');
  }
  
  // インデックス
  lines.push('---');
  lines.push('');
  lines.push('## インデックス');
  lines.push('');
  
  const indexesByTable = new Map<string, any[]>();
  for (const idx of data.indexes) {
    if (!indexesByTable.has(idx.tablename)) {
      indexesByTable.set(idx.tablename, []);
    }
    indexesByTable.get(idx.tablename)!.push(idx);
  }
  
  for (const [tableName, indexes] of Array.from(indexesByTable.entries()).sort()) {
    lines.push(`### ${escapeMarkdown(tableName)}`);
    lines.push('');
    for (const idx of indexes) {
      lines.push(`**${escapeMarkdown(idx.indexname)}**`);
      lines.push('');
      lines.push('```sql');
      lines.push(escapeMarkdown(idx.indexdef));
      lines.push('```');
      lines.push('');
    }
  }
  
  // ビュー
  lines.push('---');
  lines.push('');
  lines.push('## ビュー');
  lines.push('');
  
  if (data.views.length > 0) {
    for (const view of data.views) {
      lines.push(`### ${escapeMarkdown(view.table_name)}`);
      lines.push('');
      lines.push('```sql');
      lines.push(view.view_definition);
      lines.push('```');
      lines.push('');
    }
  } else {
    lines.push('ビューは見つかりませんでした。');
    lines.push('');
  }
  
  // マテリアライズドビュー
  lines.push('---');
  lines.push('');
  lines.push('## マテリアライズドビュー');
  lines.push('');
  
  if (data.materialized_views.length > 0) {
    for (const mv of data.materialized_views) {
      lines.push(`### ${escapeMarkdown(mv.matviewname)}`);
      lines.push('');
      lines.push(`- インデックス有無: ${mv.hasindexes ? 'あり' : 'なし'}`);
      lines.push(`- データ投入済み: ${mv.ispopulated ? 'はい' : 'いいえ'}`);
      lines.push('');
      
      const mvDef = data.materialized_view_definitions.find(
        d => d.view_name === mv.matviewname
      );
      if (mvDef) {
        lines.push('**定義:**');
        lines.push('');
        lines.push('```sql');
        lines.push(mvDef.view_definition);
        lines.push('```');
        lines.push('');
      }
    }
  } else {
    lines.push('マテリアライズドビューは見つかりませんでした。');
    lines.push('');
  }
  
  // 関数とプロシージャ
  lines.push('---');
  lines.push('');
  lines.push('## 関数とプロシージャ');
  lines.push('');
  
  if (data.functions.length > 0) {
    for (const func of data.functions) {
      lines.push(`### ${escapeMarkdown(func.function_name)}`);
      lines.push('');
      lines.push(`- 種類: ${func.kind_description}`);
      lines.push(`- 引数: ${escapeMarkdown(func.arguments)}`);
      lines.push(`- 戻り値型: ${escapeMarkdown(func.return_type)}`);
      lines.push('');
      
      const funcDef = data.function_definitions.find(
        d => d.function_name === func.function_name
      );
      if (funcDef) {
        lines.push('**定義:**');
        lines.push('');
        lines.push('```sql');
        lines.push(funcDef.function_definition);
        lines.push('```');
        lines.push('');
      }
    }
  } else {
    lines.push('関数とプロシージャは見つかりませんでした。');
    lines.push('');
  }
  
  // トリガー
  lines.push('---');
  lines.push('');
  lines.push('## トリガー');
  lines.push('');
  
  if (data.triggers.length > 0) {
    lines.push('| テーブル | トリガー名 | イベント | タイミング | 向き |');
    lines.push('|---------|-----------|---------|----------|------|');
    for (const trigger of data.triggers) {
      lines.push(`| ${escapeMarkdown(trigger.event_object_table)} | ${escapeMarkdown(trigger.trigger_name)} | ${escapeMarkdown(trigger.event_manipulation)} | ${escapeMarkdown(trigger.action_timing)} | ${escapeMarkdown(trigger.action_orientation)} |`);
    }
    lines.push('');
    
    lines.push('**トリガー定義:**');
    lines.push('');
    for (const trigger of data.triggers) {
      lines.push(`### ${escapeMarkdown(trigger.trigger_name)}`);
      lines.push('');
      lines.push('```sql');
      lines.push(escapeMarkdown(trigger.action_statement));
      lines.push('```');
      lines.push('');
    }
  } else {
    lines.push('トリガーは見つかりませんでした。');
    lines.push('');
  }
  
  // シーケンス
  lines.push('---');
  lines.push('');
  lines.push('## シーケンス');
  lines.push('');
  
  if (data.sequences.length > 0) {
    lines.push('| シーケンス名 | データ型 | 開始値 | 最小値 | 最大値 | 増分 | サイクル |');
    lines.push('|------------|---------|--------|--------|--------|------|---------|');
    for (const seq of data.sequences) {
      lines.push(`| ${escapeMarkdown(seq.sequence_name)} | ${escapeMarkdown(seq.data_type)} | ${escapeMarkdown(seq.start_value)} | ${escapeMarkdown(seq.minimum_value)} | ${escapeMarkdown(seq.maximum_value)} | ${escapeMarkdown(seq.increment)} | ${escapeMarkdown(seq.cycle_option)} |`);
    }
  } else {
    lines.push('シーケンスは見つかりませんでした。');
  }
  lines.push('');
  
  // フッター
  lines.push('---');
  lines.push('');
  lines.push(`*このドキュメントは ${new Date(data.timestamp).toLocaleString('ja-JP')} に自動生成されました。*`);
  
  return lines.join('\n');
}

// メイン処理
const inputFile = path.join(__dirname, '..', 'docs', 'db_schema_export.json');
const outputFile = path.join(__dirname, '..', 'docs', 'db_schema_2026-01-03.md');

try {
  console.log('JSONファイルを読み込み中...');
  const jsonData = fs.readFileSync(inputFile, 'utf-8');
  const data: SchemaExport = JSON.parse(jsonData);
  
  console.log('Markdownドキュメントを生成中...');
  const markdown = generateMarkdown(data);
  
  console.log('ファイルに書き込み中...');
  fs.writeFileSync(outputFile, markdown, 'utf-8');
  
  console.log(`\nドキュメントが生成されました: ${outputFile}`);
} catch (error: any) {
  console.error('エラーが発生しました:', error.message);
  process.exit(1);
}
