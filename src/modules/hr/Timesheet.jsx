// [HR-G5] Bảng công tháng + bất thường + xuất Excel + chốt công — 2026-10-26, CHƯA PHÁT HÀNH (file mới)
// Lưới nhân viên × ngày (ký hiệu theo Q2), bấm ô → chi tiết ngày (G3). Chốt / mở khóa qua hộp thoại.
import React, { useState, useEffect, useCallback } from "react";
import { Download, Lock, Unlock } from "lucide-react";
import { ListHeader, DataTable, LoadError, SearchSelect, Modal, useSaving, usePager } from "../../components.jsx";
import { hrReport, hrConfig } from "../../mesApi.js";
import { inputCls, fmt, fmtDate, fmtDateTime, statusClass, toast } from "../../ui.js";
import { usePerm } from "../../perm.jsx";
import { DayDetailModal, Badge } from "./DayDetail.jsx";

const lastMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toLocaleDateString("en-CA").slice(0, 7); };
const ymLabel = (ym) => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
const NO_UNIT = "Chưa xếp tổ";
const WD = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function CloseModal({ ym, onClose, onDone }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState("");
  const [ack, setAck] = useState(false);
  const [note, setNote] = useState("");
  const [busy, guard] = useSaving();
  const load = useCallback(() => { setErr(""); setP(null); hrReport.precheck(ym).then(setP).catch((e) => setErr(e.message)); }, [ym]);
  useEffect(() => { load(); }, [load]);
  const blocked = !p || p.blockers.length > 0;
  const submit = () => guard(async () => {
    try { await hrReport.close(ym, { acknowledge_warnings: ack, note }); toast.success(`Đã chốt công tháng ${ymLabel(ym)}`); onDone(); }
    catch (e) { toast.error(e.message); load(); }
  });
  return (
    <Modal title={`Chốt công tháng ${ymLabel(ym)}`} onClose={onClose} locked={busy} size="md"
      footer={(close) => <>
        <button type="button" className="btn-ghost" onClick={close} disabled={busy}>Đóng</button>
        <button type="button" className="btn-primary" onClick={submit} disabled={busy || blocked || (p?.warnings.length > 0 && !ack)}>
          <Lock size={16} aria-hidden="true" /> {busy ? "Đang chốt…" : "Chốt công"}</button>
      </>}>
      {err ? <LoadError message={`Không kiểm tra được (${err})`} onRetry={load} /> : !p ? <div className="text-sm text-slate-500">Đang kiểm tra…</div> : (
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">Sau khi chốt, ngày công cả nhà máy trong tháng bị khóa: không sửa công, duyệt đơn / tăng ca, phân ca hay đổi ngày lễ của tháng này cho tới khi mở khóa.</p>
          {p.blockers.length > 0 && (
            <div>
              <div className="font-semibold text-rose-700 mb-1">Cần xử lý trước khi chốt</div>
              <ul className="space-y-1">{p.blockers.map((b) => (
                <li key={b.key} className="flex justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2 text-rose-700">
                  <span>{b.label}</span>{b.key !== "not_past" && <b className="tabular-nums">{fmt(b.count)}</b>}</li>))}</ul>
              <p className="mt-2 text-xs text-slate-500">Xử lý ở màn "Cần xử lý", "Đơn nghỉ" hoặc "Ngày công", rồi mở lại hộp thoại này.</p>
            </div>
          )}
          {p.warnings.length > 0 && (
            <div>
              <div className="font-semibold text-amber-700 mb-1">Cảnh báo (vẫn chốt được)</div>
              <ul className="space-y-1">{p.warnings.map((w) => (
                <li key={w.key} className="flex justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
                  <span>{w.label}</span><b className="tabular-nums">{fmt(w.count)}</b></li>))}</ul>
              <label className="mt-2 flex items-center gap-2 text-slate-700">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} disabled={blocked} />
                Tôi đã xem các cảnh báo trên và vẫn chốt</label>
            </div>
          )}
          {!p.blockers.length && !p.warnings.length && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">Không còn việc chờ — sẵn sàng chốt.</div>}
          <label className="block text-slate-600">Ghi chú
            <input className={`${inputCls} mt-1`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} autoComplete="off" placeholder="Vd: Đã đối chiếu với tổ trưởng…" />
          </label>
        </div>
      )}
    </Modal>
  );
}

