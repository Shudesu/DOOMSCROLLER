# DOOMSCROLLER - Project Instructions

## Overview
Instagram Reelsの台本（トランスクリプト）を管理・分析するWebアプリ。セマンティック検索、ランキング、類似投稿検索などの機能を提供。

## Tech Stack
- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript 5
- **Styling**: Tailwind CSS 3.4（カスタムテーマ設定なし、デフォルト）
- **Data Fetching**: TanStack React Query 5
- **Database**: PostgreSQL (pg 8.11)
  - Elestio DB (`DATABASE_URL`) - メインデータ（ig_jobs, ig_accounts等）
  - Neon DB (`NEON_EMBEDDING_DATABASE_URL`) - Embedding用（pgvector）
- **AI**: OpenAI API (`text-embedding-3-small`) - セマンティック検索用

## Directory Structure
```
app/
├── api/              # API Routes (diagnose, favorites, new, owners, ranking, reels, search)
├── owners/           # アカウント一覧・詳細・アナリティクス
├── ranking/          # ランキング表示
├── search/           # セマンティック検索
├── group-ranking/    # グループ別ランキング
├── favorites/        # お気に入り管理
├── new/              # 新着投稿
├── diagnose/         # 診断機能
├── layout.tsx        # ルートレイアウト（Sidebar + main）
├── providers.tsx     # React Query + Toast Provider
└── globals.css       # Tailwind imports only
components/
├── Sidebar.tsx       # 固定サイドバー（w-44）
├── ReelDetailModal.tsx # Reel詳細モーダル（最大のコンポーネント ~990行）
├── LoadingSpinner.tsx
├── ToastProvider.tsx
├── DecisionBadge.tsx
└── VideoMiniPlayer.tsx
lib/
├── db.ts             # DB接続管理（2つのPool + retry logic）
└── user.ts           # ユーザー管理
migrations/           # DBマイグレーションSQL
scripts/              # 診断・調査スクリプト
docs/                 # スキーマドキュメント
```

## Development Commands
```bash
npm run dev    # 開発サーバー起動（localhost:3000）
npm run build  # プロダクションビルド
npm run start  # プロダクションサーバー起動
npm run lint   # ESLint実行
```

## Environment Variables
- `DATABASE_URL` - Elestio PostgreSQL接続文字列
- `NEON_EMBEDDING_DATABASE_URL` - Neon DB接続文字列（pgvector）
- `OPENAI_API_KEY` - OpenAI API キー
- `USER_ID` - お気に入り機能用ユーザーID（デフォルト: 'default'）

## Coding Conventions

### Patterns to Follow
- **Pages**: `'use client'` + React Query（useQuery/useMutation）でデータ取得
- **API Routes**: Next.js Route Handlers（app/api/）、`lib/db.ts`のquery/queryEmbedding使用
- **State Management**: URLパラメータ（useSearchParams）でソート・ページング状態管理
- **Styling**: Tailwind CSS直接記述。共通パターン:
  - カード: `bg-white rounded-2xl border border-gray-200/60 shadow-sm`
  - ボタン: `rounded-xl shadow-sm transition-all duration-200`
  - ホバー: `hover:bg-gray-50/80`
- **数値表示**: 万・千単位の日本語フォーマット
- **言語**: UIは日本語、コード・変数名は英語

### Deployment
- **Vercel**: https://doomscroller-beige.vercel.app
- **GitHub**: https://github.com/Shudesu/DOOMSCROLLER (private)
- 環境変数: DATABASE_URL, NEON_EMBEDDING_DATABASE_URL, OPENAI_API_KEY, USER_ID
- pushすると自動デプロイ

### Known Issues (UI/UX)
- ReelDetailModalが巨大（分割候補）
- 認証機能なし（パブリック）

## Database Tables (Main)
- `ig_jobs` - 台本データ（ig_code PK, transcript_text, transcript_ja）
- `ig_accounts` - アカウント情報
- `ig_post_metrics` - 投稿メトリクス
- `favorites` - お気に入り
- `ig_reviews` - 審査決定（keep/skip/later）

## Database Tables (Embedding - Neon)
- `script_vectors` - Embeddingベクトル（chunk単位）
- `owner_embedding_centroid` - アカウント別centroid
- `query_embeddings` - クエリキャッシュ
- `ig_embed_state` - Embedding処理状態
