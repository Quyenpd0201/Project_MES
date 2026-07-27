const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const { makeCrud } = require('../../core/genericCrud');
const production = require('../production/productionController');

// ---- Master data ----
function mountCrud(path, crud) {
  router.get(`${path}`, crud.list);
  router.post(`${path}`, crud.create);
  router.post(`${path}/import`, crud.bulkCreate);
  router.get(`${path}/:id`, crud.getById);
  router.put(`${path}/:id`, crud.update);
  router.delete(`${path}/:id`, crud.remove);
}

mountCrud('/customers', makeCrud({
  table: 'customers',
  columns: ['name', 'customer_type', 'phone', 'email', 'address', 'status'],
  searchCols: ['name', 'customer_code', 'phone'], exactCols: ['customer_type', 'status'], codeCol: 'customer_code',
  blockDeleteStatuses: ['Ho?t d?ng'],
}));

mountCrud('/machines', makeCrud({
  table: 'machines',
  columns: ['name', 'factory', 'machine_type', 'status'],
  searchCols: ['name', 'machine_code'], exactCols: ['factory', 'status'], codeCol: 'machine_code',
  blockDeleteStatuses: ['Ho?t d?ng', 'B?o trì'],
  extraSelect: `,
    CASE WHEN EXISTS (
      SELECT 1 FROM production_tasks pt JOIN production_orders po ON po.id = pt.production_order_id
      WHERE po.is_deleted = FALSE AND pt.machine_id = machines.id AND pt.status = 'Ðang s?n xu?t')
    OR EXISTS (
      SELECT 1 FROM production_orders po
      WHERE po.is_deleted = FALSE AND po.machine_id = machines.id AND po.status = 'Ðang s?n xu?t')
    THEN 'Ðang s?n xu?t' ELSE 'Ch? s?n xu?t' END AS production_status`,
}));
router.get('/machines/:id/orders', production.byMachine);

mountCrud('/warehouses', makeCrud({
  table: 'warehouses',
  columns: ['name', 'warehouse_type', 'status'],
  searchCols: ['name', 'warehouse_code'], exactCols: ['warehouse_type', 'status'], codeCol: 'warehouse_code',
  blockDeleteStatuses: ['Ho?t d?ng', 'Ðang ki?m d?m'],
}));

mountCrud('/locations', makeCrud({
  table: 'locations',
  columns: ['warehouse_id', 'name'],
  searchCols: ['name', 'location_code'], exactCols: ['warehouse_id'], codeCol: 'location_code',
}));

mountCrud('/shifts', makeCrud({
  table: 'shifts',
  columns: ['name', 'start_time', 'end_time', 'status'],
  searchCols: ['name', 'shift_code'], exactCols: ['status'], orderBy: 'shift_code', codeCol: 'shift_code',
  blockDeleteStatuses: ['Ho?t d?ng'],
}));

mountCrud('/employees', makeCrud({
  table: 'employees',
  columns: ['name', 'factory', 'position', 'skill_level', 'phone', 'status'],
  searchCols: ['name', 'employee_code', 'phone'], exactCols: ['factory', 'status'], codeCol: 'employee_code',
  blockDeleteStatuses: ['Ho?t d?ng'],
  blockDeleteMessage: 'Không th? xóa nhân viên dang "Ho?t d?ng" — h? có th? dang du?c phân công ? công vi?c khác. Vui lòng chuy?n tr?ng thái sang "Không ho?t d?ng" (ho?c "Ðã ngh?") tru?c, r?i m?i xóa.',
}));

module.exports = router;
