import db from '../src/core/db.js';

async function migrate() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    // Check if priority exists in sales_orders
    const soRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'sales_orders' AND column_name = 'priority'
    `);
    if (soRes.rows.length === 0) {
      await client.query(`ALTER TABLE sales_orders ADD COLUMN priority VARCHAR(20) DEFAULT 'Trung bình'`);
      console.log('Added priority to sales_orders');
    } else {
      console.log('priority already exists in sales_orders');
    }

    // Check if priority exists in production_orders
    const poRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'production_orders' AND column_name = 'priority'
    `);
    if (poRes.rows.length === 0) {
      await client.query(`ALTER TABLE production_orders ADD COLUMN priority VARCHAR(20) DEFAULT 'Trung bình'`);
      console.log('Added priority to production_orders');
    } else {
      console.log('priority already exists in production_orders');
    }

    await client.query('COMMIT');
    console.log('Migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

migrate();
