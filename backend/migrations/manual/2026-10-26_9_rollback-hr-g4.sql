-- [HR-G4] Đơn nghỉ phép — 2026-10-26, CHƯA PHÁT HÀNH (file mới)
-- =====================================================================
-- ROLLBACK HR G4 (mục 29 trong schema_consolidated.sql) — CHỈ DÙNG KHI CẦN GỠ PHẦN ĐƠN NGHỈ
-- XÓA VĨNH VIỄN: đơn nghỉ, đính kèm (bản ghi — file trên storage xóa riêng), số dư đã chỉnh, thông báo.
-- Cách chạy: sao lưu trước → Supabase SQL Editor → dán toàn bộ → Run. Gỡ code G4 trước.
-- Gỡ cả G3/G2/G1: chạy file này TRƯỚC 2026-10-23_9_rollback-hr-g3.sql.
-- Extension btree_gist giữ nguyên (có thể phần khác dùng).
-- =====================================================================
BEGIN;

ALTER TABLE public.attendance_days DROP COLUMN IF EXISTS leave_request_id, DROP COLUMN IF EXISTS leave_part;
DROP TABLE IF EXISTS public.notifications;
DROP TABLE IF EXISTS public.leave_attachments;
DROP TABLE IF EXISTS public.leave_balances;
DROP TABLE IF EXISTS public.leave_requests;
DELETE FROM public.app_settings WHERE key = 'hr_leave_attachment_max_mb';

COMMIT;
