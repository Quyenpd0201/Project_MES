-- =============================================================
-- MES v10 — Tài khoản đăng nhập (users) + cờ admin cho vai trò
-- Idempotent. (Tài khoản admin mặc định được seed ở server khi khởi động.)
-- =============================================================
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE roles SET is_admin = TRUE WHERE name = 'Quản trị hệ thống';

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(150),
    role_id       UUID REFERENCES roles(id),
    status        VARCHAR(20) NOT NULL DEFAULT 'Hoạt động' CHECK (status IN ('Hoạt động','Không hoạt động')),
    is_deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
