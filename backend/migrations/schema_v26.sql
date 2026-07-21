-- v26: Phiếu giao hàng & thanh toán (in template chung khi giao hàng cho khách)
CREATE TABLE IF NOT EXISTS delivery_notes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_code      VARCHAR(30) UNIQUE,
  sales_order_id UUID REFERENCES sales_orders(id),
  customer_id    UUID REFERENCES customers(id),
  delivery_date  DATE,
  status         VARCHAR(40) NOT NULL DEFAULT 'Đã xuất hóa đơn'
                 CHECK (status IN ('Đã xuất hóa đơn','Chờ thanh toán','Đã thanh toán')),
  note           TEXT,
  total_amount   NUMERIC(16,2) NOT NULL DEFAULT 0,
  is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_note_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id UUID NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
  product_id       UUID REFERENCES products(id),
  product_name     VARCHAR(255),
  specs            JSONB NOT NULL DEFAULT '{}'::jsonb,
  quantity         NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit             VARCHAR(30),
  unit_price       NUMERIC(16,2) NOT NULL DEFAULT 0,
  amount           NUMERIC(16,2) NOT NULL DEFAULT 0,
  line_no          INT
);
CREATE INDEX IF NOT EXISTS idx_dni_note ON delivery_note_items (delivery_note_id);

-- Mã phiếu tự sinh: PG00001, PG00002, ...
DROP TRIGGER IF EXISTS trg_gen_code ON delivery_notes;
CREATE TRIGGER trg_gen_code BEFORE INSERT ON delivery_notes
  FOR EACH ROW EXECUTE FUNCTION gen_code_trg('PG', '5', 'note_code');
