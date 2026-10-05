const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'backend/src/modules/production/planningController.js');
let src = fs.readFileSync(file, 'utf8');

// Find and replace the generate export function
const oldBlock = `exports.generate = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { items: planItems, item_ids, machine_id, planned_date, shift, assigned_team, assigned_worker } = req.body;
    // Phân bổ theo từng công đoạn: [{stage, name, machine_id, shift, assigned_team, assigned_worker}]
    const stages = Array.isArray(req.body.stages) ? req.body.stages.filter((s) => s && s.stage) : [];
    // Hỗ trợ cả 2 dạng: items[{item_id, qty}] (lập một phần) hoặc item_ids[] (lập hết phần còn lại)
    const list = Array.isArray(planItems) && planItems.length
      ? planItems
      : (Array.isArray(item_ids) ? item_ids.map((id) => ({ item_id: id })) : []);
    if (!list.length) return res.status(400).json({ message: 'Chưa chọn dòng nhu cầu để tạo lệnh' });
    const ids = list.map((x) => x.item_id);
    const qtyById = Object.fromEntries(list.map((x) => [x.item_id, x.qty]));

    await client.query('BEGIN');
    const items = (await client.query(\`
      SELECT it.*, so.customer_id, so.due_date, so.id AS so_id, so.priority
      FROM sales_order_items it JOIN sales_orders so ON so.id = it.sales_order_id
      WHERE it.id = ANY($1::uuid[])\`, [ids])).rows;

    // Máy/trạng thái cấp lệnh: nếu phân bổ theo công đoạn thì lấy máy của công đoạn đầu để hiển thị
    const headMachine = machine_id || (stages[0] && stages[0].machine_id) || null;
    const status = (headMachine || stages.length) ? 'Đã lên kế hoạch' : 'Chờ duyệt';
    const created = [];
    for (const it of items) {
      const remaining = Number(it.quantity) - Number(it.planned_qty || 0);
      let q = qtyById[it.id];
      q = (q === undefined || q === null || q === '') ? remaining : Number(q);
      if (!(q > 0)) continue;                 // bỏ qua dòng không nhập SL
      if (q > remaining) q = remaining;       // không vượt quá số còn lại
      const gk = [it.product_id, it.spec_key || ''].join('||');
      const r = await client.query(\`
        INSERT INTO production_orders
          (sales_order_id, sales_order_item_id, customer_id, product_id, quantity, unit,
           specs, spec_key, attr_size, attr_thickness, attr_color, machine_id, planned_date, shift, assigned_team, group_key, due_date, status, assigned_worker, material_type, mix_ratio, priority, note)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22,$23) RETURNING id, order_code\`,
        [it.so_id, it.id, it.customer_id, it.product_id, q, it.unit,
         JSON.stringify(it.specs || {}), it.spec_key || '',
         it.attr_size, it.attr_thickness, it.attr_color, headMachine, planned_date || null,
         shift || null, assigned_team || null, gk, it.due_date, status, assigned_worker || null, it.material_type || null, JSON.stringify(it.mix_ratio || []), it.priority || 'Trung bình', it.note || null]);
      const po = r.rows[0];
      created.push(po.order_code);
      // Tạo sẵn công đoạn (production_tasks) theo phân bổ từng công đoạn — mỗi công đoạn làm đủ SL (nối tiếp)
      let n = 1;
      for (const s of stages) {
        await client.query(\`
          INSERT INTO production_tasks
            (production_order_id, task_code, stage, quantity, machine_id, shift, planned_date, planned_end_date, assigned_team, assigned_worker, status, seq, note)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)\`,
          [po.id, \`\${po.order_code}-\${n}\`, s.stage, q, s.machine_id || null, s.shift || null,
           planned_date || null, planned_date || null, s.assigned_team || null, s.assigned_worker || null,
           'Chờ', n, s.name || null]);
        n++;
      }
      const newPlanned = Number(it.planned_qty || 0) + q;
      await client.query(
        \`UPDATE sales_order_items SET planned_qty = $1, is_planned = ($1 >= quantity) WHERE id = $2\`,
        [newPlanned, it.id]);
    }

    const soIds = Array.from(new Set(items.map(it => it.so_id)));
    if (soIds.length > 0) {
      await client.query(\`UPDATE sales_orders SET status = 'Đang sản xuất' WHERE id = ANY($1::uuid[]) AND status = 'Mới'\`, [soIds]);
    }

    await client.query('COMMIT');
    res.status(201).json({ created });
  } catch (err) {
    await client.query('ROLLBACK'); console.error(err);
    res.status(500).json({ message: err.detail || 'Lỗi khi sinh lệnh sản xuất từ kế hoạch' });
  } finally { client.release(); }
};`;

