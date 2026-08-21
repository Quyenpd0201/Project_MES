require('dotenv').config({ path: '../.env' });
const db = require('../src/core/db');

async function check() {
  const c = await db.pool.connect();
  const res = await c.query("SELECT COUNT(*) FROM sales_order_items WHERE product_id = (SELECT id FROM products WHERE product_code = 'SP00001')");
  console.log('sales_order_items SP00001:', res.rows[0]);
  
  const res2 = await c.query("SELECT COUNT(*) FROM production_orders WHERE product_id = (SELECT id FROM products WHERE product_code = 'SP00001')");
  console.log('production_orders SP00001:', res2.rows[0]);
  
  const res3 = await c.query("SELECT po.id FROM production_orders po JOIN sales_order_items so ON po.sales_order_item_id = so.id WHERE so.product_id = (SELECT id FROM products WHERE product_code = 'SP00001') LIMIT 5");
  console.log('mismatch:', res3.rows);
  
  c.release();
  db.pool.end();
}
check();
