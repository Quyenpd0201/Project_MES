-- =============================================================
-- MES v3 — Định mức (BOM) & Công thức pha màu
--   Giải quyết pain point #1: xác định công thức pha màu + tính NVL cần mua.
-- Idempotent.
-- =============================================================
CREATE SEQUENCE IF NOT EXISTS bom_code_seq START 1;

-- Định mức / công thức cho 1 sản phẩm đầu ra (TP hoặc BTP)
CREATE TABLE IF NOT EXISTS boms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bom_code        VARCHAR(30) UNIQUE NOT NULL
                    DEFAULT ('BOM' || LPAD(nextval('bom_code_seq')::text, 5, '0')),
    product_id      UUID NOT NULL REFERENCES products(id),   -- sản phẩm đầu ra
    name            VARCHAR(255) NOT NULL,
    bom_type        VARCHAR(30) NOT NULL DEFAULT 'Định mức NVL'
                    CHECK (bom_type IN ('Định mức NVL','Công thức pha màu')),
    output_quantity NUMERIC(14,3) NOT NULL DEFAULT 1,        -- định mức tính cho SL đầu ra này
    output_unit     VARCHAR(30),
    status          VARCHAR(20) NOT NULL DEFAULT 'Hoạt động'
                    CHECK (status IN ('Hoạt động','Không hoạt động')),
    note            TEXT,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_boms_product ON boms (product_id);

-- Chi tiết định mức: nguyên liệu / BTP đầu vào
CREATE TABLE IF NOT EXISTS bom_lines (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bom_id        UUID NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
    material_id   UUID NOT NULL REFERENCES products(id),     -- NVL hoặc BTP đầu vào
    quantity      NUMERIC(14,4) NOT NULL DEFAULT 0,          -- tiêu hao cho output_quantity
    unit          VARCHAR(30),
    ratio_percent NUMERIC(7,3),                              -- % pha (dùng cho công thức pha màu)
    line_no       INT NOT NULL DEFAULT 1,
    note          TEXT
);
CREATE INDEX IF NOT EXISTS idx_bomlines_bom ON bom_lines (bom_id);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_boms_updated ON boms;
CREATE TRIGGER trg_boms_updated BEFORE UPDATE ON boms
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
