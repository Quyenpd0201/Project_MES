-- =============================================================
-- MES v2 — Mở rộng 3 phân hệ cốt lõi cho nhà máy bao bì nhựa nhỏ
--   1) Sản xuất (Production Execution)
--   2) Kế hoạch (Planning)  — dùng chung bảng production_orders
--   3) Kho (Inventory)
-- Idempotent: chạy lại nhiều lần an toàn.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Hàm tiện ích: trigger cập nhật updated_at đã có ở schema.sql (set_updated_at)

-- ---------- Sequences sinh mã ----------
CREATE SEQUENCE IF NOT EXISTS customer_code_seq   START 1;
CREATE SEQUENCE IF NOT EXISTS machine_code_seq    START 1;
CREATE SEQUENCE IF NOT EXISTS warehouse_code_seq  START 1;
CREATE SEQUENCE IF NOT EXISTS location_code_seq   START 1;
CREATE SEQUENCE IF NOT EXISTS sales_order_seq     START 1;
CREATE SEQUENCE IF NOT EXISTS prod_order_seq      START 1;

-- =============================================================
-- MASTER DATA
-- =============================================================

-- Khách hàng
CREATE TABLE IF NOT EXISTS customers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_code VARCHAR(30) UNIQUE NOT NULL
                  DEFAULT ('KH' || LPAD(nextval('customer_code_seq')::text, 5, '0')),
    name          VARCHAR(255) NOT NULL,
    customer_type VARCHAR(20) NOT NULL DEFAULT 'Khách sỉ'
                  CHECK (customer_type IN ('Khách sỉ','Khách lẻ')),
    phone         VARCHAR(30),
    email         VARCHAR(150),
    address       TEXT,
    status        VARCHAR(20) NOT NULL DEFAULT 'Hoạt động'
                  CHECK (status IN ('Hoạt động','Không hoạt động')),
    is_deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Máy móc / thiết bị
CREATE TABLE IF NOT EXISTS machines (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_code VARCHAR(30) UNIQUE NOT NULL
                 DEFAULT ('MC' || LPAD(nextval('machine_code_seq')::text, 4, '0')),
    name         VARCHAR(150) NOT NULL,
    factory      VARCHAR(50) NOT NULL CHECK (factory IN ('Nhà máy thổi','Nhà máy cắt')),
    machine_type VARCHAR(50),              -- Máy thổi lớn / Máy thổi nhỏ / Máy HD / Máy cắt
    status       VARCHAR(20) NOT NULL DEFAULT 'Hoạt động'
                 CHECK (status IN ('Hoạt động','Bảo trì','Ngừng')),
    is_deleted   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kho
CREATE TABLE IF NOT EXISTS warehouses (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_code VARCHAR(30) UNIQUE NOT NULL
                   DEFAULT ('K' || LPAD(nextval('warehouse_code_seq')::text, 3, '0')),
    name           VARCHAR(150) NOT NULL,
    warehouse_type VARCHAR(20) NOT NULL DEFAULT 'NVL'
                   CHECK (warehouse_type IN ('NVL','BTP','TP')),
    is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vị trí lưu trữ trong kho (kệ/khu)
CREATE TABLE IF NOT EXISTS locations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id  UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    location_code VARCHAR(30) NOT NULL
                  DEFAULT ('VT' || LPAD(nextval('location_code_seq')::text, 4, '0')),
    name          VARCHAR(150) NOT NULL,
    is_deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (warehouse_id, location_code)
);

-- =============================================================
-- ĐƠN HÀNG (Sales Orders) — phục vụ kế hoạch theo đơn & ngày giao
-- =============================================================
CREATE TABLE IF NOT EXISTS sales_orders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_code  VARCHAR(30) UNIQUE NOT NULL
                DEFAULT ('DH' || LPAD(nextval('sales_order_seq')::text, 5, '0')),
    customer_id UUID NOT NULL REFERENCES customers(id),
    order_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date    DATE,                        -- ngày giao hàng (deadline)
    status      VARCHAR(20) NOT NULL DEFAULT 'Mới'
                CHECK (status IN ('Mới','Đang sản xuất','Hoàn thành','Đã hủy')),
    note        TEXT,
    is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_order_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    product_id     UUID NOT NULL REFERENCES products(id),
    quantity       NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
    unit           VARCHAR(30),
    attr_size      VARCHAR(100),  -- Kích thước
    attr_thickness VARCHAR(100),  -- Độ dày
    attr_color     VARCHAR(100),  -- Màu sắc
    note           TEXT
);

