// backend/scripts/migrate.js — Nạp schema vào database (schema_consolidated.sql)
const path = require('path');
const ROOT = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });
const fs = require('fs');
const { Pool } = require('pg');

async function main() {
  const poolConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host: process.env.PGHOST || 'localhost',
        port: process.env.PGPORT || 5432,
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'mes',
      };

  const pool = new Pool(poolConfig);
  const schemaFile = path.join(ROOT, 'migrations', 'schema_consolidated.sql');

  try {
    console.log(`📦 Đang nạp schema từ: ${schemaFile}`);
    const sql = fs.readFileSync(schemaFile, 'utf8');

    // DB đã dựng chưa? (schema nền dùng CREATE TABLE không IF NOT EXISTS → nạp lại toàn bộ
    // trên DB có sẵn sẽ lỗi "already exists" và bỏ qua luôn khối POST-MIGRATION ở cuối).
    const fresh = (await pool.query(`SELECT to_regclass('public.products') AS t`)).rows[0].t == null;
    const marker = '-- POST-MIGRATION';
    const idx = sql.indexOf(marker);

    if (fresh) {
      await pool.query(sql);                 // DB mới → nạp toàn bộ (nền + POST-MIGRATION)
      console.log('  ✓ DB mới — đã nạp toàn bộ schema_consolidated.sql');
    } else if (idx !== -1) {
      await pool.query(sql.slice(idx));      // DB đã có → chỉ áp khối POST-MIGRATION (idempotent)
      console.log('  ✓ DB đã có — đã áp khối POST-MIGRATION (idempotent), bỏ qua schema nền');
    } else {
      console.log('  ⚠ DB đã có nhưng không tìm thấy khối POST-MIGRATION — không áp gì thêm');
    }

    const tablesRes = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' ORDER BY table_name`);
    console.log(`✅ Migrate xong. Các bảng: ${tablesRes.rows.map(r => r.table_name).join(', ')}`);
  } catch (err) {
    console.error('❌ Migrate lỗi:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
