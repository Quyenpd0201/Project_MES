// [HR-G1] Module Chấm công — 2026-10-22, CHƯA PHÁT HÀNH (file mới)
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Edit, Trash2, KeyRound, Unlock, Users, ArrowRightLeft, Ban } from "lucide-react";
import { ListHeader, DataTable, Modal, LoadError, SearchSelect, DateInput, useSaving } from "../../components.jsx";
import { hrConfig } from "../../mesApi.js";
import { inputCls, fmtDate, fmtDateTime, fmtDec, toast } from "../../ui.js";
import { usePerm } from "../../perm.jsx";

/* Cấu hình Chấm công & Nghỉ phép: Đơn vị/Tổ · Ca làm · Loại nghỉ · Ngày lễ · Nhân viên & PIN.
   Quyền: hr_config.view (xem) / hr_config.edit (sửa). Lọc nhân viên theo phạm vi do backend làm. */
const TABS = [
  { key: "units", label: "Đơn vị / Tổ" },
  { key: "shifts", label: "Ca làm" },
  { key: "leave", label: "Loại nghỉ" },
  { key: "holidays", label: "Ngày lễ" },
  { key: "employees", label: "Nhân viên & PIN" },
  { key: "devices", label: "Tablet chấm công" }, // [HR-G2]
];
const KIND_LABEL = { XUONG: "Xưởng", PHONG: "Phòng", TO: "Tổ" };
const hhmm = (t) => (t ? String(t).slice(0, 5) : "—");

/** Tải danh sách + trạng thái lỗi/đang tải dùng chung cho mọi tab */
function useList(loader) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const seq = useRef(0); // chỉ nhận kết quả của lần tải mới nhất (đổi năm nhanh không bị ghi đè ngược)
  const load = useCallback(async () => {
    const my = ++seq.current;
    setErr(""); setRows(null);
    try { const r = await loader(); if (my === seq.current) setRows(r); }
    catch (e) { if (my === seq.current) setErr(e.message || "Lỗi máy chủ"); }
  }, [loader]);
  useEffect(() => { load(); }, [load]);
  return { rows, err, load };
}

function Field({ label, required, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium text-slate-600">{label}{required && <span className="text-rose-600"> *</span>}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Check({ label, checked, onChange, disabled }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
      {label}
    </label>
  );
}

const iconBtn = "p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors";

/** Hộp thoại form dùng chung: giữ state, chống bấm 2 lần, hỏi khi đóng có thay đổi. */
function FormModal({ title, initial, onSubmit, onClose, children, submitLabel = "Lưu" }) {
  const [v, setV] = useState(initial);
  const [saving, guard] = useSaving();
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const set = (k) => (val) => setV((s) => ({ ...s, [k]: val }));
  const submit = () => guard(async () => {
    try { await onSubmit(v); onClose(); } catch (e) { toast.error(e.message); }
  });
  return (
    <Modal title={title} onClose={onClose} dirty={dirty} locked={saving} size="md"
      footer={(close) => <>
        <button type="button" className="btn-ghost" onClick={close} disabled={saving}>Hủy</button>
        <button type="button" className="btn-primary disabled:opacity-60" onClick={submit} disabled={saving}>{saving ? "Đang lưu…" : submitLabel}</button>
      </>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children(v, set)}</div>
    </Modal>
  );
}

