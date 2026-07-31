-- v37: theo dõi SL đã nhập kho theo từng lệnh SX (posted_qty) để TỰ ĐỒNG BỘ kho khi sửa SL thực tế.
-- Trước đây kho chỉ nhập 1 lần (cờ inventory_posted), sửa SL thực tế sau đó không cập nhật kho.
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS posted_qty NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Khởi tạo posted_qty cho các lệnh đã nhập kho = tổng đã Nhập tự động từ lệnh SX
UPDATE production_orders po SET posted_qty = COALESCE((
  SELECT SUM(t.quantity) FROM inventory_transactions t
  WHERE t.ref_code = po.order_code AND t.trx_type = 'Nhập' AND t.note = 'Tự động từ lệnh SX'
), 0)
WHERE po.inventory_posted = TRUE AND po.posted_qty = 0;
