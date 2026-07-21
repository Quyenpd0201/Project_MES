-- v17: lập kế hoạch một phần — theo dõi số lượng đã lập của từng dòng đơn hàng
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS planned_qty NUMERIC(14,2) NOT NULL DEFAULT 0;

-- dòng đã đánh dấu lập kế hoạch trước đây -> coi như đã lập hết
UPDATE sales_order_items SET planned_qty = quantity WHERE is_planned = TRUE AND planned_qty = 0;
