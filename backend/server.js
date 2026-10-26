// backend/server.js — khởi động HTTP server
// [HR-G1] 2026-10-22, CHƯA PHÁT HÀNH: cấu hình Express đã chuyển sang app.js (để test dùng chung).
const app = require('./app');
const { ensureSeedAdmin } = require('./src/modules/auth/authController');
const { schedulePhotoPurge } = require('./src/modules/hr/photoPurge'); // [HR-G2] 2026-10-23, CHƯA PHÁT HÀNH
const db = require('./src/core/db');
const { scheduleRecalcWorker } = require('./src/modules/hr/hrRecalc'); // [HR-G3] 2026-10-23, CHƯA PHÁT HÀNH

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`MES API chạy tại http://localhost:${PORT}`);
  ensureSeedAdmin();
  schedulePhotoPurge(db); // [HR-G2] xóa ảnh chấm công quá hạn, mỗi ngày
  scheduleRecalcWorker(db); // [HR-G3] hàng đợi tính lại mỗi phút + job đêm sau 02:00
});
