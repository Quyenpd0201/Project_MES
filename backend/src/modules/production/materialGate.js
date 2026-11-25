// Cổng NVL cho lệnh sản xuất "xuất NVL ngay khi yêu cầu" (plan 2026-11-25-nvl-xuat-ngay-lsx).
// NGUỒN DUY NHẤT của các quy tắc QT1–QT5 — mọi cửa vào gọi các hàm ở đây, không viết lại điều kiện tại chỗ.
// Lệnh cũ (nvl_strict = FALSE) luôn thoát sớm → hành vi như trước.

const { orderSources } = require('../../core/lib/materialReturns');

const { producedFromTasks } = require('../../core/lib/finalStage');
const { getAppSettings } = require('../../core/lib/settings');

const EPS = 0.001;

/** Lệnh theo luồng mới (cờ đặt khi tạo lệnh). */
function isNewFlow(order) {
  return !!(order && order.nvl_strict === true);
}

/** Câu QT3 (backend trả đúng câu này cho web + mobile). */
function gateMessage(orderCode) {
  return `Lệnh ${orderCode} chưa xuất NVL nên chưa ghi nhận sản lượng được. `
    + "Vào mục 'Nguyên vật liệu cần cung cấp' → nhập NVL → bấm 'Yêu cầu NVL'. "
    + "Xuất NVL xong lệnh sẽ chuyển sang 'Đang sản xuất' và bạn ghi nhận tiếp.";
}

/**
 * QT4 (thuần): mỗi NVL — Tiêu hao = (SL yêu cầu ban đầu ÷ SL lệnh) × SL đã SX; Còn lại = đã xuất − đã trả − tiêu hao.
 * Còn lại âm (vượt quá EPS) → hiện 0 + over = true. SL lệnh 0 / không có NVL → null (UI hiện "—").
 * @returns {null | Array<{product_id, consumed, remaining, over}>}
 */
function computeConsumption(order, perMaterial, producedQty) {
  const orderQty = Number(order && order.quantity) || 0;
  if (!(orderQty > 0) || !Array.isArray(perMaterial) || perMaterial.length === 0) return null;
  const produced = Number(producedQty) || 0;
  return perMaterial.map((m) => {
    const consumed = (Number(m.requested_initial) || 0) / orderQty * produced;
    const raw = (Number(m.issued) || 0) - (Number(m.returned) || 0) - consumed;
    const over = raw < -EPS;
    return { product_id: m.product_id, consumed, remaining: raw < EPS ? 0 : raw, over };
  });
}

/**
 * QT1: NVL đã xuất cho lệnh = phiếu NVL "Đã xuất" (phiếu "Đã đảo" tự bị loại) − đã trả (TNVL/DPX theo dòng nguồn).
 * KHÔNG dùng cờ materials_issued (cờ đó bật cả khi phiếu mới Chờ xuất).
 * @returns {{ issued: boolean, perMaterial: Array<{product_id, requested_initial, issued, returned}> }}
 */
async function getIssuedState(conn, orderId) {
  const sources = await orderSources(conn, orderId);
  const plan = (await conn.query(
    `SELECT material_id, SUM(requested_initial) AS requested_initial FROM production_order_materials
      WHERE production_order_id = $1 GROUP BY material_id ORDER BY MIN(created_at), material_id`, [orderId])).rows;
  const map = new Map();
  for (const p of plan) {
    map.set(p.material_id, { product_id: p.material_id, requested_initial: p.requested_initial == null ? null : Number(p.requested_initial), issued: 0, returned: 0 });
  }
  for (const r of sources) {
    const m = map.get(r.product_id) || { product_id: r.product_id, requested_initial: null, issued: 0, returned: 0 };
    m.issued += Number(r.issued_qty) || 0;
    m.returned += Number(r.returned_qty) || 0;
    map.set(r.product_id, m);
  }
  const perMaterial = [...map.values()];
  const issued = perMaterial.some((m) => m.issued - m.returned > EPS);
  return { issued, perMaterial };
}

/** SL đã SX = công đoạn cuối (cùng định nghĩa recomputeOrder — producedFromTasks). */
async function producedQtyLastStage(conn, orderId) {
  const ord = (await conn.query(
    `SELECT p.product_type, p.product_types FROM production_orders po LEFT JOIN products p ON p.id = po.product_id WHERE po.id = $1`, [orderId])).rows[0];
  if (!ord) return 0;
  const tks = (await conn.query(`SELECT stage, status, quantity, actual_qty FROM production_tasks WHERE production_order_id = $1`, [orderId])).rows;
  return producedFromTasks(ord, tks).produced;
}

/**
 * Ngưỡng "đủ sản lượng": lệnh mới = (100 − nvl_shortfall_percent)% SL lệnh (spec 10.1); lệnh cũ giữ 100%.
 * order cần { quantity, nvl_strict }.
 */
async function isQtyReached(conn, order, produced) {
  const qty = Number(order.quantity) || 0;
  if (!isNewFlow(order)) return produced >= qty;
  const pct = (await getAppSettings(conn)).nvl_shortfall_percent;
  return produced >= qty * (100 - pct) / 100 - EPS;
}

/**
 * QT5: lệnh mới chỉ Hoàn thành khi mọi NVL còn lại ≤ 0 (sai số EPS). Lệnh cũ luôn ok.
 * @returns {{ ok: boolean, left: Array<{product_id, remaining}> }} left = các NVL còn phải trả.
 */
async function canComplete(conn, order, produced) {
  if (!isNewFlow(order)) return { ok: true, left: [] };
  const made = produced == null ? await producedQtyLastStage(conn, order.id) : produced;
  const { perMaterial } = await getIssuedState(conn, order.id);
  const cons = computeConsumption(order, perMaterial, made) || [];
  const left = cons.filter((c) => c.remaining > EPS).map((c) => ({ product_id: c.product_id, remaining: c.remaining }));
  return { ok: left.length === 0, left };
}

