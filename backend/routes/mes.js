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
  searchCols: ['name', 'customer_code', 'phone'], exactCols: ['customer_type', 'status'],
}));

mountCrud('/machines', makeCrud({
  table: 'machines',
  columns: ['name', 'factory', 'machine_type', 'status'],
  searchCols: ['name', 'machine_code'], exactCols: ['factory', 'status'],
}));

mountCrud('/warehouses', makeCrud({
  table: 'warehouses',
  columns: ['name', 'warehouse_type'],
  searchCols: ['name', 'warehouse_code'], exactCols: ['warehouse_type'],
}));

mountCrud('/locations', makeCrud({
  table: 'locations',
  columns: ['warehouse_id', 'name'],
  searchCols: ['name', 'location_code'], exactCols: ['warehouse_id'],
}));

mountCrud('/shifts', makeCrud({
  table: 'shifts',
  columns: ['name', 'start_time', 'end_time', 'status'],
  searchCols: ['name', 'shift_code'], exactCols: ['status'], orderBy: 'shift_code',
}));

mountCrud('/employees', makeCrud({
  table: 'employees',
  columns: ['name', 'factory', 'position', 'skill_level', 'phone', 'status'],
  searchCols: ['name', 'employee_code', 'phone'], exactCols: ['factory', 'status'],
}));

mountCrud('/roles', makeCrud({
  table: 'roles',
  columns: ['name', 'description', 'status'],
  searchCols: ['name', 'role_code'], exactCols: ['status'],
}));
router.put('/roles/:id/permissions', role.savePermissions);

// ---- Đăng nhập / Tài khoản ----
router.post('/auth/login', auth.login);
router.get('/auth/me', auth.me);
router.post('/auth/logout', auth.logout);
router.get('/users', user.list);
router.post('/users', user.create);
router.get('/users/:id', user.getById);
router.put('/users/:id', user.update);
router.delete('/users/:id', user.remove);

// ---- Lịch làm việc ----
router.get('/work-schedules', workSchedule.list);
router.put('/work-schedules', workSchedule.upsert);

// ---- Đơn hàng (header + dòng hàng) ----
router.get('/sales-orders', salesOrders.list);
router.post('/sales-orders', salesOrders.create);
router.get('/sales-orders/:id', salesOrders.getById);
router.put('/sales-orders/:id', salesOrders.update);
router.delete('/sales-orders/:id', salesOrders.remove);

// ---- Sản xuất ----
router.get('/production-orders', production.list);
router.post('/production-orders', production.create);
router.get('/production-orders/:id', production.getById);
router.put('/production-orders/:id', production.update);
router.put('/production-orders/:id/schedule', production.schedule);
router.get('/production/gantt', production.gantt);
router.get('/production/task-by-code/:code', production.getTaskByCode);
router.put('/production/tasks/:taskId', production.updateTask);
router.get('/production-orders/:id/tasks', production.getTasks);
router.put('/production-orders/:id/tasks', production.saveTasks);
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
router.get('/inventory/transactions', inventory.transactions);
router.post('/inventory/adjust', inventory.adjust);

// ---- Dashboard ----
router.get('/dashboard', dashboard.summary);

// ---- Lookups ----
router.get('/lookups', lookups.all);

module.exports = router;
