// backend/controllers/lookupController.js — dữ liệu cho dropdown ở frontend
const db = require('../db');

exports.all = async (_req, res) => {
  try {
    const [products, customers, machines, warehouses, locations, employees, shiftRows] = await Promise.all([
      db.query(`SELECT id, product_code, product_name, product_type, unit FROM products WHERE is_deleted = FALSE ORDER BY product_code`),
      db.query(`SELECT id, customer_code, name FROM customers WHERE is_deleted = FALSE ORDER BY name`),
      db.query(`SELECT id, machine_code, name, factory, machine_type FROM machines WHERE is_deleted = FALSE ORDER BY factory, name`),
      db.query(`SELECT id, warehouse_code, name, warehouse_type FROM warehouses WHERE is_deleted = FALSE ORDER BY name`),
      db.query(`SELECT l.id, l.location_code, l.name, l.warehouse_id, w.name AS warehouse_name
                FROM locations l JOIN warehouses w ON w.id = l.warehouse_id WHERE l.is_deleted = FALSE ORDER BY w.name, l.name`),
      db.query(`SELECT id, employee_code, name, factory, position, skill_level FROM employees WHERE is_deleted = FALSE ORDER BY factory, name`),
      db.query(`SELECT id, name FROM shifts WHERE is_deleted = FALSE ORDER BY shift_code`),
    ]);
    // Giá trị thuộc tính cốt lõi đã dùng (gợi ý nhập nhanh)
    const attrs = await db.query(`
      SELECT DISTINCT a->>'name' AS name, a->>'value' AS value
      FROM products p, jsonb_array_elements(p.attributes) a
      WHERE p.is_deleted = FALSE AND a->>'value' <> ''`);
    const byName = (n) => attrs.rows.filter(r => r.name === n).map(r => r.value);

    res.json({
      products: products.rows,
      customers: customers.rows,
      machines: machines.rows,
      warehouses: warehouses.rows,
      locations: locations.rows,
      employees: employees.rows,
      shiftList: shiftRows.rows, // [{id, name}] cho lịch làm việc
      units: ['cái', 'cuộn', 'kg', 'bao', 'thùng', 'm'],
      shifts: shiftRows.rows.length ? shiftRows.rows.map((s) => s.name) : ['Ca 1', 'Ca 2', 'Ca 3'],
      colors: byName('Màu sắc'),
      sizes: byName('Kích thước'),
      thicknesses: byName('Độ dày'),
      finishingOptions: ['Đục lỗ', 'Xí đáy', 'In ấn', 'Ghép màng', 'Hàn đáy', 'Bo góc'],
    });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy dữ liệu lookup' }); }
};
