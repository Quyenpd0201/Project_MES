// [HR-G3] Cần xử lý — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// Việc của trưởng tổ / nhân sự: lần chấm cần xác nhận, yêu cầu sửa công, tăng ca chờ duyệt.
import React, { useState, useEffect, useCallback } from "react";
import { Image as ImageIcon, Check, X } from "lucide-react";
import { ListHeader, DataTable, LoadError, Modal, useSaving } from "../../components.jsx";
import { hrWorkday, hrAttendance } from "../../mesApi.js";
import { inputCls, fmtDate, fmtDateTime, toast } from "../../ui.js";
import { usePerm } from "../../perm.jsx";
import { DayDetailModal, Badge, fmtMin } from "./DayDetail.jsx";

const TABS = [
  { key: "punches", label: "Lần chấm cần xác nhận" },
  { key: "corrections", label: "Yêu cầu sửa công" },
  { key: "overtime", label: "Tăng ca chờ duyệt" },
];
const KIND_LABEL = { add_in: "Bổ sung giờ vào", add_out: "Bổ sung giờ ra", ignore_punch: "Bỏ lần chấm sai" };
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString("en-CA"); };
const iconBtn = "p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40";

function useLoad(loader) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => { setErr(""); setRows(null); try { setRows((await loader()).data); } catch (e) { setErr(e.message); } }, [loader]);
  useEffect(() => { load(); }, [load]);
  return { rows, err, load };
}

/** Hộp nhập lý do (từ chối) */
function ReasonModal({ title, label, onSubmit, onClose }) {
  const [v, setV] = useState("");
  const [saving, guard] = useSaving();
  return (
    <Modal title={title} onClose={onClose} size="sm" locked={saving} dirty={!!v}
      footer={(close) => <>
        <button type="button" className="btn-ghost" onClick={close} disabled={saving}>Hủy</button>
        <button type="button" className="btn-ghost text-rose-600 border-rose-200 hover:bg-rose-50 disabled:opacity-60" disabled={saving || !v.trim()}
          onClick={() => guard(async () => { try { await onSubmit(v.trim()); onClose(); } catch (e) { toast.error(e.message); } })}>{saving ? "Đang lưu…" : "Từ chối"}</button>
      </>}>
      <label className="block"><span className="text-sm font-medium text-slate-600">{label} <span className="text-rose-600">*</span></span>
        <textarea className={inputCls + " mt-1"} rows={3} maxLength={500} value={v} onChange={(e) => setV(e.target.value)} />
      </label>
    </Modal>
  );
}

