const db = require('./db.js');
const it = { product_id: '8093d50b-46f9-4673-958b-085e828f7478', quantity: 10, unit: 'CÁI' }; // Use a real product ID if possible
const orderId = '8093d50b-46f9-4673-958b-085e828f7479'; // Fake order ID
const specs = {};
const a = { size: null, thickness: null, color: null };

async function run() {
    try {
        await db.query('BEGIN');
        const q = `INSERT INTO sales_order_items
           (sales_order_id, product_id, quantity, unit, specs, spec_key, attr_size, attr_thickness, attr_color,
            core_weight, total_weight, note, planned_start_date, planned_end_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`;
        const params = [orderId, it.product_id, it.quantity, it.unit, JSON.stringify(specs || {}), 'key',
            a.size, a.thickness, a.color, null, null, null, null, null];
        console.log('Query:', q);
        console.log('Params:', params);
        await db.query(q, params);
        console.log('Success!');
    } catch (err) {
        console.error('Error:', err.message);
        if (err.detail) console.error('Detail:', err.detail);
    } finally {
        await db.query('ROLLBACK');
        process.exit(0);
    }
}
run();