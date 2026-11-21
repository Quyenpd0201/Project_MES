import React, { useEffect, useMemo, useState } from "react";
import { Plus, Edit, Search } from "lucide-react";
import { ListHeader, DataTable, LoadError, SearchSelect, Section, useSaving } from "../../components.jsx";
import { HrPage } from "./HrPage.jsx";
import { hrConfig } from "../../mesApi.js";
import { inputCls, toast } from "../../ui.js";
import { usePerm } from "../../perm.jsx";

/* App "Đơn vị sản xuất" (11/2026): mỗi tổ = 1 tablet = 1 tổ trưởng.
   Một trang cho 1 tổ gồm: (1) thông tin tổ, (2) tổ trưởng, (3) nhân viên của tổ, (4) thời gian làm việc.
   Dữ liệu này là nguồn để biết: tổ nào, ai là tổ trưởng, bao nhiêu nhân viên, làm ca nào. */

const DAYS = [[1, "T2"], [2, "T3"], [3, "T4"], [4, "T5"], [5, "T6"], [6, "T7"], [7, "CN"]];
const daysLabel = (arr) => (arr?.length === 7 ? "Cả tuần" : DAYS.filter(([d]) => arr?.includes(d)).map(([, l]) => l).join(", ") || "—");
const shiftLabel = (s) => (s ? `${s.name} (${String(s.start_time || "").slice(0, 5)}–${String(s.end_time || "").slice(0, 5)})` : "");

function Field({ label, required, hint, className = "", children }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium text-slate-600">{label}{required && <span className="text-rose-500"> *</span>}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="block text-xs text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}

