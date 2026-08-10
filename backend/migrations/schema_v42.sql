-- Module Quản lý Chất lượng (MVP)

-- 1. Hạng mục kiểm tra
CREATE TABLE IF NOT EXISTS inspection_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    data_type VARCHAR(50) NOT NULL DEFAULT 'NUMBER' CHECK (data_type IN ('NUMBER', 'BOOLEAN', 'TEXT')),
    unit VARCHAR(50),
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'Hoạt động',
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Bộ tiêu chí kiểm tra
CREATE TABLE IF NOT EXISTS inspection_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criteria_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    target_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    target_operation VARCHAR(150),
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'Hoạt động',
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Chi tiết Hạng mục trong Bộ tiêu chí
CREATE TABLE IF NOT EXISTS inspection_criteria_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criteria_id UUID NOT NULL REFERENCES inspection_criteria(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES inspection_items(id) ON DELETE RESTRICT,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Cấu hình cho loại dữ liệu NUMBER
    target_value NUMERIC,
    min_value NUMERIC,
    max_value NUMERIC,
    
    -- Cấu hình cho loại dữ liệu BOOLEAN
    boolean_expected BOOLEAN,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
