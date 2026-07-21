-- v30: Quy trình CN — mỗi bước: thời gian SX + bảng NVL đầu vào (SL/ĐV) + đầu ra (SL ước tính/ĐV)
ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS duration_minutes NUMERIC(12,2);          -- thời gian SX (phút)
ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS inputs           JSONB NOT NULL DEFAULT '[]'::jsonb; -- [{material_id, quantity, unit}]
ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS output_quantity  NUMERIC(14,2);            -- SL đầu ra ước tính
ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS output_unit      VARCHAR(30);              -- đơn vị đầu ra

-- Chuyển dữ liệu cũ: input_product_ids (mảng id) -> inputs [{material_id}]
UPDATE process_steps
   SET inputs = COALESCE((SELECT jsonb_agg(jsonb_build_object('material_id', v, 'quantity', NULL, 'unit', NULL))
                          FROM jsonb_array_elements_text(input_product_ids) AS v), '[]'::jsonb)
 WHERE (inputs IS NULL OR inputs = '[]'::jsonb)
   AND input_product_ids IS NOT NULL AND jsonb_array_length(input_product_ids) > 0;
