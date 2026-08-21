require('dotenv').config({ path: '../.env' });
const db = require('../src/core/db');
const XLSX = require('xlsx');
const path = require('path');
const { buildSpecKey } = require('../src/core/lib/specs');

function parseNum(v) {
  if (v === '' || v == null) return 0;
  return parseFloat(String(v).replace(',', '.')) || 0;
}

function excelDateToISO(serial) {
  if (!serial) return null;
  if (typeof serial === 'number') {
    const d = XLSX.SSF.parse_date_code(serial);
    const y = d.y, m = String(d.m).padStart(2, '0'), day = String(d.d).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  if (typeof serial === 'string') {
    const s = serial.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const parts = s.split(/[/\\-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      let [d, m, y] = parts;
      if (y.length === 2) y = '20' + y;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return null;
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

async function findOrCreateProduct(client, productName) {
  const code = productName === 'Bao Bì' ? 'SP-BAOBI' : 'SP-CUONPE';
  const found = await client.query(
    `SELECT id FROM products WHERE is_deleted = FALSE AND LOWER(product_name) = LOWER($1) LIMIT 1`,
    [productName]
  );
  if (found.rows.length) return found.rows[0].id;
  const ins = await client.query(
    `INSERT INTO products (product_code, product_name, unit, status, product_type) VALUES ($1, $2, 'KG', 'Hoạt động', 'Thành phẩm') RETURNING id`,
    [code, productName]
  );
  return ins.rows[0].id;
}

async function main() {
  console.log('Đọc file Excel...');
  const wb = XLSX.readFile(path.resolve('e:/Project_MES/Đơn hàng(done).xlsx'));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const rows = rawData.filter((r) => r[0] !== '' && r[0] !== 'Ngày đặt hàng');

  const client = await db.pool.connect();
  let updatedCount = 0;
  let notFoundCount = 0;

  try {
    await client.query('BEGIN');
    const baoBiId = await findOrCreateProduct(client, 'Bao Bì');
    const cuonPeId = await findOrCreateProduct(client, 'CUỘN PE');

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const [dateSerial, customerName, dimStr, kgPO, kgCuon, kgTui, giaoHang, ngayGiao, phe, ghiChu] = row;
      
      const orderDate = excelDateToISO(dateSerial);
      const dim = parseDimensions(dimStr);
      const specs = {};
      if (dim.length) specs['Chiều dài'] = dim.length;
      if (dim.width) specs['Chiều ngang'] = dim.width;
      if (dim.thickness) specs['Độ dày'] = dim.thickness;
      const specKey = buildSpecKey(specs);
      
      const qtyPO = parseNum(kgPO);
      const qtyTuiNum = parseNum(kgTui);
      const cName = String(customerName || '').trim();

      if (!orderDate || !qtyPO) continue;

      const custRes = await client.query('SELECT id FROM customers WHERE name ILIKE $1 AND is_deleted = FALSE', [cName]);
      if (!custRes.rows.length) {
        notFoundCount++;
        continue;
      }
      const customerId = custRes.rows[0].id;

      const itemRes = await client.query(`
        SELECT it.id, it.sales_order_id, po.id AS production_order_id, it.spec_key
        FROM sales_order_items it
        JOIN sales_orders so ON so.id = it.sales_order_id
        LEFT JOIN production_orders po ON po.sales_order_item_id = it.id AND po.is_deleted = FALSE
        WHERE so.customer_id = $1 
          AND so.order_date = $2 
          AND so.is_deleted = FALSE
          AND (it.quantity = $3 OR ABS(it.quantity - $3) < 0.1)
      `, [customerId, orderDate, qtyPO]);

      let matchedItem = null;
      if (itemRes.rows.length === 1) {
        matchedItem = itemRes.rows[0];
      } else if (itemRes.rows.length > 1) {
        for (const r of itemRes.rows) {
          const dbKey = (r.spec_key || '').replace(/,/g, '.');
          const searchKey = specKey.replace(/,/g, '.');
          if (dbKey === searchKey) {
            matchedItem = r;
            break;
          }
        }
        if (!matchedItem) matchedItem = itemRes.rows[0];
      }

      if (!matchedItem) {
        notFoundCount++;
        continue;
      }

      const { id: sales_order_item_id, production_order_id } = matchedItem;
      const productId = qtyTuiNum > 0 ? baoBiId : cuonPeId;

      await client.query(`UPDATE sales_order_items SET product_id = $1 WHERE id = $2`, [productId, sales_order_item_id]);
      
      if (production_order_id) {
        await client.query(`UPDATE production_orders SET product_id = $1 WHERE id = $2`, [productId, production_order_id]);
      }
      updatedCount++;
    }

    await client.query('COMMIT');
    console.log(`\nHoàn tất! Đã cập nhật sản phẩm cho ${updatedCount} đơn hàng. Bỏ qua/Không tìm thấy ${notFoundCount} dòng.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Lỗi khi cập nhật:', err);
  } finally {
    client.release();
    db.pool.end();
  }
}

main();
