-- [HR-G1] Module Chấm công — 2026-10-22, CHƯA PHÁT HÀNH (file mới)
-- =====================================================================
-- ROLLBACK HR G1 (mục 26 trong schema_consolidated.sql) — CHỈ DÙNG KHI CẦN GỠ HẲN MODULE CHẤM CÔNG
-- XÓA VĨNH VIỄN: đơn vị/tổ, người quản lý, khung nghỉ, loại nghỉ, ngày lễ, nhật ký HR, PIN + đồng ý chụp ảnh của nhân viên.
-- Không đụng tới dữ liệu cũ của employees/shifts (chỉ bỏ các cột mới thêm).
--
-- Cách chạy: sao lưu trước (Supabase → Database → Backups) → SQL Editor → dán toàn bộ file → Run.
-- Tất cả trong 1 giao dịch: lỗi ở bất kỳ bước nào → không thay đổi gì.
-- Lưu ý: còn code mới trên server thì `npm run migrate` sẽ tạo lại các bảng — gỡ code trước.
-- Ca cũ đã được bật overnight / đổi required_minutes ở mục 26i: các cột này bị bỏ nên không cần hoàn tác riêng.
-- =====================================================================
BEGIN;

DROP TABLE IF EXISTS public.hr_audit_logs;
DROP TABLE IF EXISTS public.holidays;
DROP TABLE IF EXISTS public.leave_types;
DROP TABLE IF EXISTS public.shift_breaks;
DROP TABLE IF EXISTS public.org_unit_managers;

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_pin_failed_nonneg,
  DROP COLUMN IF EXISTS org_unit_id,
  DROP COLUMN IF EXISTS pin_hash,
  DROP COLUMN IF EXISTS pin_failed_count,
  DROP COLUMN IF EXISTS pin_locked_until,
  DROP COLUMN IF EXISTS face_consent_at,
  DROP COLUMN IF EXISTS face_consent_version,
  DROP COLUMN IF EXISTS user_id;

ALTER TABLE public.shifts
  DROP CONSTRAINT IF EXISTS shifts_auto_detect_pair,
  DROP COLUMN IF EXISTS overnight,
  DROP COLUMN IF EXISTS required_minutes,
  DROP COLUMN IF EXISTS late_grace_min,
  DROP COLUMN IF EXISTS early_grace_min,
  DROP COLUMN IF EXISTS rounding_min,
  DROP COLUMN IF EXISTS ot_enabled,
  DROP COLUMN IF EXISTS ot_requires_approval,
  DROP COLUMN IF EXISTS auto_detect_from,
  DROP COLUMN IF EXISTS auto_detect_to;

DROP TABLE IF EXISTS public.org_units;

DELETE FROM public.app_settings
 WHERE key IN ('hr_scope_by_unit', 'hr_punch_dedupe_min', 'hr_photo_retention_days', 'hr_pin_max_fail', 'hr_pin_lock_min');

COMMIT;
