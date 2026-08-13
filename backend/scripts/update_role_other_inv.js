const db = require('../src/core/db');

async function run() {
  try {
    const { rows } = await db.query(`SELECT id, name, permissions FROM roles WHERE name = 'Quản lý sản xuất'`);
    if (rows.length === 0) {
      console.log('Role not found!');
      process.exit(1);
    }
    
    const role = rows[0];
    const permissions = role.permissions || {};
    
    const modules = ['inv_outbound', 'inv_transfer', 'inv_adjust'];
    for (const mod of modules) {
      if (!permissions[mod]) {
        permissions[mod] = {};
      }
      permissions[mod].view = 'ALLOW';
      permissions[mod].create = 'ALLOW';
      permissions[mod].edit = 'ALLOW';
      permissions[mod].delete = 'ALLOW';
    }

    await db.query(`UPDATE roles SET permissions = $1 WHERE id = $2`, [permissions, role.id]);
    console.log('Updated successfully for', modules);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
