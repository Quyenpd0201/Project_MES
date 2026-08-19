const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const role = require('./roleController');
const { makeCrud } = require('../../core/genericCrud');

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
  columns: ['name', 'description', 'status', 'parent_id'],
  searchCols: ['name', 'role_code'], exactCols: ['status'], codeCol: 'role_code',
  blockDeleteStatuses: ['Hoạt động'],
}));
router.put('/roles/:id/permissions', requirePerm('sys:roles:edit'), role.savePermissions);
router.get('/roles/:id/effective-permissions', role.getEffectivePermissions);

module.exports = router;
