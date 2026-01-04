import { Pool } from 'pg';

let pool: Pool | null = null;
let embeddingPool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // ElestioのPostgreSQLは自己署名証明書を使用するため、証明書検証を無効化
    const isElestio = connectionString.includes('elestio');
    const sslDisabled = connectionString.includes('sslmode=disable');
    
    // Elestioの場合は、sslmode=disableでない限り、常にSSL設定を適用
    // 自己署名証明書のため、rejectUnauthorized: falseを設定
    const sslConfig = (!sslDisabled && (isElestio || connectionString.includes('sslmode=require') || connectionString.includes('sslmode=prefer')))
      ? { rejectUnauthorized: false }
      : undefined;
    
    pool = new Pool({
      connectionString,
      ssl: sslConfig,
      max: 20, // 最大接続数
      idleTimeoutMillis: 30000, // アイドル接続のタイムアウト（30秒）
      connectionTimeoutMillis: 10000, // 接続タイムアウト（10秒に延長）
      statement_timeout: 30000, // クエリタイムアウト（30秒）
    });

    // 接続エラーのハンドリング
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  return pool;
}

// クエリ実行ヘルパー（リトライロジック付き）
export async function query<T = any>(
  text: string,
  params?: any[],
  retries = 2
): Promise<{ rows: T[]; rowCount: number }> {
  const pool = getPool();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await pool.query(text, params);
      return { rows: result.rows, rowCount: result.rowCount || 0 };
    } catch (error: any) {
      lastError = error;
      
      // 接続エラーの場合のみリトライ
      if (
        attempt < retries &&
        (error.code === 'ECONNRESET' ||
         error.code === 'ETIMEDOUT' ||
         error.message?.includes('Connection terminated') ||
         error.message?.includes('connection timeout'))
      ) {
        console.warn(`Database query retry ${attempt + 1}/${retries}:`, error.message);
        // 指数バックオフでリトライ
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        continue;
      }
      
      console.error('Database query error:', error);
      throw error;
    }
  }

  throw lastError || new Error('Database query failed');
}

// Embedding用のプール管理
export function getEmbeddingPool(): Pool {
  if (!embeddingPool) {
    const connectionString = process.env.NEON_EMBEDDING_DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('NEON_EMBEDDING_DATABASE_URL environment variable is not set');
    }

    // Neon DBはSSL接続が必要
    const sslConfig = connectionString.includes('sslmode=require') || connectionString.includes('sslmode=prefer')
      ? { rejectUnauthorized: false }
      : undefined;
    
    embeddingPool = new Pool({
      connectionString,
      ssl: sslConfig,
    });

    // 接続エラーのハンドリング
    embeddingPool.on('error', (err) => {
      console.error('Unexpected error on idle embedding client', err);
    });
  }

  return embeddingPool;
}

// Embedding DBへのクエリ実行ヘルパー
export async function queryEmbedding<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number }> {
  const client = getEmbeddingPool();
  try {
    const result = await client.query(text, params);
    return { rows: result.rows, rowCount: result.rowCount || 0 };
  } catch (error) {
    console.error('Embedding database query error:', error);
    throw error;
  }
}
