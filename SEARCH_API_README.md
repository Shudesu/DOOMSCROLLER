# 検索API実装ドキュメント

## 概要

日本語クエリでNeon DBの英語チャンクembeddingを類似検索するAPIを実装しました。

## 実装ファイル

### 1. API Route Handler
- **ファイル**: `app/api/search/route.ts`
- **エンドポイント**: `GET /api/search?q=...&k=20`
- **機能**:
  - クエリバリデーション（空/短すぎる場合は400）
  - query_type推定（theme|claim|phrasing|structure）
  - クエリ正規化（trim、改行→スペース、連続スペース→1つ、NFKC）
  - query_embeddingsテーブルからキャッシュ確認
  - キャッシュがない場合はOpenAI APIでembedding生成
  - script_vectorsとig_embed_stateをJOINしてcosine距離で検索
  - レスポンスJSONを返す

### 2. データベーススキーマ
- **ファイル**: `migrations/004_create_query_embeddings.sql`
- **テーブル**: `query_embeddings`
  - `query_norm` (text, PK)
  - `model` (text, PK)
  - `embedding` (vector(1536))
  - `hits` (int, default 0)
  - `created_at` (timestamptz)
  - `last_used_at` (timestamptz)
- **インデックス**: HNSWインデックス（vector検索用）

### 3. フロントエンドUI
- **ファイル**: `app/search/page.tsx`
- **機能**:
  - 検索タイプ選択（IG Code / Owner ID / セマンティック）
  - 検索ボックス（debounce 400ms）
  - 検索結果表示（ig_code、owner_id、score、text）
  - query_type表示

## 環境変数

以下の環境変数を設定する必要があります：

```bash
# OpenAI APIキー（必須）
OPENAI_API_KEY=sk-proj-...

# Embeddingモデル名（オプション、デフォルト: text-embedding-3-small）
EMBEDDING_MODEL=text-embedding-3-small

# Neon DB接続文字列（既存）
NEON_EMBEDDING_DATABASE_URL=postgresql://...
```

## セットアップ手順

1. **依存関係のインストール**
   ```bash
   npm install
   ```

2. **データベースマイグレーションの実行**
   ```bash
   # Neon DBに接続して実行
   psql $NEON_EMBEDDING_DATABASE_URL -f migrations/004_create_query_embeddings.sql
   ```

3. **環境変数の設定**
   `.env.local`ファイルに上記の環境変数を設定

4. **開発サーバーの起動**
   ```bash
   npm run dev
   ```

## API仕様

### リクエスト
```
GET /api/search?q=<クエリ>&k=<結果数>
```

- `q`: 検索クエリ（日本語、必須、最低2文字）
- `k`: 返す結果数（オプション、デフォルト: 20）

### レスポンス
```json
{
  "query_raw": "成功の秘訣",
  "query_norm": "成功の秘訣",
  "query_type": "theme",
  "k": 20,
  "results": [
    {
      "ig_code": "Cxxxxx",
      "owner_id": "owner123",
      "score": 0.1234,
      "text": "The key to success is..."
    }
  ]
}
```

- `query_raw`: 元のクエリ
- `query_norm`: 正規化されたクエリ
- `query_type`: 推定されたクエリタイプ（theme|claim|phrasing|structure）
- `k`: 返された結果数
- `results`: 検索結果の配列
  - `ig_code`: 投稿コード
  - `owner_id`: オーナーID（nullの可能性あり）
  - `score`: 距離（小さいほど近い、cosine距離）
  - `text`: トランスクリプトテキスト

## query_type推定ルール

- **structure**: 「構成」「導入」「まとめ」「章」「スライド」「流れ」「テンプレ」を含む
- **phrasing**: 「言い回し」「表現」「セリフ」「トーン」「語尾」「コピー」「タイトル案」を含む
- **claim**: 「主張」「結論」「言いたいこと」「ポイント」「何が言える」を含む
- **theme**: 上記以外（デフォルト）

## 実装上の注意点

1. **SQLパラメタバインド**: すべてのSQLクエリでパラメタバインドを使用してSQLインジェクションを防止
2. **APIキーの管理**: OpenAI APIキーはサーバー側のみで使用し、クライアントに露出しない
3. **キャッシュ更新**: クエリキャッシュの`hits`と`last_used_at`を自動更新
4. **エラーハンドリング**: 適切なエラーメッセージとHTTPステータスコードを返す
5. **vector型の扱い**: PostgreSQLのpgvector拡張を使用し、文字列形式でvector型を扱う
6. **debounce**: フロントエンドのセマンティック検索は400msのdebounceを実装
7. **距離の意味**: `score`は距離（小さいほど近い）を表す。cosine距離を使用

## パフォーマンス

- クエリキャッシュにより、同じクエリの2回目以降は高速化
- HNSWインデックスにより、vector検索が高速化
- debounceにより、不要なAPI呼び出しを削減

## トラブルシューティング

### エラー: "OPENAI_API_KEY environment variable is not set"
- `.env.local`に`OPENAI_API_KEY`を設定してください

### エラー: "NEON_EMBEDDING_DATABASE_URL environment variable is not set"
- `.env.local`に`NEON_EMBEDDING_DATABASE_URL`を設定してください

### エラー: "relation 'query_embeddings' does not exist"
- マイグレーションファイルを実行してください

### 検索結果が返らない
- `script_vectors`テーブルにデータが存在するか確認
- `embedding`カラムがNULLでないことを確認
