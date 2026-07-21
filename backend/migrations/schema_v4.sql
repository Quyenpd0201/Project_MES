-- =============================================================
-- MES v4 — Liên kết Đơn hàng → Kế hoạch → Lệnh sản xuất
-- Idempotent.
-- =============================================================

-- Đánh dấu dòng đơn hàng đã được đưa vào kế hoạch (đã sinh lệnh SX)
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS is_planned BOOLEAN NOT NULL DEFAULT FALSE;

-- Lệnh SX truy ngược về đúng dòng đơn hàng đã sinh ra nó
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS sales_order_item_id UUID REFERENCES sales_order_items(id);
