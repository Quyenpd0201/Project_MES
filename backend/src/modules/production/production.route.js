const express = require('express');
const router = express.Router();
const production = require('./productionController');

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

module.exports = router;
