const db = require('./backend/src/core/db');
async function dump() {
  for (const table of ['production_orders', 'inventory_stock', 'production_tasks', 'products', 'inventory_transactions']) {
    const res = await db.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1`, [table]);
    console.log(`--- ${table} ---`);
    console.log(res.rows.map(r => `${r.column_name}: ${r.data_type}`).join('\n'));
  }
  process.exit(0);
}
dump().catch(console.error);
