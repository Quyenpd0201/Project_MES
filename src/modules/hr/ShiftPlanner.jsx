// [HR-G3] Phân ca — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// Lưới nhân viên × 7 ngày. Ô trống = tự nhận theo giờ chấm (mặc định ca ngày). Gán ca đêm khi có đơn gấp.
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, Save } from "lucide-react";
import { ListHeader, LoadError, SearchSelect, useSaving } from "../../components.jsx";
import { hrWorkday, hrConfig } from "../../mesApi.js";
import { inputCls, toast } from "../../ui.js";
import { usePerm } from "../../perm.jsx";

const ymd = (d) => d.toLocaleDateString("en-CA");
const mondayOf = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
const WD = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export default function ShiftPlanner() {
  const { can } = usePerm();
  const [week, setWeek] = useState(ymd(mondayOf(new Date())));
  const [unit, setUnit] = useState("");
  const [units, setUnits] = useState([]);
  const [emps, setEmps] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [saved, setSaved] = useState({}); // "emp|date" → shift_id
  const [draft, setDraft] = useState({});
  const [err, setErr] = useState("");
  const [saving, guard] = useSaving();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);

  useEffect(() => {
    Promise.all([hrConfig.orgUnits(), hrConfig.shifts(), hrConfig.employees()])
      .then(([u, s, e]) => { setUnits(u); setShifts(s.filter((x) => x.status === "Hoạt động")); setEmps(e.filter((x) => x.status === "Hoạt động")); })
      .catch((e) => setErr(e.message));
  }, []);
  const seq = useRef(0); // [Review G3] đổi tuần nhanh: chỉ nhận phản hồi của lần tải mới nhất
  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await hrWorkday.assignments({ from: days[0], to: days[6], org_unit_id: unit });
      if (my !== seq.current) return;
      const m = Object.fromEntries(r.data.map((a) => [`${a.employee_id}|${a.work_date}`, a.shift_id]));
      setSaved(m); setDraft(m);
    } catch (e) { if (my === seq.current) setErr(e.message); }
  }, [days, unit]);
  useEffect(() => { load(); }, [load]);

  const unitIds = useMemo(() => {
    if (!unit) return null;
    const ids = new Set([unit]); let grew = true;
    while (grew) { grew = false; for (const u of units) if (u.parent_id && ids.has(u.parent_id) && !ids.has(u.id)) { ids.add(u.id); grew = true; } }
    return ids;
  }, [unit, units]);
  const rows = (emps || []).filter((e) => !unitIds || unitIds.has(e.org_unit_id));
  const changes = Object.keys({ ...saved, ...draft }).filter((k) => (saved[k] || "") !== (draft[k] || ""));

  if (!can("hr_attendance", "view")) return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Bạn không có quyền xem phân ca.</div>;
  if (err) return <LoadError message={`Không tải được (${err})`} onRetry={() => { setErr(""); load(); }} />;
  const canEdit = can("hr_attendance", "approve");
  // [Review G3] ngày đã qua: chỉ nhân sự đổi ca (backend chặn 403) → khóa ô để không bấm lưu rồi mới báo lỗi
  const today = new Date().toLocaleDateString("en-CA");
  const canEditDay = (d) => canEdit && (d >= today || can("hr_all_units", "view"));

  const save = () => guard(async () => {
    try {
      await hrWorkday.saveAssignments(changes.map((k) => { const [employee_id, work_date] = k.split("|"); return { employee_id, work_date, shift_id: draft[k] || null }; }));
      toast.success(`Đã lưu ${changes.length} ô phân ca — ngày công đang được tính lại`);
      load();
    } catch (e) { toast.error(e.message); }
  });
  const setCell = (k, v) => setDraft((s) => ({ ...s, [k]: v }));
  const fillDay = (date, shiftId) => setDraft((s) => ({ ...s, ...Object.fromEntries(rows.map((e) => [`${e.id}|${date}`, shiftId])) }));

  return (
    <div className="space-y-4">
      <ListHeader title="Phân ca" subtitle="Ô trống = tự nhận theo giờ chấm (mặc định ca ngày) · gán ca đêm khi có đơn gấp"
        actions={canEdit && <button type="button" className="btn-primary disabled:opacity-60" disabled={saving || !changes.length} onClick={save}>
          <Save size={16} /> {saving ? "Đang lưu…" : changes.length ? `Lưu (${changes.length} thay đổi)` : "Lưu"}</button>} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1">
          <button type="button" className="btn-ghost" aria-label="Tuần trước" title="Tuần trước" onClick={() => setWeek(addDays(week, -7))}><ChevronLeft size={16} /></button>
          <span className="text-sm text-slate-700 tabular-nums px-2">{days[0].split("-").reverse().join("/")} – {days[6].split("-").reverse().join("/")}</span>
          <button type="button" className="btn-ghost" aria-label="Tuần sau" title="Tuần sau" onClick={() => setWeek(addDays(week, 7))}><ChevronRight size={16} /></button>
        </div>
        <label className="text-sm text-slate-600">Đơn vị<div className="mt-1 w-56">
          <SearchSelect value={unit} onChange={setUnit} options={units.map((u) => ({ value: u.id, label: u.name }))} placeholder="-- Tất cả --" ariaLabel="Lọc theo đơn vị" />
        </div></label>
      </div>
      <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/70">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 min-w-48">Nhân viên</th>
              {days.map((d, i) => (
                <th key={d} className="px-2 py-2 text-xs font-semibold text-slate-500 min-w-32">
                  <div className="uppercase tracking-wide">{WD[i]} {d.slice(8)}/{d.slice(5, 7)}</div>
                  {canEditDay(d) && rows.length > 0 && (
                    <select aria-label={`Gán cả cột ${WD[i]}`} className="mt-1 w-full text-xs rounded-md border border-slate-200 bg-white py-0.5" value=""
                      onChange={(e) => fillDay(d, e.target.value === "_auto" ? "" : e.target.value)}>
                      <option value="">Gán cả cột…</option>
                      <option value="_auto">Tự nhận</option>
                      {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!emps ? <tr><td colSpan={8} className="px-3 py-6 text-slate-400">Đang tải…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={8} className="px-3 py-6 text-slate-400">Không có nhân viên</td></tr>
              : rows.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-1.5"><div className="text-slate-800">{e.name}</div><div className="text-xs text-slate-500">{e.org_unit_name || "—"}</div></td>
                  {days.map((d) => {
                    const k = `${e.id}|${d}`; const changed = (saved[k] || "") !== (draft[k] || "");
                    return (
                      <td key={d} className="px-2 py-1.5">
                        <select aria-label={`Ca của ${e.name} ngày ${d}`} disabled={!canEditDay(d)} title={canEditDay(d) ? undefined : "Ngày đã qua — chỉ nhân sự đổi ca"} value={draft[k] || ""} onChange={(ev) => setCell(k, ev.target.value)}
                          className={`${inputCls} py-1 text-xs ${changed ? "border-blue-400 bg-blue-50" : draft[k] ? "bg-amber-50 border-amber-200" : ""}`}>
                          <option value="">Tự nhận</option>
                          {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
