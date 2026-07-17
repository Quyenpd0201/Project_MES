const express = require('express');
const router = express.Router();
const role = require('../controllers/roleController');
const { makeCrud } = require('../controllers/genericCrud');

function mountCrud(path, crud) {
  router.get(`${path}`, crud.list);
  router.post(`${path}`, crud.create);
  router.post(`${path}/import`, crud.bulkCreate);
  router.get(`${path}/:id`, crud.getById);
  router.put(`${path}/:id`, crud.update);
  router.delete(`${path}/:id`, crud.remove);
}

mountCrud('/roles', makeCrud({
  table: 'roles',
  columns: ['name', 'description', 'status'],
  searchCols: ['name', 'role_code'], exactCols: ['status'], codeCol: 'role_code',
  blockDeleteStatuses: ['Hoạt động'],
}));
router.put('/roles/:id/permissions', role.savePermissions);

module.exports = router;
