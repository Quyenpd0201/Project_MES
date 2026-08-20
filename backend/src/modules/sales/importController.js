// backend/src/modules/sales/importController.js
// POST /import/orders — Nhận file Excel, parse và nhập đơn hàng vào DB

const XLSX = require('xlsx');
const db = require('../../core/db');
const { buildSpecKey, legacyAttrs } = require('../../core/lib/specs');

function parseNum(v) {
  if (v === '' || v == null) return 0;
  return parseFloat(String(v).replace(',', '.')) || 0;
}

function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const d = XLSX.SSF.parse_date_code(serial);
  const y = d.y, m = String(d.m).padStart(2, '0'), day = String(d.d).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLengthStr(val) {
  if (!val) return '';
  val = val.trim().toLowerCase();
  if (val.includes('m')) {
    const num = parseFloat(val.replace('m', '.'));
    if (!isNaN(num)) return String(Math.round(num * 100));
  }
  return val;
}

function parseDimensions(str) {
  if (!str) return { length: '', width: '', thickness: '' };
  const parts = String(str).split('*').map(p => p.trim().toLowerCase().replace(/z$/, ''));
  if (parts.length === 2) {
    return { length: '', width: parseLengthStr(parts[0]), thickness: parts[1] };
  }
  return { 
    length: parseLengthStr(parts[0] || ''), 
    width: parseLengthStr(parts[1] || ''), 
    thickness: parts[2] || '' 
  };
}

async function findOrCreateCustomer(client, name) {
  const found = await client.query(
    `SELECT id FROM customers WHERE LOWER(name) = LOWER($1) AND is_deleted = FALSE LIMIT 1`,
    [name.trim()]
  );
  if (found.rows.length) return found.rows[0].id;
  const ins = await client.query(
    `INSERT INTO customers (name, status) VALUES ($1, 'Hoạt động') RETURNING id`,
    [name.trim()]
  );
  return ins.rows[0].id;
}

async function getDefaultProduct(client) {
  const r = await client.query(
    `SELECT id FROM products WHERE is_deleted = FALSE ORDER BY created_at ASC LIMIT 1`
  );
  if (!r.rows.length) throw new Error('Không có sản phẩm nào trong hệ thống');
  return r.rows[0].id;
}

async function importRow(client, row, idx, productId) {
  const [dateSerial, customerName, dimStr, kgPO, kgCuon, kgTui, phe, ghiChu] = row;

  const orderDate = excelDateToISO(dateSerial) || new Date().toISOString().slice(0, 10);
  const dim       = parseDimensions(dimStr);
  const qtyPO     = parseNum(kgPO);
  const qtyCuon   = parseNum(kgCuon);
  const qtyTui    = parseNum(kgTui);
  const qtyPhe    = parseNum(phe);
  const note      = ghiChu ? String(ghiChu).trim() : null;

  if (!customerName || !String(customerName).trim()) return { skipped: true, reason: 'Thiếu tên khách hàng' };
  if (qtyPO <= 0) return { skipped: true, reason: 'Số KG PO = 0' };

  const customerId = await findOrCreateCustomer(client, String(customerName));

  const specs   = {};
  if (dim.length)    specs['Chiều dài']   = dim.length;
  if (dim.width)     specs['Chiều ngang'] = dim.width;
  if (dim.thickness) specs['Độ dày']      = dim.thickness;
  const specKey = buildSpecKey(specs);
  const legacy  = legacyAttrs(specs);

  const soRes = await client.query(
    `INSERT INTO sales_orders (customer_id, order_date, status, note)
     VALUES ($1, $2, 'Hoàn thành', $3) RETURNING id`,
    [customerId, orderDate, note]
  );
  const salesOrderId = soRes.rows[0].id;

  await client.query(
    `INSERT INTO sales_order_items
       (sales_order_id, product_id, quantity, unit, specs, spec_key, attr_size, attr_thickness, attr_color)
     VALUES ($1,$2,$3,'KG',$4::jsonb,$5,$6,$7,'')`,
    [salesOrderId, productId, qtyPO, JSON.stringify(specs), specKey, legacy.size, legacy.thickness]
  );

  const poRes = await client.query(
    `INSERT INTO production_orders
       (sales_order_id, customer_id, product_id, quantity, unit,
        attr_size, attr_thickness, attr_color, status, planned_date)
     VALUES ($1,$2,$3,$4,'KG',$5,$6,'','Hoàn thành',$7) RETURNING id, order_code`,
    [salesOrderId, customerId, productId, qtyPO, legacy.size, legacy.thickness, orderDate]
  );
  const { id: poId, order_code: poCode } = poRes.rows[0];

  if (qtyCuon > 0) {
    await client.query(
      `INSERT INTO production_tasks
         (production_order_id, task_code, stage, quantity, actual_qty, scrap_qty, status, planned_date, seq)
       VALUES ($1,$2,'Thổi',$3,$3,0,'Hoàn thành',$4,1)`,
      [poId, `${poCode}-1`, qtyCuon, orderDate]
    );
  }
  if (qtyTui > 0) {
    await client.query(
      `INSERT INTO production_tasks
         (production_order_id, task_code, stage, quantity, actual_qty, scrap_qty, status, planned_date, seq)
       VALUES ($1,$2,'Cắt',$3,$3,$4,'Hoàn thành',$5,2)`,
      [poId, `${poCode}-2`, qtyTui, qtyPhe, orderDate]
    );
  }

  return {
    success: true,
    row: idx,
    customer: String(customerName).trim(),
    orderCode: poCode,
    kgPO: qtyPO,
  };
}

