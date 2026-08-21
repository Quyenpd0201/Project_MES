require('dotenv').config({ path: 'backend/.env' });
const db = require('../src/core/db');

async function moveStockByProductType() {
  const c = await db.pool.connect();
  try {
    await c.query('BEGIN');
    
    // 1. Get all warehouses
    const whRes = await c.query(`SELECT id, name FROM warehouses`);
    const warehouses = whRes.rows;
    
    const getTargetLoc = async (whNameMatch) => {
      const wh = warehouses.find(w => w.name.toLowerCase().includes(whNameMatch.toLowerCase()));
      if (!wh) return null;
      
      // Get Default Zone
      let zoneRes = await c.query(`SELECT id FROM zones WHERE warehouse_id = $1 AND name = 'Khu Mặc Định' LIMIT 1`, [wh.id]);
      let zoneId;
      if (zoneRes.rows.length === 0) {
        const insZone = await c.query(`INSERT INTO zones (warehouse_id, zone_code, name) VALUES ($1, $2, 'Khu Mặc Định') RETURNING id`, [wh.id, 'Z-' + whNameMatch.substring(0,3).toUpperCase() + '-0']);
        zoneId = insZone.rows[0].id;
      } else {
        zoneId = zoneRes.rows[0].id;
      }
      
      // Get Default Location
      let locRes = await c.query(`SELECT id FROM locations WHERE warehouse_id = $1 AND zone_id = $2 AND name = 'Vị trí Mặc Định' LIMIT 1`, [wh.id, zoneId]);
      let locId;
      if (locRes.rows.length === 0) {
        const insLoc = await c.query(`INSERT INTO locations (warehouse_id, zone_id, location_code, name) VALUES ($1, $2, $3, 'Vị trí Mặc Định') RETURNING id`, [wh.id, zoneId, 'L-' + whNameMatch.substring(0,3).toUpperCase() + '-0']);
        locId = insLoc.rows[0].id;
      } else {
        locId = locRes.rows[0].id;
      }
      return locId;
    };
    
    const nvlLoc = await getTargetLoc('Nguyên vật liệu');
    const btpLoc = await getTargetLoc('Bán thành phẩm');
    const tpLoc = await getTargetLoc('Thành phẩm');
    
    // 2. Find all stock that is in the WRONG warehouse based on product type
    // We will check by joining the current location's warehouse.
    const stocks = await c.query(`
      SELECT s.id, s.quantity, s.product_id, s.spec_key, s.lot_code, s.location_id,
             p.product_type, w.name as current_wh
      FROM inventory_stock s
      JOIN products p ON p.id = s.product_id
      LEFT JOIN locations l ON l.id = s.location_id
      LEFT JOIN warehouses w ON w.id = l.warehouse_id
    `);
    
    console.log(`Kiểm tra ${stocks.rows.length} dòng tồn kho...`);
    
    let moved = 0;
    
    for (const stock of stocks.rows) {
      let targetLocId = null;
      let expectedWhMatch = '';
      
      if (stock.product_type === 'Nguyên vật liệu') {
        targetLocId = nvlLoc;
        expectedWhMatch = 'Nguyên vật liệu';
      } else if (stock.product_type === 'Bán thành phẩm') {
        targetLocId = btpLoc;
        expectedWhMatch = 'Bán thành phẩm';
      } else if (stock.product_type === 'Thành phẩm') {
        targetLocId = tpLoc;
        expectedWhMatch = 'Thành phẩm';
      }
      
      if (targetLocId && (!stock.current_wh || !stock.current_wh.toLowerCase().includes(expectedWhMatch.toLowerCase()))) {
        // Needs moving
        // Check if there is an existing row in target location to merge
        const existRes = await c.query(`
          SELECT id, quantity FROM inventory_stock 
          WHERE location_id = $1 AND product_id = $2 AND spec_key = $3 AND lot_code = $4
        `, [targetLocId, stock.product_id, stock.spec_key, stock.lot_code]);
        
        if (existRes.rows.length > 0) {
          const existId = existRes.rows[0].id;
          const newQty = Number(existRes.rows[0].quantity) + Number(stock.quantity);
          await c.query(`UPDATE inventory_stock SET quantity = $1 WHERE id = $2`, [newQty, existId]);
          await c.query(`DELETE FROM inventory_stock WHERE id = $1`, [stock.id]);
          console.log(`Đã gộp ${stock.quantity} của sản phẩm ${stock.product_id} vào vị trí ${targetLocId}`);
        } else {
          await c.query(`UPDATE inventory_stock SET location_id = $1 WHERE id = $2`, [targetLocId, stock.id]);
          console.log(`Đã chuyển dòng tồn kho ${stock.id} sang vị trí ${targetLocId}`);
        }
        moved++;
      }
    }
    
    await c.query('COMMIT');
    console.log(`Hoàn tất! Đã chuyển ${moved} dòng tồn kho.`);
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('Lỗi:', err);
  } finally {
    c.release();
    db.pool.end();
  }
}

moveStockByProductType();
