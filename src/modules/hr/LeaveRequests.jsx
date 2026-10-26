// [HR-G4] Đơn nghỉ — 2026-10-26, CHƯA PHÁT HÀNH (file mới)
// Tab: Chờ duyệt / Đơn tôi tạo / Tất cả. "Tạo đơn hộ" (công nhân không có tài khoản). Chi tiết: đính kèm + duyệt.
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Paperclip, FileText } from "lucide-react";
import { ListHeader, DataTable, LoadError, Modal, SearchSelect, DateInput, useSaving } from "../../components.jsx";
import { hrLeave, hrConfig } from "../../mesApi.js";
import { inputCls, fmtDate, fmtDateTime, fmtDec, toast } from "../../ui.js";
import { usePerm } from "../../perm.jsx";
import { Badge } from "./DayDetail.jsx";

const PART_LABEL = { FULL: "Cả ngày", AM: "Buổi sáng", PM: "Buổi chiều" };
const TABS = [
  { key: "pending", label: "Chờ duyệt" },
  { key: "mine", label: "Đơn tôi tạo" },
  { key: "all", label: "Tất cả" },
];
const range = (r) => (r.from_date === r.to_date
  ? `${fmtDate(r.from_date)}${r.from_part !== "FULL" ? ` (${PART_LABEL[r.from_part].toLowerCase()})` : ""}`
  : `${fmtDate(r.from_date)}${r.from_part === "PM" ? " (chiều)" : ""} → ${fmtDate(r.to_date)}${r.to_part === "AM" ? " (sáng)" : ""}`);

