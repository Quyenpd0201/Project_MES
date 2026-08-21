require('dotenv').config({ path: '../.env' });
const db = require('../src/core/db');

async function fixAllProducts() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    // Bao Bì
    const res1 = await client.query(`
      UPDATE production_orders po 
      SET product_id = (SELECT id FROM products WHERE product_code = 'SP00004' LIMIT 1) 
      WHERE po.product_id = (SELECT id FROM products WHERE product_code = 'SP00001' LIMIT 1) 
      AND EXISTS (
        SELECT 1 FROM production_tasks pt 
        WHERE pt.production_order_id = po.id AND pt.stage = 'Cắt'
      )
    `);
    console.log('Cập nhật Bao Bì cho các Lệnh có Cắt: ', res1.rowCount);
    
    // Cuộn PE
    const res2 = await client.query(`
      UPDATE production_orders po 
      SET product_id = (SELECT id FROM products WHERE product_code = 'SP00017' LIMIT 1) 
      WHERE po.product_id = (SELECT id FROM products WHERE product_code = 'SP00001' LIMIT 1) 
      AND NOT EXISTS (
        SELECT 1 FROM production_tasks pt 
        WHERE pt.production_order_id = po.id AND pt.stage = 'Cắt'
      )
    `);
    console.log('Cập nhật Cuộn PE cho các Lệnh KHÔNG có Cắt: ', res2.rowCount);
    
    // Sync to sales_order_items
    const res3 = await client.query(`
      UPDATE sales_order_items so 
      SET product_id = po.product_id 
      FROM production_orders po 
      WHERE po.sales_order_item_id = so.id 
      AND so.product_id = (SELECT id FROM products WHERE product_code = 'SP00001' LIMIT 1)
    `);
    console.log('Đồng bộ sang Sales Items: ', res3.rowCount);
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
  } finally {
    client.release();
    db.pool.end();
  }
}

fixAllProducts();
