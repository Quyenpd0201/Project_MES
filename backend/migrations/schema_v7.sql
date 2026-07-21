-- =============================================================
-- MES v7 — Thực thi sản xuất + Kho tự động (backflush)
--   - Ghi nhận sản lượng thực & phế phẩm tại từng lệnh nhỏ
--   - Khi lệnh hoàn thành: nhập kho TP + trừ NVL theo BOM (1 lần)
-- Idempotent.
-- =============================================================
ALTER TABLE production_tasks  ADD COLUMN IF NOT EXISTS actual_qty NUMERIC(14,2);
ALTER TABLE production_tasks  ADD COLUMN IF NOT EXISTS scrap_qty  NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS inventory_posted BOOLEAN NOT NULL DEFAULT FALSE;
