// [HR-G5] Bảng công tháng, báo cáo bất thường, xuất Excel — 2026-10-26, CHƯA PHÁT HÀNH (file mới)
// Lọc nhân viên qua hrScope. Bảng công đọc nhân viên + ngày công bằng 1 truy vấn (không N+1, bài học R3 G4).
// Quy tắc ký hiệu / số công: core/lib/timesheetRules.js (Q1 / Q2).
const XLSX = require('xlsx');
const db = require('../../core/db');
const { hrScope, subtreeSql, UUID_RE } = require('../../core/lib/hrScope');
const { logHr } = require('../../core/lib/hrAudit');
const { cellOf, summarize, anomaliesOf, monthDays, YM_RE, LEGEND } = require('../../core/lib/timesheetRules');

const NO_UNIT = 'Chưa xếp tổ';
const bad = (res, message) => res.status(400).json({ message });

/** Dữ liệu bảng công tháng (đã lọc phạm vi). Trả null nếu tham số sai (đã trả 400). */
async function loadTimesheet(req, res) {
  const ym = String(req.query.month || '');
  if (!YM_RE.test(ym)) { bad(res, 'Tháng không hợp lệ (YYYY-MM)'); return null; }
  const days = monthDays(ym);
  const from = days[0].date; const to = days[days.length - 1].date;
  const params = [from, to];
  let unitSql = '';
  if (req.query.org_unit_id) {
    if (!UUID_RE.test(String(req.query.org_unit_id))) { bad(res, 'Đơn vị không hợp lệ'); return null; }
    params.push(req.query.org_unit_id); unitSql = `AND e.org_unit_id IN ${subtreeSql(params.length)}`;
  }
  const sc = await hrScope(req, { col: 'e.org_unit_id', startIndex: params.length + 1 });
  // Nhân viên đang làm, hoặc đã nghỉ nhưng có ngày công trong tháng
  const { rows } = await db.query(`
    SELECT e.id, e.employee_code, e.name, e.org_unit_id, u.name AS unit_name,
           COALESCE(json_agg(json_build_object(
             'd', to_char(d.work_date, 'YYYY-MM-DD'), 'status', d.status, 'worked_min', d.worked_min, 'late_min', d.late_min,
             'early_min', d.early_min, 'ot_min', d.ot_min, 'ot_night_min', d.ot_night_min, 'ot_holiday_min', d.ot_holiday_min,
             'ot_status', d.ot_status, 'flags', d.flags, 'leave_part', d.leave_part, 'leave_paid', lt.paid,
             'overnight', COALESCE(s.overnight, false), 'shift_code', s.shift_code, 'locked', d.locked)
             ORDER BY d.work_date) FILTER (WHERE d.work_date IS NOT NULL), '[]') AS days
      FROM employees e
      LEFT JOIN org_units u ON u.id = e.org_unit_id
      LEFT JOIN attendance_days d ON d.employee_id = e.id AND d.work_date BETWEEN $1 AND $2
      LEFT JOIN shifts s ON s.id = d.shift_id
      LEFT JOIN leave_requests lr ON lr.id = d.leave_request_id
      LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
     WHERE e.is_deleted = FALSE ${unitSql} AND ${sc.sql}
     GROUP BY e.id, u.name
    HAVING e.status = 'Hoạt động' OR count(d.work_date) > 0
     ORDER BY u.name NULLS FIRST, e.employee_code`, [...params, ...sc.params]);
  const { rows: hol } = await db.query(
    `SELECT to_char(date, 'YYYY-MM-DD') d, name FROM holidays WHERE date BETWEEN $1 AND $2`, [from, to]);
  const holidayOf = Object.fromEntries(hol.map((h) => [h.d, h.name]));
  const { rows: [per] } = await db.query(`
    SELECT p.status, p.closed_at, u.full_name AS closed_by_name FROM attendance_periods p
      LEFT JOIN users u ON u.id = p.closed_by WHERE p.year_month = $1`, [ym]);
  const employees = rows.map((e) => {
    const byDate = Object.fromEntries(e.days.map((x) => [x.d, x]));
    const list = days.map((x) => byDate[x.date] || null);
    const cells = list.map(cellOf);
    return {
      id: e.id, employee_code: e.employee_code, name: e.name, org_unit_id: e.org_unit_id, unit_name: e.unit_name,
      cells: cells.map((c, i) => ({ s: c.symbol, st: list[i]?.status || null, a: anomaliesOf(list[i]).length > 0 })),
      summary: summarize(cells, list), _days: list,
    };
  });
  return {
    year_month: ym,
    period: per || { status: 'Mở' },
    days: days.map((x) => ({ ...x, holiday: holidayOf[x.date] || null })),
    employees, legend: LEGEND,
  };
}

const strip = (t) => ({ ...t, employees: t.employees.map(({ _days, ...e }) => e) });

