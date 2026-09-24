require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('1. Fetching old scrap data from production_tasks...');
    const { rows: tasks } = await client.query(`
      SELECT 
        pt.assigned_worker as worker_name,
        pt.updated_at::date as record_date,
        po.product_id,
        SUM(pt.actual_qty) as finished_qty,
        SUM(pt.scrap_qty) as scrap_qty
      FROM production_tasks pt
      JOIN production_orders po ON pt.production_order_id = po.id
      WHERE pt.scrap_qty > 0 AND pt.status = 'Hoàn thành' AND pt.assigned_worker IS NOT NULL
      GROUP BY pt.assigned_worker, pt.updated_at::date, po.product_id
      ORDER BY pt.updated_at::date, pt.assigned_worker
    `);

    console.log(`Found ${tasks.length} grouped records with scrap.`);
    
    // Group by worker and date to create records
    const recordsMap = {}; // key: "worker|date" => { items: [] }
    for (const t of tasks) {
      const key = `${t.worker_name}|${t.record_date.toISOString().slice(0, 10)}`;
      if (!recordsMap[key]) {
        recordsMap[key] = {
          worker_name: t.worker_name,
          record_date: t.record_date.toISOString().slice(0, 10),
          items: []
        };
      }
      recordsMap[key].items.push({
        product_id: t.product_id,
        finished_qty: t.finished_qty,
        scrap_qty: t.scrap_qty
      });
    }

    const recordKeys = Object.keys(recordsMap);
    console.log(`Will insert/update ${recordKeys.length} daily_scrap_records.`);

    let insertedCount = 0;
    for (const key of recordKeys) {
      const rec = recordsMap[key];
      
      // Upsert record
      const rRes = await client.query(`
        INSERT INTO daily_scrap_records (worker_name, record_date, note, updated_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (worker_name, record_date) 
        DO UPDATE SET updated_at = now()
        RETURNING id
      `, [rec.worker_name, rec.record_date, "Migrated from production_tasks"]);
      
      const recordId = rRes.rows[0].id;
      
      // Delete existing items for this record if any (rerunnable)
      await client.query(`DELETE FROM daily_scrap_items WHERE record_id = $1`, [recordId]);
      
      // Insert new items
      for (const item of rec.items) {
        await client.query(`
          INSERT INTO daily_scrap_items (record_id, product_id, finished_qty, scrap_qty)
          VALUES ($1, $2, $3, $4)
        `, [recordId, item.product_id, item.finished_qty, item.scrap_qty]);
      }
      
      insertedCount++;
    }

    await client.query('COMMIT');
    console.log(`✅ Successfully migrated ${insertedCount} records!`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
