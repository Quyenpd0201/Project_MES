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
    await pool.query(sql);
    console.log('  ✓ Đã nạp schema_consolidated.sql');

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
