require('dotenv').config({ path: '../.env' });
const db = require('../src/core/db');

async function fixUnassignedStock() {
  const c = await db.pool.connect();
  try {
    await c.query('BEGIN');

    // 1. Tìm Kho Nguyên vật liệu
    const whRes = await c.query(`SELECT id, name FROM warehouses WHERE name ILIKE '%Nguyên vật liệu%' LIMIT 1`);
    if (whRes.rows.length === 0) {
      console.log('Không tìm thấy Kho Nguyên vật liệu');
      return;
    }
    const wh = whRes.rows[0];
    console.log(`Tìm thấy kho: ${wh.name} (${wh.id})`);

    // 2. Tìm Khu Mặc Định của kho này
    const zoneRes = await c.query(`SELECT id, name FROM zones WHERE warehouse_id = $1 AND name = 'Khu Mặc Định' LIMIT 1`, [wh.id]);
    let zoneId;
    if (zoneRes.rows.length === 0) {
      console.log('Không tìm thấy Khu Mặc Định, đang tạo mới...');
      const insZone = await c.query(`
        INSERT INTO zones (warehouse_id, zone_code, name) VALUES ($1, 'Z-NVL-0', 'Khu Mặc Định') RETURNING id
      `, [wh.id]);
      zoneId = insZone.rows[0].id;
    } else {
      zoneId = zoneRes.rows[0].id;
      console.log(`Tìm thấy Khu Mặc Định: ${zoneId}`);
    }

    // 3. Tìm hoặc tạo một vị trí mặc định trong khu này
    const locRes = await c.query(`SELECT id FROM locations WHERE warehouse_id = $1 AND zone_id = $2 AND name = 'Vị trí Mặc Định' LIMIT 1`, [wh.id, zoneId]);
    let locId;
    if (locRes.rows.length === 0) {
      console.log('Không tìm thấy Vị trí Mặc Định, đang tạo mới...');
      const insLoc = await c.query(`
        INSERT INTO locations (warehouse_id, zone_id, location_code, name) VALUES ($1, $2, 'L-NVL-0', 'Vị trí Mặc Định') RETURNING id
      `, [wh.id, zoneId]);
      locId = insLoc.rows[0].id;
    } else {
      locId = locRes.rows[0].id;
      console.log(`Tìm thấy Vị trí Mặc Định: ${locId}`);
    }

    // 4. Cập nhật các dòng tồn kho chưa được gán vị trí (location_id IS NULL)
    // Đặc biệt là những sản phẩm Nguyên vật liệu, nhưng ở đây người dùng muốn "gán nó vào khu nguyên vật liệu ở trên" (có thể tất cả hàng chưa gán)
    // Chúng ta có thể kiểm tra xem hàng nào là Nguyên vật liệu thì gán vào Kho NVL, hàng Thành phẩm thì gán vào Kho Thành phẩm.
    // Dựa vào yêu cầu: "gán nó vào khu nguyên vật liệu ở trên". Mình sẽ gán tất cả các mặt hàng có location_id IS NULL vào vị trí mặc định này.
    
    // Nhưng nếu có một mặt hàng trùng spec, lot_code, product_id đã có ở vị trí đó thì phải cộng dồn, nếu không sẽ lỗi UNIQUE (product_id, location_id, spec_key, lot_code).
    
    const unassignedStocks = await c.query(`SELECT * FROM inventory_stock WHERE location_id IS NULL`);
    console.log(`Tìm thấy ${unassignedStocks.rows.length} dòng tồn kho chưa gán vị trí.`);

    for (const stock of unassignedStocks.rows) {
      // Kiểm tra xem vị trí đích đã có dòng tồn kho trùng khớp chưa
      const existRes = await c.query(`
        SELECT id, quantity FROM inventory_stock 
        WHERE location_id = $1 AND product_id = $2 AND spec_key = $3 AND lot_code = $4
      `, [locId, stock.product_id, stock.spec_key, stock.lot_code]);

      if (existRes.rows.length > 0) {
        // Cộng dồn số lượng
        const existId = existRes.rows[0].id;
        const newQty = Number(existRes.rows[0].quantity) + Number(stock.quantity);
        await c.query(`UPDATE inventory_stock SET quantity = $1 WHERE id = $2`, [newQty, existId]);
        await c.query(`DELETE FROM inventory_stock WHERE id = $1`, [stock.id]);
        console.log(`Đã gộp ${stock.quantity} vào dòng tồn kho ${existId}`);
      } else {
        // Đổi location_id
        await c.query(`UPDATE inventory_stock SET location_id = $1 WHERE id = $2`, [locId, stock.id]);
        console.log(`Đã chuyển dòng tồn kho ${stock.id} sang vị trí ${locId}`);
      }
    }

    await c.query('COMMIT');
    console.log('Hoàn tất!');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('Lỗi:', err);
  } finally {
    c.release();
    db.pool.end();
  }
}

fixUnassignedStock();
