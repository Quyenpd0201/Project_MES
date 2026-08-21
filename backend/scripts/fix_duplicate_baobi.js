require('dotenv').config({ path: '../.env' });
const db = require('../src/core/db');

async function fixDuplicateProduct() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    // Tìm ID của SP00004
    const res1 = await client.query(`SELECT id FROM products WHERE product_code = 'SP00004'`);
    if (!res1.rows.length) throw new Error('Không tìm thấy SP00004');
    const correctBaoBiId = res1.rows[0].id;
    
    // Tìm ID của SP-BAOBI
    const res2 = await client.query(`SELECT id FROM products WHERE product_code = 'SP-BAOBI'`);
    if (res2.rows.length) {
      const wrongBaoBiId = res2.rows[0].id;
      
      console.log('Update sales_order_items...');
      await client.query(`UPDATE sales_order_items SET product_id = $1 WHERE product_id = $2`, [correctBaoBiId, wrongBaoBiId]);
      
      console.log('Update production_orders...');
      await client.query(`UPDATE production_orders SET product_id = $1 WHERE product_id = $2`, [correctBaoBiId, wrongBaoBiId]);
      
      console.log('Update inventory_transactions...');
      await client.query(`UPDATE inventory_transactions SET product_id = $1 WHERE product_id = $2`, [correctBaoBiId, wrongBaoBiId]);
      
      console.log('Delete wrong product SP-BAOBI...');
      await client.query(`DELETE FROM products WHERE id = $1`, [wrongBaoBiId]);
      console.log('Done.');
    } else {
      console.log('SP-BAOBI not found, maybe already deleted.');
    }
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
  } finally {
    client.release();
    db.pool.end();
  }
}

fixDuplicateProduct();
