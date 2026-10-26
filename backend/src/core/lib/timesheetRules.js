// [HR-G5] Bảng công tháng — 2026-10-26, CHƯA PHÁT HÀNH (file mới)
// Hàm thuần: ngày công (attendance_days) → ký hiệu ô + số công; tổng tháng; loại bất thường.
// Quyết định Q1 / Q2 (plan docs/ai/plans/2026-10-26-hr-g5-bang-cong-chot-cong.md):
//  - 1 công: Đủ công / Đi muộn / Về sớm (phút muộn / sớm ghi riêng). Nửa ngày nghỉ theo đơn + nửa ngày làm: 0,5 công + 0,5 phép.
//  - Vắng nửa ngày (nửa nghỉ theo đơn, nửa còn lại không chấm): 0 công + 0,5 phép + 0,5 vắng.
//  - 0 công: vắng, nghỉ không lương, thiếu giờ / chờ xác nhận (đến khi sửa công xong). Làm ngày nghỉ / lễ đếm riêng.
//  - Tăng ca: engine đã để ot_* = 0 khi chờ duyệt → cộng thẳng là chỉ phần đã duyệt.

const LATE_PUNCH_FLAG = 'Có lần chấm sau khi chốt';

const ZERO = { work: 0, paid: 0, unpaid: 0, absent: 0, pending: 0, holiday: 0, offday: 0 };
const WORKED = new Set(['Đủ công', 'Đi muộn', 'Về sớm', 'Đi muộn, về sớm', 'Nghỉ nửa ngày']);
const PENDING = new Set(['Thiếu giờ vào', 'Thiếu giờ ra', 'Chờ xác nhận', 'Chưa kết thúc']);

/** @param {object|null} d dòng attendance_days (+ leave_paid, overnight) */
function cellOf(d) {
  if (!d) return { symbol: '', ...ZERO };
  const half = d.leave_part === 'AM' || d.leave_part === 'PM';
  const leaveKey = d.leave_paid === false ? 'unpaid' : 'paid';
  const night = d.overnight ? 'Đ' : '';
  if (WORKED.has(d.status)) {
    if (half) return { ...ZERO, symbol: d.leave_paid === false ? 'KL/2' : 'P/2', work: 0.5, [leaveKey]: 0.5 };
    return { ...ZERO, symbol: (d.status === 'Đủ công' ? 'X' : 'M') + night, work: 1 };
  }
  switch (d.status) {
    case 'Nghỉ có phép': return { ...ZERO, symbol: 'P', paid: 1 };
    case 'Nghỉ không lương': return { ...ZERO, symbol: 'KL', unpaid: 1 };
    case 'Vắng nửa ngày': return { ...ZERO, symbol: 'V/2', [leaveKey]: 0.5, absent: 0.5 };
    case 'Vắng không phép': return { ...ZERO, symbol: 'V', absent: 1 };
    case 'Nghỉ lễ': return { ...ZERO, symbol: 'L', holiday: 1 };
    case 'Nghỉ': return { ...ZERO, symbol: 'CN' };
    case 'Làm ngày lễ':
    case 'Làm ngày nghỉ': return { ...ZERO, symbol: `LL${night}`, offday: 1 };
    default: return { ...ZERO, symbol: '?', pending: 1 }; // PENDING + trạng thái lạ: không im lặng tính công
  }
}

/** Tổng tháng của 1 nhân viên. cells[i] ứng với days[i] (cùng thứ tự). */
function summarize(cells, days) {
  const s = { ...ZERO, worked_min: 0, late_min: 0, early_min: 0, late_early_count: 0, ot_min: 0, ot_night_min: 0, ot_holiday_min: 0, ot_pending_days: 0, night_shifts: 0 };
  cells.forEach((c, i) => {
    for (const k of Object.keys(ZERO)) s[k] += c[k];
    const d = days[i];
    if (!d) return;
    s.worked_min += d.worked_min || 0;
    s.late_min += d.late_min || 0;
    s.early_min += d.early_min || 0;
    if ((d.late_min || 0) > 0 || (d.early_min || 0) > 0) s.late_early_count++;
    s.ot_min += d.ot_min || 0;
    s.ot_night_min += d.ot_night_min || 0;
    s.ot_holiday_min += d.ot_holiday_min || 0;
    if (d.ot_status === 'pending') s.ot_pending_days++;
    if (d.overnight && (c.work > 0 || c.offday > 0)) s.night_shifts++;
  });
  return s;
}

/** Loại bất thường của 1 ngày (dùng cho báo cáo + Excel). */
function anomaliesOf(d) {
  if (!d) return [];
  const out = [];
  if (d.status === 'Thiếu giờ vào' || d.status === 'Thiếu giờ ra') out.push('Thiếu giờ vào / ra');
  if (d.status === 'Chờ xác nhận') out.push('Chờ xác nhận');
  if (d.status === 'Vắng không phép') out.push('Vắng không phép');
  if (['Đi muộn', 'Về sớm', 'Đi muộn, về sớm'].includes(d.status)) out.push('Đi muộn / về sớm');
  if (d.ot_status === 'pending') out.push('Tăng ca chờ duyệt');
  const flags = Array.isArray(d.flags) ? d.flags : [];
  if (flags.includes(LATE_PUNCH_FLAG)) out.push('Có lần chấm sau khi chốt');
  if (flags.some((f) => f !== LATE_PUNCH_FLAG)) out.push('Có cờ cần xem');
  return out;
}

const YM_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Các ngày của tháng 'YYYY-MM': { date, day, weekday (1 = thứ 2 … 7 = CN) } */
function monthDays(ym) {
  const m = YM_RE.exec(String(ym || ''));
  if (!m) throw new Error('Tháng không hợp lệ (YYYY-MM)');
  const y = Number(m[1]); const mo = Number(m[2]);
  const n = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(Date.UTC(y, mo - 1, i + 1));
    return { date: dt.toISOString().slice(0, 10), day: i + 1, weekday: ((dt.getUTCDay() + 6) % 7) + 1 };
  });
}

const LEGEND = [
  ['X', 'Đủ công'], ['M', 'Đi muộn / về sớm (vẫn 1 công)'], ['P', 'Nghỉ có phép'], ['P/2', 'Nửa ngày phép + nửa ngày làm'],
  ['KL', 'Nghỉ không lương'], ['KL/2', 'Nửa ngày không lương + nửa ngày làm'], ['V', 'Vắng không phép'], ['V/2', 'Nửa ngày phép + nửa ngày vắng'],
  ['?', 'Thiếu giờ vào / ra hoặc chờ xác nhận (0 công đến khi sửa)'], ['L', 'Nghỉ lễ'], ['CN', 'Ngày nghỉ hằng tuần'],
  ['LL', 'Làm ngày lễ / ngày nghỉ'], ['…Đ', 'Hậu tố: làm ca đêm'],
];

module.exports = { cellOf, summarize, anomaliesOf, monthDays, YM_RE, LEGEND, LATE_PUNCH_FLAG, PENDING_STATUSES: PENDING };
