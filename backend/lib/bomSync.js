// backend/lib/bomSync.js
// Đồng bộ dòng NVL của 1 BOM đang gắn với Quy trình CN:
//   NVL đầu vào ở các bước (cộng dồn, bỏ BTP trung gian) = định mức NVL của BOM.
async function syncLinkedBom(client, processId) {
  if (!processId) return;
  const bom = (await client.query(`SELECT id FROM boms WHERE process_id = $1 AND is_deleted = FALSE`, [processId])).rows[0];
  if (!bom) return;
  const proc = (await client.query(`SELECT product_id FROM tech_processes WHERE id = $1 AND is_deleted = FALSE`, [processId])).rows[0];
  const steps = (await client.query(
    `SELECT inputs, output_product_id, output_quantity, output_unit FROM process_steps WHERE process_id = $1 ORDER BY seq`, [processId])).rows;

  const stepOutputs = new Set(steps.map((s) => s.output_product_id).filter(Boolean)); // BTP trung gian → bỏ
  const agg = new Map();
  for (const s of steps) {
    for (const it of (Array.isArray(s.inputs) ? s.inputs : [])) {
      if (!it.material_id || stepOutputs.has(it.material_id)) continue;
      const cur = agg.get(it.material_id) || { quantity: 0, unit: null };
      cur.quantity += Number(it.quantity) || 0;
      if (!cur.unit && it.unit) cur.unit = it.unit;
      agg.set(it.material_id, cur);
    }
  }
  const finalStep = (proc && steps.find((s) => s.output_product_id === proc.product_id)) || steps[steps.length - 1];
  const outQty = finalStep && Number(finalStep.output_quantity) > 0 ? Number(finalStep.output_quantity) : null;
  const outUnit = finalStep ? finalStep.output_unit : null;

  await client.query(
    `UPDATE boms SET output_quantity = COALESCE($1, output_quantity), output_unit = COALESCE($2, output_unit), updated_at = now() WHERE id = $3`,
    [outQty, outUnit, bom.id]);
  await client.query(`DELETE FROM bom_lines WHERE bom_id = $1`, [bom.id]);
  let n = 1;
  for (const [material_id, v] of agg) {
    await client.query(
      `INSERT INTO bom_lines (bom_id, material_id, quantity, unit, line_no) VALUES ($1,$2,$3,$4,$5)`,
      [bom.id, material_id, v.quantity || 0, v.unit, n++]);
  }
}

module.exports = { syncLinkedBom };