const newBlock = `exports.generate = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { items: planItems, item_ids, machine_id, planned_date, shift, assigned_team, assigned_worker } = req.body;
    // Phân bổ theo từng công đoạn: [{stage, name, machine_id, shift, assigned_team, assigned_worker}]
    const stages = Array.isArray(req.body.stages) ? req.body.stages.filter((s) => s && s.stage) : [];
    // Hỗ trợ cả 2 dạng: items[{item_id, qty}] (lập một phần) hoặc item_ids[] (lập hết phần còn lại)
    const list = Array.isArray(planItems) && planItems.length
      ? planItems
      : (Array.isArray(item_ids) ? item_ids.map((id) => ({ item_id: id })) : []);
    if (!list.length) return res.status(400).json({ message: 'Chưa chọn dòng nhu cầu để tạo lệnh' });
    const ids = list.map((x) => x.item_id);
    const qtyById = Object.fromEntries(list.map((x) => [x.item_id, x.qty]));

    await client.query('BEGIN');
    const items = (await client.query(\`
      SELECT it.*, so.customer_id, so.due_date, so.id AS so_id, so.priority
      FROM sales_order_items it JOIN sales_orders so ON so.id = it.sales_order_id
      WHERE it.id = ANY($1::uuid[])\`, [ids])).rows;

    // Máy/trạng thái cấp lệnh: nếu phân bổ theo công đoạn thì lấy máy của công đoạn đầu để hiển thị
    const headMachine = machine_id || (stages[0] && stages[0].machine_id) || null;
    const status = (headMachine || stages.length) ? 'Đã lên kế hoạch' : 'Chờ duyệt';

    // Cache quy trình theo product_id để tránh query nhiều lần khi tạo nhiều lệnh
    const processCache = {};
    const getProcessStages = async (productId) => {
      if (processCache[productId] !== undefined) return processCache[productId];
      try {
        const procs = (await client.query(
          'SELECT id FROM processes WHERE product_id = $1 AND is_deleted = FALSE ORDER BY created_at DESC LIMIT 1',
          [productId])).rows;
        if (!procs.length) { processCache[productId] = []; return []; }
        // Thử process_steps trước, fallback về process_operations
        let steps = (await client.query(
          'SELECT name, workshop, machine_type FROM process_steps WHERE process_id = $1 ORDER BY step_order, seq',
          [procs[0].id])).rows;
        if (!steps.length) {
          steps = (await client.query(
            'SELECT name, workshop, machine_type FROM process_operations WHERE process_id = $1 ORDER BY seq',
            [procs[0].id])).rows;
        }
        const mapStage = (s) => /c[\\u1eaft\\u1eb3a]t/i.test(\`\${s.name || ''} \${s.workshop || ''} \${s.machine_type || ''}\`) ? 'Cắt' : 'Thổi';
        processCache[productId] = steps.map((s) => ({
          stage: mapStage(s),
          name: s.name || mapStage(s),
          assigned_team: s.workshop || (mapStage(s) === 'Cắt' ? 'Nhà máy cắt' : 'Nhà máy thổi'),
          machine_id: null, shift: null, assigned_worker: null,
        }));
      } catch (e) { console.warn('getProcessStages error:', e.message); processCache[productId] = []; }
      return processCache[productId];
    };

    const created = [];
    for (const it of items) {
      const remaining = Number(it.quantity) - Number(it.planned_qty || 0);
      let q = qtyById[it.id];
      q = (q === undefined || q === null || q === '') ? remaining : Number(q);
      if (!(q > 0)) continue;                 // bỏ qua dòng không nhập SL
      if (q > remaining) q = remaining;       // không vượt quá số còn lại
      const gk = [it.product_id, it.spec_key || ''].join('||');
      const r = await client.query(\`
        INSERT INTO production_orders
          (sales_order_id, sales_order_item_id, customer_id, product_id, quantity, unit,
           specs, spec_key, attr_size, attr_thickness, attr_color, machine_id, planned_date, shift, assigned_team, group_key, due_date, status, assigned_worker, material_type, mix_ratio, priority, note)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22,$23) RETURNING id, order_code\`,
        [it.so_id, it.id, it.customer_id, it.product_id, q, it.unit,
         JSON.stringify(it.specs || {}), it.spec_key || '',
         it.attr_size, it.attr_thickness, it.attr_color, headMachine, planned_date || null,
         shift || null, assigned_team || null, gk, it.due_date, status, assigned_worker || null, it.material_type || null, JSON.stringify(it.mix_ratio || []), it.priority || 'Trung bình', it.note || null]);
      const po = r.rows[0];
      created.push(po.order_code);

      // Tạo sẵn công đoạn (production_tasks) theo phân bổ từng công đoạn — mỗi công đoạn làm đủ SL (nối tiếp)
      // Nếu không truyền stages từ frontend → tự tìm quy trình sản phẩm để tạo tasks
      const effectiveStages = stages.length > 0 ? stages : await getProcessStages(it.product_id);
      let n = 1;
      for (const s of effectiveStages) {
        await client.query(\`
          INSERT INTO production_tasks
            (production_order_id, task_code, stage, quantity, machine_id, shift, planned_date, planned_end_date, assigned_team, assigned_worker, status, seq, note)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)\`,
          [po.id, \`\${po.order_code}-\${n}\`, s.stage, q, s.machine_id || null, s.shift || null,
           planned_date || null, planned_date || null, s.assigned_team || null, s.assigned_worker || null,
           'Chờ', n, s.name || null]);
        n++;
      }
      const newPlanned = Number(it.planned_qty || 0) + q;
      await client.query(
        \`UPDATE sales_order_items SET planned_qty = $1, is_planned = ($1 >= quantity) WHERE id = $2\`,
        [newPlanned, it.id]);
    }

    const soIds = Array.from(new Set(items.map(it => it.so_id)));
    if (soIds.length > 0) {
      await client.query(\`UPDATE sales_orders SET status = 'Đang sản xuất' WHERE id = ANY($1::uuid[]) AND status = 'Mới'\`, [soIds]);
    }

    await client.query('COMMIT');
    res.status(201).json({ created });
  } catch (err) {
    await client.query('ROLLBACK'); console.error(err);
    res.status(500).json({ message: err.detail || 'Lỗi khi sinh lệnh sản xuất từ kế hoạch' });
  } finally { client.release(); }
};`;

// Normalize CRLF to LF for comparison
const srcNorm = src.replace(/\r\n/g, '\n');
const oldNorm = oldBlock.replace(/\r\n/g, '\n');

if (!srcNorm.includes(oldNorm)) {
  console.error('❌ Could not find target block in file. Checking content around line 126...');
  const lines = srcNorm.split('\n');
  const start = 120;
  const end = Math.min(start + 80, lines.length);
  for (let i = start; i < end; i++) {
    console.log(`${i+1}: ${lines[i]}`);
  }
  process.exit(1);
}

const result = srcNorm.replace(oldNorm, newBlock.replace(/\r\n/g, '\n'));
fs.writeFileSync(file, result.replace(/\n/g, '\r\n'), 'utf8');
console.log('✅ planningController.js updated successfully');
process.exit(0);