function PunchesTab({ canApprove, onOpen }) {
  const loader = useCallback(() => hrWorkday.pendingReviews({ from: daysAgo(30), to: daysAgo(0) }), []);
  const { rows, err, load } = useLoad(loader);
  const [busy, guard] = useSaving();
  const [rejecting, setRejecting] = useState(null);
  const [photo, setPhoto] = useState(null);
  if (err) return <LoadError message={`Không tải được (${err})`} onRetry={load} />;
  const accept = (r) => guard(async () => {
    try { await hrWorkday.reviewPunch(r.id, "accept", "Đã đối chiếu"); toast.success(`Đã duyệt lần chấm của ${r.employee_name}`); load(); } catch (e) { toast.error(e.message); }
  });
  const openPhoto = async (r) => { try { const { url } = await hrAttendance.photoUrl(r.photo_id); setPhoto({ url, who: r.employee_name, at: r.punched_at }); } catch (e) { toast.error(e.message); } };
  const columns = [
    { key: "punched_at", label: "Thời điểm", render: (r) => <span className="tabular-nums">{fmtDateTime(r.punched_at)}</span> },
    { key: "employee_name", label: "Nhân viên", filter: "text", render: (r) => (
      <button type="button" className="text-left hover:text-blue-700 underline decoration-slate-300 underline-offset-2" aria-label={`Xem ngày công ${r.employee_name} ngày ${fmtDate(r.work_date)}`} onClick={() => onOpen(r.employee_id, r.work_date)}>{r.employee_name}</button>) },
    { key: "org_unit_name", label: "Tổ", filter: "select" },
    { key: "review_reason", label: "Lý do cần xác nhận", render: (r) => <span className="text-amber-700">{r.review_reason}</span> },
    { key: "_act", label: "", align: "right", render: (r) => (
      <div className="flex justify-end gap-1">
        {r.photo_id && !r.photo_purged ? <button type="button" className={iconBtn} title="Xem ảnh" aria-label={`Xem ảnh ${r.employee_name}`} onClick={() => openPhoto(r)}><ImageIcon size={15} /></button>
          : <span className="text-xs text-slate-400 self-center mr-2">Không ảnh</span>}
        {canApprove && <>
          <button type="button" disabled={busy} className={`${iconBtn} hover:text-emerald-700 hover:bg-emerald-50`} title="Duyệt (tính công)" aria-label={`Duyệt lần chấm ${r.employee_name}`} onClick={() => accept(r)}><Check size={15} /></button>
          <button type="button" disabled={busy} className={`${iconBtn} hover:text-rose-600 hover:bg-rose-50`} title="Từ chối (không tính)" aria-label={`Từ chối lần chấm ${r.employee_name}`} onClick={() => setRejecting(r)}><X size={15} /></button>
        </>}
      </div>) },
  ];
  return (
    <>
      <DataTable columns={columns} rows={rows || []} rowKey={(r) => r.id} loading={!rows} stateKey="hr:inbox:punches" emptyText="Không có lần chấm nào cần xác nhận" />
      {rejecting && <ReasonModal title={`Từ chối lần chấm — ${rejecting.employee_name}`} label="Lý do từ chối" onClose={() => setRejecting(null)}
        onSubmit={async (reason) => { await hrWorkday.reviewPunch(rejecting.id, "reject", reason); toast.success("Đã từ chối lần chấm"); load(); }} />}
      {photo && (
        <Modal title={`Ảnh chấm công — ${photo.who}`} onClose={() => setPhoto(null)} size="md" closeOnBackdrop>
          <div className="text-center space-y-2">
            <img src={photo.url} alt={`Ảnh chấm công của ${photo.who}`} width={480} height={360} className="mx-auto rounded-lg max-h-[60vh] w-auto" />
            <p className="text-sm text-slate-500 tabular-nums">{fmtDateTime(photo.at)} · lượt xem đã được ghi lại</p>
          </div>
        </Modal>
      )}
    </>
  );
}

