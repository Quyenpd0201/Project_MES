-- v33: dòng hàng đơn hàng — ngày dự kiến (người dùng điền) + ngày thực tế (ghi tự động từ Thực thi SX)
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS planned_start_date DATE;
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS planned_end_date   DATE;
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS actual_start_date  TIMESTAMPTZ;
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS actual_end_date    TIMESTAMPTZ;

-- Xóa dòng đơn không làm hỏng lệnh SX đã gắn (gỡ liên kết thay vì chặn)
ALTER TABLE production_orders DROP CONSTRAINT IF EXISTS production_orders_sales_order_item_id_fkey;
ALTER TABLE production_orders
  ADD CONSTRAINT production_orders_sales_order_item_id_fkey
  FOREIGN KEY (sales_order_item_id) REFERENCES sales_order_items(id) ON DELETE SET NULL;