/* ─── Tạo đơn hộ ─── */
function CreateModal({ onClose, onDone }) {
  const [emps, setEmps] = useState([]);
  const [types, setTypes] = useState([]);
  const [v, setV] = useState({ employee_id: "", leave_type_id: "", from_date: "", to_date: "", from_part: "FULL", to_part: "FULL", reason: "" });
  const [file, setFile] = useState(null);
  const [balance, setBalance] = useState(null);
  const [saving, guard] = useSaving();
  const set = (k) => (x) => setV((s) => ({ ...s, [k]: x }));
  useEffect(() => {
    Promise.all([hrConfig.employees(), hrConfig.leaveTypes()])
      .then(([e, t]) => { setEmps(e.filter((x) => x.status === "Hoạt động")); setTypes(t.filter((x) => x.status === "Hoạt động")); })
      .catch((e) => toast.error(e.message));
  }, []);
  const type = types.find((t) => t.id === v.leave_type_id);
  const oneDay = v.from_date && v.from_date === v.to_date;
  // Số dư còn lại của loại nghỉ có giới hạn (hiện ngay khi chọn nhân viên + loại)
  useEffect(() => {
    setBalance(null);
    if (!v.employee_id || !type?.uses_balance) return undefined;
    let alive = true; // [Review G4 R14] đổi nhân viên / ngày nhanh: bỏ phản hồi cũ
    const year = (v.from_date || new Date().toLocaleDateString("en-CA")).slice(0, 4);
    hrLeave.balances({ year, employee_id: v.employee_id })
      .then((r) => { if (alive) setBalance(r.data.find((x) => x.leave_type_id === type.id) || null); }).catch(() => {});
    return () => { alive = false; };
  }, [v.employee_id, type, v.from_date]);
  const submit = () => guard(async () => {
    try {
      const d = { ...v, to_date: v.to_date || v.from_date, to_part: oneDay ? v.from_part : v.to_part };
      let r;
      try { r = await hrLeave.create(d); } catch (e) { toast.error(e.message); return; }
      // [Review G4 R13] đơn đã tạo xong — đính kèm lỗi thì KHÔNG giữ modal (bấm lại sẽ báo trùng ngày)
      let attachErr = null;
      if (file) { try { await hrLeave.upload(r.id, file); } catch (e) { attachErr = e.message; } }
      if (attachErr) toast.error(`Đã tạo đơn nhưng chưa đính kèm được (${attachErr}) — bổ sung trong chi tiết đơn`);
      else toast.success(`Đã tạo đơn ${type?.name || ""} — ${fmtDec(r.days, 1)} ngày, chờ trưởng đơn vị duyệt`);
      onDone(); onClose();
    } catch (e) { toast.error(e.message); }
  });
  const valid = v.employee_id && v.leave_type_id && v.from_date && v.reason.trim();
  return (
    <Modal title="Tạo đơn nghỉ hộ" onClose={onClose} size="md" locked={saving} dirty={!!(v.employee_id || v.reason)}
      footer={(close) => <>
        <button type="button" className="btn-ghost" onClick={close} disabled={saving}>Hủy</button>
        <button type="button" className="btn-primary disabled:opacity-60" disabled={saving || !valid} onClick={submit}>{saving ? "Đang gửi…" : "Gửi đơn"}</button>
      </>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block sm:col-span-2"><span className="text-sm font-medium text-slate-600">Nhân viên <span className="text-rose-600">*</span></span>
          <div className="mt-1"><SearchSelect value={v.employee_id} onChange={set("employee_id")} ariaLabel="Nhân viên"
            options={emps.map((e) => ({ value: e.id, label: `${e.name} · ${e.employee_code}${e.org_unit_name ? ` · ${e.org_unit_name}` : ""}` }))} /></div>
        </label>
        <label className="block sm:col-span-2"><span className="text-sm font-medium text-slate-600">Loại nghỉ <span className="text-rose-600">*</span></span>
          <select className={inputCls + " mt-1"} value={v.leave_type_id} onChange={(e) => set("leave_type_id")(e.target.value)}>
            <option value="">-- Chọn --</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.paid ? "" : " (không lương)"}</option>)}
          </select>
          {balance && <span className="block mt-1 text-xs text-slate-500">Còn lại {fmtDec(balance.remaining, 1)} ngày{balance.pending ? ` · đang chờ duyệt ${fmtDec(balance.pending, 1)} ngày` : ""}</span>}
        </label>
        <label className="block"><span className="text-sm font-medium text-slate-600">Từ ngày <span className="text-rose-600">*</span></span>
          <div className="mt-1"><DateInput value={v.from_date} onChange={(e) => { const d = e.target.value; setV((s) => ({ ...s, from_date: d, to_date: s.to_date && s.to_date >= d ? s.to_date : d })); }} /></div>
        </label>
        <label className="block"><span className="text-sm font-medium text-slate-600">Đến ngày</span>
          <div className="mt-1"><DateInput value={v.to_date} min={v.from_date} onChange={(e) => set("to_date")(e.target.value)} /></div>
        </label>
        <label className="block"><span className="text-sm font-medium text-slate-600">{oneDay || !v.to_date ? "Buổi" : "Ngày đầu nghỉ"}</span>
          <select className={inputCls + " mt-1"} value={v.from_part} onChange={(e) => set("from_part")(e.target.value)}>
            <option value="FULL">Cả ngày</option>
            {(oneDay || !v.to_date) && <option value="AM">Buổi sáng</option>}
            <option value="PM">{oneDay || !v.to_date ? "Buổi chiều" : "Từ buổi chiều"}</option>
          </select>
        </label>
        {!oneDay && v.to_date && (
          <label className="block"><span className="text-sm font-medium text-slate-600">Ngày cuối nghỉ</span>
            <select className={inputCls + " mt-1"} value={v.to_part} onChange={(e) => set("to_part")(e.target.value)}>
              <option value="FULL">Cả ngày</option><option value="AM">Đến hết buổi sáng</option>
            </select>
          </label>
        )}
        <label className="block sm:col-span-2"><span className="text-sm font-medium text-slate-600">Lý do <span className="text-rose-600">*</span></span>
          <textarea className={inputCls + " mt-1"} rows={2} maxLength={500} value={v.reason} onChange={(e) => set("reason")(e.target.value)} placeholder="VD: Ốm, có giấy khám…" />
        </label>
        <label className="block sm:col-span-2"><span className="text-sm font-medium text-slate-600">Đính kèm{type?.requires_attachment && <span className="text-amber-700"> (bắt buộc trước khi duyệt — có thể bổ sung sau)</span>}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-1 block text-sm" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <span className="block mt-1 text-xs text-slate-500">Ảnh hoặc PDF, tối đa 5 MB. Chủ nhật / ngày lễ trong khoảng nghỉ không bị trừ phép.</span>
        </label>
      </div>
    </Modal>
  );
}

