require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../src/core/db');

async function main() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    const targetProductId = '2b0227d3-53c4-4b62-8e71-5a770a3f04d3'; // SP00004 "Bao Bì "
    const duplicateProductId = '354338fd-d274-4304-a209-0a0ccf1d27cf'; // SP_BAOBI "Bao bì"

    // Cập nhật các đơn hàng vừa nhập (DH00049 -> DH00118) 
    const soRes = await client.query(`
      UPDATE sales_order_items
      SET product_id = $1
      WHERE sales_order_id IN (
        SELECT id FROM sales_orders 
        WHERE order_code >= 'DH00049' AND order_code <= 'DH00118'
      )
    `, [targetProductId]);
    console.log(`Đã chuyển ${soRes.rowCount} dòng đơn hàng bán về sản phẩm "Bao Bì " cũ.`);

    // Cập nhật các lệnh sản xuất liên quan
    const poRes = await client.query(`
      UPDATE production_orders
      SET product_id = $1
      WHERE order_code >= 'LSX00049' AND order_code <= 'LSX00118'
    `, [targetProductId]);
    console.log(`Đã chuyển ${poRes.rowCount} lệnh sản xuất về sản phẩm "Bao Bì " cũ.`);

    // Xóa sản phẩm trùng lặp vừa tạo
    await client.query(`DELETE FROM products WHERE id = $1`, [duplicateProductId]);
    console.log('Đã xóa sản phẩm "Bao bì" bị tạo dư.');

    await client.query('COMMIT');
    console.log('Thành công!');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Lỗi:', e);
  } finally {
    client.release();
    await db.pool.end();
  }
}

main();
