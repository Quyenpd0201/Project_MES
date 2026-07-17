-- v18: gắn tài khoản với Đội sản xuất (để công nhân chỉ thấy việc của đội mình)
ALTER TABLE users ADD COLUMN IF NOT EXISTS team VARCHAR(100);
