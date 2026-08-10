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

// --- INSPECTIONS ---
exports.listInspections = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT i.*, po.order_code as po_code, p.product_name, c.name as criteria_name
      FROM inspections i
      LEFT JOIN production_orders po ON i.production_order_id = po.id
      LEFT JOIN sales_order_items soi ON po.sales_order_item_id = soi.id
      LEFT JOIN products p ON soi.product_id = p.id
      LEFT JOIN inspection_criteria c ON i.criteria_id = c.id
      ORDER BY i.created_at DESC
    `);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi tải danh sách phiếu kiểm tra' });
  }
};

exports.getInspection = async (req, res) => {
  try {
    const insp = (await db.query(`
      SELECT i.*, po.order_code as po_code, p.product_name, c.name as criteria_name 
      FROM inspections i
      LEFT JOIN production_orders po ON i.production_order_id = po.id
      LEFT JOIN sales_order_items soi ON po.sales_order_item_id = soi.id
      LEFT JOIN products p ON soi.product_id = p.id
      LEFT JOIN inspection_criteria c ON i.criteria_id = c.id
      WHERE i.id = $1
    `, [req.params.id])).rows[0];
    if (!insp) return res.status(404).json({ message: 'Không tìm thấy phiếu kiểm tra' });
    
    const results = (await db.query(`
      SELECT r.*, cd.item_id, cd.min_value, cd.max_value, cd.boolean_expected, cd.is_required, it.name as item_name, it.data_type, it.unit
      FROM inspection_results r
      JOIN inspection_criteria_details cd ON r.criteria_detail_id = cd.id
      JOIN inspection_items it ON cd.item_id = it.id
      WHERE r.inspection_id = $1
    `, [insp.id])).rows;
    
    res.json({ ...insp, results });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi tải chi tiết phiếu kiểm tra' });
  }
};

exports.createInspection = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { production_order_id, criteria_id, inspector_name, note, results } = req.body;
    
    // Determine overall status
    let allPassed = true;
    for (const r of results) {
      if (!r.is_passed) allPassed = false;
    }
    const status = allPassed ? 'Đạt' : 'Không đạt';
    
    const inspection_code = 'INSP-' + Date.now().toString().slice(-6);
    
    const { rows } = await client.query(
      `INSERT INTO inspections (inspection_code, production_order_id, criteria_id, inspector_name, status, note)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [inspection_code, production_order_id, criteria_id, inspector_name, status, note]
    );
    const inspId = rows[0].id;
    
    for (const r of results) {
      await client.query(
        `INSERT INTO inspection_results (inspection_id, criteria_detail_id, result_number, result_boolean, result_text, is_passed, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [inspId, r.criteria_detail_id, r.result_number, r.result_boolean, r.result_text, r.is_passed, r.note]
      );
    }
    
    if (!allPassed) {
      const ncCode = 'NG-' + Date.now().toString().slice(-6);
      await client.query(
        `INSERT INTO non_conformities (nc_code, inspection_id, reason_category, status) VALUES ($1, $2, $3, $4)`,
        [ncCode, inspId, 'Quality Check Failed', 'Chờ xử lý']
      );
    }
    
    await client.query('COMMIT');
    res.status(201).json({ id: inspId, status });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
};

// --- NON-CONFORMITIES (NG) ---
exports.listNG = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT nc.*, i.inspection_code, po.order_code as po_code, p.product_name
      FROM non_conformities nc
      JOIN inspections i ON nc.inspection_id = i.id
      JOIN production_orders po ON i.production_order_id = po.id
      LEFT JOIN sales_order_items soi ON po.sales_order_item_id = soi.id
      LEFT JOIN products p ON soi.product_id = p.id
      ORDER BY nc.created_at DESC
    `);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi tải danh sách NG' });
  }
};

exports.updateNG = async (req, res) => {
  try {
    const { reason_details, disposition, status } = req.body;
    await db.query(
      `UPDATE non_conformities SET reason_details = $1, disposition = $2, status = $3, updated_at = now() WHERE id = $4`,
      [reason_details, disposition, status, req.params.id]
    );
    res.json({ message: 'Cập nhật NG thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi cập nhật NG' });
  }
};
