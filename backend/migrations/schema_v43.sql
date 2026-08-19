-- =============================================================
-- MES v43 — Thêm quyền riêng lẻ cho từng User (Override Role)
-- =============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
