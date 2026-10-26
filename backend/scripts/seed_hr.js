// [HR-G1] Module Chấm công — 2026-10-22, CHƯA PHÁT HÀNH (file mới)
// backend/scripts/seed_hr.js — dữ liệu mẫu Chấm công & Nghỉ phép cho DEV/TEST (KHÔNG chạy trên production).
// Chạy: node scripts/seed_hr.js   (chạy lại nhiều lần không sao — đã có theo mã thì bỏ qua)
// Tạo: tổ mẫu dưới Xưởng Thổi / Xưởng Cắt, ca CA_NGAY + CA_DEM kèm khung nghỉ, nhân viên mẫu có PIN ngẫu nhiên
// (PIN không in ra — đặt lại PIN trong màn "Cấu hình chấm công" khi cần thử kiosk).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const crypto = require('crypto');
const db = require('../src/core/db');
const { hashPassword } = require('../src/modules/auth/authController');

const dbName = process.env.PGDATABASE || '';
if (process.env.DATABASE_URL || process.env.NODE_ENV === 'production' || !/^(mes|mes_test_[a-z0-9_]+)$/.test(dbName)) {
  console.error('⛔ seed_hr chỉ chạy trên DB local "mes" hoặc "mes_test_*" (không có DATABASE_URL, không NODE_ENV=production).');
  process.exit(1);
}

const TEAMS = [
  { code: 'THOI-T1', name: 'Tổ Thổi 1', parent: 'THOI' },
  { code: 'THOI-T2', name: 'Tổ Thổi 2', parent: 'THOI' },
  { code: 'CAT-T1', name: 'Tổ Cắt 1', parent: 'CAT' },
  { code: 'CAT-T2', name: 'Tổ Cắt 2', parent: 'CAT' },
];

// Ca đêm: 2 tiếng nghỉ — khung giờ TẠM, chờ chủ dự án chốt (spec mục "Còn mở").
const SHIFTS = [
  { code: 'CA_NGAY', name: 'Ca ngày', start: '08:00', end: '17:00', overnight: false, required: 480,
    detect: ['05:00', '12:00'], breaks: [['12:00', '13:00']] },
  { code: 'CA_DEM', name: 'Ca đêm', start: '19:00', end: '07:00', overnight: true, required: 600,
    detect: ['17:30', '23:00'], breaks: [['23:00', '00:00'], ['03:00', '04:00']] },
];

const EMPLOYEES_PER_TEAM = 3;
const randomPin = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');

async function main() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    for (const t of TEAMS) {
      await client.query(
        `INSERT INTO org_units (code, name, kind, parent_id)
         SELECT $1, $2, 'TO', p.id FROM org_units p WHERE p.code = $3
         ON CONFLICT (code) DO NOTHING`, [t.code, t.name, t.parent]);
    }

    for (const s of SHIFTS) {
      const { rows: [ex] } = await client.query(`SELECT id FROM shifts WHERE shift_code = $1`, [s.code]);
      if (ex) continue;
      const { rows: [sh] } = await client.query(
        `INSERT INTO shifts (shift_code, name, start_time, end_time, overnight, required_minutes,
                             auto_detect_from, auto_detect_to, late_grace_min, early_grace_min)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 5, 5) RETURNING id`,
        [s.code, s.name, s.start, s.end, s.overnight, s.required, s.detect[0], s.detect[1]]);
      for (const [b1, b2] of s.breaks) {
        await client.query(`INSERT INTO shift_breaks (shift_id, start_time, end_time) VALUES ($1, $2, $3)`, [sh.id, b1, b2]);
      }
    }

    const units = [...TEAMS.map((t) => t.code), 'VP'];
    let created = 0;
    for (const code of units) {
      const n = code === 'VP' ? 2 : EMPLOYEES_PER_TEAM;
      for (let k = 1; k <= n; k++) {
        const empCode = `HR-${code}-${k}`;
        const r = await client.query(
          `INSERT INTO employees (employee_code, name, org_unit_id, pin_hash)
           SELECT $1::varchar, $2, u.id, $3 FROM org_units u WHERE u.code = $4
           AND NOT EXISTS (SELECT 1 FROM employees WHERE employee_code = $1::varchar)`,
          [empCode, `Nhân viên ${code} ${k}`, hashPassword(randomPin()), code]);
        created += r.rowCount;
      }
    }

    await client.query('COMMIT');
    console.log(`✅ seed_hr xong trên "${dbName}": ${TEAMS.length} tổ, ${SHIFTS.length} ca, thêm ${created} nhân viên mới.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ seed_hr lỗi:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.pool.end();
  }
}

main();