/* ─── Chi tiết đơn ─── */
function DetailModal({ id, onClose, onChanged }) {
  const { can, user } = usePerm();
  const [r, setR] = useState(null);
  const [err, setErr] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, guard] = useSaving();
  const fileRef = useRef(null);
  const load = useCallback(() => hrLeave.get(id).then(setR).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  const isHr = can("hr_all_units", "view");
  const mine = r && user && r.created_by === user.id;
  const run = (action, d, msg) => guard(async () => {
    try { await hrLeave.act(id, action, d); toast.success(msg); onChanged(); load(); setRejecting(false); } catch (e) { toast.error(e.message); }
  });
  const upload = (file) => guard(async () => {
    try { await hrLeave.upload(id, file); toast.success("Đã đính kèm"); load(); onChanged(); } catch (e) { toast.error(e.message); }
  });
  const open = async (a) => { try { const { url } = await hrLeave.attachmentUrl(a.id); window.open(url, "_blank", "noopener"); } catch (e) { toast.error(e.message); } };
  const today = new Date().toLocaleDateString("en-CA");
  const pending = r && ["Chờ trưởng đơn vị", "Chờ nhân sự"].includes(r.status);
  return (
    <Modal title={r ? `Đơn ${r.leave_type_name} — ${r.employee_name}` : "Đơn nghỉ"} onClose={onClose} size="md" closeOnBackdrop>
      {err ? <LoadError message={err} onRetry={load} /> : !r ? <div className="text-sm text-slate-400">Đang tải…</div> : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Badge s={r.status} />
            <span><b>{range(r)}</b> · {fmtDec(r.days, 1)} ngày</span>
            <span className="text-slate-500">{r.org_unit_name}</span>
          </div>
          <p className="text-slate-700">Lý do: {r.reason}</p>
          <ul className="text-xs text-slate-500 space-y-0.5">
            <li>Tạo hộ bởi {r.created_by_name || "—"} lúc {fmtDateTime(r.created_at)}</li>
            {r.approved_by_name && <li>Trưởng đơn vị duyệt: {r.approved_by_name} · {fmtDateTime(r.approved_at)}</li>}
            {r.hr_approved_by_name && <li>Nhân sự duyệt: {r.hr_approved_by_name} · {fmtDateTime(r.hr_approved_at)}</li>}
            {r.rejected_by_name && <li className="text-rose-700">Từ chối bởi {r.rejected_by_name}: {r.reject_reason}</li>}
          </ul>
          <section>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-slate-700">Đính kèm{r.requires_attachment && <span className="text-amber-700 font-normal"> (bắt buộc)</span>}</h3>
              {pending && can("hr_leave", "create") && <>
                <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={() => fileRef.current?.click()}><Paperclip size={14} /> Bổ sung</button>
                <input ref={fileRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </>}
            </div>
            {r.attachments.length === 0 ? <p className="text-slate-400">Chưa có</p> : (
              <ul className="space-y-1">{r.attachments.map((a) => (
                <li key={a.id}><button type="button" className="inline-flex items-center gap-1 text-blue-700 hover:underline" onClick={() => open(a)}>
                  <FileText size={14} aria-hidden="true" /> {a.file_name || (a.mime === "application/pdf" ? "Tệp PDF" : "Ảnh")}</button>
                  <span className="text-xs text-slate-400"> · {fmtDec(a.bytes / 1024, 0)} KB</span></li>))}
              </ul>
            )}
          </section>
          {rejecting && (
            <label className="block"><span className="text-sm font-medium text-slate-600">Lý do từ chối <span className="text-rose-600">*</span></span>
              <textarea className={inputCls + " mt-1"} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100">
            {rejecting ? <>
              <button type="button" className="btn-ghost" onClick={() => setRejecting(false)}>Thôi</button>
              <button type="button" disabled={busy || !reason.trim()} className="btn-ghost text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => run("reject", { reject_reason: reason.trim() }, "Đã từ chối đơn")}>Xác nhận từ chối</button>
            </> : <>
              {pending && (mine || isHr) && <button type="button" disabled={busy} className="btn-ghost" onClick={() => window.confirm("Hủy đơn này?") && run("cancel", {}, "Đã hủy đơn")}>Hủy đơn</button>}
              {r.status === "Đã duyệt" && isHr && r.from_date > today && <button type="button" disabled={busy} className="btn-ghost text-rose-600 border-rose-200 hover:bg-rose-50"
                onClick={() => window.confirm(`Hủy đơn đã duyệt của ${r.employee_name}? Số ngày phép sẽ được hoàn lại.`) && run("cancel", {}, "Đã hủy đơn — số dư đã hoàn")}>Hủy đơn đã duyệt</button>}
              {pending && !mine && can("hr_leave", "approve") && (r.status === "Chờ trưởng đơn vị" || isHr) && <>
                <button type="button" disabled={busy} className="btn-ghost text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => setRejecting(true)}>Từ chối</button>
                {r.status === "Chờ trưởng đơn vị" && <button type="button" disabled={busy} className="btn-primary" onClick={() => run("approve", {}, r.requires_hr_approval ? "Đã duyệt — chờ nhân sự duyệt cuối" : "Đã duyệt đơn")}>Duyệt</button>}
                {r.status === "Chờ nhân sự" && isHr && <button type="button" disabled={busy} className="btn-primary" onClick={() => run("hr-approve", {}, "Đã duyệt cuối")}>Duyệt cuối (nhân sự)</button>}
              </>}
            </>}
          </div>
          {pending && mine && <p className="text-xs text-slate-500">Đơn do bạn tạo — người khác (trưởng xưởng / nhân sự) sẽ duyệt.</p>}
        </div>
      )}
    </Modal>
  );
}

export default function LeaveRequests() {
  const { can } = usePerm();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const openId = params.get("open");
  const seq = useRef(0);
  const query = useMemo(() => (tab === "pending" ? { status: "pending" } : tab === "mine" ? { mine: "1" } : {}), [tab]);
  const load = useCallback(async () => {
    const my = ++seq.current;
    setErr(""); setRows(null);
    try { const r = await hrLeave.list(query); if (my === seq.current) setRows(r.data); } catch (e) { if (my === seq.current) setErr(e.message); }
  }, [query]);
  useEffect(() => { load(); }, [load]);
  if (!can("hr_leave", "view")) return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Bạn không có quyền xem đơn nghỉ.</div>;

  const columns = [
    { key: "employee_name", label: "Nhân viên", filter: "text", render: (r) => (
      <button type="button" className="text-left hover:text-blue-700 underline decoration-slate-300 underline-offset-2"
        aria-label={`Xem đơn nghỉ của ${r.employee_name}`} onClick={() => setParams({ open: r.id })}>
        <div>{r.employee_name}</div><div className="text-xs text-slate-500 font-mono no-underline">{r.employee_code}</div>
      </button>) },
    { key: "org_unit_name", label: "Tổ", filter: "select" },
    { key: "leave_type_name", label: "Loại nghỉ", filter: "select" },
    { key: "range", label: "Thời gian", render: (r) => <span className="tabular-nums">{range(r)}</span> },
    { key: "days", label: "Số ngày", align: "right", render: (r) => <span className="tabular-nums">{fmtDec(r.days, 1)}</span> },
    { key: "attachment_count", label: "Đính kèm", align: "right", render: (r) => (r.attachment_count
      ? <span className="tabular-nums">{r.attachment_count}</span>
      : r.requires_attachment ? <span className="text-amber-700 text-xs">Thiếu</span> : <span className="text-slate-400">—</span>) },
    { key: "created_by_name", label: "Người tạo" },
    { key: "status", label: "Trạng thái", filter: "select", render: (r) => <Badge s={r.status} /> },
  ];
  return (
    <div className="space-y-4">
      <ListHeader title="Đơn nghỉ" subtitle="Trưởng tổ tạo hộ công nhân · trưởng xưởng duyệt · nhân sự duyệt cuối với loại nghỉ cần"
        actions={can("hr_leave", "create") && <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Tạo đơn hộ</button>} />
      <div role="tablist" aria-label="Lọc đơn" className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{t.label}</button>
        ))}
      </div>
      {err ? <LoadError message={`Không tải được đơn nghỉ (${err})`} onRetry={load} />
        : <DataTable columns={columns} rows={rows || []} rowKey={(r) => r.id} loading={!rows} stateKey={`hr:leave:${tab}`} pageSize={15}
          emptyText={tab === "pending" ? "Không có đơn chờ duyệt" : "Chưa có đơn"} />}
      {creating && <CreateModal onClose={() => setCreating(false)} onDone={load} />}
      {openId && <DetailModal id={openId} onClose={() => setParams({})} onChanged={load} />}
    </div>
  );
}
