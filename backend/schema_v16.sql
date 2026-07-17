-- v16: lệnh sản xuất tách Đội (assigned_team) và Công nhân (assigned_worker)
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS assigned_worker VARCHAR(100);
