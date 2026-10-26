// [HR-G4] Quy tắc đơn nghỉ — 2026-10-26, CHƯA PHÁT HÀNH (file mới)
// HÀM THUẦN (không đụng DB): kiểm buổi, khung nửa ngày (chống chồng lấn), đếm ngày nghỉ, tách theo năm.
// Quy ước buổi: FULL = cả ngày, AM = buổi sáng, PM = buổi chiều.
//  - Đơn 1 ngày: from_part = to_part ∈ {FULL, AM, PM}.
//  - Đơn nhiều ngày: ngày đầu ∈ {FULL, PM} (bắt đầu từ chiều), ngày cuối ∈ {FULL, AM} (kết thúc buổi sáng).
// Q4 (chốt 2026-10-26): ngày nghỉ hằng tuần / ngày lễ trong khoảng nghỉ KHÔNG trừ phép.

const PARTS = ['FULL', 'AM', 'PM'];
const DAY_MS = 86400000;

const dayIndex = (ymd) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS);
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const isoWeekday = (ymd) => ((new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = thứ 2 … 7 = CN

/** Kiểm + chuẩn hóa buổi. Ném lỗi tiếng Việt nếu không hợp lệ. */
function normalizeParts({ from_date: from, to_date: to, from_part: fp = 'FULL', to_part: tp = 'FULL' }) {
  if (!PARTS.includes(fp) || !PARTS.includes(tp)) throw new Error('Buổi nghỉ không hợp lệ (cả ngày / sáng / chiều)');
  if (to < from) throw new Error('Đến ngày không được trước từ ngày');
  if (from === to) {
    if (fp !== tp) throw new Error('Đơn 1 ngày: chọn cả ngày, buổi sáng hoặc buổi chiều');
    return { from_part: fp, to_part: tp };
  }
  if (fp === 'AM') throw new Error('Ngày đầu chỉ nghỉ cả ngày hoặc từ buổi chiều');
  if (tp === 'PM') throw new Error('Ngày cuối chỉ nghỉ cả ngày hoặc đến hết buổi sáng');
  return { from_part: fp, to_part: tp };
}

/** Khung nửa ngày [lo, hi): ngày × 2 + (0 sáng | 1 chiều). Dùng cho EXCLUDE chống chồng lấn ở DB. */
function slotRange(r) {
  const { from_part: fp, to_part: tp } = normalizeParts(r);
  const lo = dayIndex(r.from_date) * 2 + (fp === 'PM' ? 1 : 0);
  const hi = dayIndex(r.to_date) * 2 + (tp === 'AM' ? 1 : 2);
  return [lo, hi];
}

/** Buổi nghỉ của đơn r vào ngày `date` → 'FULL' | 'AM' | 'PM' | null */
function partOnDate(r, date) {
  if (date < r.from_date || date > r.to_date) return null;
  if (r.from_date === r.to_date) return r.from_part;
  if (date === r.from_date) return r.from_part;
  if (date === r.to_date) return r.to_part;
  return 'FULL';
}

const isCountable = (date, { workdays, holidays }) => workdays.has(isoWeekday(date)) && !holidays.has(date);

/** Danh sách { date, part, days } của các ngày bị trừ phép (bỏ ngày nghỉ hằng tuần / lễ). */
function chargedDays(r, cal) {
  normalizeParts(r);
  const out = [];
  for (let d = r.from_date; d <= r.to_date; d = addDays(d, 1)) {
    if (!isCountable(d, cal)) continue;
    const part = partOnDate(r, d);
    out.push({ date: d, part, days: part === 'FULL' ? 1 : 0.5 });
  }
  return out;
}

/** Tổng số ngày bị trừ (bước 0,5). */
const countDays = (r, cal) => chargedDays(r, cal).reduce((s, x) => s + x.days, 0);

/** Số ngày bị trừ tách theo năm (đơn vắt qua 01/01). */
function daysByYear(r, cal) {
  const out = {};
  for (const x of chargedDays(r, cal)) {
    const y = Number(x.date.slice(0, 4));
    out[y] = (out[y] || 0) + x.days;
  }
  return out;
}

module.exports = { PARTS, normalizeParts, slotRange, partOnDate, chargedDays, countDays, daysByYear, isoWeekday };
