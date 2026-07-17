-- v24: NVL thực tế sử dụng theo lệnh sản xuất (nhập ở màn Thực thi SX) → trừ tồn kho NVL
CREATE TABLE IF NOT EXISTS production_material_usage (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  material_id         UUID NOT NULL REFERENCES products(id),
  qty                 NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit                VARCHAR(30),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (production_order_id, material_id)
);
CREATE INDEX IF NOT EXISTS idx_pmu_po ON production_material_usage (production_order_id);
