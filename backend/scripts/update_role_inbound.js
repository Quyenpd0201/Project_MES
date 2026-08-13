const db = require('../src/core/db');

async function run() {
  try {
    const { rows } = await db.query(`SELECT id, name, permissions FROM roles WHERE name = 'Quản lý sản xuất'`);
    if (rows.length === 0) {
      console.log('Role not found!');
      process.exit(1);
    }
    
    const role = rows[0];
    console.log('Current permissions:', JSON.stringify(role.permissions, null, 2));

    const permissions = role.permissions || {};
    
    // Check and set full rights for inv_inbound
    if (!permissions.inv_inbound) {
      permissions.inv_inbound = {};
    }
    
    permissions.inv_inbound.view = 'ALLOW';
    permissions.inv_inbound.create = 'ALLOW';
    permissions.inv_inbound.edit = 'ALLOW';
    permissions.inv_inbound.delete = 'ALLOW';

    await db.query(`UPDATE roles SET permissions = $1 WHERE id = $2`, [permissions, role.id]);
    
    const { rows: rowsAfter } = await db.query(`SELECT id, name, permissions FROM roles WHERE name = 'Quản lý sản xuất'`);
    console.log('Updated successfully. New permissions:', JSON.stringify(rowsAfter[0].permissions, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
