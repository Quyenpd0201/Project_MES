// [HR-G3] Ngày công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// Kết quả tính công theo ngày / tổ. Bấm 1 dòng → chi tiết (lần chấm + ảnh, sửa công).
import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { ListHeader, DataTable, LoadError, DateInput, SearchSelect, useSaving } from "../../components.jsx";
import { hrWorkday, hrConfig } from "../../mesApi.js";
import { fmtDate, todayYmd, toast } from "../../ui.js";
import { usePerm } from "../../perm.jsx";
import { DayDetailModal, Badge, fmtMin, fmtHm } from "./DayDetail.jsx";

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString("en-CA"); };

export default function WorkdayList() {
  const { can } = usePerm();
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(todayYmd());
  const [unit, setUnit] = useState("");
  const [units, setUnits] = useState([]);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);
  const [busy, guard] = useSaving();

  useEffect(() => { hrConfig.orgUnits().then(setUnits).catch(() => setUnits([])); }, []);
  const load = useCallback(async () => {
    setErr(""); setRows(null);
    try { setRows((await hrWorkday.days({ from, to, org_unit_id: unit })).data); } catch (e) { setErr(e.message); }
  }, [from, to, unit]);
  useEffect(() => { load(); }, [load]);

  if (!can("hr_attendance", "view")) return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Bạn không có quyền xem ngày công.</div>;

  const recalc = () => guard(async () => {
    try { const r = await hrWorkday.recalculate({ from, to }); toast.success(`Đã xếp hàng tính lại ${r.queued} ngày công — kết quả cập nhật trong vài phút`); }
    catch (e) { toast.error(e.message); }
  });

  const columns = [
    { key: "work_date", label: "Ngày", render: (r) => <span className="tabular-nums">{fmtDate(r.work_date)}</span> },
    { key: "employee_name", label: "Nhân viên", filter: "text", render: (r) => (
      <button type="button" className="text-left hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded outline-none"
        title="Xem chi tiết ngày công" aria-label={`Xem ngày công ${r.employee_name} ngày ${fmtDate(r.work_date)}`}
        onClick={() => setOpen({ employee_id: r.employee_id, work_date: r.work_date })}>
        <div className="underline decoration-slate-300 underline-offset-2">{r.employee_name}</div>
        <div className="text-xs text-slate-500 font-mono">{r.employee_code}</div>
      </button>) },
    { key: "org_unit_name", label: "Tổ", filter: "select" },
    { key: "shift_name", label: "Ca", filter: "select" },
    { key: "in_out", label: "Vào – Ra", render: (r) => <span className="tabular-nums">{fmtHm(r.first_in)} – {fmtHm(r.last_out)}</span> },
    { key: "worked_min", label: "Giờ làm", align: "right", render: (r) => <span className="tabular-nums">{fmtMin(r.worked_min)}</span> },
    { key: "late_early", label: "Muộn / sớm", align: "right", render: (r) => (r.late_min || r.early_min
      ? <span className="tabular-nums text-amber-700">{r.late_min ? `M ${r.late_min}′` : ""}{r.late_min && r.early_min ? " · " : ""}{r.early_min ? `S ${r.early_min}′` : ""}</span>
      : <span className="text-slate-400">—</span>) },
    { key: "ot", label: "Tăng ca", align: "right", render: (r) => {
      const calc = r.ot_calc_min + r.ot_calc_night_min + r.ot_calc_holiday_min;
      if (!calc) return <span className="text-slate-400">—</span>;
      return <span className={`tabular-nums ${r.ot_status === "pending" ? "text-amber-700" : ""}`} title="thường / đêm / nghỉ-lễ">
        {fmtMin(r.ot_status === "pending" ? calc : r.ot_min + r.ot_night_min + r.ot_holiday_min)}{r.ot_status === "pending" && " (chờ duyệt)"}</span>;
    } },
    { key: "status", label: "Trạng thái", filter: "select", render: (r) => <Badge s={r.status} /> },
  ];

  return (
    <div className="space-y-4">
      <ListHeader title="Ngày công" subtitle="Kết quả tính công từ lần chấm, duyệt và sửa công — bấm tên nhân viên để xem chi tiết"
        actions={can("hr_all_units", "view") && <button type="button" className="btn-ghost" disabled={busy} onClick={recalc}><RefreshCw size={16} /> {busy ? "Đang tính…" : "Tính lại khoảng này"}</button>} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">Từ ngày<div className="mt-1 w-40"><DateInput value={from} onChange={(e) => setFrom(e.target.value)} /></div></label>
        <label className="text-sm text-slate-600">Đến ngày<div className="mt-1 w-40"><DateInput value={to} onChange={(e) => setTo(e.target.value)} /></div></label>
        <label className="text-sm text-slate-600">Đơn vị<div className="mt-1 w-56">
          <SearchSelect value={unit} onChange={setUnit} options={units.map((u) => ({ value: u.id, label: u.name }))} placeholder="-- Tất cả --" ariaLabel="Lọc theo đơn vị" />
        </div></label>
      </div>
      {err ? <LoadError message={`Không tải được ngày công (${err})`} onRetry={load} /> : (
        <DataTable columns={columns} rows={rows || []} rowKey={(r) => `${r.employee_id}|${r.work_date}`} loading={!rows}
          stateKey="hr:days" pageSize={20} emptyText="Chưa có ngày công trong khoảng này" />
      )}
      {open && <DayDetailModal employeeId={open.employee_id} date={open.work_date} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
