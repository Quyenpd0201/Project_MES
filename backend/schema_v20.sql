-- v20: thông số kỹ thuật chuẩn (JSONB) + gom nhóm tồn kho + lô sản xuất
-- Đơn hàng / Lệnh SX / Tồn kho đều mang specs (JSONB) + spec_key (khoá gom nhóm).
-- Tồn kho thêm chiều "lô sản xuất" (lot_code) để gom 3 cấp: SP -> nhóm thông số -> lô.

ALTER TABLE sales_order_items   ADD COLUMN IF NOT EXISTS specs    JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sales_order_items   ADD COLUMN IF NOT EXISTS spec_key TEXT  NOT NULL DEFAULT '';

ALTER TABLE production_orders    ADD COLUMN IF NOT EXISTS specs    JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE production_orders    ADD COLUMN IF NOT EXISTS spec_key TEXT  NOT NULL DEFAULT '';

ALTER TABLE inventory_stock      ADD COLUMN IF NOT EXISTS specs        JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE inventory_stock      ADD COLUMN IF NOT EXISTS spec_key     TEXT  NOT NULL DEFAULT '';
ALTER TABLE inventory_stock      ADD COLUMN IF NOT EXISTS lot_code     VARCHAR(40) NOT NULL DEFAULT '';
ALTER TABLE inventory_stock      ADD COLUMN IF NOT EXISTS prod_order_id UUID REFERENCES production_orders(id);

ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS specs    JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS spec_key TEXT  NOT NULL DEFAULT '';
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS lot_code VARCHAR(40) NOT NULL DEFAULT '';

-- Bỏ ràng buộc duy nhất cũ (theo attr_*) — nay tồn kho phân biệt theo spec_key + lô
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'inventory_stock'::regclass AND contype = 'u'
     AND pg_get_constraintdef(oid) LIKE '%attr_size%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE inventory_stock DROP CONSTRAINT %I', c); END IF;
END $$;

-- Ràng buộc duy nhất mới: 1 dòng tồn = (sản phẩm, vị trí, nhóm thông số, lô)
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_spec_lot
  ON inventory_stock (product_id, location_id, spec_key, lot_code) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_stock_speckey ON inventory_stock (product_id, spec_key);
