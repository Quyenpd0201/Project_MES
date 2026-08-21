require('dotenv').config({ path: '../.env' });
const db = require('../src/core/db');
async function run() {
  const c = await db.pool.connect();
  const res = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'inventory_stock'");
  console.log('inventory_stock:', res.rows);
  const zres = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'zones'");
  console.log('zones:', zres.rows);
  c.release();
  db.pool.end();
}
run();
