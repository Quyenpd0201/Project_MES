require('dotenv').config({ path: '../.env' });
const db = require('../src/core/db');

async function main() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Thêm cột material_type vào sales_orders
    await client.query(`
      ALTER TABLE sales_orders 
      ADD COLUMN IF NOT EXISTS material_type VARCHAR(20) DEFAULT NULL
    `);
    console.log('Đã thêm cột material_type vào sales_orders');

    // Thêm cột material_type vào production_orders để kế thừa từ đơn hàng
    await client.query(`
      ALTER TABLE production_orders 
      ADD COLUMN IF NOT EXISTS material_type VARCHAR(20) DEFAULT NULL
    `);
    console.log('Đã thêm cột material_type vào production_orders');

    await client.query('COMMIT');
    console.log('Hoàn tất!');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Lỗi:', e.message);
  } finally {
    client.release();
    await db.pool.end();
  }
}

main();
