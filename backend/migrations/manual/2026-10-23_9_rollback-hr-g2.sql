-- [HR-G2] Kiosk chấm công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
-- =====================================================================
-- ROLLBACK HR G2 (mục 27 trong schema_consolidated.sql) — CHỈ DÙNG KHI CẦN GỠ KIOSK CHẤM CÔNG
-- XÓA VĨNH VIỄN: mọi lần chấm công, thông tin ảnh, tablet đã đăng ký, cờ từ chối chụp ảnh.
-- File ảnh trên Supabase Storage / thư mục PHOTO_DIR KHÔNG bị xóa bởi script này — xóa bucket riêng nếu cần.
-- Cách chạy: sao lưu trước → Supabase SQL Editor → dán toàn bộ → Run. Gỡ code G2 trước (nếu không `npm run migrate` sẽ tạo lại).
-- Gỡ cả G1 thì chạy file này TRƯỚC 2026-10-22_9_rollback-hr-g1.sql.
-- =====================================================================
BEGIN;

DROP TRIGGER IF EXISTS attendance_punches_immutable_trg ON public.attendance_punches;
DROP FUNCTION IF EXISTS public.attendance_punches_immutable();
DROP TRIGGER IF EXISTS attendance_punches_no_truncate_trg ON public.attendance_punches;
DROP FUNCTION IF EXISTS public.attendance_punches_no_truncate();
DROP INDEX IF EXISTS public.employees_code_upper_idx;
DROP TABLE IF EXISTS public.attendance_punches;
DROP TABLE IF EXISTS public.punch_photos;
DROP TABLE IF EXISTS public.kiosk_devices;

ALTER TABLE public.employees DROP COLUMN IF EXISTS face_consent_refused_at;

DELETE FROM public.app_settings WHERE key IN ('hr_consent_version', 'hr_kiosk_result_seconds');

COMMIT;
