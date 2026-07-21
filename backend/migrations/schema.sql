-- =============================================================
-- MES - Phân hệ Quản lý Sản phẩm
-- PostgreSQL Schema (tinh gọn cho nhà máy bao bì nhựa SME)
-- =============================================================

-- Cần extension để sinh UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Bảng sinh số thứ tự cho mã sản phẩm tự động (SP00001, SP00002, ...)
CREATE SEQUENCE IF NOT EXISTS product_code_seq START 1;

CREATE TABLE IF NOT EXISTS products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Mã SP tự sinh dạng SP + 5 chữ số. Có thể override khi insert.
    product_code    VARCHAR(30) UNIQUE NOT NULL
                    DEFAULT ('SP' || LPAD(nextval('product_code_seq')::text, 5, '0')),
    product_name    VARCHAR(255) NOT NULL,

    -- Phân loại
    production_area VARCHAR(100),                 -- Khu vực SX (Xưởng thổi / Xưởng cắt)
    category        VARCHAR(100),                 -- Danh mục
    product_type    VARCHAR(30) NOT NULL           -- Thành phẩm/Bán thành phẩm/NVL/Dịch vụ
                    CHECK (product_type IN ('Thành phẩm','Bán thành phẩm','NVL','Dịch vụ')),
    product_group   VARCHAR(100),                 -- Nhóm SP

    -- Đo lường & theo dõi
    unit            VARCHAR(30),                  -- Đơn vị tính (kg, cuộn, cái...)
    barcode_type    VARCHAR(30),                  -- Loại mã vạch (CODE128, QR...)
    tracking_type   VARCHAR(20)                   -- Theo lô / Theo serial
                    CHECK (tracking_type IN ('Theo lô','Theo serial')),

    -- Cờ hiệu
    is_pqc_required BOOLEAN NOT NULL DEFAULT FALSE, -- Cần kiểm tra PQC
    status          VARCHAR(20) NOT NULL DEFAULT 'Hoạt động'
                    CHECK (status IN ('Hoạt động','Không hoạt động')),

    -- Mô tả & thuộc tính động (Kích thước/Độ dày/Màu sắc...)
    description     TEXT,
    attributes      JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Ví dụ: [{"name":"Màu sắc","value":"Đỏ"},{"name":"Độ dày","value":"20mic"}]

    -- Soft delete + audit
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index phục vụ tìm kiếm/filter & truy vấn JSONB
CREATE INDEX IF NOT EXISTS idx_products_type        ON products (product_type);
CREATE INDEX IF NOT EXISTS idx_products_area        ON products (production_area);
CREATE INDEX IF NOT EXISTS idx_products_not_deleted ON products (is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_products_attributes  ON products USING GIN (attributes);
-- Tìm kiếm theo tên/mã không phân biệt hoa thường
CREATE INDEX IF NOT EXISTS idx_products_name_trgm   ON products (lower(product_name));
CREATE INDEX IF NOT EXISTS idx_products_code_trgm   ON products (lower(product_code));

-- Trigger tự cập nhật updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Dữ liệu mẫu (chỉ nạp khi bảng đang trống)
INSERT INTO products (product_name, production_area, category, product_type, product_group,
                      unit, barcode_type, tracking_type, is_pqc_required, status, description, attributes)
SELECT * FROM (VALUES
('Túi nilon HD 20x30', 'Xưởng cắt', 'Túi đựng', 'Thành phẩm', 'Túi HD',
 'cái', 'CODE128', 'Theo lô', TRUE, 'Hoạt động', 'Túi siêu thị size vừa',
 '[{"name":"Kích thước","value":"20x30cm"},{"name":"Độ dày","value":"20mic"},{"name":"Màu sắc","value":"Trắng sữa"}]'::jsonb),
('Cuộn nilon PE khổ 50', 'Xưởng thổi', 'Cuộn màng', 'Bán thành phẩm', 'Màng PE',
 'cuộn', 'QR', 'Theo serial', FALSE, 'Hoạt động', 'Cuộn màng chờ cắt',
 '[{"name":"Kích thước","value":"khổ 50cm"},{"name":"Độ dày","value":"35mic"},{"name":"Màu sắc","value":"Trong"}]'::jsonb),
('Hạt nhựa HDPE nguyên sinh', NULL, 'Nguyên liệu', 'NVL', 'Hạt nhựa',
 'kg', 'CODE128', 'Theo lô', FALSE, 'Hoạt động', 'Hạt nhựa đầu vào',
 '[{"name":"Màu sắc","value":"Tự nhiên"}]'::jsonb)
) AS seed(product_name, production_area, category, product_type, product_group,
          unit, barcode_type, tracking_type, is_pqc_required, status, description, attributes)
WHERE NOT EXISTS (SELECT 1 FROM products);