-- =============================================================
-- LỆNH SẢN XUẤT (Production Orders) — dùng cho cả Sản xuất & Kế hoạch
--  - Kế thừa 3 thuộc tính cốt lõi: Kích thước / Độ dày / Màu sắc
--  - finishing: checklist gia công (Đục lỗ, Xí đáy, ...)
--  - group_key: khóa gom nhóm chạy hàng loạt (màu|kích thước)
-- =============================================================
CREATE TABLE IF NOT EXISTS production_orders (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_code     VARCHAR(30) UNIQUE NOT NULL
                   DEFAULT ('LSX' || LPAD(nextval('prod_order_seq')::text, 5, '0')),
    sales_order_id UUID REFERENCES sales_orders(id),
    customer_id    UUID REFERENCES customers(id),
    product_id     UUID NOT NULL REFERENCES products(id),
    quantity       NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
    unit           VARCHAR(30),

    -- 3 thuộc tính cốt lõi (đặc thù bao bì nhựa)
    attr_size      VARCHAR(100),
    attr_thickness VARCHAR(100),
    attr_color     VARCHAR(100),

    -- Yêu cầu gia công hoàn thiện: [{ "name": "Đục lỗ", "checked": true }, ...]
    finishing      JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Phân bổ nguồn lực / lập lịch
    machine_id     UUID REFERENCES machines(id),
    planned_date   DATE,
    shift          VARCHAR(20) CHECK (shift IN ('Ca 1','Ca 2','Ca 3') OR shift IS NULL),
    assigned_team  VARCHAR(100),
    group_key      VARCHAR(200),   -- gom nhóm changeover (vd: 'Trắng sữa|20x30cm')
    due_date       DATE,

    status         VARCHAR(20) NOT NULL DEFAULT 'Chờ duyệt'
                   CHECK (status IN ('Chờ duyệt','Đã lên kế hoạch','Đang sản xuất','Hoàn thành','Đã hủy')),
    note           TEXT,
    is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_po_status   ON production_orders (status);
CREATE INDEX IF NOT EXISTS idx_po_group    ON production_orders (group_key);
CREATE INDEX IF NOT EXISTS idx_po_machine  ON production_orders (machine_id);
CREATE INDEX IF NOT EXISTS idx_po_planned  ON production_orders (planned_date);
CREATE INDEX IF NOT EXISTS idx_po_notdel   ON production_orders (is_deleted) WHERE is_deleted = FALSE;

-- =============================================================
-- KHO (Inventory) — tồn theo sản phẩm + đa thuộc tính + vị trí
-- =============================================================
CREATE TABLE IF NOT EXISTS inventory_stock (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id     UUID NOT NULL REFERENCES products(id),
    location_id    UUID REFERENCES locations(id),
    attr_size      VARCHAR(100) NOT NULL DEFAULT '',
    attr_thickness VARCHAR(100) NOT NULL DEFAULT '',
    attr_color     VARCHAR(100) NOT NULL DEFAULT '',
    quantity       NUMERIC(14,2) NOT NULL DEFAULT 0,
    unit           VARCHAR(30),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, location_id, attr_size, attr_thickness, attr_color)
);
CREATE INDEX IF NOT EXISTS idx_stock_product ON inventory_stock (product_id);

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id   UUID NOT NULL REFERENCES products(id),
    location_id  UUID REFERENCES locations(id),
    trx_type     VARCHAR(20) NOT NULL CHECK (trx_type IN ('Nhập','Xuất','Điều chỉnh')),
    quantity     NUMERIC(14,2) NOT NULL,
    attr_size      VARCHAR(100) DEFAULT '',
    attr_thickness VARCHAR(100) DEFAULT '',
    attr_color     VARCHAR(100) DEFAULT '',
    ref_code     VARCHAR(50),
    note         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Triggers updated_at ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers','machines','warehouses','locations','sales_orders','production_orders']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON %1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON %1$s
                    FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

-- =============================================================
-- SEED dữ liệu nền (chỉ nạp khi bảng trống)
-- =============================================================

-- Máy móc theo biên bản: NM thổi (2 lớn, 2 nhỏ, 1 HD) + NM cắt (7 máy)
INSERT INTO machines (name, factory, machine_type)
SELECT * FROM (VALUES
  ('Máy thổi lớn 1','Nhà máy thổi','Máy thổi lớn'),
  ('Máy thổi lớn 2','Nhà máy thổi','Máy thổi lớn'),
  ('Máy thổi nhỏ 1','Nhà máy thổi','Máy thổi nhỏ'),
  ('Máy thổi nhỏ 2','Nhà máy thổi','Máy thổi nhỏ'),
  ('Máy HD','Nhà máy thổi','Máy HD'),
  ('Máy cắt 1','Nhà máy cắt','Máy cắt'),
  ('Máy cắt 2','Nhà máy cắt','Máy cắt'),
  ('Máy cắt 3','Nhà máy cắt','Máy cắt'),
  ('Máy cắt 4','Nhà máy cắt','Máy cắt'),
  ('Máy cắt 5','Nhà máy cắt','Máy cắt'),
  ('Máy cắt 6','Nhà máy cắt','Máy cắt'),
  ('Máy cắt 7','Nhà máy cắt','Máy cắt')
) AS s(name, factory, machine_type)
WHERE NOT EXISTS (SELECT 1 FROM machines);

-- Kho mặc định
INSERT INTO warehouses (name, warehouse_type)
SELECT * FROM (VALUES
  ('Kho Nguyên vật liệu','NVL'),
  ('Kho Bán thành phẩm','BTP'),
  ('Kho Thành phẩm','TP')
) AS s(name, warehouse_type)
WHERE NOT EXISTS (SELECT 1 FROM warehouses);

-- Vị trí mẫu cho mỗi kho
INSERT INTO locations (warehouse_id, name)
SELECT w.id, v.name
FROM warehouses w
CROSS JOIN (VALUES ('Khu A'),('Khu B')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM locations);

-- Khách hàng mẫu
INSERT INTO customers (name, customer_type, phone, address)
SELECT * FROM (VALUES
  ('Công ty TNHH Bao bì Minh Anh','Khách sỉ','0901234567','KCN Tân Bình, TP.HCM'),
  ('Siêu thị Sao Việt','Khách sỉ','0912345678','Quận 7, TP.HCM'),
  ('Khách lẻ tại quầy','Khách lẻ',NULL,NULL)
) AS s(name, customer_type, phone, address)
WHERE NOT EXISTS (SELECT 1 FROM customers);
