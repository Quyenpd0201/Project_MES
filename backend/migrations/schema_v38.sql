-- v38: theo dõi SL đã nhập kho theo TỪNG công đoạn (WIP: Thổi→BTP, Cắt→TP + tiêu hao BTP).
ALTER TABLE production_tasks ADD COLUMN IF NOT EXISTS posted_qty NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Khởi tạo: lệnh ĐÃ HOÀN THÀNH TOÀN BỘ coi như đã hạch toán xong (posted = SL thực tế) → không đổi kho lịch sử.
-- Lệnh chưa hoàn thành: công đoạn đã xong sẽ được nhập kho BTP ở lần đồng bộ tới (posted vẫn = 0).
UPDATE production_tasks t SET posted_qty = COALESCE(t.actual_qty, t.quantity)
WHERE t.status = 'Hoàn thành'
  AND (SELECT po.status FROM production_orders po WHERE po.id = t.production_order_id) = 'Hoàn thành';
