require('dotenv').config({ path: '../.env' });
const db = require('../src/core/db');

async function main() {
  const r = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'sales_orders'");
  console.log('sales_orders columns:', r.rows.map(c => c.column_name));
  
  const r2 = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'sales_order_items'");
  console.log('sales_order_items columns:', r2.rows.map(c => c.column_name));
  
  await db.pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
