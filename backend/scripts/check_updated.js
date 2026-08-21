require('dotenv').config({path:'../.env'}); 
const db = require('../src/core/db'); 
db.query("SELECT status, order_code FROM sales_orders ORDER BY updated_at DESC LIMIT 5")
  .then(r=>{console.log(r.rows); db.pool.end();})
  .catch(e => { console.error(e); db.pool.end(); });
