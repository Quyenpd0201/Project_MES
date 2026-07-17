-- v12: bổ sung thông tin hạn dùng & kiểm đếm cho tồn kho theo vị trí
ALTER TABLE inventory_stock ADD COLUMN IF NOT EXISTS expiry_date  DATE;
ALTER TABLE inventory_stock ADD COLUMN IF NOT EXISTS counted_qty  NUMERIC(14,2);
ALTER TABLE inventory_stock ADD COLUMN IF NOT EXISTS counted_date DATE;
