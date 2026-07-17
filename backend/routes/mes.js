// backend/routes/mes.js — gom toàn bộ route của các phân hệ mở rộng
const express = require('express');
const router = express.Router();
const { makeCrud } = require('../controllers/genericCrud');
const production = require('../controllers/productionController');
const planning = require('../controllers/planningController');
const inventory = require('../controllers/inventoryController');
const bom = require('../controllers/bomController');
const salesOrders = require('../controllers/salesOrderController');
const techProcess = require('../controllers/processController');
const dashboard = require('../controllers/dashboardController');
const workSchedule = require('../controllers/workScheduleController');
const role = require('../controllers/roleController');
const auth = require('../controllers/authController');
const user = require('../controllers/userController');
const lookups = require('../controllers/lookupController');
const deliveries = require('../controllers/deliveryController');
const requireAuth = require('../middleware/requireAuth');

// ---- Đăng nhập (public — không cần token) ----
router.post('/auth/login', auth.login);
router.get('/auth/me', auth.me);
router.post('/auth/logout', auth.logout);

// ========================================================
// Toàn bộ route bên dưới yêu cầu xác thực hợp lệ
// ========================================================
router.use(requireAuth);

// Helper gắn 5 route CRUD chuẩn
function mountCrud(path, crud) {
  router.get(`${path}`, crud.list);
  router.post(`${path}`, crud.create);
  router.post(`${path}/import`, crud.bulkCreate);
  router.get(`${path}/:id`, crud.getById);
  router.put(`${path}/:id`, crud.update);
  router.delete(`${path}/:id`, crud.remove);
}



// ---- Master data ----
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
  // Trạng thái sản xuất suy ra động: gắn với lệnh SX đang chạy → "Đang sản xuất", ngược lại "Chờ sản xuất"
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
  columns: ['name', 'warehouse_type', 'status'],
  searchCols: ['name', 'warehouse_code'], exactCols: ['warehouse_type', 'status'], codeCol: 'warehouse_code',
  blockDeleteStatuses: ['Hoạt động', 'Đang kiểm đếm'],
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
  blockDeleteStatuses: ['Hoạt động'],
}));

mountCrud('/employees', makeCrud({
  table: 'employees',
  columns: ['name', 'factory', 'position', 'skill_level', 'phone', 'status'],
  searchCols: ['name', 'employee_code', 'phone'], exactCols: ['factory', 'status'], codeCol: 'employee_code',
  blockDeleteStatuses: ['Hoạt động'],
  blockDeleteMessage: 'Không thể xóa nhân viên đang "Hoạt động" — họ có thể đang được phân công ở công việc khác. Vui lòng chuyển trạng thái sang "Không hoạt động" (hoặc "Đã nghỉ") trước, rồi mới xóa.',
}));

mountCrud('/roles', makeCrud({
  table: 'roles',
  columns: ['name', 'description', 'status'],
  searchCols: ['name', 'role_code'], exactCols: ['status'], codeCol: 'role_code',
  blockDeleteStatuses: ['Hoạt động'],
}));
router.put('/roles/:id/permissions', role.savePermissions);

// ---- Tài khoản người dùng ----
router.get('/users', user.list);
router.post('/users', user.create);
router.get('/users/:id', user.getById);
router.put('/users/:id', user.update);
router.delete('/users/:id', user.remove);


// ---- Lịch làm việc ----
router.get('/work-schedules', workSchedule.list);
router.put('/work-schedules', workSchedule.upsert);

// ---- Đơn hàng (header + dòng hàng) ----
router.get('/customers/:id/orders', salesOrders.byCustomer);
router.get('/sales-orders', salesOrders.list);
router.post('/sales-orders', salesOrders.create);
router.get('/sales-orders/:id', salesOrders.getById);
router.put('/sales-orders/:id', salesOrders.update);
router.delete('/sales-orders/:id', salesOrders.remove);

// ---- Phiếu giao hàng & thanh toán ----
router.get('/deliveries', deliveries.list);
router.post('/deliveries', deliveries.create);
router.get('/deliveries/from-order/:orderId', deliveries.fromOrder);
router.get('/deliveries/:id', deliveries.getById);
router.put('/deliveries/:id', deliveries.update);
router.delete('/deliveries/:id', deliveries.remove);

// ---- Sản xuất ----
router.get('/production-orders', production.list);
router.post('/production-orders', production.create);
router.get('/production-orders/:id', production.getById);
router.put('/production-orders/:id', production.update);
router.put('/production-orders/:id/schedule', production.schedule);
router.put('/production-orders/:id/reschedule', production.reschedule);
router.get('/production/gantt', production.gantt);
router.get('/production/machine-availability', production.machineAvailability);
router.get('/production/execution', production.executionTasks);
router.get('/production/task-by-code/:code', production.getTaskByCode);
router.put('/production/tasks/:taskId', production.updateTask);
router.get('/production-orders/:id/tasks', production.getTasks);
router.put('/production-orders/:id/tasks', production.saveTasks);
router.get('/production-orders/:id/materials', production.getMaterials);
router.post('/production-orders/:id/materials', production.saveMaterials);
router.delete('/production-orders/:id', production.remove);

// ---- Quy trình công nghệ ----
router.get('/processes', techProcess.list);
router.post('/processes', techProcess.create);
router.get('/processes/:id', techProcess.getById);
router.put('/processes/:id', techProcess.update);
router.delete('/processes/:id', techProcess.remove);

// ---- Định mức (BOM) ----
router.get('/boms', bom.list);
router.post('/boms', bom.create);
router.get('/boms/:id', bom.getById);
router.put('/boms/:id', bom.update);
router.delete('/boms/:id', bom.remove);

// ---- Kế hoạch ----
router.get('/planning/from-orders', planning.fromOrders);
router.post('/planning/generate', planning.generate);
router.get('/planning/groups', planning.groups);
router.get('/planning/material-requirements', planning.materialRequirements);

// ---- Kho ----
router.get('/inventory', inventory.list);
router.get('/inventory/tree', inventory.tree);
router.get('/inventory/detail', inventory.stockDetail);
router.get('/inventory/transactions', inventory.transactions);
router.post('/inventory/adjust', inventory.adjust);
router.post('/inventory/stock', inventory.addStockLine);
router.delete('/inventory/stock/:id', inventory.deleteStockLine);

// ---- Dashboard ----
router.get('/dashboard', dashboard.summary);

// ---- Lookups ----
router.get('/lookups', lookups.all);
router.get('/next-code/:entity', lookups.nextCode);

module.exports = router;
