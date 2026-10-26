// [HR-G3] Engine tính công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// HÀM THUẦN: 1 nhân viên × 1 ngày công → kết quả. Không đụng DB (đọc / ghi ở hrRecalc.js).
// Quy tắc chốt ngày 2026-10-23 (plan G3, Q1–Q8). Test "hợp đồng": tests/hr.engine.test.js.
//
// Nguyên tắc:
//  - KHÔNG tin cột direction đã lưu: lần hợp lệ sớm nhất = VÀO, muộn nhất = RA (chỉ 1 lần → gần đầu ca = VÀO, gần cuối ca = RA).
//  - Lần chấm cần xác nhận chưa duyệt → cả ngày "Chờ xác nhận", chưa tính công. Bị từ chối → bỏ qua.
//  - Giờ làm = có mặt TRONG khung ca − phần giao với khung nghỉ. Đến sớm không tính (Q7).
//  - Tăng ca = có mặt SAU giờ ra ca (tính từ max(giờ ra ca, giờ vào)): < otMinMinutes thì bỏ; tách thường / đêm
//    (từ otNightFrom tới 06:00 hôm sau); block otBlock phút (Q1, Q6). Chưa duyệt → ot_* = 0, số tính được ở ot_calc_*.
//  - Ngày nghỉ / lễ có đi làm: toàn bộ thời gian (trừ nghỉ) = tăng ca ngày nghỉ/lễ (Q4).

const MIN = 60000;
const DAY_MS = 86400000;
const ABNORMAL_EXTRA_MS = 4 * 3600000;

/** Mốc thời gian 'YYYY-MM-DD' + 'HH:MM' giờ Việt Nam (+07:00, không có giờ mùa hè) */
const at = (date, hhmm, plusDays = 0) => new Date(Date.parse(`${date}T${String(hhmm).slice(0, 5)}:00+07:00`) + plusDays * DAY_MS);
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
const mins = (ms) => Math.floor(ms / MIN);
const block = (m, size) => (size > 1 ? Math.floor(m / size) * size : m);

/** Khung ca + các khung nghỉ dạng mốc tuyệt đối của ngày công workDate */
function shiftWindow(workDate, shift) {
  const start = at(workDate, shift.start);
  const end = at(workDate, shift.end, shift.overnight ? 1 : 0);
  const breaks = (shift.breaks || []).map((b) => {
    // Ca qua đêm: khung nghỉ có giờ < giờ vào ca là của ngày hôm sau (vd 03:00)
    const dayShift = shift.overnight && toMin(b.start) < toMin(shift.start) ? 1 : 0;
    const bs = at(workDate, b.start, dayShift);
    const be = at(workDate, b.end, dayShift + (toMin(b.end) <= toMin(b.start) ? 1 : 0)); // 23:00–00:00 → qua ngày
    return [bs.getTime(), be.getTime()];
  });
  return { start: start.getTime(), end: end.getTime(), breaks };
}

/** Thời gian có mặt trong [from, to] trừ phần giao với khung nghỉ (ms) */
function workedWithin(inMs, outMs, from, to, breaks) {
  const s = Math.max(inMs, from); const e = Math.min(outMs, to);
  if (e <= s) return 0;
  return (e - s) - breaks.reduce((sum, [bs, be]) => sum + overlap(s, e, bs, be), 0);
}

/**
 * @param {object} input
 *  workDate 'YYYY-MM-DD'; shift {start,end,overnight,required_minutes,late_grace_min,early_grace_min,ot_enabled,ot_requires_approval,breaks[]}
 *  punches [{id, at:Date, needs_review, review:'accept'|'reject'|null}] — các lần chấm thuộc ngày công này
 *  corrections [{kind:'add_in'|'add_out'|'ignore_punch', new_time?, punch_id?}] — chỉ yêu cầu ĐÃ DUYỆT
 *  isHoliday, isWorkday, otApproval {ot_min, ot_night_min, ot_holiday_min}|null, cfg {otNightFrom, otMinMinutes, otBlock}
 */