function UnitPage({ unit, units, employees, shifts, canEdit, onClose, onSaved }) {
  const isNew = !unit.id;
  const initial = useMemo(() => ({
    code: unit.code || "", name: unit.name || "", parent_id: unit.parent_id || "", status: unit.status || "Hoạt động",
    leader: unit.managers?.[0]?.id || "",
    members: employees.filter((e) => unit.id && e.org_unit_id === unit.id).map((e) => e.id),
    default_shift_id: unit.default_shift_id || "", work_days: unit.work_days || [1, 2, 3, 4, 5, 6],
  }), [unit, employees]);
  const [v, setV] = useState(initial);
  const [q, setQ] = useState("");
  const [onlyFree, setOnlyFree] = useState(false);
  const [saving, guard] = useSaving();
  const set = (k) => (val) => setV((s) => ({ ...s, [k]: val }));
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const ro = !canEdit;

  const parentOpts = units.filter((u) => u.kind !== "TO" && u.status === "Hoạt động").map((u) => ({ value: u.id, label: u.name }));
  const unitName = Object.fromEntries(units.map((u) => [u.id, u.name]));
  const memberSet = new Set(v.members);
  const members = employees.filter((e) => memberSet.has(e.id));
  // Tổ trưởng chọn trong TOÀN BỘ nhân viên → tự tick vào tổ; bỏ tick tổ trưởng ở mục 3 thì tự bỏ chọn tổ trưởng
  const pickLeader = (userId) => {
    const emp = employees.find((e) => e.user_id === userId);
    setV((s) => ({ ...s, leader: userId, members: emp && !s.members.includes(emp.id) ? [...s.members, emp.id] : s.members }));
  };
  useEffect(() => { if (v.leader && !members.some((m) => m.user_id === v.leader)) set("leader")(""); }, [v.members]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = employees.filter((e) => {
    if (onlyFree && e.org_unit_id && !memberSet.has(e.id)) return false;
    const s = q.trim().toLowerCase();
    return !s || e.name.toLowerCase().includes(s) || String(e.employee_code).toLowerCase().includes(s);
  });
  const toggle = (id, on) => set("members")(on ? [...v.members, id] : v.members.filter((x) => x !== id));
  const shift = shifts.find((s) => s.id === v.default_shift_id);

  const save = () => guard(async () => {
    if (!v.name.trim() || (isNew && !v.code.trim())) return toast.error("Vui lòng nhập mã và tên tổ");
    if (!v.parent_id) return toast.error("Vui lòng chọn tổ thuộc xưởng nào");
    try {
      let id = unit.id;
      if (isNew) id = (await hrConfig.createOrgUnit({ code: v.code, name: v.name, kind: "TO", parent_id: v.parent_id })).id;
      await hrConfig.updateOrgUnit(id, { name: v.name, kind: "TO", parent_id: v.parent_id, status: v.status,
        default_shift_id: v.default_shift_id || null, work_days: v.work_days });
      // Nhân viên trước, tổ trưởng sau (tổ trưởng phải là nhân viên của tổ)
      if (isNew || JSON.stringify([...v.members].sort()) !== JSON.stringify([...initial.members].sort())) await hrConfig.setMembers(id, v.members);
      if (isNew ? v.leader : v.leader !== initial.leader) await hrConfig.setManagers(id, v.leader ? [v.leader] : []);
      toast.success(isNew ? `Đã tạo ${v.name}` : `Đã lưu ${v.name}`);
      onSaved(); onClose();
    } catch (e) { toast.error(e.message); }
  });

  return (
    <HrPage title={isNew ? "Thêm tổ sản xuất" : unit.name} section={null} onClose={onClose} dirty={dirty} locked={saving}
      footer={(close) => <>
        <button type="button" className="btn-ghost" onClick={close} disabled={saving}>{ro ? "Đóng" : "Hủy"}</button>
        {!ro && <button type="button" className="btn-primary disabled:opacity-60" onClick={save} disabled={saving}>{saving ? "Đang lưu…" : "Lưu"}</button>}
      </>}>
      <div className="space-y-5">
        <Section title="1. Thông tin tổ" collapsible={false}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
            <Field label="Mã tổ" required><input className={inputCls} value={v.code} disabled={!isNew || ro} placeholder="VD: CAT-T1" spellCheck={false} onChange={(e) => set("code")(e.target.value)} /></Field>
            <Field label="Tên tổ" required><input className={inputCls} value={v.name} disabled={ro} onChange={(e) => set("name")(e.target.value)} /></Field>
            <Field label="Thuộc xưởng" required><SearchSelect value={v.parent_id} onChange={set("parent_id")} options={parentOpts} disabled={ro} ariaLabel="Thuộc xưởng" /></Field>
            <Field label="Trạng thái">
              <SearchSelect value={v.status} onChange={set("status")} disabled={isNew || ro} ariaLabel="Trạng thái"
                options={[{ value: "Hoạt động", label: "Hoạt động" }, { value: "Không hoạt động", label: "Không hoạt động" }]} />
            </Field>
          </div>
        </Section>

        <Section title="2. Tổ trưởng" collapsible={false}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
            <Field label="Tổ trưởng" className="lg:col-span-2" hint="Chọn 1 người trong danh sách nhân viên (phải có tài khoản đăng nhập). Người được chọn tự được đưa vào tổ này và chấm công trên tablet của tổ.">
              <SearchSelect value={v.leader} onChange={pickLeader} disabled={ro} placeholder="— Chưa có tổ trưởng —" ariaLabel="Tổ trưởng"
                options={[{ value: "", label: "— Chưa có tổ trưởng —" }, ...employees.map((m) => ({
                  value: m.user_id || `nouser-${m.id}`, disabled: !m.user_id,
                  label: `${m.name} (${m.employee_code})${!m.user_id ? " — chưa có tài khoản" : m.org_unit_id && m.org_unit_id !== unit.id && !memberSet.has(m.id) ? ` — đang ở ${unitName[m.org_unit_id] || "tổ khác"}` : ""}`,
                }))]} />
            </Field>
          </div>
        </Section>

        <Section title={`3. Nhân viên của tổ (${members.length})`} collapsible={false}>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${inputCls} pl-9`} value={q} placeholder="Tìm theo tên hoặc mã nhân viên…" onChange={(e) => setQ(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> Chỉ hiện người chưa có tổ
            </label>
          </div>
          <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0"><tr>
                <th className="w-10 px-3 py-2"></th><th className="text-left px-3 py-2">Mã NV</th><th className="text-left px-3 py-2">Họ tên</th>
                <th className="text-left px-3 py-2">Tổ hiện tại</th><th className="text-left px-3 py-2">Tài khoản</th><th className="text-left px-3 py-2">Vai trò</th>
              </tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Không có nhân viên phù hợp</td></tr>}
                {shown.map((e) => {
                  const on = memberSet.has(e.id);
                  const other = e.org_unit_id && e.org_unit_id !== unit.id;
                  return (
                    <tr key={e.id} className={`border-t border-slate-100 ${on ? "bg-blue-50/40" : ""}`}>
                      <td className="px-3 py-2"><input type="checkbox" checked={on} disabled={ro} aria-label={`Chọn ${e.name}`} onChange={(ev) => toggle(e.id, ev.target.checked)} /></td>
                      <td className="px-3 py-2 font-mono text-xs">{e.employee_code}</td>
                      <td className="px-3 py-2">{e.name}</td>
                      <td className="px-3 py-2">{on ? (other ? <span className="text-amber-700">{unitName[e.org_unit_id]} → chuyển sang tổ này</span> : "Tổ này")
                        : e.org_unit_id ? unitName[e.org_unit_id] || "—" : <span className="text-slate-400">Chưa có tổ</span>}</td>
                      <td className="px-3 py-2">{e.user_id ? "Có" : <span className="text-amber-700">Chưa có</span>}</td>
                      <td className="px-3 py-2">{on && e.user_id && e.user_id === v.leader ? <span className="text-blue-700 font-medium">Tổ trưởng</span> : on ? "Nhân viên" : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 mt-2">Tick để đưa vào tổ; người đang ở tổ khác sẽ được chuyển sang tổ này khi bấm Lưu. Bỏ tick thì người đó thành "chưa có tổ".</p>
        </Section>

        <Section title="4. Thời gian làm việc" collapsible={false}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
            <Field label="Ca làm việc của tổ" className="lg:col-span-2" hint={shift ? `Giờ làm ${String(shift.start_time).slice(0, 5)}–${String(shift.end_time).slice(0, 5)}${shift.overnight ? " (qua đêm)" : ""}. Muốn thêm ca: Cấu hình chấm công → Ca làm.` : "Chọn trong các ca đã khai báo ở Cấu hình chấm công → Ca làm."}>
              <SearchSelect value={v.default_shift_id} onChange={set("default_shift_id")} disabled={ro} placeholder="— Chưa chọn ca —" ariaLabel="Ca làm việc của tổ"
                options={[{ value: "", label: "— Chưa chọn ca —" }, ...shifts.filter((s) => s.status === "Hoạt động" || s.id === v.default_shift_id).map((s) => ({ value: s.id, label: shiftLabel(s) }))]} />
            </Field>
            <Field label="Ngày làm trong tuần" className="lg:col-span-2">
              <div className="flex flex-wrap gap-2">
                {DAYS.map(([d, l]) => {
                  const on = v.work_days.includes(d);
                  return (
                    <button key={d} type="button" disabled={ro} onClick={() => set("work_days")(on ? v.work_days.filter((x) => x !== d) : [...v.work_days, d].sort())}
                      className={`w-12 h-10 rounded-lg border text-sm font-medium transition ${on ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-300 text-slate-500 hover:bg-slate-50"}`}>{l}</button>
                  );
                })}
              </div>
            </Field>
          </div>
        </Section>
      </div>
    </HrPage>
  );
}

