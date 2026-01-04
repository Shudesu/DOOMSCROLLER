# データベース不整合診断レポート

## 診断の実行方法

### 方法1: Web UIから実行（推奨）
1. 開発サーバーを起動: `npm run dev`
2. ブラウザで `http://localhost:3000/diagnose` にアクセス
3. ページが自動的に診断を実行し、結果を表示します

### 方法2: APIエンドポイントから直接実行
```bash
curl http://localhost:3000/api/diagnose | jq
```

### 方法3: ターミナルから直接SQLを実行
```bash
# PostgreSQLに接続
psql $DATABASE_URL

# または、scripts/diagnose_db.sqlの各クエリを個別に実行
```

## 診断クエリの説明

### 1. ig_jobsテーブルのスキーマ確認
- テーブルの構造、カラムの型、制約を確認
- 期待されるカラム: `owner_id`, `ig_code`, `status`, `transcript_text`, `transcript_ja`, `transcribed_at`, `updated_at`

### 2. 各owner_idごとのstatus値の分布
- 各owner_idでどのようなstatus値が存在するかを確認
- 期待される状態: 全てのレコードが`status = 'transcribed'`であるべき

### 3. transcribed状態でないレコードの詳細
- **重要**: このクエリで問題のあるレコードを特定
- `status != 'transcribed'`のレコードを表示
- これらのレコードが不整合の原因

### 4. 各owner_idごとの集計（不整合があるowner_idのみ）
- 現在のAPIと同じロジックで集計
- `transcribed < total`となっているowner_idを特定
- 不整合の規模を把握

### 5. transcript_jaがNULLまたは空のtranscribedレコード
- `status = 'transcribed'`だが日本語訳がないレコード
- これらは`has_ja < transcribed`の原因

### 6. 最近更新されたレコードの状態
- 過去7日間に更新されたレコードを確認
- UPDATE文の影響範囲を把握

### 7. 各owner_idの不整合サマリー
- 不整合があるowner_idの一覧
- 各owner_idの詳細な不整合情報

## 不整合の原因分析

### 考えられる原因

1. **UPDATE文の条件が不十分**
   - WHERE句が正しく適用されなかった
   - トランザクションがコミットされなかった
   - 一部のレコードが更新対象から漏れた

2. **status値の不整合**
   - `status`カラムに`'transcribed'`以外の値が残っている
   - 例: `'pending'`, `'processing'`, `'failed'`, `NULL`など

3. **transcript_jaの欠落**
   - `status = 'transcribed'`だが`transcript_ja`がNULLまたは空
   - 翻訳処理が完了していない

4. **データの削除や追加**
   - 診断実行後に新しいレコードが追加された
   - レコードが削除された

## 修正方法

### ステップ1: 問題のあるレコードを特定
診断結果の「3. transcribed状態でないレコードの詳細」を確認し、どのレコードが問題かを特定します。

### ステップ2: statusを修正
```sql
-- 全てのレコードをtranscribed状態にする
UPDATE public.ig_jobs
SET status = 'transcribed'
WHERE owner_id IS NOT NULL 
  AND owner_id <> ''
  AND status != 'transcribed';
```

### ステップ3: transcript_jaを確認
```sql
-- transcript_jaがNULLまたは空のレコードを確認
SELECT owner_id, ig_code, status, transcript_ja
FROM public.ig_jobs
WHERE status = 'transcribed'
  AND (transcript_ja IS NULL OR transcript_ja = '');
```

### ステップ4: 再診断
診断を再実行して、不整合が解消されたか確認します。

## 予防策

1. **n8nからの更新処理を確認**
   - UPDATE文のWHERE句が正しいか
   - トランザクションが正しくコミットされているか
   - エラーハンドリングが適切か

2. **定期的な診断の実行**
   - 週次または日次で診断を実行
   - 不整合を早期に発見

3. **データ整合性チェック**
   - アプリケーション側で整合性チェックを実装
   - 不整合が検出されたらアラートを送信

## 注意事項

- 診断クエリは読み取り専用です（SELECT文のみ）
- データを変更する場合は、必ずバックアップを取ってから実行してください
- n8nからの更新処理を変更する場合は、テスト環境で十分に検証してから本番環境に適用してください