function CorrectionsTab({ canApprove, onOpen }) {
  const loader = useCallback(() => hrWorkday.corrections({ from: daysAgo(60), to: daysAgo(0), status: "Chờ duyệt" }), []);
  const { rows, err, load } = useLoad(loader);
  const [busy, guard] = useSaving();
  const [rejecting, setRejecting] = useState(null);
  if (err) return <LoadError message={`Không tải được (${err})`} onRetry={load} />;
  const act = (r, action) => guard(async () => {
    if (action === "cancel" && !window.confirm(`Hủy yêu cầu sửa công của ${r.employee_name} (${fmtDate(r.work_date)})?`)) return;
    try { await hrWorkday.decideCorrection(r.id, action); toast.success(action === "approve" ? "Đã duyệt sửa công — ngày công đã tính lại" : "Đã hủy yêu cầu"); load(); }
    catch (e) { toast.error(e.message); }
  });
  const columns = [
    { key: "work_date", label: "Ngày công", render: (r) => <span className="tabular-nums">{fmtDate(r.work_date)}</span> },
    { key: "employee_name", label: "Nhân viên", filter: "text", render: (r) => (
      <button type="button" className="text-left hover:text-blue-700 underline decoration-slate-300 underline-offset-2" aria-label={`Xem ngày công ${r.employee_name} ngày ${fmtDate(r.work_date)}`} onClick={() => onOpen(r.employee_id, r.work_date)}>{r.employee_name}</button>) },
    { key: "kind", label: "Sửa", render: (r) => <>{KIND_LABEL[r.kind]}{r.new_time && <b className="tabular-nums"> {fmtDateTime(r.new_time)}</b>}</> },
    { key: "reason", label: "Lý do", render: (r) => <span className="truncate block max-w-xs" title={r.reason}>{r.reason}</span> },
    { key: "requested_by_name", label: "Người tạo" },
    { key: "_act", label: "", align: "right", render: (r) => (
      <div className="flex justify-end gap-1">
        {r.mine ? <button type="button" disabled={busy} className={`${iconBtn} hover:text-rose-600 hover:bg-rose-50`} title="Hủy yêu cầu của tôi" aria-label="Hủy yêu cầu" onClick={() => act(r, "cancel")}><X size={15} /></button>
          : canApprove && <>
            <button type="button" disabled={busy} className={`${iconBtn} hover:text-emerald-700 hover:bg-emerald-50`} title="Duyệt" aria-label={`Duyệt sửa công ${r.employee_name}`} onClick={() => act(r, "approve")}><Check size={15} /></button>
            <button type="button" disabled={busy} className={`${iconBtn} hover:text-rose-600 hover:bg-rose-50`} title="Từ chối" aria-label={`Từ chối sửa công ${r.employee_name}`} onClick={() => setRejecting(r)}><X size={15} /></button>
          </>}
      </div>) },
  ];
  return (
    <>
      <p className="text-xs text-slate-500">Yêu cầu do chính bạn tạo không duyệt được — người khác (trưởng xưởng / nhân sự) sẽ duyệt.</p>
      <DataTable columns={columns} rows={rows || []} rowKey={(r) => r.id} loading={!rows} stateKey="hr:inbox:corr" emptyText="Không có yêu cầu sửa công chờ duyệt" />
      {rejecting && <ReasonModal title={`Từ chối sửa công — ${rejecting.employee_name}`} label="Lý do từ chối" onClose={() => setRejecting(null)}
        onSubmit={async (reject_reason) => { await hrWorkday.decideCorrection(rejecting.id, "reject", { reject_reason }); toast.success("Đã từ chối yêu cầu"); load(); }} />}
    </>
  );
}

function OvertimeModal({ row, onClose, onDone }) {
  const [v, setV] = useState({ ot_min: row.ot_calc_min, ot_night_min: row.ot_calc_night_min, ot_holiday_min: row.ot_calc_holiday_min });
  const [saving, guard] = useSaving();
  const field = (k, label, max) => (
    <label className="block"><span className="text-sm font-medium text-slate-600">{label} (tối đa {max} phút)</span>
      <input type="number" min={0} max={max} step={30} className={inputCls + " mt-1"} value={v[k]} disabled={!max}
        onChange={(e) => setV((s) => ({ ...s, [k]: Math.max(0, Math.min(max, Number(e.target.value) || 0)) }))} />
    </label>
  );
  return (
    <Modal title={`Duyệt tăng ca — ${row.employee_name} · ${fmtDate(row.work_date)}`} onClose={onClose} size="sm" locked={saving}
      footer={(close) => <>
        <button type="button" className="btn-ghost" onClick={close} disabled={saving}>Hủy</button>
        <button type="button" className="btn-primary disabled:opacity-60" disabled={saving}
          onClick={() => guard(async () => { try { await hrWorkday.approveOvertime(row.employee_id, row.work_date, v); toast.success("Đã duyệt tăng ca"); onDone(); onClose(); } catch (e) { toast.error(e.message); } })}>
          {saving ? "Đang lưu…" : "Duyệt tăng ca"}</button>
      </>}>
      <div className="space-y-3">
        {field("ot_min", "Tăng ca thường", row.ot_calc_min)}
        {field("ot_night_min", "Tăng ca đêm", row.ot_calc_night_min)}
        {field("ot_holiday_min", "Tăng ca ngày nghỉ / lễ", row.ot_calc_holiday_min)}
        <p className="text-xs text-slate-500">Có thể duyệt ít hơn số phút tính được (VD chỉ duyệt phần được giao làm thêm).</p>
      </div>
    </Modal>
  );
}

