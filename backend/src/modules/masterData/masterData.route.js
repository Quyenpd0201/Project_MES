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
  blockDeleteStatuses: ['Hoạt động'],
}));

mountCrud('/machines', makeCrud({
  table: 'machines',
  columns: ['name', 'factory', 'machine_type', 'status'],
  searchCols: ['name', 'machine_code'], exactCols: ['factory', 'status'], codeCol: 'machine_code',
  blockDeleteStatuses: ['Hoạt động', 'Bảo trì'],
  extraSelect: `,
    CASE WHEN EXISTS (
      SELECT 1 FROM production_tasks pt JOIN production_orders po ON po.id = pt.production_order_id
      WHERE po.is_deleted = FALSE AND pt.machine_id = machines.id AND pt.status = 'Đang sản xuất')
    OR EXISTS (
      SELECT 1 FROM production_orders po
      WHERE po.is_deleted = FALSE AND po.machine_id = machines.id AND po.status = 'Đang sản xuất')
    THEN 'Đang sản xuất' ELSE 'Chờ sản xuất' END AS production_status`,
}));
router.get('/machines/:id/orders', production.byMachine);

mountCrud('/warehouses', makeCrud({
  table: 'warehouses',
  columns: [
    'name', 'warehouse_type', 'status', 'purpose', 'factory', 'workshop',
    'address', 'manager', 'department', 'phone', 'description',
    'allow_inbound', 'allow_outbound', 'allow_transfer', 'allow_manufacturing',
    'require_qc', 'require_approval', 'outbound_method',
    'capacity_unit', 'max_capacity', 'capacity_warning'
  ],
  searchCols: ['name', 'warehouse_code'], exactCols: ['warehouse_type', 'status'], codeCol: 'warehouse_code',
  blockDeleteStatuses: ['Hoạt động', 'Đang kiểm đếm'],
}));

mountCrud('/zones', makeCrud({
  table: 'zones',
  columns: ['warehouse_id', 'name', 'description', 'status'],
  searchCols: ['name', 'zone_code'], exactCols: ['warehouse_id', 'status'], codeCol: 'zone_code',
  blockDeleteStatuses: ['Hoạt động'],
}));

mountCrud('/locations', makeCrud({
  table: 'locations',
  columns: ['warehouse_id', 'zone_id', 'name'],
  searchCols: ['name', 'location_code'], exactCols: ['warehouse_id', 'zone_id'], codeCol: 'location_code',
}));

mountCrud('/shifts', makeCrud({
  table: 'shifts',
  columns: ['name', 'start_time', 'end_time', 'status'],
  searchCols: ['name', 'shift_code'], exactCols: ['status'], orderBy: 'shift_code', codeCol: 'shift_code',
  blockDeleteStatuses: ['Hoạt động'],
}));

mountCrud('/employees', makeCrud({
  table: 'employees',
  columns: ['name', 'factory', 'position', 'skill_level', 'phone', 'status'],
  searchCols: ['name', 'employee_code', 'phone'], exactCols: ['factory', 'status'], codeCol: 'employee_code',
  blockDeleteStatuses: ['Hoạt động'],
  blockDeleteMessage: 'Không thể xóa nhân viên đang "Hoạt động" - họ có thể đang được phân công ở công việc khác. Vui lòng chuyển trạng thái sang "Không hoạt động" (hoặc "Đã nghỉ") trước, rồi mới xóa.',
}));

module.exports = router;
