// backend/scripts/import_orders.js
// Chạy: node backend/scripts/import_orders.js
// Nhập 70 đơn hàng lịch sử từ Data_don.xlsx vào hệ thống MES

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const XLSX = require('xlsx');
const path = require('path');
const db = require('../src/core/db');
const { buildSpecKey, legacyAttrs } = require('../src/core/lib/specs');

/* ─── Helpers ─── */

/** Parse số theo kiểu VN: "219,4" → 219.4, "" → 0 */
function parseNum(v) {
  if (v === '' || v == null) return 0;
  return parseFloat(String(v).replace(',', '.')) || 0;
}

/** Excel serial date → YYYY-MM-DD */
function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const d = XLSX.SSF.parse_date_code(serial);
  const y = d.y, m = String(d.m).padStart(2, '0'), day = String(d.d).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse kích thước "50*70*5z" hoặc "80*120*0.03z"
 * → { length: "50", width: "70", thickness: "5" }
 * (bỏ ký tự z/Z cuối chuỗi độ dày)
 */
function parseDimensions(str) {
  if (!str) return { length: '', width: '', thickness: '' };
  const parts = String(str).split('*');
  const raw = (i) => (parts[i] || '').trim().replace(/z$/i, '');
  return { length: raw(0), width: raw(1), thickness: raw(2) };
}

/* ─── Tìm hoặc tạo customer ─── */
async function findOrCreateCustomer(client, name) {
  const found = await client.query(
    `SELECT id FROM customers WHERE LOWER(name) = LOWER($1) AND is_deleted = FALSE LIMIT 1`,
    [name.trim()]
  );
  if (found.rows.length) return found.rows[0].id;

  // Tạo mới
  const ins = await client.query(
    `INSERT INTO customers (name, status) VALUES ($1, 'Hoạt động') RETURNING id`,
    [name.trim()]
  );
  console.log(`  ✚ Tạo khách hàng mới: ${name}`);
  return ins.rows[0].id;
}

/* ─── Tìm sản phẩm mặc định "Túi PE" ─── */
let cachedProductId = null;
async function getDefaultProduct(client) {
  if (cachedProductId) return cachedProductId;
  const r = await client.query(
    `SELECT id FROM products WHERE is_deleted = FALSE ORDER BY created_at ASC LIMIT 1`
  );
  if (!r.rows.length) throw new Error('Không có sản phẩm nào trong hệ thống. Hãy tạo ít nhất 1 sản phẩm trước.');
  cachedProductId = r.rows[0].id;
  return cachedProductId;
}

/* ─── Import 1 dòng ─── */
async function importRow(client, row, idx) {
  const [dateSerial, customerName, dimStr, kgPO, kgCuon, kgTui, phe, ghiChu] = row;

  const orderDate = excelDateToISO(dateSerial) || new Date().toISOString().slice(0, 10);
  const dim = parseDimensions(dimStr);
  const qtyPO = parseNum(kgPO);
  const qtyCuon = parseNum(kgCuon);
  const qtyTui = parseNum(kgTui);
  const qtyPhe = parseNum(phe);
  const note = ghiChu ? String(ghiChu).trim() : null;

  if (!customerName || !String(customerName).trim()) {
    console.warn(`  ⚠ Dòng ${idx}: bỏ qua (thiếu tên khách hàng)`);
    return { skipped: true };
  }
  if (qtyPO <= 0) {
    console.warn(`  ⚠ Dòng ${idx}: bỏ qua (Số KG PO = 0)`);
    return { skipped: true };
  }

  const customerId = await findOrCreateCustomer(client, String(customerName));
  const productId  = await getDefaultProduct(client);

  // Xây specs
  const specs = {};
  if (dim.length)    specs['Chiều dài']  = dim.length;
  if (dim.width)     specs['Chiều ngang'] = dim.width;
  if (dim.thickness) specs['Độ dày']     = dim.thickness;
  const specKey = buildSpecKey(specs);
  const legacy  = legacyAttrs(specs);

  // 1. Tạo sales_order
  const soRes = await client.query(
    `INSERT INTO sales_orders (customer_id, order_date, status, note)
     VALUES ($1, $2, 'Hoàn thành', $3) RETURNING id`,
    [customerId, orderDate, note]
  );
  const salesOrderId = soRes.rows[0].id;

  // 2. Tạo sales_order_item
  const soiRes = await client.query(
    `INSERT INTO sales_order_items
       (sales_order_id, product_id, quantity, unit, specs, spec_key, attr_size, attr_thickness, attr_color)
     VALUES ($1, $2, $3, 'KG', $4::jsonb, $5, $6, $7, '') RETURNING id`,
    [salesOrderId, productId, qtyPO, JSON.stringify(specs), specKey, legacy.size, legacy.thickness]
  );
  const soiId = soiRes.rows[0].id;

  // 3. Tạo production_order
  const poRes = await client.query(
    `INSERT INTO production_orders
       (sales_order_id, customer_id, product_id, quantity, unit,
        attr_size, attr_thickness, attr_color, status, planned_date)
     VALUES ($1, $2, $3, $4, 'KG', $5, $6, '', 'Hoàn thành', $7) RETURNING id, order_code`,
    [salesOrderId, customerId, productId, qtyPO, legacy.size, legacy.thickness, orderDate]
  );
  const { id: poId, order_code: poCode } = poRes.rows[0];

  // 4a. Tạo task Thổi
  if (qtyCuon > 0) {
    await client.query(
      `INSERT INTO production_tasks
         (production_order_id, task_code, stage, quantity, actual_qty, scrap_qty, status, planned_date, seq)
       VALUES ($1, $2, 'Thổi', $3, $3, 0, 'Hoàn thành', $4, 1)`,
      [poId, `${poCode}-1`, qtyCuon, orderDate]
    );
  }

  // 4b. Tạo task Cắt
  if (qtyTui > 0) {
    await client.query(
      `INSERT INTO production_tasks
         (production_order_id, task_code, stage, quantity, actual_qty, scrap_qty, status, planned_date, seq)
       VALUES ($1, $2, 'Cắt', $3, $3, $4, 'Hoàn thành', $5, 2)`,
      [poId, `${poCode}-2`, qtyTui, qtyPhe, orderDate]
    );
  }

  return { success: true, salesOrderId, poCode };
}

/* ─── Main ─── */
async function main() {
  const filePath = path.join(__dirname, '../../Data_don.xlsx');
  console.log('📂 Đọc file:', filePath);

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const rows = rawData.filter((r) => r[0] !== '' && r[0] !== 'Ngày đặt hàng');

  console.log(`📋 Tổng số dòng dữ liệu: ${rows.length}`);

  const client = await db.pool.connect();
  let success = 0, skipped = 0, errors = 0;

  try {
    await client.query('BEGIN');

    for (let i = 0; i < rows.length; i++) {
      try {
        const result = await importRow(client, rows[i], i + 2);
        if (result.skipped) skipped++;
        else { success++; console.log(`  ✓ [${i + 2}] ${rows[i][1]} — ${result.poCode}`); }
      } catch (e) {
        errors++;
        console.error(`  ✗ [${i + 2}] ${rows[i][1]}: ${e.message}`);
      }
    }

    await client.query('COMMIT');
    console.log('\n═══════════════════════════════');
    console.log(`✅ Hoàn thành: ${success} thành công | ${skipped} bỏ qua | ${errors} lỗi`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi nghiêm trọng, đã rollback:', e.message);
  } finally {
    client.release();
    await db.pool.end();
  }
}

main().catch(console.error);