/* ─── Tab Đơn vị / Tổ ─── */
function UnitsTab({ canEdit }) {
  const { rows, err, load } = useList(hrConfig.orgUnits);
  const [edit, setEdit] = useState(null);
  const [mgr, setMgr] = useState(null);
  const byId = useMemo(() => Object.fromEntries((rows || []).map((u) => [u.id, u])), [rows]);
  const parentOpts = (rows || []).filter((u) => u.kind !== "TO" && u.status === "Hoạt động").map((u) => ({ value: u.id, label: u.name }));

  if (err) return <LoadError message={`Không tải được đơn vị (${err})`} onRetry={load} />;
  const columns = [
    { key: "code", label: "Mã", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: "name", label: "Tên", filter: "text" },
    { key: "kind", label: "Loại", filter: "select", filterValue: (r) => KIND_LABEL[r.kind], render: (r) => KIND_LABEL[r.kind] },
    { key: "parent", label: "Thuộc", render: (r) => byId[r.parent_id]?.name || <span className="text-slate-400">—</span> },
    { key: "managers", label: "Người quản lý", render: (r) => r.managers.length ? r.managers.map((m) => m.name).join(", ") : <span className="text-slate-400">—</span> },
    { key: "employee_count", label: "Nhân viên", align: "right", render: (r) => <span className="tabular-nums">{r.employee_count}</span> },
    { key: "status", label: "Trạng thái" },
    ...(canEdit ? [{ key: "_act", label: "", align: "right", render: (r) => (
      <div className="flex justify-end gap-1">
        <button type="button" className={iconBtn} title="Gán người quản lý" aria-label={`Gán người quản lý ${r.name}`} onClick={() => setMgr(r)}><Users size={15} /></button>
        <button type="button" className={iconBtn} title="Sửa" aria-label={`Sửa ${r.name}`} onClick={() => setEdit(r)}><Edit size={15} /></button>
      </div>) }] : []),
  ];
  const save = async (v) => {
    const d = { name: v.name, kind: v.kind, parent_id: v.parent_id || null, status: v.status };
    if (edit.id) await hrConfig.updateOrgUnit(edit.id, d); else await hrConfig.createOrgUnit({ ...d, code: v.code });
    toast.success(edit.id ? `Đã lưu ${v.name}` : `Đã tạo ${v.name}`);
    load();
  };
  return (
    <>
      {canEdit && <div className="flex justify-end"><button type="button" className="btn-primary" onClick={() => setEdit({ kind: "TO", status: "Hoạt động" })}><Plus size={16} /> Thêm đơn vị</button></div>}
      <DataTable columns={columns} rows={rows || []} rowKey={(r) => r.id} loading={!rows} stateKey="hr:units" />
      {edit && (
        <FormModal title={edit.id ? `Sửa ${edit.name}` : "Thêm đơn vị / tổ"} initial={{ code: edit.code || "", name: edit.name || "", kind: edit.kind, parent_id: edit.parent_id || "", status: edit.status }}
          onSubmit={save} onClose={() => setEdit(null)}>
          {(v, set) => <>
            <Field label="Mã" required><input className={inputCls} value={v.code} disabled={!!edit.id} spellCheck={false} autoComplete="off" placeholder="VD: THOI-T1…" onChange={(e) => set("code")(e.target.value)} /></Field>
            <Field label="Tên" required><input className={inputCls} value={v.name} autoComplete="off" onChange={(e) => set("name")(e.target.value)} /></Field>
            <Field label="Loại" required>
              <select className={inputCls} value={v.kind} onChange={(e) => set("kind")(e.target.value)}>
                {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Thuộc xưởng / phòng" required={v.kind === "TO"}>
              <SearchSelect value={v.parent_id} onChange={set("parent_id")} options={parentOpts.filter((o) => o.value !== edit.id)} placeholder="-- Không --" ariaLabel="Thuộc xưởng / phòng" />
            </Field>
            {edit.id && <Field label="Trạng thái">
              <select className={inputCls} value={v.status} onChange={(e) => set("status")(e.target.value)}>
                <option>Hoạt động</option><option>Không hoạt động</option>
              </select>
            </Field>}
          </>}
        </FormModal>
      )}
      {mgr && <ManagersModal unit={mgr} onClose={() => setMgr(null)} onSaved={load} />}
    </>
  );
}

function ManagersModal({ unit, onClose, onSaved }) {
  const [all, setAll] = useState(null);
  const initial = unit.managers.map((m) => m.id);
  const [sel, setSel] = useState(initial);
  const [saving, guard] = useSaving();
  useEffect(() => { hrConfig.assignableUsers().then(setAll).catch((e) => { toast.error(e.message); setAll([]); }); }, []);
  const save = () => guard(async () => {
    try { await hrConfig.setManagers(unit.id, sel); toast.success(`Đã lưu người quản lý ${unit.name}`); onSaved(); onClose(); }
    catch (e) { toast.error(e.message); }
  });
  return (
    <Modal title={`Người quản lý — ${unit.name}`} onClose={onClose} size="md" locked={saving}
      dirty={JSON.stringify([...sel].sort()) !== JSON.stringify([...initial].sort())}
      footer={(close) => <>
        <button type="button" className="btn-ghost" onClick={close} disabled={saving}>Hủy</button>
        <button type="button" className="btn-primary disabled:opacity-60" onClick={save} disabled={saving || !all}>{saving ? "Đang lưu…" : "Lưu người quản lý"}</button>
      </>}>
      {!all ? <div className="text-sm text-slate-400">Đang tải…</div> : (
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {all.map((u) => (
            <Check key={u.id} label={`${u.name} (${u.username})`} checked={sel.includes(u.id)}
              onChange={(on) => setSel((s) => (on ? [...s, u.id] : s.filter((x) => x !== u.id)))} />
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500 mt-3">Người quản lý xưởng sẽ quản lý luôn các tổ bên dưới.</p>
    </Modal>
  );
}

/* ─── Tab Ca làm ─── */
function ShiftsTab({ canEdit }) {
  const { rows, err, load } = useList(hrConfig.shifts);
  const [edit, setEdit] = useState(null);
  if (err) return <LoadError message={`Không tải được ca làm (${err})`} onRetry={load} />;
  const columns = [
    { key: "shift_code", label: "Mã", render: (r) => <span className="font-mono text-xs">{r.shift_code}</span> },
    { key: "name", label: "Tên ca" },
    { key: "time", label: "Giờ làm", render: (r) => <span className="tabular-nums">{hhmm(r.start_time)}–{hhmm(r.end_time)}{r.overnight && <span className="text-xs text-slate-500"> (qua đêm)</span>}</span> },
    { key: "breaks", label: "Nghỉ", render: (r) => r.breaks.length ? r.breaks.map((b) => `${hhmm(b.start_time)}–${hhmm(b.end_time)}`).join(", ") : <span className="text-slate-400">—</span> },
    { key: "required_minutes", label: "Giờ công", align: "right", render: (r) => <span className="tabular-nums">{fmtDec(r.required_minutes / 60, 1)} giờ</span> },
    { key: "grace", label: "Châm chước muộn/sớm", align: "right", render: (r) => <span className="tabular-nums">{r.late_grace_min}/{r.early_grace_min} phút</span> },
    { key: "detect", label: "Tự nhận ca khi chấm vào", render: (r) => r.auto_detect_from ? `${hhmm(r.auto_detect_from)}–${hhmm(r.auto_detect_to)}` : <span className="text-slate-400">—</span> },
    ...(canEdit ? [{ key: "_act", label: "", align: "right", render: (r) => <button type="button" className={iconBtn} title="Sửa" aria-label={`Sửa ${r.name}`} onClick={() => setEdit(r)}><Edit size={15} /></button> }] : []),
  ];
  const save = async (v) => {
    const d = {
      name: v.name, start_time: v.start_time, end_time: v.end_time, overnight: v.overnight,
      required_minutes: Math.round(Number(v.required_hours) * 60), late_grace_min: Number(v.late_grace_min), early_grace_min: Number(v.early_grace_min),
      auto_detect_from: v.auto_detect_from || null, auto_detect_to: v.auto_detect_to || null,
      ot_enabled: v.ot_enabled, ot_requires_approval: v.ot_requires_approval,
      breaks: v.breaks.filter((b) => b.start_time && b.end_time),
    };
    if (edit.id) await hrConfig.updateShift(edit.id, d); else await hrConfig.createShift({ ...d, shift_code: v.shift_code });
    toast.success(edit.id ? `Đã lưu ${v.name}` : `Đã tạo ${v.name}`);
    load();
  };
  const init = (s) => ({
    shift_code: s.shift_code || "", name: s.name || "", start_time: hhmm(s.start_time).replace("—", ""), end_time: hhmm(s.end_time).replace("—", ""),
    overnight: !!s.overnight, required_hours: (s.required_minutes ?? 480) / 60, late_grace_min: s.late_grace_min ?? 0, early_grace_min: s.early_grace_min ?? 0,
    auto_detect_from: s.auto_detect_from ? hhmm(s.auto_detect_from) : "", auto_detect_to: s.auto_detect_to ? hhmm(s.auto_detect_to) : "",
    ot_enabled: s.ot_enabled ?? true, ot_requires_approval: s.ot_requires_approval ?? true,
    breaks: (s.breaks || []).map((b) => ({ start_time: hhmm(b.start_time), end_time: hhmm(b.end_time) })),
  });
  return (
    <>
      {canEdit && <div className="flex justify-end"><button type="button" className="btn-primary" onClick={() => setEdit({})}><Plus size={16} /> Thêm ca</button></div>}
      <DataTable columns={columns} rows={rows || []} rowKey={(r) => r.id} loading={!rows} stateKey="hr:shifts" />
      {edit && (
        <FormModal title={edit.id ? `Sửa ${edit.name}` : "Thêm ca làm"} initial={init(edit)} onSubmit={save} onClose={() => setEdit(null)}>
          {(v, set) => <>
            <Field label="Mã ca" required><input className={inputCls} value={v.shift_code} disabled={!!edit.id} spellCheck={false} autoComplete="off" onChange={(e) => set("shift_code")(e.target.value)} /></Field>
            <Field label="Tên ca" required><input className={inputCls} value={v.name} autoComplete="off" onChange={(e) => set("name")(e.target.value)} /></Field>
            <Field label="Giờ bắt đầu" required><input type="time" className={inputCls} value={v.start_time} onChange={(e) => set("start_time")(e.target.value)} /></Field>
            <Field label="Giờ kết thúc" required><input type="time" className={inputCls} value={v.end_time} onChange={(e) => set("end_time")(e.target.value)} /></Field>
            <div className="sm:col-span-2"><Check label="Ca qua đêm (kết thúc sáng hôm sau)" checked={v.overnight} onChange={set("overnight")} /></div>
            <Field label="Giờ công chuẩn (giờ)" required><input type="number" min={0.5} step={0.5} className={inputCls} value={v.required_hours} onChange={(e) => set("required_hours")(e.target.value)} /></Field>
            <div />
            <Field label="Châm chước đi muộn (phút)"><input type="number" min={0} className={inputCls} value={v.late_grace_min} onChange={(e) => set("late_grace_min")(e.target.value)} /></Field>
            <Field label="Châm chước về sớm (phút)"><input type="number" min={0} className={inputCls} value={v.early_grace_min} onChange={(e) => set("early_grace_min")(e.target.value)} /></Field>
            <Field label="Tự nhận ca nếu chấm vào từ"><input type="time" className={inputCls} value={v.auto_detect_from} onChange={(e) => set("auto_detect_from")(e.target.value)} /></Field>
            <Field label="đến"><input type="time" className={inputCls} value={v.auto_detect_to} onChange={(e) => set("auto_detect_to")(e.target.value)} /></Field>
            <div className="sm:col-span-2 space-y-2">
              <div className="text-sm font-medium text-slate-600">Khung nghỉ (tự trừ, công nhân không phải chấm)</div>
              {v.breaks.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="time" aria-label={`Nghỉ ${i + 1} từ`} className={inputCls} value={b.start_time} onChange={(e) => set("breaks")(v.breaks.map((x, k) => (k === i ? { ...x, start_time: e.target.value } : x)))} />
                  <span className="text-slate-400">–</span>
                  <input type="time" aria-label={`Nghỉ ${i + 1} đến`} className={inputCls} value={b.end_time} onChange={(e) => set("breaks")(v.breaks.map((x, k) => (k === i ? { ...x, end_time: e.target.value } : x)))} />
                  <button type="button" className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" title="Bỏ khung nghỉ" aria-label={`Bỏ khung nghỉ ${i + 1}`} onClick={() => set("breaks")(v.breaks.filter((_, k) => k !== i))}><Trash2 size={15} /></button>
                </div>
              ))}
              {v.breaks.length < 5 && <button type="button" className="btn-ghost text-sm" onClick={() => set("breaks")([...v.breaks, { start_time: "", end_time: "" }])}><Plus size={14} /> Thêm khung nghỉ</button>}
            </div>
            <Check label="Tính tăng ca" checked={v.ot_enabled} onChange={set("ot_enabled")} />
            <Check label="Tăng ca cần duyệt" checked={v.ot_requires_approval} disabled={!v.ot_enabled} onChange={set("ot_requires_approval")} />
          </>}
        </FormModal>
      )}
    </>
  );
}

/* ─── Tab Loại nghỉ ─── */
function LeaveTypesTab({ canEdit }) {
  const { rows, err, load } = useList(hrConfig.leaveTypes);
  const [edit, setEdit] = useState(null);
  if (err) return <LoadError message={`Không tải được loại nghỉ (${err})`} onRetry={load} />;
  const yn = (b) => (b ? "Có" : <span className="text-slate-400">—</span>);
  const columns = [
    { key: "code", label: "Mã", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: "name", label: "Tên" },
    { key: "paid", label: "Hưởng lương", render: (r) => yn(r.paid) },
    { key: "annual_days", label: "Ngày/năm", align: "right", render: (r) => (r.uses_balance ? <span className="tabular-nums">{fmtDec(r.annual_days, 1)}</span> : <span className="text-slate-400">—</span>) },
    { key: "requires_attachment", label: "Cần đính kèm", render: (r) => yn(r.requires_attachment) },
    { key: "requires_hr_approval", label: "Nhân sự duyệt cuối", render: (r) => yn(r.requires_hr_approval) },
    { key: "status", label: "Trạng thái" },
    ...(canEdit ? [{ key: "_act", label: "", align: "right", render: (r) => <button type="button" className={iconBtn} title="Sửa" aria-label={`Sửa ${r.name}`} onClick={() => setEdit(r)}><Edit size={15} /></button> }] : []),
  ];
  const save = async (v) => {
    const d = { name: v.name, paid: v.paid, uses_balance: v.uses_balance, annual_days: v.uses_balance ? Number(v.annual_days) : 0,
      requires_attachment: v.requires_attachment, requires_hr_approval: v.requires_hr_approval, status: v.status };
    if (edit.id) await hrConfig.updateLeaveType(edit.id, d); else await hrConfig.createLeaveType({ ...d, code: v.code });
    toast.success(edit.id ? `Đã lưu ${v.name}` : `Đã tạo ${v.name}`);
    load();
  };
  return (
    <>
      {canEdit && <div className="flex justify-end"><button type="button" className="btn-primary" onClick={() => setEdit({ status: "Hoạt động", paid: true })}><Plus size={16} /> Thêm loại nghỉ</button></div>}
      <DataTable columns={columns} rows={rows || []} rowKey={(r) => r.id} loading={!rows} stateKey="hr:leave-types" />
      {edit && (
        <FormModal title={edit.id ? `Sửa ${edit.name}` : "Thêm loại nghỉ"} onSubmit={save} onClose={() => setEdit(null)}
          initial={{ code: edit.code || "", name: edit.name || "", paid: !!edit.paid, uses_balance: !!edit.uses_balance, annual_days: Number(edit.annual_days || 0),
            requires_attachment: !!edit.requires_attachment, requires_hr_approval: !!edit.requires_hr_approval, status: edit.status }}>
          {(v, set) => <>
            <Field label="Mã" required><input className={inputCls} value={v.code} disabled={!!edit.id} spellCheck={false} autoComplete="off" onChange={(e) => set("code")(e.target.value)} /></Field>
            <Field label="Tên" required><input className={inputCls} value={v.name} autoComplete="off" onChange={(e) => set("name")(e.target.value)} /></Field>
            <Check label="Hưởng lương" checked={v.paid} onChange={set("paid")} />
            <Check label="Trừ vào số ngày phép" checked={v.uses_balance} onChange={set("uses_balance")} />
            {v.uses_balance && <Field label="Số ngày mỗi năm (reset 01/01)" required><input type="number" min={0} step={0.5} className={inputCls} value={v.annual_days} onChange={(e) => set("annual_days")(e.target.value)} /></Field>}
            <div className="sm:col-span-2 space-y-2">
              <Check label="Bắt buộc đính kèm (vd giấy khám)" checked={v.requires_attachment} onChange={set("requires_attachment")} />
              <Check label="Nhân sự duyệt cuối sau trưởng đơn vị" checked={v.requires_hr_approval} onChange={set("requires_hr_approval")} />
            </div>
            {edit.id && <Field label="Trạng thái"><select className={inputCls} value={v.status} onChange={(e) => set("status")(e.target.value)}><option>Hoạt động</option><option>Không hoạt động</option></select></Field>}
          </>}
        </FormModal>
      )}
    </>
  );
}

/* ─── Tab Ngày lễ ─── */
function HolidaysTab({ canEdit }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const loader = useCallback(() => hrConfig.holidays(year), [year]);
  const { rows, err, load } = useList(loader);
  const [adding, setAdding] = useState(false);
  const [busy, guard] = useSaving();
  if (err) return <LoadError message={`Không tải được ngày lễ (${err})`} onRetry={load} />;
  const remove = (r) => guard(async () => {
    if (!window.confirm(`Xóa ngày lễ "${r.name}" (${fmtDate(r.date)})?`)) return;
    try { await hrConfig.deleteHoliday(r.id); toast.success(`Đã xóa ${r.name}`); load(); } catch (e) { toast.error(e.message); }
  });
  const columns = [
    { key: "date", label: "Ngày", render: (r) => <span className="tabular-nums">{fmtDate(r.date)}</span> },
    { key: "name", label: "Tên ngày lễ" },
    ...(canEdit ? [{ key: "_act", label: "", align: "right", render: (r) => <button type="button" disabled={busy} className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" title="Xóa" aria-label={`Xóa ${r.name}`} onClick={() => remove(r)}><Trash2 size={15} /></button> }] : []),
  ];
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">Năm
          <input type="number" className={inputCls + " w-28 no-spin"} value={year} onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())} />
        </label>
        {canEdit && <button type="button" className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Thêm ngày lễ</button>}
      </div>
      <DataTable columns={columns} rows={rows || []} rowKey={(r) => r.id} loading={!rows} stateKey="hr:holidays" emptyText="Chưa có ngày lễ trong năm này" />
      {adding && (
        <FormModal title="Thêm ngày lễ" initial={{ date: "", name: "" }} onClose={() => setAdding(false)}
          onSubmit={async (v) => { await hrConfig.createHoliday(v); toast.success(`Đã thêm ${v.name}`); load(); }}>
          {(v, set) => <>
            <Field label="Ngày" required><DateInput value={v.date} onChange={(e) => set("date")(e.target.value)} /></Field>
            <Field label="Tên" required><input className={inputCls} value={v.name} autoComplete="off" placeholder="VD: Quốc khánh…" onChange={(e) => set("name")(e.target.value)} /></Field>
          </>}
        </FormModal>
      )}
    </>
  );
}

/* ─── Tab Nhân viên & PIN ─── */
function EmployeesTab({ canEdit }) {
  const { rows, err, load } = useList(hrConfig.employees);
  const units = useList(hrConfig.orgUnits);
  const [pinShown, setPinShown] = useState(null);
  const [moving, setMoving] = useState(null);
  const [busy, guard] = useSaving();
  if (err) return <LoadError message={`Không tải được nhân viên (${err})`} onRetry={load} />;
  const resetPin = (r) => guard(async () => {
    if (r.has_pin && !window.confirm(`Đặt lại PIN cho ${r.name}? PIN cũ sẽ không dùng được nữa.`)) return;
    try { const { pin } = await hrConfig.resetPin(r.id); setPinShown({ name: r.name, pin }); load(); } catch (e) { toast.error(e.message); }
  });
  const unlock = (r) => guard(async () => {
    try { await hrConfig.unlockPin(r.id); toast.success(`Đã mở khóa PIN của ${r.name}`); load(); } catch (e) { toast.error(e.message); }
  });
  const columns = [
    { key: "employee_code", label: "Mã NV", filter: "text", render: (r) => <span className="font-mono text-xs">{r.employee_code}</span> },
    { key: "name", label: "Họ tên", filter: "text" },
    { key: "org_unit_name", label: "Tổ / đơn vị", filter: "select", render: (r) => r.org_unit_name || <span className="text-amber-700">Chưa xếp tổ</span> },
    { key: "pin", label: "PIN chấm công", filter: "select", filterValue: (r) => (r.pin_locked ? "Đang khóa" : r.has_pin ? "Đã có" : "Chưa có"),
      render: (r) => r.pin_locked ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700">Đang khóa</span>
        : r.has_pin ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Đã có</span>
        : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">Chưa có</span> },
    { key: "face_consent_at", label: "Đồng ý chụp ảnh", render: (r) => r.face_consent_at ? <span className="tabular-nums">{fmtDate(r.face_consent_at)}</span> : <span className="text-slate-400">—</span> },
    ...(canEdit ? [{ key: "_act", label: "", align: "right", render: (r) => (
      <div className="flex justify-end gap-1">
        <button type="button" disabled={busy} className={iconBtn} title="Chuyển tổ" aria-label={`Chuyển tổ ${r.name}`} onClick={() => setMoving(r)}><ArrowRightLeft size={15} /></button>
        {r.pin_locked && <button type="button" disabled={busy} className={iconBtn} title="Mở khóa PIN" aria-label={`Mở khóa PIN ${r.name}`} onClick={() => unlock(r)}><Unlock size={15} /></button>}
        <button type="button" disabled={busy} className={iconBtn} title={r.has_pin ? "Đặt lại PIN" : "Tạo PIN"} aria-label={`${r.has_pin ? "Đặt lại" : "Tạo"} PIN ${r.name}`} onClick={() => resetPin(r)}><KeyRound size={15} /></button>
      </div>) }] : []),
  ];
  const unitOpts = (units.rows || []).filter((u) => u.status === "Hoạt động").map((u) => ({ value: u.id, label: `${u.name} (${KIND_LABEL[u.kind]})` }));
  return (
    <>
      <DataTable columns={columns} rows={rows || []} rowKey={(r) => r.id} loading={!rows} stateKey="hr:employees" pageSize={15} />
      {pinShown && (
        <Modal title={`PIN mới — ${pinShown.name}`} onClose={() => setPinShown(null)} size="sm"
          footer={(close) => <button type="button" className="btn-primary" onClick={close}>Đã ghi lại PIN</button>}>
          <div className="text-center space-y-3">
            <div className="text-3xl font-bold tracking-[0.3em] tabular-nums text-slate-800 font-mono">{pinShown.pin}</div>
            <p className="text-sm text-slate-600">PIN chỉ hiện <b>một lần</b>. Đưa trực tiếp cho công nhân, không gửi qua nhóm chat.</p>
          </div>
        </Modal>
      )}
      {moving && (
        <FormModal title={`Chuyển tổ — ${moving.name}`} initial={{ org_unit_id: moving.org_unit_id || "" }} submitLabel="Chuyển tổ" onClose={() => setMoving(null)}
          onSubmit={async (v) => { await hrConfig.moveEmployee(moving.id, v.org_unit_id); toast.success(`Đã chuyển ${moving.name}`); load(); }}>
          {(v, set) => <Field label="Tổ / đơn vị mới" required className="sm:col-span-2"><SearchSelect value={v.org_unit_id} onChange={set("org_unit_id")} options={unitOpts} ariaLabel="Tổ / đơn vị mới" /></Field>}
        </FormModal>
      )}
    </>
  );
}

/* ─── [HR-G2] Tab Tablet chấm công — 2026-10-23, CHƯA PHÁT HÀNH ─── */
const DEVICE_TONE = { "Hoạt động": "bg-emerald-50 text-emerald-700", "Chờ duyệt": "bg-amber-50 text-amber-700", "Thu hồi": "bg-slate-100 text-slate-600" };

function DevicesTab({ canEdit }) {
  const { rows, err, load } = useList(hrConfig.devices);
  const units = useList(hrConfig.orgUnits);
  const [approving, setApproving] = useState(false);
  const [busy, guard] = useSaving();
  if (err) return <LoadError message={`Không tải được danh sách tablet (${err})`} onRetry={load} />;
  const unitOpts = (units.rows || []).filter((u) => u.status === "Hoạt động" && u.kind !== "TO").map((u) => ({ value: u.id, label: u.name }));
  const revoke = (r) => guard(async () => {
    if (!window.confirm(`Thu hồi tablet "${r.name || "không tên"}"? Tablet sẽ không chấm công được nữa cho tới khi đăng ký lại.`)) return;
    try { await hrConfig.revokeDevice(r.id); toast.success(`Đã thu hồi ${r.name || "tablet"}`); load(); } catch (e) { toast.error(e.message); }
  });
  const columns = [
    { key: "name", label: "Tên tablet", render: (r) => r.name || <span className="text-slate-400">—</span> },
    { key: "org_unit_name", label: "Xưởng", render: (r) => r.org_unit_name || <span className="text-slate-400">—</span> },
    { key: "status", label: "Trạng thái", filter: "select", render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DEVICE_TONE[r.status] || ""}`}>{r.expired ? "Mã hết hạn" : r.status}</span>) },
    { key: "register_code", label: "Mã chờ duyệt", render: (r) => (r.status === "Chờ duyệt" && !r.expired ? <span className="font-mono">{r.register_code}</span> : <span className="text-slate-400">—</span>) },
    { key: "last_seen_at", label: "Hoạt động gần nhất", render: (r) => (r.last_seen_at ? <span className="tabular-nums">{fmtDateTime(r.last_seen_at)}</span> : <span className="text-slate-400">—</span>) },
    { key: "clock_skew_ms", label: "Lệch đồng hồ", align: "right", render: (r) => (r.clock_skew_ms == null ? <span className="text-slate-400">—</span>
      : <span className={`tabular-nums ${Math.abs(r.clock_skew_ms) > 120000 ? "text-amber-700" : ""}`}>{fmtDec(r.clock_skew_ms / 1000, 0)} giây</span>) },
    ...(canEdit ? [{ key: "_act", label: "", align: "right", render: (r) => (r.status === "Hoạt động"
      ? <button type="button" disabled={busy} className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" title="Thu hồi" aria-label={`Thu hồi ${r.name || "tablet"}`} onClick={() => revoke(r)}><Ban size={15} /></button>
      : null) }] : []),
  ];
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Trên tablet mở <span className="font-mono">/kiosk</span> → bấm "Đăng ký tablet" → nhập mã 6 ký tự hiện trên tablet vào đây.</p>
        {canEdit && <button type="button" className="btn-primary shrink-0" onClick={() => setApproving(true)}><Plus size={16} /> Duyệt tablet</button>}
      </div>
      <DataTable columns={columns} rows={rows || []} rowKey={(r) => r.id} loading={!rows} stateKey="hr:devices" emptyText="Chưa có tablet nào" />
      {approving && (
        <FormModal title="Duyệt tablet chấm công" initial={{ code: "", org_unit_id: "", name: "" }} submitLabel="Duyệt tablet" onClose={() => setApproving(false)}
          onSubmit={async (v) => { await hrConfig.approveDevice(v); toast.success("Đã duyệt tablet"); load(); }}>
          {(v, set) => <>
            <Field label="Mã trên tablet" required><input className={inputCls + " font-mono uppercase tracking-widest"} value={v.code} maxLength={6} spellCheck={false} autoComplete="off" placeholder="VD: K7M2QX…" onChange={(e) => set("code")(e.target.value.toUpperCase())} /></Field>
            <Field label="Xưởng / phòng" required><SearchSelect value={v.org_unit_id} onChange={set("org_unit_id")} options={unitOpts} ariaLabel="Xưởng / phòng của tablet" /></Field>
            <Field label="Tên tablet" className="sm:col-span-2"><input className={inputCls} value={v.name} maxLength={100} autoComplete="off" placeholder="VD: Tablet cửa xưởng Thổi…" onChange={(e) => set("name")(e.target.value)} /></Field>
          </>}
        </FormModal>
      )}
    </>
  );
}

export default function HrConfig() {
  const { can } = usePerm();
  const [tab, setTab] = useState("units");
  const canEdit = can("hr_config", "edit");
  if (!can("hr_config", "view")) return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Bạn không có quyền xem cấu hình chấm công.</div>;
  return (
    <div className="space-y-4">
      <ListHeader title="Cấu hình chấm công" subtitle="Đơn vị, ca làm, loại nghỉ, ngày lễ và PIN chấm công của nhân viên" />
      <div role="tablist" aria-label="Mục cấu hình" className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {tab === "units" && <UnitsTab canEdit={canEdit && can("hr_all_units", "view")} />}
        {tab === "shifts" && <ShiftsTab canEdit={canEdit} />}
        {tab === "leave" && <LeaveTypesTab canEdit={canEdit} />}
        {tab === "holidays" && <HolidaysTab canEdit={canEdit} />}
        {tab === "employees" && <EmployeesTab canEdit={canEdit} />}
        {tab === "devices" && <DevicesTab canEdit={canEdit && can("hr_all_units", "view")} />}
      </div>
    </div>
  );
}
