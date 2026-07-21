-- =============================================================
-- MES v8 — Nhân sự: Nhân viên · Ca làm việc · Lịch làm việc
-- Idempotent.
-- =============================================================
CREATE SEQUENCE IF NOT EXISTS shift_code_seq    START 1;
CREATE SEQUENCE IF NOT EXISTS employee_code_seq START 1;

-- Ca làm việc
CREATE TABLE IF NOT EXISTS shifts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_code  VARCHAR(20) UNIQUE NOT NULL DEFAULT ('CA' || LPAD(nextval('shift_code_seq')::text, 2, '0')),
    name        VARCHAR(50) NOT NULL,
    start_time  TIME,
    end_time    TIME,
    status      VARCHAR(20) NOT NULL DEFAULT 'Hoạt động' CHECK (status IN ('Hoạt động','Không hoạt động')),
    is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nhân viên
CREATE TABLE IF NOT EXISTS employees (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_code VARCHAR(20) UNIQUE NOT NULL DEFAULT ('NV' || LPAD(nextval('employee_code_seq')::text, 5, '0')),
    name          VARCHAR(150) NOT NULL,
    factory       VARCHAR(50),     -- Đơn vị: Nhà máy thổi / Nhà máy cắt / Quản lý ...
    position      VARCHAR(100),    -- Chức vụ
    skill_level   VARCHAR(30),     -- Bậc thợ
    phone         VARCHAR(30),
    status        VARCHAR(20) NOT NULL DEFAULT 'Hoạt động' CHECK (status IN ('Hoạt động','Không hoạt động')),
    is_deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lịch làm việc: mỗi nhân viên / ngày → 1 ca
CREATE TABLE IF NOT EXISTS work_schedules (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    work_date   DATE NOT NULL,
    shift_id    UUID REFERENCES shifts(id),
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (employee_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_ws_date ON work_schedules (work_date);

-- Triggers updated_at
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shifts','employees','work_schedules']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON %1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

-- Seed ca làm việc
INSERT INTO shifts (name, start_time, end_time)
SELECT name, start_time::time, end_time::time
FROM (VALUES ('Ca 1','06:00','14:00'),('Ca 2','14:00','22:00'),('Ca 3','22:00','06:00')) AS s(name, start_time, end_time)
WHERE NOT EXISTS (SELECT 1 FROM shifts);

-- Seed nhân viên theo biên bản
INSERT INTO employees (name, factory, position, skill_level)
SELECT * FROM (VALUES
  ('Phạm Công Nghệ','Quản lý','Quản lý công nghệ','—'),
  ('Trần Văn Thổi','Nhà máy thổi','Công nhân thổi','Bậc 4'),
  ('Lê Thị Màng','Nhà máy thổi','Công nhân thổi','Bậc 3'),
  ('Hoàng Văn Cuộn','Nhà máy thổi','Công nhân thổi','Bậc 3'),
  ('Nguyễn Văn Cắt','Nhà máy cắt','Công nhân cắt','Bậc 4'),
  ('Trần Thị Túi','Nhà máy cắt','Công nhân cắt','Bậc 3'),
  ('Lê Văn Dán','Nhà máy cắt','Công nhân cắt','Bậc 3'),
  ('Phạm Thị Bao','Nhà máy cắt','Công nhân cắt','Bậc 2'),
  ('Vũ Văn Khổ','Nhà máy cắt','Công nhân cắt','Bậc 2'),
  ('Đỗ Thị Mép','Nhà máy cắt','Công nhân cắt','Bậc 2')
) AS s(name, factory, position, skill_level)
WHERE NOT EXISTS (SELECT 1 FROM employees);
