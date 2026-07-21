-- =============================================================
-- MES v5 — Phân công sản xuất: chia 1 lệnh SX thành các lệnh nhỏ
--   theo công đoạn (Thổi/Cắt) + sản lượng + máy + ca + đội/nhân công.
-- Idempotent.
-- =============================================================
CREATE TABLE IF NOT EXISTS production_tasks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    task_code           VARCHAR(40) NOT NULL,          -- vd: LSX00004-1
    stage               VARCHAR(20) NOT NULL CHECK (stage IN ('Thổi','Cắt')),  -- công đoạn
    quantity            NUMERIC(14,2) NOT NULL DEFAULT 0,
    machine_id          UUID REFERENCES machines(id),
    shift               VARCHAR(20),
    planned_date        DATE,
    assigned_team       VARCHAR(100),
    assigned_worker     VARCHAR(100),
    status              VARCHAR(20) NOT NULL DEFAULT 'Chờ'
                        CHECK (status IN ('Chờ','Đang sản xuất','Hoàn thành','Đã hủy')),
    seq                 INT NOT NULL DEFAULT 1,
    note                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_po ON production_tasks (production_order_id);

DROP TRIGGER IF EXISTS trg_tasks_updated ON production_tasks;
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON production_tasks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
