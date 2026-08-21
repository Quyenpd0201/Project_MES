require('dotenv').config({path:'../.env'}); 
const db = require('../src/core/db'); 
db.query("SELECT so.order_date, c.name, it.quantity, it.spec_key, it.attr_size, it.specs FROM sales_order_items it JOIN sales_orders so ON so.id = it.sales_order_id JOIN customers c ON c.id = so.customer_id")
  .then(r=>{console.log(r.rows); db.pool.end();})
  .catch(e => { console.error(e); db.pool.end(); });
