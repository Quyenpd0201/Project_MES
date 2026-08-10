-- Module Quản lý Chất lượng (Phase 2 - Thực thi)

-- 1. Phiếu kiểm tra chất lượng (Inspection Header)
CREATE TABLE IF NOT EXISTS inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_code VARCHAR(50) UNIQUE NOT NULL,
    production_order_id UUID REFERENCES production_orders(id) ON DELETE CASCADE,
    criteria_id UUID REFERENCES inspection_criteria(id) ON DELETE SET NULL,
    inspector_name VARCHAR(100),
    inspection_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    status VARCHAR(50) NOT NULL DEFAULT 'Đang chờ', -- Đạt, Không đạt, Đang chờ
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Kết quả kiểm tra chi tiết (Inspection Results)
CREATE TABLE IF NOT EXISTS inspection_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    criteria_detail_id UUID NOT NULL REFERENCES inspection_criteria_details(id) ON DELETE CASCADE,
    result_number NUMERIC,
    result_boolean BOOLEAN,
    result_text TEXT,
    is_passed BOOLEAN NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Quản lý Hàng Không Phù Hợp / Sự cố (Non-conformities - NG)
CREATE TABLE IF NOT EXISTS non_conformities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nc_code VARCHAR(50) UNIQUE NOT NULL,
    inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    reason_category VARCHAR(100),
    reason_details TEXT,
    disposition VARCHAR(100), -- Rework, Scrap, Tái kiểm tra, Chấp nhận có điều kiện
    status VARCHAR(50) NOT NULL DEFAULT 'Chờ xử lý', -- Chờ xử lý, Đang xử lý, Đã đóng
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
