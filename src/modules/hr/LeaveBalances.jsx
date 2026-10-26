// [HR-G4] Số dư phép — 2026-10-26, CHƯA PHÁT HÀNH (file mới)
// Được hưởng (12 / năm, reset 01/01) + chỉnh tay của nhân sự − đã dùng (đơn đã duyệt) = còn lại; đang chờ tách riêng.
import React, { useState, useEffect, useCallback, useRef } from "react";
import { ListHeader, DataTable, LoadError, Modal, useSaving } from "../../components.jsx";
import { hrLeave } from "../../mesApi.js";
import { inputCls, fmtDec, toast } from "../../ui.js";
import { usePerm } from "../../perm.jsx";

function AdjustModal({ row, onClose, onDone }) {
  const [v, setV] = useState({ adjusted: row.adjusted, reason: "" });
  const [saving, guard] = useSaving();
  const submit = () => guard(async () => {
    try { await hrLeave.adjust(row.employee_id, row.year, row.leave_type_id, { adjusted: Number(v.adjusted), reason: v.reason.trim() }); toast.success(`Đã chỉnh số dư của ${row.employee_name}`); onDone(); onClose(); }
    catch (e) { toast.error(e.message); }
  });
  return (
    <Modal title={`Chỉnh số dư — ${row.employee_name} · ${row.leave_type_name} ${row.year}`} onClose={onClose} size="sm" locked={saving} dirty={!!v.reason}
      footer={(close) => <>
        <button type="button" className="btn-ghost" onClick={close} disabled={saving}>Hủy</button>
        <button type="button" className="btn-primary disabled:opacity-60" disabled={saving || !v.reason.trim()} onClick={submit}>{saving ? "Đang lưu…" : "Lưu"}</button>
      </>}>
      <div className="space-y-3">
        <label className="block"><span className="text-sm font-medium text-slate-600">Cộng / trừ thêm (ngày, bước 0,5)</span>
          <input type="number" step={0.5} className={inputCls + " mt-1"} value={v.adjusted} onChange={(e) => setV((s) => ({ ...s, adjusted: e.target.value }))} />
          <span className="block mt-1 text-xs text-slate-500">Được hưởng {fmtDec(row.entitled, 1)} ngày. Số âm để trừ bớt.</span>
        </label>
        <label className="block"><span className="text-sm font-medium text-slate-600">Lý do <span className="text-rose-600">*</span></span>
          <textarea className={inputCls + " mt-1"} rows={2} maxLength={300} value={v.reason} onChange={(e) => setV((s) => ({ ...s, reason: e.target.value }))} />
        </label>
      </div>
    </Modal>
  );
}

export default function LeaveBalances() {
  const { can } = usePerm();
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    setErr(""); setRows(null);
    try { const r = await hrLeave.balances({ year }); if (my === seq.current) setRows(r.data); } catch (e) { if (my === seq.current) setErr(e.message); }
  }, [year]);
  useEffect(() => { load(); }, [load]);
  if (!can("hr_leave", "view")) return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Bạn không có quyền xem số dư phép.</div>;
  const canAdjust = can("hr_all_units", "view") && can("hr_leave", "approve");
  const num = (k) => (r) => <span className="tabular-nums">{fmtDec(r[k], 1)}</span>;
  const columns = [
    { key: "employee_name", label: "Nhân viên", filter: "text", render: (r) => <><div>{r.employee_name}</div><div className="text-xs text-slate-500 font-mono">{r.employee_code}</div></> },
    { key: "org_unit_name", label: "Tổ", filter: "select" },
    { key: "leave_type_name", label: "Loại", filter: "select" },
    { key: "entitled", label: "Được hưởng", align: "right", render: num("entitled") },
    { key: "adjusted", label: "Chỉnh", align: "right", render: (r) => (r.adjusted ? <span className="tabular-nums">{r.adjusted > 0 ? "+" : ""}{fmtDec(r.adjusted, 1)}</span> : <span className="text-slate-400">—</span>) },
    { key: "used", label: "Đã dùng", align: "right", render: num("used") },
    { key: "pending", label: "Đang chờ", align: "right", render: (r) => (r.pending ? <span className="tabular-nums text-amber-700">{fmtDec(r.pending, 1)}</span> : <span className="text-slate-400">—</span>) },
    { key: "remaining", label: "Còn lại", align: "right", render: (r) => <b className={`tabular-nums ${r.remaining <= 0 ? "text-rose-700" : "text-slate-800"}`}>{fmtDec(r.remaining, 1)}</b> },
    ...(canAdjust ? [{ key: "_act", label: "", align: "right", render: (r) => <button type="button" className="btn-ghost text-xs" onClick={() => setEditing(r)}>Chỉnh…</button> }] : []),
  ];
  return (
    <div className="space-y-4">
      <ListHeader title="Số dư phép" subtitle="Phép năm 12 ngày, reset 01/01, không cộng dồn · đã dùng tính từ đơn đã duyệt" />
      <label className="flex items-center gap-2 text-sm text-slate-600">Năm
        <input type="number" className={inputCls + " w-28 no-spin"} value={year} onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())} />
      </label>
      {err ? <LoadError message={`Không tải được số dư (${err})`} onRetry={load} />
        : <DataTable columns={columns} rows={rows || []} rowKey={(r) => `${r.employee_id}|${r.leave_type_id}`} loading={!rows} stateKey="hr:leave-balances" pageSize={20} />}
      {editing && <AdjustModal row={editing} onClose={() => setEditing(null)} onDone={load} />}
    </div>
  );
}
