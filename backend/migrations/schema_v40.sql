-- Thêm trường Tồn kho tối thiểu theo từng kho vào bảng sản phẩm
ALTER TABLE products ADD COLUMN IF NOT EXISTS warehouse_limits JSONB DEFAULT '[]'::jsonb;
