// [HR-G2] Kiosk chấm công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// Quy tắc của MỘT lần chấm — hàm thuần, không đụng DB (test ở tests/hr.punchRules.test.js).
// Tính công (đi muộn, về sớm, tăng ca...) là việc của engine G3, không nằm ở đây.

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const OFFLINE_MAX_AGE_HOURS = 24;

const vnFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });
/** 'YYYY-MM-DD' theo giờ Việt Nam */
const vnDate = (d) => vnFmt.format(d);

/**
 * Lần chấm này là VÀO hay RA.
 * @param {{direction:'IN'|'OUT', punched_at:Date, work_date:string}|null} last  lần chấm gần nhất TRƯỚC thời điểm `now`
 * @param {Date} now
 * @param {{dedupeMin:number, maxOpenHours:number}} cfg
 * @returns {{duplicate:true}|{duplicate:false, direction:'IN'|'OUT', work_date:string}}
 *  - Chấm lại trong dedupeMin phút → duplicate (không tạo bản ghi).
 *  - Lần trước là VÀO, chưa quá maxOpenHours giờ → RA, giữ work_date của lần VÀO (ca đêm qua ngày).
 *  - Còn lại (chưa chấm / đã RA / VÀO quá lâu = quên chấm RA) → VÀO, work_date = ngày hiện tại.
 */
function decideDirection(last, now, { dedupeMin, maxOpenHours }) {
  if (last) {
    const gap = now - new Date(last.punched_at);
    if (dedupeMin > 0 && gap >= 0 && gap < dedupeMin * MIN) return { duplicate: true };
    if (last.direction === 'IN' && gap >= 0 && gap <= maxOpenHours * HOUR) {
      return { duplicate: false, direction: 'OUT', work_date: last.work_date };
    }
  }
  return { duplicate: false, direction: 'IN', work_date: vnDate(now) };
}

/**
 * Giờ của lần chấm OFFLINE (quyết định Q1 ngày 2026-10-23).
 * Lấy giờ tablet trừ độ lệch đồng hồ đo ở lần online gần nhất (skewMs = giờ tablet − giờ server).
 * Cần trưởng tổ xác nhận khi: chưa đo được độ lệch / cũ hơn 24 giờ / ở tương lai / giờ không hợp lệ.
 */
function resolveOfflineTime({ clientTime, skewMs, now }) {
  const t = new Date(clientTime);
  if (Number.isNaN(t.getTime())) return { time: now, needsReview: true, reason: 'Giờ chấm offline không hợp lệ — đã dùng giờ nhận' };
  const hasSkew = Number.isFinite(skewMs);
  const time = new Date(t.getTime() - (hasSkew ? skewMs : 0));
  if (time > now) return { time: now, needsReview: true, reason: 'Giờ tablet ở tương lai — đã dùng giờ nhận' };
  if (now - time > OFFLINE_MAX_AGE_HOURS * HOUR) {
    return { time, needsReview: true, reason: `Chấm offline gửi lên sau hơn ${OFFLINE_MAX_AGE_HOURS} giờ` };
  }
  if (!hasSkew) return { time, needsReview: true, reason: 'Tablet chưa đo được độ lệch đồng hồ' };
  return { time, needsReview: false, reason: null };
}

module.exports = { decideDirection, resolveOfflineTime, vnDate };
