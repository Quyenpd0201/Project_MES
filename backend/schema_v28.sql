-- v28: số tiền đã trả trên phiếu (công nợ = tổng tiền − đã trả)
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(16,2) NOT NULL DEFAULT 0;
