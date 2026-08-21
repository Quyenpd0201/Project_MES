require('dotenv').config({ path: '../.env' });
const db = require('../src/core/db');

async function check() {
  const c = await db.pool.connect();
  const res = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'production_orders'");
  console.log(res.rows);
  c.release();
  db.pool.end();
}
check();