function anomalyRows(t) {
  const out = [];
  for (const e of t.employees) {
    e._days.forEach((d, i) => {
      const types = anomaliesOf(d);
      if (!types.length) return;
      out.push({
        employee_id: e.id, employee_code: e.employee_code, employee_name: e.name, unit_name: e.unit_name,
        work_date: t.days[i].date, status: d.status, types, flags: d.flags || [], late_min: d.late_min, early_min: d.early_min,
        ot_status: d.ot_status,
      });
    });
  }
  return out;
}

exports.timesheet = async (req, res) => {
  const t = await loadTimesheet(req, res);
  if (t) res.json(strip(t));
};

exports.anomalies = async (req, res) => {
  const t = await loadTimesheet(req, res);
  if (t) res.json({ year_month: t.year_month, period: t.period, data: anomalyRows(t) });
};

// [Review G5] chống chèn công thức khi mở bằng Excel / xuất CSV sau này
const safe = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const safeRow = (r) => r.map(safe);

const fmtVn = (d) => (d ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(d)) : '');
const h = (min) => Math.round(((min || 0) / 60) * 100) / 100;

exports.exportXlsx = async (req, res) => {
  const t = await loadTimesheet(req, res);
  if (!t) return;
  const [y, m] = t.year_month.split('-');
  const status = t.period.status === 'Đã chốt'
    ? `ĐÃ CHỐT ngày ${fmtVn(t.period.closed_at)} bởi ${t.period.closed_by_name || ''}`
    : 'CHƯA CHỐT — số liệu có thể thay đổi';
  const unitName = req.query.org_unit_id
    ? ((await db.query('SELECT name FROM org_units WHERE id = $1', [req.query.org_unit_id])).rows[0]?.name || '')
    : 'Tất cả đơn vị (trong phạm vi được xem)';

  // Sheet 1 — Bảng công
  const head = ['Mã NV', 'Họ tên', 'Tổ', ...t.days.map((d) => String(d.day)), 'Công', 'Phép', 'Không lương', 'Vắng', 'Chưa rõ (?)', 'Làm lễ / nghỉ', 'Ca đêm'];
  const s1 = [
    [`BẢNG CÔNG THÁNG ${m}/${y} — ${unitName}`],
    [status],
    [],
    head,
    ['', '', '', ...t.days.map((d) => (d.holiday ? 'Lễ' : d.weekday === 7 ? 'CN' : `T${d.weekday + 1}`))],
    ...t.employees.map((e) => [e.employee_code, e.name, e.unit_name || NO_UNIT, ...e.cells.map((c) => c.s),
      e.summary.work, e.summary.paid, e.summary.unpaid, e.summary.absent, e.summary.pending, e.summary.offday, e.summary.night_shifts]),
    [],
    ['Chú giải'],
    ...LEGEND.map(([k, v]) => [k, v]),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(s1.map(safeRow));
  ws1['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 18 }, ...t.days.map(() => ({ wch: 5 })), ...Array(7).fill({ wch: 10 })];
  ws1['!freeze'] = { xSplit: 3, ySplit: 5 };

  // Sheet 2 — Tổng hợp (giờ)
  const s2 = [
    [`TỔNG HỢP THÁNG ${m}/${y}`], [status], [],
    ['Mã NV', 'Họ tên', 'Tổ', 'Công', 'Giờ làm', 'Phút muộn', 'Phút về sớm', 'Số lần muộn / sớm', 'Tăng ca thường (giờ)', 'Tăng ca đêm (giờ)',
      'Tăng ca ngày nghỉ / lễ (giờ)', 'Ngày tăng ca chờ duyệt'],
    ...t.employees.map((e) => [e.employee_code, e.name, e.unit_name || NO_UNIT, e.summary.work, h(e.summary.worked_min),
      e.summary.late_min, e.summary.early_min, e.summary.late_early_count, h(e.summary.ot_min), h(e.summary.ot_night_min),
      h(e.summary.ot_holiday_min), e.summary.ot_pending_days]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(s2.map(safeRow));
  ws2['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 18 }, ...Array(9).fill({ wch: 14 })];

  // Sheet 3 — Bất thường
  const an = anomalyRows(t);
  const s3 = [
    [`BẤT THƯỜNG THÁNG ${m}/${y}`], [status], [],
    ['Mã NV', 'Họ tên', 'Tổ', 'Ngày', 'Trạng thái', 'Loại bất thường', 'Cờ', 'Phút muộn', 'Phút về sớm'],
    ...an.map((a) => [a.employee_code, a.employee_name, a.unit_name || NO_UNIT, a.work_date, a.status, a.types.join('; '),
      (a.flags || []).join('; '), a.late_min, a.early_min]),
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(s3.map(safeRow));
  ws3['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 36 }, { wch: 36 }, { wch: 10 }, { wch: 10 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Bảng công');
  XLSX.utils.book_append_sheet(wb, ws2, 'Tổng hợp');
  XLSX.utils.book_append_sheet(wb, ws3, 'Bất thường');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  await logHr(db, req, { action: 'export_timesheet', entity: 'attendance_period', entityId: t.year_month,
    after: { org_unit_id: req.query.org_unit_id || null, employees: t.employees.length, period_status: t.period.status } });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="bang-cong-${t.year_month}.xlsx"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
};
