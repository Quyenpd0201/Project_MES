const db = require('./src/core/db');

async function test() {
  try {
    const r = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'daily_scrap_records'");
    console.log('SUCCESS', r.rows);
  } catch (e) {
    console.error('ERROR', e.message);
  }
  process.exit(0);
}

test();
