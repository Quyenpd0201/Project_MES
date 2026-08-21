require('dotenv').config({ path: '../.env' });
const db = require('../src/core/db');

async function migrate() {
  const c = await db.pool.connect();
  try {
    await c.query('BEGIN');

    // 1. Create zones table
    console.log('Creating zones table...');
    await c.query(`
      CREATE TABLE IF NOT EXISTS zones (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
        zone_code VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'Hoạt động',
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (warehouse_id, zone_code)
      )
    `);

    // 2. Add zone_id to locations
    console.log('Adding zone_id to locations...');
    await c.query(`
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES zones(id) ON DELETE RESTRICT
    `);

    // 3. Create default zones and update locations
    console.log('Creating default zones and migrating locations...');
    const whRes = await c.query('SELECT id, warehouse_code FROM warehouses WHERE is_deleted = FALSE');
    for (const wh of whRes.rows) {
      // Create a default zone
      const defaultZoneCode = `${wh.warehouse_code}-Z0`;
      let zoneRes = await c.query(
        'SELECT id FROM zones WHERE warehouse_id = $1 AND zone_code = $2',
        [wh.id, defaultZoneCode]
      );
      
      let zoneId;
      if (zoneRes.rows.length === 0) {
        const ins = await c.query(`
          INSERT INTO zones (warehouse_id, zone_code, name, description)
          VALUES ($1, $2, 'Khu Mặc Định', 'Khu vực tạo tự động trong quá trình nâng cấp hệ thống')
          RETURNING id
        `, [wh.id, defaultZoneCode]);
        zoneId = ins.rows[0].id;
      } else {
        zoneId = zoneRes.rows[0].id;
      }

      // Update locations
      await c.query(`
        UPDATE locations SET zone_id = $1 WHERE warehouse_id = $2 AND zone_id IS NULL
      `, [zoneId, wh.id]);
    }

    await c.query('COMMIT');
    console.log('Migration completed successfully!');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    c.release();
    db.pool.end();
  }
}

migrate();
