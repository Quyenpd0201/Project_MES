-- =============================================================
-- MES v42 — Thêm parent_id vào bảng roles để hỗ trợ Kế thừa quyền
-- =============================================================

ALTER TABLE roles ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES roles(id) ON DELETE SET NULL;
