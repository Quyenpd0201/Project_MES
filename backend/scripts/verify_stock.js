require('dotenv').config({ path: '../.env' });
const db = require('../src/core/db');

async function verify() {
  try {
    const res = await db.query(`
      SELECT s.id, p.product_name, p.product_type, w.name as wh_name 
      FROM inventory_stock s 
      JOIN products p ON p.id = s.product_id 
      LEFT JOIN locations l ON l.id = s.location_id 
      LEFT JOIN warehouses w ON w.id = l.warehouse_id 
      WHERE p.product_type = 'Nguyên vật liệu' AND w.name IS DISTINCT FROM 'Kho Nguyên vật liệu'
    `);
    console.log("Nguyên vật liệu Not in Kho Nguyên vật liệu:", res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    db.pool.end();
  }
}
verify();
