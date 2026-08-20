-- =============================================================
-- MES v44 — Thêm liên kết tài khoản với công nhân (linked_worker)
-- =============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS linked_worker VARCHAR(100);