function OvertimeTab({ canApprove, onOpen }) {
  const loader = useCallback(() => hrWorkday.days({ from: daysAgo(30), to: daysAgo(0), ot_status: "pending" }), []);
  const { rows, err, load } = useLoad(loader);
  const [editing, setEditing] = useState(null);
  if (err) return <LoadError message={`Không tải được (${err})`} onRetry={load} />;
  const columns = [
    { key: "work_date", label: "Ngày", render: (r) => <span className="tabular-nums">{fmtDate(r.work_date)}</span> },
    { key: "employee_name", label: "Nhân viên", filter: "text", render: (r) => (
      <button type="button" className="text-left hover:text-blue-700 underline decoration-slate-300 underline-offset-2" aria-label={`Xem ngày công ${r.employee_name} ngày ${fmtDate(r.work_date)}`} onClick={() => onOpen(r.employee_id, r.work_date)}>{r.employee_name}</button>) },
    { key: "org_unit_name", label: "Tổ", filter: "select" },
    { key: "status", label: "Ngày", render: (r) => <Badge s={r.status} /> },
    { key: "ot_calc_min", label: "Thường", align: "right", render: (r) => <span className="tabular-nums">{fmtMin(r.ot_calc_min)}</span> },
    { key: "ot_calc_night_min", label: "Đêm", align: "right", render: (r) => <span className="tabular-nums">{fmtMin(r.ot_calc_night_min)}</span> },
    { key: "ot_calc_holiday_min", label: "Nghỉ / lễ", align: "right", render: (r) => <span className="tabular-nums">{fmtMin(r.ot_calc_holiday_min)}</span> },
    { key: "_act", label: "", align: "right", render: (r) => canApprove && (
      <button type="button" className="btn-ghost text-sm" onClick={() => setEditing(r)}>Duyệt…</button>) },
  ];
  return (
    <>
      <DataTable columns={columns} rows={rows || []} rowKey={(r) => `${r.employee_id}|${r.work_date}`} loading={!rows} stateKey="hr:inbox:ot" emptyText="Không có tăng ca chờ duyệt" />
      {editing && <OvertimeModal row={editing} onClose={() => setEditing(null)} onDone={load} />}
    </>
  );
}

export default function HrInbox() {
  const { can } = usePerm();
  const [tab, setTab] = useState("punches");
  const [open, setOpen] = useState(null);
  const [rev, setRev] = useState(0);
  if (!can("hr_attendance", "view")) return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Bạn không có quyền xem mục này.</div>;
  const canApprove = can("hr_attendance", "approve");
  const onOpen = (employee_id, work_date) => setOpen({ employee_id, work_date });
  return (
    <div className="space-y-4">
      <ListHeader title="Cần xử lý" subtitle="Lần chấm cần xác nhận, yêu cầu sửa công và tăng ca chờ duyệt (30–60 ngày gần nhất)" />
      <div role="tablist" aria-label="Loại việc" className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="space-y-3" key={rev}>
        {tab === "punches" && <PunchesTab canApprove={canApprove} onOpen={onOpen} />}
        {tab === "corrections" && <CorrectionsTab canApprove={canApprove} onOpen={onOpen} />}
        {tab === "overtime" && <OvertimeTab canApprove={canApprove} onOpen={onOpen} />}
      </div>
      {open && <DayDetailModal employeeId={open.employee_id} date={open.work_date} onClose={() => setOpen(null)} onChanged={() => setRev((x) => x + 1)} />}
    </div>
  );
}
