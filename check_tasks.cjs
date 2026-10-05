const db = require('./backend/src/core/db');
async function run() {
  const r = await db.query(
    `SELECT po.order_code, po.id, COUNT(t.id)::int as task_count
     FROM production_orders po
     LEFT JOIN production_tasks t ON t.production_order_id = po.id
     WHERE po.order_code = ANY($1)
     GROUP BY po.id, po.order_code
     ORDER BY po.order_code`,
    [['LSX00696', 'LSX00629']]
  );
  console.log(r.rows);
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
