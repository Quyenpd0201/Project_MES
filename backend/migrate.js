// backend/migrate.js — nạp schema.sql vào database (thay cho psql)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const fs = require('fs');
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'mes',
  });

  // Nạp tuần tự mọi file schema*.sql (schema.sql trước, rồi schema_v2.sql, ...)
  const files = fs.readdirSync(__dirname)
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
      const sql = fs.readFileSync(path.join(__dirname, f), 'utf8');
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
