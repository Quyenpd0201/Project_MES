-- =============================================================
-- MES v43 — Quyền mở rộng cá nhân cho tài khoản (Individual Permissions)
-- =============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS user_permissions JSONB DEFAULT '{}'::jsonb;
