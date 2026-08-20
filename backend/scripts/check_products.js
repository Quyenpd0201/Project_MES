require('dotenv').config({ path: '.env' });
const db = require('../src/core/db');
db.query("SELECT id, product_code, product_name FROM products WHERE product_name ILIKE '%Bao%'")
  .then(r => { console.log(r.rows); db.pool.end(); })
  .catch(e => { console.error(e.message); process.exit(1); });
