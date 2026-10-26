-- [HR-G3] Tính công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
-- =====================================================================
-- ROLLBACK HR G3 (mục 28 trong schema_consolidated.sql) — CHỈ DÙNG KHI CẦN GỠ PHẦN TÍNH CÔNG
-- XÓA VĨNH VIỄN: ngày công đã tính, phân ca, quyết định duyệt lần chấm, yêu cầu sửa công, tăng ca đã duyệt.
-- Lần chấm gốc (attendance_punches, G2) GIỮ NGUYÊN.
-- Cách chạy: sao lưu trước → Supabase SQL Editor → dán toàn bộ → Run. Gỡ code G3 trước (nếu không `npm run migrate` sẽ tạo lại).
-- Gỡ cả G2 / G1: chạy file này TRƯỚC 2026-10-23_9_rollback-hr-g2.sql rồi 2026-10-22_9_rollback-hr-g1.sql.
-- =====================================================================
-- Sau khi chạy: gỡ cả code G3 — 5 khóa hr_* trong backend/src/core/lib/settings.js (nhóm [HR-G3]) và
-- scheduleRecalcWorker trong backend/server.js — nếu không app vẫn cố tính công và lỗi vì thiếu bảng.
BEGIN;

DROP TABLE IF EXISTS public.attendance_recalc_queue;
DROP TABLE IF EXISTS public.attendance_days;
DROP TABLE IF EXISTS public.overtime_approvals;
DROP TABLE IF EXISTS public.attendance_corrections;
DROP TABLE IF EXISTS public.punch_reviews;
DROP TABLE IF EXISTS public.shift_assignments;

DELETE FROM public.app_settings
 WHERE key IN ('hr_default_shift_code', 'hr_workdays', 'hr_ot_night_from', 'hr_ot_min_minutes', 'hr_ot_block_minutes');

COMMIT;
