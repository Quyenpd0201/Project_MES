-- Thêm thông tin về công suất, tuổi thọ, ngày lắp đặt cho bảng machines
ALTER TABLE machines ADD COLUMN IF NOT EXISTS capacity_per_hour NUMERIC(10,2) DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS expected_lifespan_hours NUMERIC(14,2) DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS installation_date DATE DEFAULT CURRENT_DATE;
