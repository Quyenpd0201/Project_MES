-- v25: bổ sung trạng thái đơn hàng (sản xuất → giao hàng → thanh toán)
ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_status_check;
ALTER TABLE sales_orders ALTER COLUMN status TYPE VARCHAR(50);
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_status_check CHECK (status IN (
  'Mới',
  'Đang sản xuất',
  'Hoàn thành sản xuất',
  'Chuyển hàng 1 phần',
  'Đang vận chuyển',
  'Đã vận chuyển, chưa thanh toán',
  'Đã thanh toán',
  'Hoàn thành',
  'Đã hủy'
));
