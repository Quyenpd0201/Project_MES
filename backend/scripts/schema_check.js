require('dotenv').config({ path: '../.env' });
const db = require('../src/core/db');

async function getTables() {
  const c = await db.pool.connect();
  let res = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  console.log('Tables:', res.rows.map(r => r.table_name));
  
  res = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'inventory'");
  console.log('Inventory cols:', res.rows);

  res = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'locations'");
  console.log('Locations cols:', res.rows);

  const hasWarehouses = await c.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'warehouses'");
  if (hasWarehouses.rows.length) {
    res = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'warehouses'");
    console.log('Warehouses cols:', res.rows);
  }

  const hasZones = await c.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'zones'");
  if (hasZones.rows.length) {
    res = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'zones'");
    console.log('Zones cols:', res.rows);
  }

  c.release();
  db.pool.end();
}
getTables();
