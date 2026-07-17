-- v15: bước công đoạn tách Xưởng/Máy + nhiều NVL/BTP đầu vào
ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS workshop          VARCHAR(100);
ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS machine_id        UUID REFERENCES machines(id);
ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS input_product_ids JSONB NOT NULL DEFAULT '[]';

-- chuyển dữ liệu cũ: input_product_id (1 giá trị) -> input_product_ids (mảng)
UPDATE process_steps
   SET input_product_ids = jsonb_build_array(input_product_id)
 WHERE input_product_id IS NOT NULL
   AND (input_product_ids IS NULL OR input_product_ids = '[]'::jsonb);
