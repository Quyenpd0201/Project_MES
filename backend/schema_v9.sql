-- =============================================================
-- MES v9 — Phân quyền theo Vai trò (Role) → Ứng dụng → Trường
-- permissions JSONB: { "<app>": { view,create,edit,delete, fields:{<field>:"hidden|view|edit"} } }
-- Idempotent.
-- =============================================================
CREATE SEQUENCE IF NOT EXISTS role_code_seq START 1;

CREATE TABLE IF NOT EXISTS roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_code   VARCHAR(20) UNIQUE NOT NULL DEFAULT ('VT' || LPAD(nextval('role_code_seq')::text, 3, '0')),
    name        VARCHAR(150) NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    status      VARCHAR(20) NOT NULL DEFAULT 'Hoạt động' CHECK (status IN ('Hoạt động','Không hoạt động')),
    is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_roles_updated ON roles;
CREATE TRIGGER trg_roles_updated BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO roles (name, description)
SELECT * FROM (VALUES
  ('Quản trị hệ thống','Toàn quyền trên mọi ứng dụng'),
  ('Quản lý sản xuất','Quản lý kế hoạch, lệnh sản xuất, phân công'),
  ('Công nhân','Quét QR cập nhật tiến độ tại xưởng'),
  ('Thủ kho','Quản lý tồn kho, nhập/xuất'),
  ('Kinh doanh','Quản lý đơn hàng, khách hàng')
) AS s(name, description)
WHERE NOT EXISTS (SELECT 1 FROM roles);
