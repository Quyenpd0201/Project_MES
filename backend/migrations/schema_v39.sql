-- Thêm trường Tồn kho tối thiểu vào bảng sản phẩm
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_quantity NUMERIC;
