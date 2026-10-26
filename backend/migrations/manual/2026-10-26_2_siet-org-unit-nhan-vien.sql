-- [HR-G5] Siết employees.org_unit_id NOT NULL (Q8) — 2026-10-26, CHƯA PHÁT HÀNH (file mới)
-- KHÔNG chạy tự động. Chủ dự án chạy tay SAU KHI đã xếp tổ cho mọi nhân viên (màn "Cấu hình chấm công").

-- Phần 1 — XEM TRƯỚC: nhân viên chưa có tổ (phải ra 0 dòng mới chạy phần 2)
SELECT employee_code, name, status, is_deleted FROM public.employees WHERE org_unit_id IS NULL ORDER BY employee_code;

-- Phần 2 — SIẾT (lỗi nếu còn nhân viên chưa xếp tổ → không thay đổi gì). Bỏ dấu "--" rồi chạy.
-- ALTER TABLE public.employees ALTER COLUMN org_unit_id SET NOT NULL;

-- Gỡ: ALTER TABLE public.employees ALTER COLUMN org_unit_id DROP NOT NULL;
