-- =============================================================
-- MES v6 — Ngày kết thúc cho phân công (để vẽ thanh Gantt trải nhiều ngày)
-- Idempotent.
-- =============================================================
ALTER TABLE production_tasks ADD COLUMN IF NOT EXISTS planned_end_date DATE;
