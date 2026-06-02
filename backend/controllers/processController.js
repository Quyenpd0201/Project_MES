// backend/controllers/processController.js — Quy trình công nghệ + các bước
const db = require('../db');

exports.list = async (req, res) => {
  try {
    const where = ['pr.is_deleted = FALSE']; const params = []; let i = 1;
    const { q, product_id } = req.query;
    if (product_id) { where.push(`pr.product_id = $${i++}`); params.push(product_id); }
    if (q) { where.push(`(pr.process_code ILIKE $${i} OR pr.name ILIKE $${i})`); params.push(`%${q}%`); i++; }
    const { rows } = await db.query(`
      SELECT pr.*, p.product_name,
             (SELECT COUNT(*)::int FROM process_steps s WHERE s.process_id = pr.id) AS step_count
      FROM tech_processes pr LEFT JOIN products p ON p.id = pr.product_id
      WHERE ${where.join(' AND ')} ORDER BY pr.created_at DESC`, params);
    res.json({ data: rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy quy trình' }); }
};

exports.getById = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT pr.*, p.product_name FROM tech_processes pr LEFT JOIN products p ON p.id = pr.product_id
      WHERE pr.id = $1 AND pr.is_deleted = FALSE`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy quy trình' });
    const steps = await db.query(`
      SELECT s.*, pin.product_name AS input_name, pout.product_name AS output_name
      FROM process_steps s
      LEFT JOIN products pin ON pin.id = s.input_product_id
      LEFT JOIN products pout ON pout.id = s.output_product_id
      WHERE s.process_id = $1 ORDER BY s.seq`, [req.params.id]);
    res.json({ ...rows[0], steps: steps.rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy chi tiết quy trình' }); }
};

async function saveSteps(client, processId, steps) {
  await client.query('DELETE FROM process_steps WHERE process_id = $1', [processId]);
  let n = 1;
  for (const s of (Array.isArray(steps) ? steps : []).filter((x) => x && x.name)) {
    await client.query(`
      INSERT INTO process_steps (process_id, seq, name, machine_type, input_product_id, output_product_id, yield_percent, scrap_percent, note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [processId, n++, s.name, s.machine_type || null, s.input_product_id || null, s.output_product_id || null,
       s.yield_percent === '' || s.yield_percent == null ? null : s.yield_percent,
       s.scrap_percent === '' || s.scrap_percent == null ? null : s.scrap_percent, s.note || null]);
  }
}

exports.create = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const b = req.body;
    if (!b.name) return res.status(400).json({ message: 'Thiếu tên quy trình' });
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO tech_processes (name, product_id, status, note) VALUES ($1,$2,$3,$4) RETURNING *`,
      [b.name, b.product_id || null, b.status || 'Hoạt động', b.note || null]);
    await saveSteps(client, rows[0].id, b.steps);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi tạo quy trình' }); }
  finally { client.release(); }
};

exports.update = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const b = req.body;
    await client.query('BEGIN');
    const fields = ['name', 'product_id', 'status', 'note'];
    const cols = [], vals = []; let i = 1;
    for (const f of fields) if (b[f] !== undefined) { cols.push(`${f} = $${i++}`); vals.push(b[f] === '' ? null : b[f]); }
    if (cols.length) {
      const r = await client.query(`UPDATE tech_processes SET ${cols.join(', ')} WHERE id = $${i} AND is_deleted = FALSE RETURNING id`, [...vals, req.params.id]);
      if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Không tìm thấy quy trình' }); }
    }
    if (b.steps !== undefined) await saveSteps(client, req.params.id, b.steps);
    await client.query('COMMIT');
    res.json({ message: 'Đã cập nhật quy trình' });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi cập nhật' }); }
  finally { client.release(); }
};

exports.remove = async (req, res) => {
  try {
    const { rowCount } = await db.query(`UPDATE tech_processes SET is_deleted = TRUE WHERE id = $1 AND is_deleted = FALSE`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Không tìm thấy quy trình' });
    res.json({ message: 'Đã xóa quy trình' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi xóa' }); }
};