function UnlockModal({ ym, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [hist, setHist] = useState(null);
  const [busy, guard] = useSaving();
  useEffect(() => {
    hrReport.periods(ym.slice(0, 4)).then((r) => setHist(r.data.find((x) => x.year_month === ym) || null)).catch(() => setHist(null));
  }, [ym]);
  const ok = reason.trim().length >= 5;
  const submit = () => guard(async () => {
    try { await hrReport.unlock(ym, reason.trim()); toast.success(`Đã mở khóa tháng ${ymLabel(ym)} — ngày công sẽ được tính lại trong vài phút`); onDone(); }
    catch (e) { toast.error(e.message); }
  });
  return (
    <Modal title={`Mở khóa công tháng ${ymLabel(ym)}`} onClose={onClose} locked={busy} dirty={!!reason} size="md"
      footer={(close) => <>
        <button type="button" className="btn-ghost" onClick={close} disabled={busy}>Đóng</button>
        <button type="button" className="btn-primary !bg-rose-600 hover:!bg-rose-700" onClick={submit} disabled={busy || !ok}>
          <Unlock size={16} aria-hidden="true" /> {busy ? "Đang mở…" : "Mở khóa"}</button>
      </>}>
      <div className="space-y-4 text-sm">
        {hist?.closed_at && <p className="text-slate-600">Chốt lúc <b>{fmtDateTime(hist.closed_at)}</b> bởi <b>{hist.closed_by_name || "—"}</b>{hist.close_note ? ` · ${hist.close_note}` : ""}</p>}
        <label className="block text-slate-600">Lý do mở khóa <span className="text-rose-600">*</span>
          <textarea className={`${inputCls} mt-1`} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500}
            placeholder="Vd: Bổ sung sửa công tổ Cắt 1 theo xác nhận của quản đốc…" autoFocus />
          {reason && !ok && <span className="text-xs text-rose-600">Lý do cần ít nhất 5 ký tự</span>}
        </label>
        {hist?.unlocks?.length > 0 && (
          <div>
            <div className="font-semibold text-slate-700 mb-1">Lịch sử mở khóa</div>
            <ul className="space-y-1 text-slate-600">{hist.unlocks.map((u, i) => (
              <li key={i} className="text-xs"><span className="tabular-nums">{fmtDateTime(u.at)}</span> · {u.by || "—"} · {u.reason}</li>))}</ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Grid({ data, onOpen }) {
  const { slice, pager } = usePager(data.employees, 50, [50, 100, 200], "hr:timesheet");
  if (!data.employees.length) return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Không có nhân viên trong phạm vi / đơn vị này</div>;
  const off = (d) => d.holiday || d.weekday === 7;
  const th = "px-1 py-1.5 text-[11px] font-semibold text-slate-500 text-center border-b border-slate-200";
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className={`${th} sticky left-0 z-10 bg-white text-left !px-3 min-w-[200px]`}>Nhân viên</th>
              {data.days.map((d) => (
                <th key={d.date} className={`${th} min-w-[34px] ${off(d) ? "bg-slate-100" : ""}`} title={d.holiday || fmtDate(d.date)}>
                  <div className="tabular-nums text-slate-700">{d.day}</div><div className="font-normal">{d.holiday ? "Lễ" : WD[d.weekday]}</div></th>))}
              <th className={`${th} !px-2`} title="Số công">Công</th>
              <th className={`${th} !px-2`} title="Ngày phép có lương">Phép</th>
              <th className={`${th} !px-2`} title="Vắng không phép">Vắng</th>
              <th className={`${th} !px-2`} title="Thiếu giờ / chờ xác nhận">?</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50/60">
                <td className="sticky left-0 z-10 bg-white px-3 py-1 border-b border-slate-100">
                  <div className="font-medium text-slate-800 truncate max-w-[220px]" title={e.name}>{e.name}</div>
                  <div className="text-[11px] text-slate-500"><span className="font-mono">{e.employee_code}</span> · {e.unit_name || NO_UNIT}</div>
                </td>
                {e.cells.map((c, i) => {
                  const d = data.days[i];
                  return (
                    <td key={d.date} className={`p-0.5 border-b border-slate-100 text-center ${off(d) ? "bg-slate-50" : ""}`}>
                      {c.s ? (
                        <button type="button" onClick={() => onOpen(e.id, d.date)}
                          title={`${e.name} · ${fmtDate(d.date)} · ${c.st}${c.a ? " · có bất thường" : ""}`}
                          aria-label={`${e.name} ngày ${fmtDate(d.date)}: ${c.st}`}
                          className={`w-full min-w-[30px] rounded px-0.5 py-1 font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${statusClass(c.st)} ${c.a ? "ring-1 ring-inset ring-rose-300" : ""}`}>
                          {c.s}</button>
                      ) : <span className="text-slate-300" aria-hidden="true">·</span>}
                    </td>);
                })}
                <td className="px-2 border-b border-slate-100 text-right tabular-nums font-semibold text-slate-800">{fmt(e.summary.work)}</td>
                <td className="px-2 border-b border-slate-100 text-right tabular-nums">{fmt(e.summary.paid)}</td>
                <td className={`px-2 border-b border-slate-100 text-right tabular-nums ${e.summary.absent ? "text-rose-700" : ""}`}>{fmt(e.summary.absent)}</td>
                <td className={`px-2 border-b border-slate-100 text-right tabular-nums ${e.summary.pending ? "text-amber-700" : ""}`}>{fmt(e.summary.pending)}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
      {pager}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {data.legend.map(([k, v]) => <span key={k}><b className="font-mono text-slate-700">{k}</b> {v}</span>)}
      </div>
    </div>
  );
}

export default function Timesheet() {
  const { can } = usePerm();
  const [month, setMonth] = useState(lastMonth());
  const [unit, setUnit] = useState("");
  const [units, setUnits] = useState([]);
  const [tab, setTab] = useState("grid");
  const [data, setData] = useState(null);
  const [anom, setAnom] = useState(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);
  const [modal, setModal] = useState(null);
  const [busy, guard] = useSaving();

  useEffect(() => { hrConfig.orgUnits().then(setUnits).catch(() => setUnits([])); }, []);
  const load = useCallback(async () => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    setErr(""); setData(null); setAnom(null);
    try {
      const params = { month, org_unit_id: unit };
      const [t, a] = await Promise.all([hrReport.timesheet(params), hrReport.anomalies(params)]);
      setData(t); setAnom(a.data);
    } catch (e) { setErr(e.message); }
  }, [month, unit]);
  useEffect(() => { load(); }, [load]);

  if (!can("hr_attendance", "view")) return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Bạn không có quyền xem bảng công.</div>;

  const closed = data?.period?.status === "Đã chốt";
  const canClose = can("hr_period", "approve") && can("hr_all_units", "view");
  const exportXlsx = () => guard(async () => {
    try {
      const blob = await hrReport.exportXlsx({ month, org_unit_id: unit });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `bang-cong-${month}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { toast.error(e.message); }
  });

  const anomCols = [
    { key: "work_date", label: "Ngày", render: (r) => <span className="tabular-nums">{fmtDate(r.work_date)}</span> },
    { key: "employee_name", label: "Nhân viên", filter: "text", render: (r) => (
      <button type="button" className="text-left hover:text-blue-700 rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
        onClick={() => setOpen({ employee_id: r.employee_id, work_date: r.work_date })} aria-label={`Xem ngày công ${r.employee_name} ngày ${fmtDate(r.work_date)}`}>
        <div className="underline decoration-slate-300 underline-offset-2">{r.employee_name}</div>
        <div className="text-xs text-slate-500 font-mono">{r.employee_code}</div>
      </button>) },
    { key: "unit_name", label: "Tổ", filter: "select", render: (r) => r.unit_name || NO_UNIT },
    { key: "status", label: "Trạng thái", filter: "select", render: (r) => <Badge s={r.status} /> },
    { key: "types", label: "Bất thường", render: (r) => <span className="text-slate-700">{r.types.join(" · ")}</span> },
    { key: "flags", label: "Cờ", render: (r) => r.flags.length ? <span className="text-xs text-slate-600">{r.flags.join("; ")}</span> : <span className="text-slate-400">—</span> },
  ];

  return (
    <div className="space-y-4">
      <ListHeader title="Bảng công tháng" subtitle="Ký hiệu theo ngày, tổng công và bất thường — bấm một ô để xem chi tiết ngày công"
        actions={<>
          {data && <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusClass(data.period.status)}`}
            title={closed ? `Chốt lúc ${fmtDateTime(data.period.closed_at)} bởi ${data.period.closed_by_name || "—"}` : "Chưa chốt — số liệu có thể thay đổi"}>
            {closed ? `Đã chốt ${fmtDate(data.period.closed_at)}` : "Chưa chốt"}</span>}
          {can("hr_attendance", "export") && <button type="button" className="btn-ghost" onClick={exportXlsx} disabled={busy || !data}>
            <Download size={16} aria-hidden="true" /> {busy ? "Đang xuất…" : "Xuất Excel"}</button>}
          {canClose && data && (closed
            ? <button type="button" className="btn-ghost" onClick={() => setModal("unlock")}><Unlock size={16} aria-hidden="true" /> Mở khóa</button>
            : <button type="button" className="btn-primary" onClick={() => setModal("close")}><Lock size={16} aria-hidden="true" /> Chốt công tháng</button>)}
        </>} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">Tháng
          <input type="month" className={`${inputCls} mt-1 w-40`} value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <label className="text-sm text-slate-600">Đơn vị<div className="mt-1 w-56">
          <SearchSelect value={unit} onChange={setUnit} options={units.map((u) => ({ value: u.id, label: u.name }))} placeholder="-- Tất cả --" ariaLabel="Lọc theo đơn vị" />
        </div></label>
        <div className="ml-auto flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm" role="tablist">
          {[["grid", "Bảng công"], ["anom", `Bất thường${anom ? ` (${anom.length})` : ""}`]].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`px-3 py-1.5 rounded-md transition-colors ${tab === k ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{l}</button>))}
        </div>
      </div>
      {err ? <LoadError message={`Không tải được bảng công (${err})`} onRetry={load} />
        : !data ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Đang tải…</div>
        : tab === "grid" ? <Grid data={data} onOpen={(employee_id, work_date) => setOpen({ employee_id, work_date })} />
        : <DataTable columns={anomCols} rows={anom || []} rowKey={(r) => `${r.employee_id}|${r.work_date}`} stateKey="hr:anomalies" pageSize={20}
            emptyText="Không có bất thường trong tháng" />}
      {open && <DayDetailModal employeeId={open.employee_id} date={open.work_date} onClose={() => setOpen(null)} onChanged={load} />}
      {modal === "close" && <CloseModal ym={month} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal === "unlock" && <UnlockModal ym={month} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
    </div>
  );
}
