-- v23: hàng cuộn — khối lượng lõi cuộn & tổng khối lượng trên từng dòng đơn hàng
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS core_weight  NUMERIC(14,2);
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS total_weight NUMERIC(14,2);