export default function ProductionUnits() {
  const { can } = usePerm();
  const canEdit = can("hr_config", "edit") && can("hr_all_units", "view");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  const load = () => {
    setErr(null);
    Promise.all([hrConfig.orgUnits(), hrConfig.employees(), hrConfig.shifts()])
      .then(([units, employees, shifts]) => setData({ units, employees, shifts }))
      .catch((e) => setErr(e.message));
  };
  useEffect(load, []);

  if (!can("hr_config", "view")) return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Bạn không có quyền xem đơn vị sản xuất.</div>;
  if (err) return <LoadError message={`Không tải được đơn vị sản xuất (${err})`} onRetry={load} />;
  const units = data?.units || [];
  const byId = Object.fromEntries(units.map((u) => [u.id, u]));
  const rows = units.filter((u) => u.kind === "TO");
  const noUnit = (data?.employees || []).filter((e) => !e.org_unit_id).length;

  const columns = [
    { key: "code", label: "Mã", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: "name", label: "Tổ", filter: "text", render: (r) => <button type="button" className="text-blue-700 hover:underline font-medium" onClick={() => setOpen(r)}>{r.name}</button> },
    { key: "parent", label: "Xưởng", filter: "select", filterValue: (r) => byId[r.parent_id]?.name || "—", render: (r) => byId[r.parent_id]?.name || "—" },
    { key: "leader", label: "Tổ trưởng", render: (r) => r.managers?.[0]?.name || <span className="text-amber-700">Chưa có</span> },
    { key: "employee_count", label: "Nhân viên", align: "right", render: (r) => <span className="tabular-nums">{r.employee_count}</span> },
    { key: "shift", label: "Ca làm việc", render: (r) => r.shift_name ? `${r.shift_name} (${r.shift_start}–${r.shift_end})` : <span className="text-slate-400">Chưa chọn</span> },
    { key: "days", label: "Ngày làm", render: (r) => daysLabel(r.work_days) },
    { key: "status", label: "Trạng thái", filter: "select" },
    { key: "_act", label: "", align: "right", render: (r) => <button type="button" className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100" title={canEdit ? "Sửa" : "Xem"} aria-label={`Mở ${r.name}`} onClick={() => setOpen(r)}><Edit size={15} /></button> },
  ];

  return (
    <div className="space-y-4">
      <ListHeader title="Đơn vị sản xuất" subtitle="Mỗi tổ: 1 tablet chấm công · 1 tổ trưởng · danh sách nhân viên · ca làm việc"
        actions={canEdit && <button type="button" className="btn-primary" onClick={() => setOpen({})} disabled={!data}><Plus size={16} /> Thêm tổ</button>} />
      {data && noUnit > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Có <b>{noUnit}</b> nhân viên chưa thuộc tổ nào — những người này chưa chấm công được trên tablet. Mở một tổ và tick họ ở mục "Nhân viên của tổ".
        </div>
      )}
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={!data} stateKey="hr:prod-units" emptyText="Chưa có tổ nào" />
      {open && data && <UnitPage unit={open} units={units} employees={data.employees} shifts={data.shifts} canEdit={canEdit}
        onClose={() => setOpen(null)} onSaved={load} />}
    </div>
  );
}
