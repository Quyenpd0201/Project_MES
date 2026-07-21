-- v13: trạng thái hoạt động của kho (Hoạt động / Đang kiểm đếm / Không hoạt động)
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'Hoạt động';
