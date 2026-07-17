-- v29: thêm trạng thái "Đã hủy" cho phiếu giao hàng (để xóa theo mẫu chung — chỉ xóa khi Đã hủy)
ALTER TABLE delivery_notes DROP CONSTRAINT IF EXISTS delivery_notes_status_check;
ALTER TABLE delivery_notes ADD CONSTRAINT delivery_notes_status_check CHECK (status IN (
  'Đã xuất hóa đơn',
  'Chờ thanh toán',
  'Đã thanh toán 1 phần',
  'Đã thanh toán',
  'Đã hủy'
));
