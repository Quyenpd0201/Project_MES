// backend/scripts/migrate.js — nạp schema.sql vào database (thay cho psql)
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

  // Nạp tuần tự mọi file schema*.sql từ migrations/ (schema.sql trước, rồi schema_v2.sql, ...)
  const migrationsDir = path.join(ROOT, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => /^schema.*\.sql$/i.test(f))
    .sort((a, b) => {
      if (a === 'schema.sql') return -1;
      if (b === 'schema.sql') return 1;
      const numA = parseInt((a.match(/\d+/) || [0])[0]);
      const numB = parseInt((b.match(/\d+/) || [0])[0]);
      return numA - numB;
    });
  try {
    for (const f of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
      await pool.query(sql);
      console.log(`  ✓ đã nạp ${f}`);
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
