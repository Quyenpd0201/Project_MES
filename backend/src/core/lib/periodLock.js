// [HR-G5] Chốt công — 2026-10-26, CHƯA PHÁT HÀNH (file mới)
// Chặn ghi vào tháng đã chốt. Gọi BÊN TRONG transaction của thao tác, TRƯỚC các khóa khác (vd khóa số dư phép G4)
// để thứ tự khóa luôn là: kỳ công → dữ liệu → số dư, tránh deadlock.
//
// Cơ chế: tạo sẵn dòng kỳ công (trạng thái Mở) nếu chưa có, rồi khóa FOR SHARE. Lệnh chốt khóa FOR UPDATE cùng dòng
// → chốt phải chờ các thao tác đang chạy commit xong, và thao tác bắt đầu sau khi chốt thấy "Đã chốt".

class PeriodClosedError extends Error {
  constructor(ym) {
    super(`Tháng ${ym.slice(5, 7)}/${ym.slice(0, 4)} đã chốt công — cần mở khóa trước`);
    this.status = 409;
    this.yearMonth = ym;
  }
}

const ymOf = (d) => String(d).slice(0, 7);

/** Các tháng 'YYYY-MM' mà khoảng ngày [from, to] chạm tới */
function monthsBetween(from, to) {
  const out = [];
  let [y, m] = ymOf(from).split('-').map(Number);
  const end = ymOf(to);
  for (let k = 0; k < 1200; k++) {
    const ym = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
    out.push(ym);
    if (ym >= end) break;
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

/**
 * Ném PeriodClosedError nếu một trong các ngày / tháng thuộc kỳ đã chốt.
 * @param {object} client pg client trong transaction
 * @param {string[]} dates 'YYYY-MM-DD' hoặc 'YYYY-MM'
 */
async function assertOpen(client, dates) {
  const closed = await lockPeriods(client, dates);
  if (closed.size) throw new PeriodClosedError([...closed].sort()[0]);
}

/** Khóa FOR SHARE các kỳ chạm tới, trả Set tháng 'Đã chốt' (không ném lỗi — dùng cho tính lại: bỏ qua tháng chốt). */
async function lockPeriods(client, dates) {
  const yms = [...new Set(dates.filter(Boolean).map(ymOf))].sort();
  if (!yms.length) return new Set();
  await client.query(
    `INSERT INTO attendance_periods (year_month) SELECT unnest($1::text[]) ON CONFLICT (year_month) DO NOTHING`, [yms]);
  const { rows } = await client.query(
    `SELECT year_month, status FROM attendance_periods WHERE year_month = ANY($1::text[]) ORDER BY year_month FOR SHARE`, [yms]);
  return new Set(rows.filter((r) => r.status === 'Đã chốt').map((r) => r.year_month));
}

module.exports = { assertOpen, lockPeriods, monthsBetween, PeriodClosedError, ymOf };
