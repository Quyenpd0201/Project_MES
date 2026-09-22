// migrate_outbound_slips.js — tao bang outbound_slips, outbound_slip_lines, production_order_materials
// node scripts/migrate_outbound_slips.js
require('dotenv').config({ path: '../.env' });
const db = require('../src/core/db');

async function main() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. production_order_materials
    await client.query(`
      CREATE TABLE IF NOT EXISTS production_order_materials (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        production_order_id uuid NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
        material_id uuid NOT NULL REFERENCES products(id),
        qty numeric DEFAULT 0 NOT NULL,
        unit character varying,
        note text,
        created_at timestamptz DEFAULT now()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pom_po ON production_order_materials(production_order_id)`);
    console.log('[1/5] production_order_materials OK');

    // 2. Them cot materials_issued vao production_orders
    await client.query(`ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS materials_issued boolean DEFAULT false`);
    await client.query(`ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS materials_issued_at timestamptz`);
    console.log('[2/5] production_orders (materials_issued) OK');

    // 3. outbound_slips
    await client.query(`
      CREATE TABLE IF NOT EXISTS outbound_slips (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        slip_code varchar UNIQUE,
        slip_date date DEFAULT CURRENT_DATE,
        purpose varchar,
        location_id uuid REFERENCES locations(id),
        prod_order_id uuid REFERENCES production_orders(id) ON DELETE SET NULL,
        status varchar DEFAULT 'Cho xuat',
        note text,
        created_by uuid,
        created_at timestamptz DEFAULT now(),
        confirmed_at timestamptz
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_obs_status ON outbound_slips(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_obs_prod_order ON outbound_slips(prod_order_id)`);
    console.log('[3/5] outbound_slips OK');

    // 4. outbound_slip_lines
    await client.query(`
      CREATE TABLE IF NOT EXISTS outbound_slip_lines (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        slip_id uuid NOT NULL REFERENCES outbound_slips(id) ON DELETE CASCADE,
        product_id uuid NOT NULL REFERENCES products(id),
        quantity numeric DEFAULT 0 NOT NULL,
        unit varchar,
        lot_code varchar DEFAULT '',
        note text
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_obsl_slip ON outbound_slip_lines(slip_id)`);
    console.log('[4/5] outbound_slip_lines OK');

    // 5. them status "Cho nguyen vat lieu" vao production_orders
    await client.query(`ALTER TABLE production_orders DROP CONSTRAINT IF EXISTS production_orders_status_check`);
    await client.query(`
      ALTER TABLE production_orders ADD CONSTRAINT production_orders_status_check
        CHECK (status::text = ANY (ARRAY[
          'Cho duyet','Da len ke hoach','Cho nguyen vat lieu',
          'Dang san xuat','Hoan thanh','Da huy',
          'Ch\u1edd duy\u1ec7t','\u0110\u00e3 l\u00ean k\u1ebf ho\u1ea1ch','Ch\u1edd nguy\u00ean v\u1eadt li\u1ec7u',
          '\u0110ang s\u1ea3n xu\u1ea5t','Ho\u00e0n th\u00e0nh','\u0110\u00e3 h\u1ee7y'
        ]::text[]))
    `);
    console.log('[5/5] production_orders status constraint OK');

    await client.query('COMMIT');
    console.log('\n Migration hoan tat!');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(' Loi:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.pool.end();
  }
}

main();