function computeDay({ workDate, shift, punches = [], corrections = [], isHoliday = false, isWorkday = true, otApproval = null, cfg, now = null, leave = null }) {
  const flags = [];
  const result = (o) => {
    const r = {
      first_in: null, last_out: null, worked_min: 0, late_min: 0, early_min: 0,
      ot_calc_min: 0, ot_calc_night_min: 0, ot_calc_holiday_min: 0, ...o, flags,
      leave_applied: leavePart, // [HR-G4] buổi nghỉ thực sự áp vào ngày này (null nếu không có / ngày nghỉ, lễ)
    };
    // Tăng ca được tính công = min(tính được, được duyệt); chưa duyệt → 0 nhưng giữ số tính được để duyệt
    const calcTotal = r.ot_calc_min + r.ot_calc_night_min + r.ot_calc_holiday_min;
    const approved = !shift.ot_requires_approval || !!otApproval;
    r.ot_status = calcTotal === 0 ? 'none' : approved ? 'approved' : 'pending';
    const cap = (calc, key) => (!shift.ot_requires_approval ? calc : otApproval ? Math.min(calc, Number(otApproval[key]) || 0) : 0);
    // ot_* = phút ĐƯỢC TÍNH CÔNG (chưa duyệt = 0); ot_calc_* = phút tính được (để duyệt / đối chiếu)
    r.ot_min = r.ot_status === 'pending' ? 0 : cap(r.ot_calc_min, 'ot_min');
    r.ot_night_min = r.ot_status === 'pending' ? 0 : cap(r.ot_calc_night_min, 'ot_night_min');
    r.ot_holiday_min = r.ot_status === 'pending' ? 0 : cap(r.ot_calc_holiday_min, 'ot_holiday_min');
    return r;
  };

  // 1) Lần chấm hợp lệ
  const ignored = new Set(corrections.filter((c) => c.kind === 'ignore_punch').map((c) => c.punch_id));
  const pending = punches.some((x) => x.needs_review && !x.review && !ignored.has(x.id));
  const valid = punches
    .filter((x) => !ignored.has(x.id) && (!x.needs_review || x.review === 'accept'))
    .map((x) => new Date(x.at).getTime())
    .sort((a, b) => a - b);
  // Nhiều yêu cầu cùng loại được duyệt → lấy yêu cầu duyệt SAU CÙNG (yêu cầu sau sửa lại yêu cầu trước)
  const latest = (kind) => corrections.filter((c) => c.kind === kind)
    .sort((a, b) => new Date(a.decided_at || 0) - new Date(b.decided_at || 0)).pop();
  const addIn = latest('add_in');
  const addOut = latest('add_out');
  if (corrections.length) flags.push('Có sửa công');

  const win = shiftWindow(workDate, shift);
  // [HR-G4] Đơn nghỉ đã duyệt. Ngày nghỉ hằng tuần / lễ: bỏ qua đơn (Q4). Ca đêm chỉ nghỉ cả ca (Q3).
  const offDayForLeave = isHoliday || !isWorkday;
  const leavePart = leave && !offDayForLeave ? (shift.overnight ? 'FULL' : leave.part) : null;
  if (leave && !offDayForLeave && shift.overnight && leave.part !== 'FULL') flags.push('Đơn nửa ngày trên ca đêm — cần xem lại');
  const origEnd = win.end; // [Review G4 R1] tăng ca luôn tính từ giờ ra ca GỐC, kể cả khi nghỉ buổi chiều
  if (leavePart === 'AM' || leavePart === 'PM') {
    // Nửa ngày: khung ca thu về 1 buổi, mốc chia là khung nghỉ đầu tiên (ca ngày: nghỉ trưa 12–13)
    const [bs, be] = [...win.breaks].sort((a, b) => a[0] - b[0])[0] || [win.start + (win.end - win.start) / 2, win.start + (win.end - win.start) / 2];
    if (leavePart === 'AM') win.start = be; else win.end = bs;
  }
  let inMs = addIn ? new Date(addIn.new_time).getTime() : null;
  let outMs = addOut ? new Date(addOut.new_time).getTime() : null;
  if (inMs == null && outMs == null) {
    if (valid.length >= 2) { inMs = valid[0]; outMs = valid[valid.length - 1]; } else if (valid.length === 1) {
      // 1 lần: gần đầu ca → VÀO (thiếu RA), gần cuối ca → RA (thiếu VÀO)
      if (Math.abs(valid[0] - win.start) <= Math.abs(valid[0] - win.end)) inMs = valid[0]; else outMs = valid[0];
    }
  } else if (inMs == null) {
    const before = valid.filter((v) => v < outMs); if (before.length) inMs = before[0];
  } else if (outMs == null) {
    const after = valid.filter((v) => v > inMs); if (after.length) outMs = after[after.length - 1];
  }
  const firstIn = inMs != null ? new Date(inMs) : null;
  const lastOut = outMs != null ? new Date(outMs) : null;

  if (pending) return result({ status: 'Chờ xác nhận', first_in: firstIn, last_out: lastOut });

  const offDay = isHoliday || !isWorkday;
  if (leavePart === 'FULL') {
    if (inMs != null || outMs != null) flags.push('Có chấm công trong ngày nghỉ');
    return result({ status: leave.paid ? 'Nghỉ có phép' : 'Nghỉ không lương', first_in: firstIn, last_out: lastOut });
  }
  // Ngày chưa kết thúc (now trước giờ ra ca + 4 giờ) và chưa có giờ RA → chưa kết luận thiếu / vắng
  const nowMs = now ? new Date(now).getTime() : Infinity;
  // Ngày nghỉ / lễ chưa chấm → "Nghỉ" ngay cả khi ngày chưa hết (Q8)
  if (inMs == null && outMs == null && offDay) return result({ status: isHoliday ? 'Nghỉ lễ' : 'Nghỉ' });
  if (outMs == null && nowMs < win.end + ABNORMAL_EXTRA_MS) return result({ status: 'Chưa kết thúc', first_in: firstIn });
  if (inMs == null && outMs == null) return result({ status: leavePart ? 'Vắng nửa ngày' : 'Vắng không phép' });
  if (inMs == null) return result({ status: 'Thiếu giờ vào', last_out: lastOut });
  if (outMs == null) return result({ status: 'Thiếu giờ ra', first_in: firstIn });
  if (outMs <= inMs) { flags.push('Giờ ra trước giờ vào'); return result({ status: 'Thiếu giờ ra', first_in: firstIn }); }
  if (outMs - inMs > (win.end - win.start) + ABNORMAL_EXTRA_MS) flags.push('Khoảng vào–ra dài bất thường');

  // 2) Ngày nghỉ / lễ có đi làm → toàn bộ là tăng ca ngày nghỉ/lễ (Q4)
  if (offDay) {
    let m = shift.ot_enabled ? mins(workedWithin(inMs, outMs, inMs, outMs, win.breaks)) : 0;
    if (m < cfg.otMinMinutes) m = 0;
    return result({ status: isHoliday ? 'Làm ngày lễ' : 'Làm ngày nghỉ', first_in: firstIn, last_out: lastOut,
      ot_calc_holiday_min: block(m, cfg.otBlock) });
  }

  // 3) Ngày làm việc
  const worked = mins(workedWithin(inMs, outMs, win.start, win.end, win.breaks));
  const late = inMs > win.start + shift.late_grace_min * MIN ? mins(inMs - win.start) : 0;
  const early = outMs < win.end - shift.early_grace_min * MIN ? mins(win.end - outMs) : 0;

  // Tăng ca sau giờ ra ca: tách đêm [otNightFrom ngày công → 06:00 hôm sau] và thường
  let ot = 0; let otNight = 0;
  // [Review G4 R1] có mặt trong buổi đã nghỉ (lệch quá 30 phút) → gắn cờ để trưởng tổ xem
  if (leavePart === 'AM' && inMs < win.start - 30 * MIN) flags.push('Có mặt trong buổi nghỉ');
  if (leavePart === 'PM' && outMs > win.end + 30 * MIN) flags.push('Có mặt trong buổi nghỉ');
  if (shift.ot_enabled && outMs > origEnd) {
    const otStart = Math.max(origEnd, inMs); // vào sau giờ ra ca → chỉ tính từ lúc có mặt
    const nightFrom = at(workDate, cfg.otNightFrom).getTime();
    const nightTo = at(workDate, '06:00', 1).getTime();
    const total = mins(outMs - otStart);
    if (total >= cfg.otMinMinutes) {
      otNight = mins(overlap(otStart, outMs, nightFrom, nightTo));
      ot = total - otNight;
    }
  }
  const status = late && early ? 'Đi muộn, về sớm' : late ? 'Đi muộn' : early ? 'Về sớm' : leavePart ? 'Nghỉ nửa ngày' : 'Đủ công';
  return result({
    status, first_in: firstIn, last_out: lastOut, worked_min: worked, late_min: late, early_min: early,
    ot_calc_min: block(ot, cfg.otBlock), ot_calc_night_min: block(otNight, cfg.otBlock),
  });
}

module.exports = { computeDay, shiftWindow, at };
