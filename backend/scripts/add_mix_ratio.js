require('dotenv').config();
const db = require('../src/core/db');

async function migrate() {
  try {
    await db.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS mix_ratio JSONB DEFAULT '[]'::jsonb`);
    console.log("Added mix_ratio to sales_orders");
    
    await db.query(`ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS mix_ratio JSONB DEFAULT '[]'::jsonb`);
    console.log("Added mix_ratio to production_orders");
  } catch (err) {
    console.error(err);
  } finally {
    db.pool.end();
  }
}
migrate();
