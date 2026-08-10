const db = require('../../core/db');

exports.listCriteria = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT c.*, p.product_name, p.product_code 
      FROM inspection_criteria c 
      LEFT JOIN products p ON c.target_product_id = p.id
      WHERE c.is_deleted = FALSE
      ORDER BY c.created_at DESC
    `);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi tải bộ tiêu chí' });
  }
};

exports.getCriteria = async (req, res) => {
  try {
    const criteria = (await db.query(`SELECT * FROM inspection_criteria WHERE id = $1`, [req.params.id])).rows[0];
    if (!criteria) return res.status(404).json({ message: 'Không tìm thấy' });
    const details = (await db.query(`
      SELECT d.*, i.name as item_name, i.data_type, i.unit 
      FROM inspection_criteria_details d 
      JOIN inspection_items i ON d.item_id = i.id
      WHERE d.criteria_id = $1
      ORDER BY d.created_at ASC
    `, [criteria.id])).rows;
    res.json({ ...criteria, details });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi tải chi tiết bộ tiêu chí' });
  }
};

exports.createCriteria = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { criteria_code, name, target_product_id, target_operation, description, status, details } = req.body;
    const { rows } = await client.query(
      `INSERT INTO inspection_criteria (criteria_code, name, target_product_id, target_operation, description, status) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [criteria_code || ('QC-' + Date.now().toString().slice(-6)), name, target_product_id || null, target_operation, description, status || 'Hoạt động']
    );
    const criteriaId = rows[0].id;
    if (details && details.length) {
      for (const d of details) {
        await client.query(
          `INSERT INTO inspection_criteria_details (criteria_id, item_id, is_required, target_value, min_value, max_value, boolean_expected) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [criteriaId, d.item_id, d.is_required !== false, d.target_value, d.min_value, d.max_value, d.boolean_expected]
        );
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ id: criteriaId });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
};

exports.updateCriteria = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { criteria_code, name, target_product_id, target_operation, description, status, details } = req.body;
    await client.query(
      `UPDATE inspection_criteria SET criteria_code=$1, name=$2, target_product_id=$3, target_operation=$4, description=$5, status=$6, updated_at=now() 
       WHERE id=$7`,
      [criteria_code, name, target_product_id || null, target_operation, description, status, req.params.id]
    );
    await client.query(`DELETE FROM inspection_criteria_details WHERE criteria_id = $1`, [req.params.id]);
    if (details && details.length) {
      for (const d of details) {
        await client.query(
          `INSERT INTO inspection_criteria_details (criteria_id, item_id, is_required, target_value, min_value, max_value, boolean_expected) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [req.params.id, d.item_id, d.is_required !== false, d.target_value, d.min_value, d.max_value, d.boolean_expected]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ message: 'Cập nhật thành công' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
};

exports.deleteCriteria = async (req, res) => {
  try {
    await db.query(`UPDATE inspection_criteria SET is_deleted = TRUE, updated_at = now() WHERE id = $1`, [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ message: 'Lỗi xóa bộ tiêu chí' });
  }
};
