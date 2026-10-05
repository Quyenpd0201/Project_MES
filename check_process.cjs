const db = require('./backend/src/core/db');
async function run() {
  const r = await db.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'process_steps' ORDER BY ordinal_position
  `);
  console.log('process_steps columns:', r.rows.map(x => `${x.column_name}:${x.data_type}`));

  const r2 = await db.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'tech_processes' ORDER BY ordinal_position
  `);
  console.log('tech_processes columns:', r2.rows.map(x => `${x.column_name}:${x.data_type}`));

  // Sample data
  const r3 = await db.query('SELECT * FROM process_steps LIMIT 3');
  console.log('\nprocess_steps sample:', r3.rows);
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