/** Spec 10.7: phiếu xuất NVL của lệnh mới không đảo (DPX) — câu hướng dẫn dùng phiếu trả NVL. */
function reverseBlockedMessage(orderCode) {
  return `Phiếu này là NVL đã xuất cho lệnh ${orderCode} — không đảo phiếu được. `
    + `Muốn bớt NVL, mở lệnh ${orderCode} → mục 'Nguyên vật liệu' → lập phiếu trả NVL cho phần còn thừa.`;
}

/** Lỗi chặn của cổng NVL — controller trả 400 + câu QT3 (gateErrorResponse). */
class GateError extends Error {
  constructor(message) { super(message); this.name = 'GateError'; this.status = 400; }
}

// Trạng thái dòng phân công coi là "đang chạy" (cùng tập recomputeOrder dùng cho anyStarted, trừ Hoàn thành).
const RUN_TASK_STATUSES = new Set(['Đang sản xuất', 'Dừng sản xuất']);

/** Lệnh mới đã xuất NVL chưa (QT1). Lệnh cũ luôn true. order cần { id, nvl_strict }. */
async function hasIssuedMaterials(conn, order) {
  if (!isNewFlow(order)) return true;
  return (await getIssuedState(conn, order.id)).issued;
}

/** QT2: lệnh mới chưa xuất NVL không được vào "Đang sản xuất" / chạy dòng. order cần { id, order_code, nvl_strict }. */
async function assertCanRun(conn, order) {
  if (!isNewFlow(order)) return;
  // Spec 10.11: lệnh mới đã Hoàn thành → không dòng nào chạy thêm (web, mobile, lưu phân công, PUT).
  if (order.status === 'Hoàn thành') throw new GateError(completedRunMessage(order.order_code));
  if (!(await hasIssuedMaterials(conn, order))) throw new GateError(gateMessage(order.order_code));
}

/**
 * QT3: lệnh mới chỉ ghi sản lượng khi đang "Đang sản xuất" VÀ còn NVL đã xuất
 * (đảo phiếu DPX: lệnh giữ "Đang sản xuất" nhưng bị khóa tới khi Yêu cầu NVL lại).
 * order cần { id, order_code, status, nvl_strict }.
 */
async function isOutputBlocked(conn, order) {
  if (!isNewFlow(order)) return false;
  return order.status !== 'Đang sản xuất' || !(await hasIssuedMaterials(conn, order));
}
/** Câu chặn ghi SL khi lệnh mới đã Hoàn thành (R9) — không nói "chưa xuất NVL" gây hiểu nhầm. */
function completedMessage(orderCode) {
  return `Lệnh ${orderCode} đã hoàn thành nên không ghi nhận thêm sản lượng được. `
    + 'Nếu cần làm tiếp, nhờ Admin bấm "Hủy hoàn thành" ở dòng phân công của lệnh.';
}
/** Spec 10.11: câu chặn chạy dòng khi lệnh mới đã Hoàn thành. */
function completedRunMessage(orderCode) {
  return `Lệnh ${orderCode} đã hoàn thành nên không chạy thêm dòng phân công nào được. `
    + 'Nếu cần làm tiếp, nhờ Admin bấm "Hủy hoàn thành" ở dòng phân công của lệnh.';
}
async function assertCanRecordOutput(conn, order) {
  if (!(await isOutputBlocked(conn, order))) return;
  throw new GateError(order.status === 'Hoàn thành' ? completedMessage(order.order_code) : gateMessage(order.order_code));
}

/**
 * T13 — số cho màn chi tiết lệnh. Lệnh cũ → { materials_progress: null, gate_message: null }.
 * materials_progress: mỗi NVL { product_id, requested_initial, issued, returned, consumed, remaining, over }
 * (consumed/remaining/over = null khi SL lệnh 0 → UI hiện "—"). gate_message: câu QT3 khi bị khóa ghi SL
 * (lệnh Hoàn thành / Đã hủy → null: khóa vì lý do khác, không phải do NVL).
 * order cần { id, order_code, status, quantity, nvl_strict }.
 */
async function materialsProgress(conn, order) {
  if (!isNewFlow(order)) return { materials_progress: null, gate_message: null };
  const { perMaterial } = await getIssuedState(conn, order.id);
  const cons = computeConsumption(order, perMaterial, await producedQtyLastStage(conn, order.id));
  const progress = perMaterial.map((m, i) => ({
    product_id: m.product_id, requested_initial: m.requested_initial, issued: m.issued, returned: m.returned,
    consumed: cons ? cons[i].consumed : null, remaining: cons ? cons[i].remaining : null, over: cons ? cons[i].over : null,
  }));
  const closed = order.status === 'Hoàn thành' || order.status === 'Đã hủy';
  const blocked = !closed && (await isOutputBlocked(conn, order));
  return { materials_progress: progress, gate_message: blocked ? gateMessage(order.order_code) : null };
}

/** Gọi trong catch của controller (sau ROLLBACK): GateError → 400, trả true. */
function gateErrorResponse(res, err) {
  if (!(err instanceof GateError)) return false;
  res.status(err.status).json({ message: err.message });
  return true;
}

module.exports = {
  EPS, isNewFlow, gateMessage, completedMessage, completedRunMessage, reverseBlockedMessage, computeConsumption, getIssuedState, producedQtyLastStage, isQtyReached, canComplete,
  GateError, RUN_TASK_STATUSES, hasIssuedMaterials, assertCanRun, assertCanRecordOutput, gateErrorResponse, materialsProgress,
};
