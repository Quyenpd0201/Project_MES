const express = require('express');
const router = express.Router();
const { makeCrud } = require('../../core/genericCrud');
const ctrl = require('./qualityController');

function mountCrud(path, crud) {
  router.get(`${path}`, crud.list);
  router.post(`${path}`, crud.create);
  router.post(`${path}/import`, crud.bulkCreate);
  router.get(`${path}/:id`, crud.getById);
  router.put(`${path}/:id`, crud.update);
  router.delete(`${path}/:id`, crud.remove);
}

mountCrud('/items', makeCrud({
  table: 'inspection_items',
  columns: ['name', 'data_type', 'unit', 'description', 'status'],
  searchCols: ['name', 'item_code'], exactCols: ['data_type', 'status'], codeCol: 'item_code'
}));

router.get('/criteria', ctrl.listCriteria);
router.post('/criteria', ctrl.createCriteria);
router.get('/criteria/:id', ctrl.getCriteria);
router.put('/criteria/:id', ctrl.updateCriteria);
router.delete('/criteria/:id', ctrl.deleteCriteria);

router.get('/inspections', ctrl.listInspections);
router.post('/inspections', ctrl.createInspection);
router.get('/inspections/:id', ctrl.getInspection);

router.get('/ng', ctrl.listNG);
router.put('/ng/:id', ctrl.updateNG);

module.exports = router;
