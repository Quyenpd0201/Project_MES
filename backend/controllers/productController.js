// backend/controllers/productController.js
const db = require('../db');

/**
 * GET /api/products
 * Filter: code, name, type, area  | Pagination: page, pageSize
 */
exports.getProducts = async (req, res) => {
  try {
    const { code, name, type, area } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 10, 1), 100);
    const offset = (page - 1) * pageSize;

    const where = ['is_deleted = FALSE'];
    const params = [];
    let i = 1;

    if (code) { where.push(`product_code ILIKE $${i++}`); params.push(`%${code}%`); }
    if (name) { where.push(`product_name ILIKE $${i++}`); params.push(`%${name}%`); }
    if (type) { where.push(`product_type = $${i++}`); params.push(type); }
    if (area) { where.push(`production_area = $${i++}`); params.push(area); }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const totalRes = await db.query(`SELECT COUNT(*)::int AS total FROM products ${whereSql}`, params);
    const total = totalRes.rows[0].total;

    const dataRes = await db.query(
      `SELECT id, product_code, product_name, product_type, status, description, attributes, updated_at
       FROM products ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, pageSize, offset]
    );

    res.json({
      data: dataRes.rows,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách sản phẩm' });
  }
};

/**
 * POST /api/products  — lưu attributes (mảng) vào cột JSONB
 */
exports.createProduct = async (req, res) => {
  try {
    const {
      product_name, production_area, category, product_type, product_group,
      unit, barcode_type, tracking_type, is_pqc_required, status,
      description, attributes,
    } = req.body;

    if (!product_name || !product_type) {
      return res.status(400).json({ message: 'Thiếu Tên sản phẩm hoặc Loại sản phẩm' });
    }

    // Chuẩn hoá attributes: chỉ giữ dòng có name & value
    const attrs = Array.isArray(attributes)
      ? attributes.filter(a => a && a.name && a.value).map(a => ({ name: a.name, value: a.value }))
      : [];

    const result = await db.query(
      `INSERT INTO products
         (product_name, production_area, category, product_type, product_group,
          unit, barcode_type, tracking_type, is_pqc_required, status, description, attributes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
       RETURNING *`,
      [
        product_name, production_area || null, category || null, product_type, product_group || null,
        unit || null, barcode_type || null, tracking_type || null,
        is_pqc_required ?? false, status || 'Hoạt động', description || null,
        JSON.stringify(attrs),
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi tạo sản phẩm' });
  }
};

/**
 * PUT /api/products/:id — cập nhật sản phẩm (kèm attributes JSONB)
 */
exports.updateProduct = async (req, res) => {
  try {
    const {
      product_name, production_area, category, product_type, product_group,
      unit, barcode_type, tracking_type, is_pqc_required, status,
      description, attributes,
    } = req.body;

    if (!product_name || !product_type) {
      return res.status(400).json({ message: 'Thiếu Tên sản phẩm hoặc Loại sản phẩm' });
    }
    const attrs = Array.isArray(attributes)
      ? attributes.filter(a => a && a.name && a.value).map(a => ({ name: a.name, value: a.value }))
      : [];

    const result = await db.query(
      `UPDATE products SET
         product_name=$1, production_area=$2, category=$3, product_type=$4, product_group=$5,
         unit=$6, barcode_type=$7, tracking_type=$8, is_pqc_required=$9, status=$10,
         description=$11, attributes=$12::jsonb
       WHERE id=$13 AND is_deleted=FALSE
       RETURNING *`,
      [
        product_name, production_area || null, category || null, product_type, product_group || null,
        unit || null, barcode_type || null, tracking_type || null,
        is_pqc_required ?? false, status || 'Hoạt động', description || null,
        JSON.stringify(attrs), req.params.id,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi cập nhật sản phẩm' });
  }
};

/**
 * GET /api/products/:id — chi tiết + mock data cho tab BOM & Tồn kho
 */
exports.getProductById = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM products WHERE id = $1 AND is_deleted = FALSE`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });

    const product = rows[0];

    // ---- MOCK DATA (Tab Thông tin sản xuất & Tồn kho) ----
    const boms = [
      { bom_code: 'BOM001', product: 'Hạt nhựa HDPE', quantity: 0.85, unit: 'kg', bom_type: 'Định mức chính' },
      { bom_code: 'BOM002', product: 'Mực in', quantity: 0.02, unit: 'kg', bom_type: 'Phụ liệu' },
    ];
    const processes = [
      { step: 1, name: 'Thổi màng', workshop: 'Xưởng thổi' },
      { step: 2, name: 'Cắt & dán', workshop: 'Xưởng cắt' },
    ];
    const inventory = [
      { warehouse: 'Kho TP', current_qty: 1200, expected_qty: 1500, unit: product.unit || 'cái' },
      { warehouse: 'Kho phụ', current_qty: 300, expected_qty: 300, unit: product.unit || 'cái' },
    ];

    res.json({ ...product, boms, processes, inventory });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết sản phẩm' });
  }
};

/**
 * DELETE /api/products/:id — soft delete
 */
exports.softDeleteProduct = async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `UPDATE products SET is_deleted = TRUE WHERE id = $1 AND is_deleted = FALSE`, [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    res.json({ message: 'Đã xóa sản phẩm' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi xóa sản phẩm' });
  }
};
