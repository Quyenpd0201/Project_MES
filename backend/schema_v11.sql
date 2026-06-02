-- =============================================================
-- MES v11 — Quy trình công nghệ (theo công đoạn/step) + lưu đồ
--   Mỗi bước: NVL/BTP đầu vào → BTP/TP đầu ra, % thành phẩm & % phế phẩm
-- Idempotent.
-- =============================================================
CREATE SEQUENCE IF NOT EXISTS process_code_seq START 1;

CREATE TABLE IF NOT EXISTS tech_processes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_code VARCHAR(20) UNIQUE NOT NULL DEFAULT ('QT' || LPAD(nextval('process_code_seq')::text, 4, '0')),
    name         VARCHAR(200) NOT NULL,
    product_id   UUID REFERENCES products(id),  -- thành phẩm cuối (tuỳ chọn)
    status       VARCHAR(20) NOT NULL DEFAULT 'Hoạt động' CHECK (status IN ('Hoạt động','Không hoạt động')),
    note         TEXT,
    is_deleted   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS process_steps (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id        UUID NOT NULL REFERENCES tech_processes(id) ON DELETE CASCADE,
    seq               INT NOT NULL DEFAULT 1,
    name              VARCHAR(100) NOT NULL,         -- tên công đoạn (Thổi màng, Cắt & dán...)
    machine_type      VARCHAR(80),                   -- máy / xưởng
    input_product_id  UUID REFERENCES products(id),  -- NVL/BTP đầu vào
    output_product_id UUID REFERENCES products(id),  -- BTP/TP đầu ra
    yield_percent     NUMERIC(7,3),                  -- tỉ lệ thành phẩm %
    scrap_percent     NUMERIC(7,3),                  -- tỉ lệ phế phẩm %
    note              TEXT
);
CREATE INDEX IF NOT EXISTS idx_psteps_proc ON process_steps (process_id);

DROP TRIGGER IF EXISTS trg_tech_processes_updated ON tech_processes;
CREATE TRIGGER trg_tech_processes_updated BEFORE UPDATE ON tech_processes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
