import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { ListHeader } from "../components.jsx";
import { workSchedules } from "../mesApi.js";
import { inputCls } from "../ui.js";

const d = (ymd) => new Date(ymd + "T00:00:00");
const toYMD = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (ymd, n) => { const x = d(ymd); x.setDate(x.getDate() + n); return toYMD(x); };
const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

// thứ 2 đầu tuần của hôm nay
function mondayOf(date) {
  const x = new Date(date); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day);
  return toYMD(x);
}

export default function WorkScheduleModule({ lookups }) {
  const [anchor, setAnchor] = useState(mondayOf(new Date()));
  const [map, setMap] = useState({}); // `${emp}|${date}` -> shift_id
  const employees = lookups.employees || [];
  const shiftList = lookups.shiftList || [];
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchor, i)), [anchor]);

  const load = useCallback(async () => {
    try {
      const rows = await workSchedules.list(days[0], days[6]);
      const m = {};
      rows.forEach((r) => { 
        m[`${r.employee_id}|${r.work_date}`] = {
          shift_id: r.shift_id,
          has_attendance: !!(r.check_in_at || r.check_out_at)
        }; 
      });
      setMap(m);
    } catch (e) { alert("Lỗi tải lịch: " + e.message); }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const setCell = async (employee_id, work_date, shift_id, has_attendance) => {
    setMap((m) => ({ ...m, [`${employee_id}|${work_date}`]: { shift_id: shift_id || undefined, has_attendance } }));
    try { await workSchedules.upsert({ employee_id, work_date, shift_id: shift_id || null }); }
    catch (e) { alert("Lỗi lưu: " + e.message); load(); }
  };

  // gom nhân viên theo đơn vị
  const groups = useMemo(() => {
    const g = {};
    employees.forEach((e) => { (g[e.factory || "Khác"] = g[e.factory || "Khác"] || []).push(e); });
    return Object.entries(g);
  }, [employees]);

  return (
    <div className="space-y-5">
      <ListHeader title="Lịch làm việc" actions={<>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button 
            onClick={() => setAnchor(addDays(mondayOf(new Date()), -7))} 
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${anchor === addDays(mondayOf(new Date()), -7) ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            Tuần trước
          </button>
          <button 
            onClick={() => setAnchor(mondayOf(new Date()))} 
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${anchor === mondayOf(new Date()) ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            Tuần này
          </button>
        </div>
        <span className="text-sm font-medium text-slate-500 border-l border-slate-200 pl-4 py-1">
          {d(days[0]).getDate()}/{d(days[0]).getMonth() + 1} – {d(days[6]).getDate()}/{d(days[6]).getMonth() + 1}
        </span>
        <button onClick={load} className="btn-ghost ml-2"><RotateCcw size={16} /> Làm mới</button>
      </>} />

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-slate-500 text-xs uppercase border-r border-slate-200 w-52">Nhân viên</th>
              {days.map((dy) => {
                const wd = d(dy).getDay(); const weekend = wd === 0 || wd === 6;
                return <th key={dy} className={`px-2 py-2 text-center text-xs border-r border-slate-100 ${weekend ? "bg-slate-100/60" : ""}`}>
                  <div className="text-slate-400">{WD[wd]}</div><div className="font-medium text-slate-600">{d(dy).getDate()}/{d(dy).getMonth() + 1}</div>
                </th>;
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map(([factory, emps]) => (
              <React.Fragment key={factory}>
                <tr className="bg-slate-50/60"><td colSpan={8} className="px-4 py-1.5 text-xs font-semibold text-slate-500">{factory}</td></tr>
                {emps.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 border-r border-slate-200">
                      <div className="font-medium text-slate-800">{e.name}</div>
                      <div className="text-[11px] text-slate-400">{e.employee_code}{e.skill_level ? ` · ${e.skill_level}` : ""}</div>
                    </td>
                    {days.map((dy) => {
                      const cell = map[`${e.id}|${dy}`] || {};
                      const val = cell.shift_id || "";
                      
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const wDate = d(dy);
                      const diffDays = Math.floor((today - wDate) / (1000 * 60 * 60 * 24));
                      const isLocked = cell.has_attendance || diffDays > 3;

                      return (
                        <td key={dy} className="px-1.5 py-1.5 border-r border-slate-100">
                          <select value={val} onChange={(ev) => setCell(e.id, dy, ev.target.value, cell.has_attendance)}
                            disabled={isLocked}
                            className={`${inputCls} px-1.5 py-1 text-xs ${val ? "bg-blue-50 border-blue-200 text-blue-700 font-medium" : "text-slate-400"} ${isLocked ? "opacity-60 cursor-not-allowed bg-slate-100" : ""}`}>
                            <option value="">—</option>
                            {shiftList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
            {!employees.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Chưa có nhân viên. Thêm ở Danh mục → Nhân viên.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
