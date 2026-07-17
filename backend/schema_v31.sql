-- v31: liên kết BOM với Quy trình công nghệ. BOM có process_id là định mức TỰ SINH từ quy trình (chỉ xem).
ALTER TABLE boms ADD COLUMN IF NOT EXISTS process_id UUID REFERENCES tech_processes(id);
CREATE INDEX IF NOT EXISTS idx_boms_process ON boms (process_id);
