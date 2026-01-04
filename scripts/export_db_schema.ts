import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// .env.localを読み込む
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  }
}

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

async function exportDatabaseSchema(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // ElestioのPostgreSQLは自己署名証明書を使用するため、証明書検証を無効化
  const isElestio = connectionString.includes('elestio');
  const sslDisabled = connectionString.includes('sslmode=disable');
  
  const sslConfig = (!sslDisabled && (isElestio || connectionString.includes('sslmode=require') || connectionString.includes('sslmode=prefer')))
    ? { rejectUnauthorized: false }
    : undefined;

  const pool = new Pool({
    connectionString,
    ssl: sslConfig,
    max: 5,
    connectionTimeoutMillis: 10000,
    statement_timeout: 60000, // 60秒
  });

  try {
    console.log('データベースに接続中...');
    
    // SQLファイルを読み込む
    const sqlFile = path.join(__dirname, 'export_db_schema.sql');
    const sqlContent = fs.readFileSync(sqlFile, 'utf-8');
    
    // SQL文を分割（セミコロンで区切る）
    // コメント行を除外し、SELECT文のみを抽出
    const queries: string[] = [];
    const lines = sqlContent.split('\n');
    let currentQuery = '';
    let inQuery = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // コメント行をスキップ
      if (trimmed.startsWith('--') || trimmed.length === 0) {
        continue;
      }
      
      // SELECT文の開始
      if (trimmed.toUpperCase().startsWith('SELECT')) {
        inQuery = true;
        currentQuery = line;
      } else if (inQuery) {
        currentQuery += '\n' + line;
        
        // セミコロンで終了
        if (trimmed.endsWith(';')) {
          queries.push(currentQuery.trim());
          currentQuery = '';
          inQuery = false;
        }
      }
    }
    
    // 最後のクエリが残っている場合
    if (currentQuery.trim()) {
      queries.push(currentQuery.trim());
    }

    const exportData: SchemaExport = {
      timestamp: new Date().toISOString(),
      database_url: connectionString.replace(/:[^:@]+@/, ':****@'), // パスワードをマスク
      extensions: [],
      tables: [],
      columns: [],
      primary_keys: [],
      foreign_keys: [],
      unique_constraints: [],
      check_constraints: [],
      indexes: [],
      index_details: [],
      views: [],
      materialized_views: [],
      materialized_view_definitions: [],
      functions: [],
      function_definitions: [],
      triggers: [],
      sequences: [],
      sequence_list: [],
    };

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      
      if (query.trim().length === 0) {
        continue;
      }

      try {
        console.log(`クエリ ${i + 1}/${queries.length} を実行中...`);
        const result = await pool.query(query);
        
        // クエリの内容に基づいて結果を分類
        const queryUpper = query.toUpperCase();
        
        if (query.includes('pg_extension') && query.includes('extname')) {
          exportData.extensions = result.rows;
        } else if (query.includes('pg_tables') && query.includes('tablename') && !query.includes('pg_matviews')) {
          exportData.tables = result.rows;
        } else if (query.includes('information_schema.columns') && query.includes('table_name')) {
          exportData.columns = result.rows;
        } else if (query.includes('PRIMARY KEY') && query.includes('table_constraints')) {
          exportData.primary_keys = result.rows;
        } else if (query.includes('FOREIGN KEY') && query.includes('foreign_table_name')) {
          exportData.foreign_keys = result.rows;
        } else if (query.includes('UNIQUE') && query.includes('table_constraints') && query.includes('constraint_type')) {
          exportData.unique_constraints = result.rows;
        } else if (query.includes('CHECK') && query.includes('check_constraints')) {
          exportData.check_constraints = result.rows;
        } else if (query.includes('pg_indexes') && query.includes('indexname')) {
          exportData.indexes = result.rows;
        } else if (query.includes('pg_index') && query.includes('pg_class') && query.includes('column_role')) {
          exportData.index_details = result.rows;
        } else if (query.includes('information_schema.views') && query.includes('view_definition') && !query.includes('pg_matviews')) {
          exportData.views = result.rows;
        } else if (query.includes('pg_matviews') && query.includes('matviewname') && !query.includes('pg_get_viewdef')) {
          exportData.materialized_views = result.rows;
        } else if (query.includes('pg_get_viewdef') && query.includes('relkind')) {
          exportData.materialized_view_definitions = result.rows;
        } else if (query.includes('pg_proc') && query.includes('proname') && !query.includes('pg_get_functiondef')) {
          exportData.functions = result.rows;
        } else if (query.includes('pg_get_functiondef')) {
          exportData.function_definitions = result.rows;
        } else if (query.includes('information_schema.triggers') && query.includes('trigger_name')) {
          exportData.triggers = result.rows;
        } else if (query.includes('information_schema.sequences') && query.includes('sequence_name') && query.includes('start_value')) {
          exportData.sequences = result.rows;
        } else if (query.includes('pg_sequences') && query.includes('sequencename')) {
          exportData.sequence_list = result.rows;
        } else {
          console.warn(`未分類のクエリ ${i + 1}:`, query.substring(0, 100));
        }
      } catch (error: any) {
        console.error(`クエリ実行エラー (${i + 1}):`, error.message);
        console.error('問題のクエリ:', query.substring(0, 200));
        // エラーが発生しても続行（一部のクエリが失敗しても他の情報は取得できる）
      }
    }

    // JSONファイルに保存
    const outputDir = path.join(__dirname, '..', 'docs');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, 'db_schema_export.json');
    fs.writeFileSync(outputFile, JSON.stringify(exportData, null, 2), 'utf-8');
    
    console.log(`\nデータベース構造のエクスポートが完了しました:`);
    console.log(`出力ファイル: ${outputFile}`);
    console.log(`\n取得した情報:`);
    console.log(`- 拡張機能: ${exportData.extensions.length}件`);
    console.log(`- テーブル: ${exportData.tables.length}件`);
    console.log(`- カラム: ${exportData.columns.length}件`);
    console.log(`- 主キー: ${exportData.primary_keys.length}件`);
    console.log(`- 外部キー: ${exportData.foreign_keys.length}件`);
    console.log(`- ユニーク制約: ${exportData.unique_constraints.length}件`);
    console.log(`- チェック制約: ${exportData.check_constraints.length}件`);
    console.log(`- インデックス: ${exportData.indexes.length}件`);
    console.log(`- ビュー: ${exportData.views.length}件`);
    console.log(`- マテリアライズドビュー: ${exportData.materialized_views.length}件`);
    console.log(`- 関数: ${exportData.functions.length}件`);
    console.log(`- トリガー: ${exportData.triggers.length}件`);
    console.log(`- シーケンス: ${exportData.sequences.length}件`);

  } catch (error) {
    console.error('エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// スクリプト実行
exportDatabaseSchema()
  .then(() => {
    console.log('\n処理が正常に完了しました。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n処理中にエラーが発生しました:', error);
    process.exit(1);
  });
