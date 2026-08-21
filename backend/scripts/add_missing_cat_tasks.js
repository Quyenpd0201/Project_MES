require('dotenv').config({ path: '../.env' });
const db = require('../src/core/db');

async function main() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    // Find Cuon PE orders that do not have a Cắt task
    const res = await client.query(`
      SELECT po.id, po.order_code, po.status, pt.quantity, pt.actual_qty, pt.planned_date, po.status as po_status
      FROM production_orders po
      JOIN production_tasks pt ON pt.production_order_id = po.id AND pt.stage = 'Thổi'
      WHERE po.product_id = (SELECT id FROM products WHERE product_code = 'SP00017' LIMIT 1)
      AND NOT EXISTS (
        SELECT 1 FROM production_tasks pt2 WHERE pt2.production_order_id = po.id AND pt2.stage = 'Cắt'
      )
    `);

    console.log(`Found ${res.rows.length} orders needing 'Cắt' task.`);

    for (const row of res.rows) {
      // The task_code should be po.order_code + '-2'
      // quantity = pt.quantity, actual_qty = pt.actual_qty, status = pt.status
      await client.query(`
        INSERT INTO production_tasks
          (production_order_id, task_code, stage, quantity, actual_qty, scrap_qty, status, planned_date, seq)
        VALUES ($1, $2, 'Cắt', $3, $4, 0, $5, $6, 2)
      `, [row.id, `${row.order_code}-2`, row.quantity, row.actual_qty, row.status === 'Hoàn thành' ? 'Hoàn thành' : 'Đang sản xuất', row.planned_date]);
    }

    await client.query('COMMIT');
    console.log(`Inserted ${res.rows.length} 'Cắt' tasks successfully.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
  } finally {
    client.release();
    db.pool.end();
  }
}

main();
