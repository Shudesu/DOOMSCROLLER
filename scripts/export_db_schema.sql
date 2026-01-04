-- ============================================
-- データベース構造エクスポート用SQL
-- ============================================
-- このスクリプトは、PostgreSQLデータベースの完全な構造を取得します
-- データベース構造は一切変更しません（SELECT文のみ使用）

-- ============================================
-- 1. 拡張機能一覧
-- ============================================
SELECT 
    extname as extension_name,
    extversion as version
FROM pg_extension
WHERE extnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
   OR extname IN ('vector', 'pg_trgm', 'btree_gin', 'btree_gist')
ORDER BY extname;

-- ============================================
-- 2. テーブル一覧
-- ============================================
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ============================================
-- 3. テーブル構造（カラム情報）
-- ============================================
SELECT 
    table_name,
    column_name,
    ordinal_position,
    data_type,
    character_maximum_length,
    numeric_precision,
    numeric_scale,
    is_nullable,
    column_default,
    udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- ============================================
-- 4. 主キー制約
-- ============================================
SELECT
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    kcu.ordinal_position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
    AND tc.constraint_type = 'PRIMARY KEY'
ORDER BY tc.table_name, kcu.ordinal_position;

-- ============================================
-- 5. 外部キー制約
-- ============================================
SELECT
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.update_rule,
    rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
    AND tc.table_schema = ccu.table_schema
JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
    AND tc.table_schema = rc.constraint_schema
WHERE tc.table_schema = 'public'
    AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;

-- ============================================
-- 6. ユニーク制約
-- ============================================
SELECT
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    kcu.ordinal_position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
    AND tc.constraint_type = 'UNIQUE'
ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;

-- ============================================
-- 7. チェック制約
-- ============================================
SELECT
    tc.table_name,
    tc.constraint_name,
    cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
    ON tc.constraint_name = cc.constraint_name
    AND tc.table_schema = cc.constraint_schema
WHERE tc.table_schema = 'public'
    AND tc.constraint_type = 'CHECK'
ORDER BY tc.table_name, tc.constraint_name;

-- ============================================
-- 8. インデックス情報
-- ============================================
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ============================================
-- 9. インデックスの詳細情報（INCLUDEカラム含む）
-- ============================================
-- 注意: このクエリは複雑なため、簡略化したバージョンを使用
SELECT
    i.relname as index_name,
    t.relname as table_name,
    a.attname as column_name,
    am.amname as index_type,
    idx.indisunique as is_unique,
    idx.indisprimary as is_primary,
    pg_get_expr(idx.indpred, idx.indrelid) as where_clause,
    CASE 
        WHEN a.attnum = ANY(idx.indkey) THEN 'KEY'
        ELSE 'INCLUDE'
    END as column_role
FROM pg_index idx
JOIN pg_class i ON i.oid = idx.indexrelid
JOIN pg_class t ON t.oid = idx.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
LEFT JOIN pg_am am ON am.oid = i.relam
LEFT JOIN pg_attribute a ON a.attrelid = t.oid 
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND (
        a.attnum = ANY(idx.indkey) 
        OR a.attnum IN (
            SELECT unnest(idx.indkey) 
            FROM pg_attribute att 
            WHERE att.attrelid = t.oid 
            AND att.attnum = ANY(idx.indkey)
        )
    )
WHERE n.nspname = 'public'
    AND t.relkind = 'r'
ORDER BY t.relname, i.relname, 
    CASE WHEN a.attnum = ANY(idx.indkey) THEN 1 ELSE 2 END;

-- ============================================
-- 10. ビュー一覧
-- ============================================
SELECT
    table_schema,
    table_name,
    view_definition
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- ============================================
-- 11. マテリアライズドビュー一覧
-- ============================================
SELECT
    schemaname,
    matviewname,
    hasindexes,
    ispopulated
FROM pg_matviews
WHERE schemaname = 'public'
ORDER BY matviewname;

-- ============================================
-- 12. マテリアライズドビューの定義
-- ============================================
SELECT
    n.nspname as schema_name,
    c.relname as view_name,
    pg_get_viewdef(c.oid, true) as view_definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
    AND c.relkind = 'm'
ORDER BY c.relname;

-- ============================================
-- 13. 関数とプロシージャ一覧
-- ============================================
SELECT
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as return_type,
    p.prokind as kind,
    CASE p.prokind
        WHEN 'f' THEN 'function'
        WHEN 'p' THEN 'procedure'
        WHEN 'a' THEN 'aggregate'
        WHEN 'w' THEN 'window'
        ELSE 'unknown'
    END as kind_description
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- ============================================
-- 14. 関数定義
-- ============================================
SELECT
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- ============================================
-- 15. トリガー一覧
-- ============================================
SELECT
    trigger_schema,
    trigger_name,
    event_object_table,
    event_manipulation,
    action_timing,
    action_statement,
    action_orientation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ============================================
-- 16. シーケンス一覧
-- ============================================
SELECT
    sequence_schema,
    sequence_name,
    data_type,
    numeric_precision,
    numeric_precision_radix,
    numeric_scale,
    start_value,
    minimum_value,
    maximum_value,
    increment,
    cycle_option
FROM information_schema.sequences
WHERE sequence_schema = 'public'
ORDER BY sequence_name;

-- ============================================
-- 17. シーケンスの現在値（実際の値は取得しないが、存在確認用）
-- ============================================
SELECT
    schemaname,
    sequencename
FROM pg_sequences
WHERE schemaname = 'public'
ORDER BY sequencename;
