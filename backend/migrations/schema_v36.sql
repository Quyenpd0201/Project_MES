-- v36: process_steps — thêm cột machine_ids (JSONB) cho phép gán NHIỀU máy cho 1 bước công đoạn.
-- Code (getById + saveSteps) đã dùng cột này nhưng thiếu migration tạo cột → lỗi 500 khi mở chi tiết quy trình.
ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS machine_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Suy ra dữ liệu cũ: nếu bước đã có machine_id đơn lẻ thì đưa vào mảng machine_ids
UPDATE process_steps
SET machine_ids = jsonb_build_array(machine_id::text)
WHERE machine_id IS NOT NULL
  AND (machine_ids IS NULL OR machine_ids = '[]'::jsonb);
