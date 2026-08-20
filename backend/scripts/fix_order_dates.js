// backend/scripts/fix_order_dates.js
// Sửa ngày bị hoán đổi tháng/ngày cho các đơn hàng nhập từ Excel (DH00049 - DH00118)

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../src/core/db');

async function main() {
  const client = await db.pool.connect();

  try {
    // Xem trước dữ liệu sẽ sửa
    const preview = await client.query(`
      SELECT order_code, order_date::text,
             make_date(
               EXTRACT(YEAR FROM order_date)::int,
               EXTRACT(DAY FROM order_date)::int,
               EXTRACT(MONTH FROM order_date)::int
             )::text AS corrected_date
      FROM sales_orders
      WHERE order_code >= 'DH00049' AND order_code <= 'DH00118'
        AND is_deleted = FALSE
        AND EXTRACT(DAY FROM order_date) <= 12   -- chỉ swap khi day ≤ 12 (có thể làm tháng)
        AND order_date != CURRENT_DATE            -- bỏ qua đơn có ngày = hôm nay (không cần swap)
      ORDER BY order_code
    `);

    console.log(`Sẽ sửa ${preview.rows.length} đơn hàng:`);
    preview.rows.forEach(r => console.log(`  ${r.order_code}: ${r.order_date} → ${r.corrected_date}`));

    if (!preview.rows.length) {
      console.log('Không có gì để sửa.');
      return;
    }

    await client.query('BEGIN');

    // 1. Sửa sales_orders
    const soRes = await client.query(`
      UPDATE sales_orders
      SET order_date = make_date(
        EXTRACT(YEAR FROM order_date)::int,
        EXTRACT(DAY FROM order_date)::int,
        EXTRACT(MONTH FROM order_date)::int
      )
      WHERE order_code >= 'DH00049' AND order_code <= 'DH00118'
        AND is_deleted = FALSE
        AND EXTRACT(DAY FROM order_date) <= 12
        AND order_date != CURRENT_DATE
    `);
    console.log(`\n✓ Đã sửa ${soRes.rowCount} đơn hàng bán (sales_orders)`);

    // 2. Sửa production_orders (planned_date)
    const poRes = await client.query(`
      UPDATE production_orders
      SET planned_date = make_date(
        EXTRACT(YEAR FROM planned_date)::int,
        EXTRACT(DAY FROM planned_date)::int,
        EXTRACT(MONTH FROM planned_date)::int
      )
      WHERE order_code >= 'LSX00049' AND order_code <= 'LSX00118'
        AND is_deleted = FALSE
        AND planned_date IS NOT NULL
        AND EXTRACT(DAY FROM planned_date) <= 12
        AND planned_date != CURRENT_DATE
    `);
    console.log(`✓ Đã sửa ${poRes.rowCount} lệnh sản xuất (production_orders)`);

    // 3. Sửa production_tasks (planned_date)
    const ptRes = await client.query(`
      UPDATE production_tasks
      SET planned_date = make_date(
        EXTRACT(YEAR FROM planned_date)::int,
        EXTRACT(DAY FROM planned_date)::int,
        EXTRACT(MONTH FROM planned_date)::int
      )
      WHERE task_code >= 'LSX00049-1' AND task_code <= 'LSX00118-2'
        AND planned_date IS NOT NULL
        AND EXTRACT(DAY FROM planned_date) <= 12
        AND planned_date != CURRENT_DATE
    `);
    console.log(`✓ Đã sửa ${ptRes.rowCount} task sản xuất (production_tasks)`);

    await client.query('COMMIT');
    console.log('\n✅ Hoàn thành! Tất cả ngày đặt hàng đã được sửa lại đúng.');

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi, đã rollback:', e.message);
  } finally {
    client.release();
    await db.pool.end();
  }
}

main().catch(console.error);
