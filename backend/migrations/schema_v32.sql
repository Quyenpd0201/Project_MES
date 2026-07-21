-- v32: thêm trạng thái "Dừng sản xuất" cho lô/công đoạn (tạm dừng ở màn Thực thi SX)
ALTER TABLE production_tasks DROP CONSTRAINT IF EXISTS production_tasks_status_check;
ALTER TABLE production_tasks ADD CONSTRAINT production_tasks_status_check CHECK (status IN (
  'Chờ',
  'Đang sản xuất',
  'Dừng sản xuất',
  'Hoàn thành',
  'Đã hủy'
));
