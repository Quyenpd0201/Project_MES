require('dotenv').config({ path: '.env' });
const db = require('../src/core/db');

async function main() {
  // Query latest imported orders
  const r = await db.query(
    `SELECT order_code, order_date::text FROM sales_orders WHERE is_deleted=FALSE ORDER BY order_code DESC LIMIT 20`
  );
  console.log('Stored dates in DB:');
  r.rows.forEach(x => console.log(x.order_code, x.order_date));
  await db.pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
