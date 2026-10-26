-- [HR-G5] Chốt công tháng — 2026-10-26, CHƯA PHÁT HÀNH (file mới)
-- ROLLBACK HR G5 (mục 30 trong schema_consolidated.sql) — CHỈ DÙNG KHI CẦN GỠ PHẦN CHỐT CÔNG.
-- XÓA VĨNH VIỄN: kỳ công + lịch sử mở khóa. Ngày công đang khóa được MỞ lại (locked = false).
-- Cách chạy: sao lưu trước → SQL Editor → dán toàn bộ file → Run (1 giao dịch).
-- Lưu ý: còn code mới trên server thì `npm run migrate` sẽ tạo lại các bảng — gỡ code trước.
BEGIN;
UPDATE public.attendance_days SET locked = false WHERE locked;
DROP TABLE IF EXISTS public.period_unlocks;
DROP TABLE IF EXISTS public.attendance_periods;
COMMIT;
