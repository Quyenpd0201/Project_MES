const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const production = require('./productionController');

router.get('/production-orders', production.list);
router.post('/production-orders', requirePerm('production:edit'), production.create);
router.get('/production-orders/:id', production.getById);
router.put('/production-orders/:id', requirePerm('production:edit'), production.update);
router.put('/production-orders/:id/schedule', requirePerm('production:edit'), production.schedule);
router.put('/production-orders/:id/reschedule', requirePerm('production:edit'), production.reschedule);
router.get('/production/gantt', production.gantt);
router.get('/production/machine-availability', production.machineAvailability);
router.get('/production/execution', production.executionTasks);
router.get('/production/task-by-code/:code', production.getTaskByCode);
router.put('/production/tasks/:taskId', requirePerm('production:edit'), production.updateTask);
router.get('/production-orders/:id/tasks', production.getTasks);
router.put('/production-orders/:id/tasks', requirePerm('production:edit'), production.saveTasks);
router.get('/production-orders/:id/materials', production.getMaterials);
router.post('/production-orders/:id/materials', requirePerm('production:edit'), production.saveMaterials);
router.delete('/production-orders/:id', requirePerm('production:edit'), production.remove);

module.exports = router;