exports.previewOrders = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Vui lòng upload file Excel (.xlsx)' });

  let wb;
  try {
    wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  } catch {
    return res.status(400).json({ message: 'File không đúng định dạng Excel' });
  }

  let rows = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    // Bỏ qua header hoặc dòng trống
    const sheetRows = rawData.filter((r) => r[0] !== '' && r[0] !== 'Ngày đặt hàng' && r[1]);
    // Gắn thêm tên sheet vào phần tử cuối của mảng để debug nếu cần
    sheetRows.forEach(r => { r.sheetName = sheetName; });
    rows = rows.concat(sheetRows);
  }

  const client = await db.pool.connect();
  const previewData = [];

  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const [dateSerial, customerName, dimStr, kgPO, kgCuon, kgTui, phe, ghiChu] = row;
      const sheetName = row.sheetName || '';
      
      const orderDate = excelDateToISO(dateSerial) || new Date().toISOString().slice(0, 10);
      const dim       = parseDimensions(dimStr);
      const qtyPO     = parseNum(kgPO);
      const qtyCuon   = parseNum(kgCuon);
      const qtyTui    = parseNum(kgTui);
      const qtyPhe    = parseNum(phe);
      const note      = ghiChu ? String(ghiChu).trim() : null;
      const cName     = String(customerName || '').trim();

      const item = {
        _id: i + 1,
        sheetName,
        dateSerial,
        orderDate,
        customerName: cName,
        dimStr: String(dimStr || '').trim(),
        dim,
        kgPO: qtyPO,
        kgCuon: qtyCuon,
        kgTui: qtyTui,
        phe: qtyPhe,
        ghiChu: note,
        isValid: true,
        errors: [],
        warnings: []
      };

      if (!cName) {
        item.isValid = false;
        item.errors.push('Thiếu tên khách hàng');
      }
      if (qtyPO <= 0) {
        item.isValid = false;
        item.errors.push('Số KG PO phải lớn hơn 0');
      }

      // Check duplicate
      if (cName && qtyPO > 0) {
        // Find customer ID if exists
        const custRes = await client.query(`SELECT id FROM customers WHERE LOWER(name) = LOWER($1) AND is_deleted = FALSE LIMIT 1`, [cName]);
        if (custRes.rows.length > 0) {
          const cId = custRes.rows[0].id;
          // Check if order exists on the same date with the same quantity and dimensions
          const dupRes = await client.query(`
            SELECT so.id 
            FROM sales_orders so
            JOIN sales_order_items soi ON so.id = soi.sales_order_id
            WHERE so.customer_id = $1 
              AND so.order_date = $2
              AND so.is_deleted = FALSE
              AND soi.quantity = $3
              AND COALESCE(soi.attr_size, '') = COALESCE($4, '')
              AND COALESCE(soi.attr_thickness, '') = COALESCE($5, '')
            LIMIT 1
          `, [cId, orderDate, qtyPO, dim.length ? (dim.width ? `${dim.length} x ${dim.width}` : dim.length) : null, dim.thickness || null]);
          
          if (dupRes.rows.length > 0) {
            item.isValid = false;
            item.errors.push('Đơn hàng có thể đã tồn tại (trùng Khách, Ngày, SL, Kích thước)');
          }
        } else {
          item.warnings.push('Khách hàng mới (sẽ được tạo tự động)');
        }
      }

      previewData.push(item);
    }

    res.json({ preview: previewData });
  } catch (e) {
    console.error('[previewOrders]', e);
    res.status(500).json({ message: 'Lỗi parse file: ' + e.message });
  } finally {
    client.release();
  }
};

exports.confirmOrders = async (req, res) => {
  const { rows } = req.body;
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
  }

  const client = await db.pool.connect();
  const results = [];
  let successCount = 0, errorCount = 0;

  try {
    await client.query('BEGIN');
    const productId = await getDefaultProduct(client);

    for (let i = 0; i < rows.length; i++) {
      const item = rows[i];
      try {
        // Reconstruct the original row array format to pass to importRow
        const rowArray = [
          item.dateSerial,
          item.customerName,
          item.dimStr,
          item.kgPO,
          item.kgCuon,
          item.kgTui,
          item.phe,
          item.ghiChu
        ];
        
        const result = await importRow(client, rowArray, i + 1, productId);
        results.push(result);
        if (!result.skipped) successCount++;
      } catch (e) {
        errorCount++;
        results.push({ error: true, row: i + 1, message: e.message });
      }
    }

    await client.query('COMMIT');
    res.json({
      message: \`Import hoàn tất: \${successCount} thành công, \${errorCount} lỗi\`,
      summary: { success: successCount, errors: errorCount, total: rows.length },
      details: results,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[confirmOrders]', e);
    res.status(500).json({ message: 'Lỗi nghiêm trọng, đã rollback toàn bộ: ' + e.message });
  } finally {
    client.release();
  }
};
