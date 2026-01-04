# データベース構造調査ガイド

このディレクトリには、Neon DB（embedding用）とn8nPGのテーブル構造を調査するためのSQLクエリが含まれています。

## ファイル

- `investigate_db_structure.sql` - 調査用SQLクエリ集

## 実行方法

### Neon DB（embedding用）での実行

```bash
psql 'postgresql://neondb_owner:npg_3BGPxLRavZ5z@ep-withered-fire-a1wfz8ob-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' -f scripts/investigate_db_structure.sql
```

または、対話的に実行する場合:

```bash
psql 'postgresql://neondb_owner:npg_3BGPxLRavZ5z@ep-withered-fire-a1wfz8ob-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
```

接続後、SQLファイルのPART 1セクションのクエリを実行してください。

### n8nPGでの実行

`.env.local`の`DATABASE_URL`を使用して接続:

```bash
# .env.localからDATABASE_URLを読み込んで実行
psql $DATABASE_URL -f scripts/investigate_db_structure.sql
```

または、対話的に実行する場合:

```bash
# .env.localからDATABASE_URLを読み込む
source .env.local
psql $DATABASE_URL
```

接続後、SQLファイルのPART 2セクションのクエリを実行してください。

## 調査内容

### PART 1: Neon DB（embedding用）

1. **テーブル一覧取得** (1.1)
   - データベース内の全テーブルを確認

2. **embedding関連テーブルの検索** (1.2)
   - embedding、reel、post、centroidを含むテーブルを検索

3. **owner_embedding_centroidテーブルの構造確認** (1.3)
   - 既知のテーブルのカラム構造を確認

4. **投稿単位embeddingテーブルの構造確認** (1.4)
   - 複数の候補テーブル名をチェック
   - `reel_embedding`, `ig_post_embedding`, `post_embedding`, `ig_reel_embedding`

5. **サンプルデータ確認** (1.5-1.8)
   - embeddingの型と次元数を確認
   - データ件数を確認

6. **インデックス確認** (1.9)
   - embedding関連テーブルのインデックスを確認

### PART 2: n8nPG

1. **owner_statsテーブルの構造確認** (2.1-2.4)
   - 完全なカラム構造
   - サンプルデータ
   - インデックス情報

2. **ig_post_metricsテーブルの構造確認** (2.5)
   - 投稿メトリクス情報の構造

3. **ig_jobsテーブルの構造確認** (2.6)
   - 台本情報の構造

4. **JOIN確認** (2.7)
   - ig_post_metricsとig_jobsのJOIN例

5. **ANY配列クエリのテスト** (2.8-2.9)
   - 実装で使用する一括取得クエリの動作確認

### PART 3: 実装に必要な情報の確認

1. **owner類似検索クエリの動作確認** (3.1)
   - 実際のowner_idで動作確認

2. **投稿類似検索クエリの動作確認** (3.2)
   - 実際のig_codeで動作確認（テーブル名を実際の名前に置き換えて実行）

## 重要な注意事項

1. **投稿単位のembeddingテーブル名が不明**
   - 1.2のクエリでテーブル一覧を確認し、実際のテーブル名を特定してください
   - 1.4のクエリで候補テーブルの構造を確認してください
   - テーブル名が判明したら、1.7, 1.8, 3.2のクエリでテーブル名を置き換えて実行してください

2. **実際のデータでの動作確認**
   - 3.1, 3.2のクエリは実際のowner_idやig_codeに置き換えて動作確認してください

3. **接続情報の管理**
   - Neon DBの接続情報は環境変数`NEON_EMBEDDING_DATABASE_URL`に設定されています
   - n8nPGの接続情報は環境変数`DATABASE_URL`に設定されています

## 次のステップ

調査結果を基に、以下の実装を進めてください:

1. 投稿単位のembeddingテーブル名を特定
2. `/api/reels/[ig_code]/similar` APIの実装
3. `/api/owners/[owner_id]/similar` APIの拡張
4. UIコンポーネントの実装
