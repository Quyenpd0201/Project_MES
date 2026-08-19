import React, { useState, useEffect, useCallback } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Users, RefreshCcw, Download, TrendingUp, Package, CheckCircle2,
  AlertTriangle, Clock, CalendarDays, User, Layers, Factory,
  Target, ChevronRight, Filter, BarChart2, ChevronDown, X,
} from "lucide-react";
import { PageHeader } from "../../components.jsx";
import { reports } from "../../mesApi.js";
import { fmt, fmtDate, statusClass, toast } from "../../ui.js";
import * as XLSX from "xlsx";

const today    = () => new Date().toISOString().slice(0, 10);
const monthStart = () =>
  new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

/* ─── helpers ─── */
const pct = (a, b) => (b > 0 ? Math.round((Number(a) / Number(b)) * 100) : 0);
const pctColor = (p) =>
  p >= 100 ? "text-emerald-600" : p >= 80 ? "text-amber-600" : "text-rose-600";
const pctBg = (p) =>
  p >= 100 ? "bg-emerald-500" : p >= 80 ? "bg-amber-400" : "bg-rose-400";

/* ─── KPI Card ─── */
function KpiCard({ label, value, sub, icon: Icon, color = "blue", badge }) {
  const colors = {
    blue:   { bg: "bg-blue-50",    icon: "text-blue-500",    val: "text-blue-700"    },
    green:  { bg: "bg-emerald-50", icon: "text-emerald-500", val: "text-emerald-700" },
    amber:  { bg: "bg-amber-50",   icon: "text-amber-500",   val: "text-amber-700"   },
    rose:   { bg: "bg-rose-50",    icon: "text-rose-500",    val: "text-rose-700"    },
    indigo: { bg: "bg-indigo-50",  icon: "text-indigo-500",  val: "text-indigo-700"  },
  };
  const c = colors[color] || colors.blue;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-start gap-3">
      <div className={`${c.bg} rounded-lg p-2.5 shrink-0`}>
        <Icon size={20} className={c.icon} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-slate-500 font-medium mb-0.5">{label}</div>
        <div className={`text-xl font-bold ${c.val}`}>{value}</div>
        {sub  && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
        {badge && <div className="mt-1.5">{badge}</div>}
      </div>
    </div>
  );
}

/* ─── Bullet Bar (CSS KH vs TT) ─── */
function BulletBar({ label, planned, actual, unit = "" }) {
  const p = pct(actual, planned);
  const maxW = Math.max(planned, actual);
  const planW = maxW > 0 ? (planned / maxW) * 100 : 0;
  const actW  = maxW > 0 ? (actual  / maxW) * 100 : 0;
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <span className={`text-xs font-bold ${pctColor(p)}`}>{p}%</span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 w-14 text-right shrink-0">KH {fmt(planned)}</span>
          <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-200 rounded-full" style={{ width: `${planW}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 w-14 text-right shrink-0">TT {fmt(actual)}</span>
          <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${pctBg(p)}`} style={{ width: `${actW}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Stage horizontal bar ─── */
function StageBar({ stage, actual, planned, maxActual }) {
  const p = pct(actual, planned);
  const barW = maxActual > 0 ? Math.round((actual / maxActual) * 100) : 0;
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-slate-700">{stage}</span>
        <span className={`text-xs font-bold ${pctColor(p)}`}>{fmt(actual)} <span className="font-normal text-slate-400">({p}%)</span></span>
      </div>
      <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pctBg(p)}`}
          style={{ width: `${barW}%` }}
        />
      </div>
    </div>
  );
}

/* ─── Custom Tooltip for recharts ─── */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-slate-700 mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-semibold text-slate-800">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Work Orders Table ─── */
function WorkOrdersTable({ tasks }) {
  if (!tasks?.length) return (
    <div className="text-center py-8 text-slate-400 text-sm">Không có lệnh làm việc</div>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500 font-medium">
            <th className="text-left py-2.5 px-3">Đơn hàng</th>
            <th className="text-left py-2.5 px-3">Mã LSX</th>
            <th className="text-left py-2.5 px-3">Sản phẩm</th>
            <th className="text-left py-2.5 px-3">Công đoạn</th>
            <th className="text-right py-2.5 px-3">KH</th>
            <th className="text-right py-2.5 px-3">Thực tế</th>
            <th className="text-center py-2.5 px-3">Tiến độ</th>
            <th className="text-left py-2.5 px-3">Ca</th>
            <th className="text-left py-2.5 px-3">Ngày</th>
            <th className="text-center py-2.5 px-3">Trạng thái</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tasks.map((t) => {
            const actual  = t.status === "Hoàn thành" ? (Number(t.actual_qty) ?? Number(t.quantity) ?? 0) : 0;
            const planned = Number(t.quantity) || 0;
            const p       = pct(actual, planned);
            return (
              <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                <td className="py-2.5 px-3 text-slate-500 text-xs">{t.sales_order_code || "—"}</td>
                <td className="py-2.5 px-3 font-medium text-blue-600">{t.order_code}</td>
                <td className="py-2.5 px-3 text-slate-600 text-xs">
                  {t.product_code}
                  <span className="block text-slate-400">{t.product_name}</span>
                </td>
                <td className="py-2.5 px-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                    {t.stage}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right text-slate-600 font-medium">{fmt(planned)} <span className="text-xs text-slate-400">{t.unit}</span></td>
                <td className={`py-2.5 px-3 text-right font-bold ${pctColor(p)}`}>{fmt(actual)}</td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pctBg(p)}`} style={{ width: `${Math.min(p, 100)}%` }} />
                    </div>
                    <span className={`text-xs font-semibold ${pctColor(p)} w-8 text-right`}>{p}%</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-xs text-slate-500">{t.shift || "—"}</td>
                <td className="py-2.5 px-3 text-xs text-slate-500">{fmtDate(t.planned_date) || "—"}</td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(t.status)}`}>
                    {t.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Employee Detail Panel ─── */
function EmployeeDetail({ workerData, detail, loading }) {
  if (!workerData) return null;

  const { worker, team, planned_qty, actual_qty, scrap_qty, tasks_count,
    orders_count, work_days, work_hours, done_count, active_count, paused_count } = workerData;
  const overall = pct(actual_qty, planned_qty);
  const { tasks = [], daily = [], stages = [] } = detail || {};
  const maxStageActual = Math.max(...stages.map(s => Number(s.actual_qty)), 1);

  return (
    <div className="space-y-5">
      {/* Employee header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-xl px-6 py-4 text-white flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <User size={20} className="text-white" />
          </div>
          <div>
            <div className="text-xs opacity-75 mb-0.5">Nhân viên đang xem</div>
            <div className="text-lg font-bold">{worker}</div>
            {team && <div className="text-xs opacity-80">{team}</div>}
          </div>
        </div>
        <div className="flex items-center gap-6 text-center">
          <div>
            <div className="text-2xl font-bold">{overall}%</div>
            <div className="text-xs opacity-75">Tỷ lệ hoàn thành</div>
          </div>
          <div className="w-px h-10 bg-white/20" />
          <div>
            <div className="text-2xl font-bold">{fmt(actual_qty)}</div>
            <div className="text-xs opacity-75">Thực tế / {fmt(planned_qty)}</div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Tỷ lệ HT"
          value={`${overall}%`}
          icon={Target}
          color={overall >= 100 ? "green" : overall >= 80 ? "amber" : "rose"}
        />
        <KpiCard
          label="Số lệnh"
          value={tasks_count}
          icon={Layers}
          color="blue"
          badge={
            <div className="flex gap-1 flex-wrap">
              {done_count > 0   && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{done_count} HT</span>}
              {active_count > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{active_count} đang</span>}
              {paused_count > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{paused_count} dừng</span>}
            </div>
          }
        />
        <KpiCard
          label="Sản lượng"
          value={fmt(actual_qty)}
          sub={`/ ${fmt(planned_qty)} kế hoạch`}
          icon={TrendingUp}
          color="green"
        />
        <KpiCard
          label="Đơn hàng"
          value={orders_count}
          sub="đơn liên quan"
          icon={Package}
          color="indigo"
        />
        <KpiCard
          label="Ngày làm"
          value={work_days ?? "—"}
          sub="ngày có phân công"
          icon={CalendarDays}
          color="blue"
        />
        <KpiCard
          label="Giờ (ước tính)"
          value={work_hours > 0 ? `${work_hours}h` : "—"}
          sub="từ ca phân công"
          icon={Clock}
          color={scrap_qty > 0 ? "rose" : "amber"}
          badge={scrap_qty > 0 ? (
            <span className="text-xs text-rose-500">Phế: {fmt(scrap_qty)}</span>
          ) : null}
        />
      </div>

      {/* Charts row */}
      {loading ? (
        <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
          <RefreshCcw size={18} className="animate-spin mr-2" /> Đang tải biểu đồ…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Bullet: KH vs TT */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="text-sm font-semibold text-slate-700 mb-4">Kế hoạch vs Thực tế</div>
            <BulletBar label="Tổng" planned={Number(planned_qty)} actual={Number(actual_qty)} />
            {stages.map((s) => (
              <BulletBar
                key={s.stage}
                label={s.stage}
                planned={Number(s.planned_qty)}
                actual={Number(s.actual_qty)}
              />
            ))}
          </div>

          {/* Stage breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="text-sm font-semibold text-slate-700 mb-4">Sản lượng theo công đoạn</div>
            {stages.length === 0 ? (
              <div className="text-slate-400 text-sm text-center py-6">Không có dữ liệu</div>
            ) : stages.map((s) => (
              <StageBar
                key={s.stage}
                stage={s.stage}
                actual={Number(s.actual_qty)}
                planned={Number(s.planned_qty)}
                maxActual={maxStageActual}
              />
            ))}
          </div>
        </div>
      )}

      {/* Daily output chart */}
      {!loading && daily.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-sm font-semibold text-slate-700 mb-4">Sản lượng theo ngày</div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date_label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="actual_qty" name="Thực tế" fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="planned_qty" name="Kế hoạch" stroke="#94a3b8" strokeWidth={2} dot={false} strokeDasharray="4 3" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Work orders table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-800 text-sm">Chi tiết lệnh làm việc</div>
            <div className="text-xs text-slate-400 mt-0.5">{tasks.length} lệnh phân công</div>
          </div>
        </div>
        <div className="p-2">
          <WorkOrdersTable tasks={tasks} />
        </div>
      </div>
    </div>
  );
}

/* ─── Main ─── */
export default function EmployeeReport() {
  const [workers, setWorkers]         = useState([]);
  const [loading, setLoading]         = useState(false);
  const [selected, setSelected]       = useState(null);
  const [detail, setDetail]           = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Filters
  const [from, setFrom]               = useState(monthStart());
  const [to, setTo]                   = useState(today());
  const [stageFilter, setStageFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [teamFilter, setTeamFilter]   = useState("");
  const [orderFilter, setOrderFilter] = useState("");

  const filterParams = { fromDate: from, toDate: to, stage: stageFilter, shift: shiftFilter, team: teamFilter, orderCode: orderFilter };

  /* load worker list */
  const loadWorkers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await reports.employees(filterParams);
      setWorkers(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error("Lỗi tải dữ liệu nhân viên: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, stageFilter, shiftFilter, teamFilter, orderFilter]);

  useEffect(() => { loadWorkers(); }, [loadWorkers]);

  /* load detail when selecting */
  const loadDetail = useCallback(async (workerName) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const data = await reports.employeeTasks(workerName, filterParams);
      setDetail(data);
    } catch (e) {
      toast.error("Lỗi tải chi tiết: " + e.message);
    } finally {
      setDetailLoading(false);
    }
  }, [from, to, stageFilter, shiftFilter, teamFilter]);

  const handleSelectWorker = (w) => {
    if (selected?.worker === w.worker) { setSelected(null); setDetail(null); return; }
    setSelected(w);
    loadDetail(w.worker);
  };

  /* Export Excel */
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    // Sheet 1: Summary
    const summaryData = workers.map(w => ({
      "Nhân viên":         w.worker,
      "Đội / Nhà máy":    w.team || "",
      "Công đoạn":         w.stages || "",
      "Ca làm việc":       w.shifts || "",
      "Số lệnh":           w.tasks_count,
      "Số đơn hàng":       w.orders_count,
      "KH":                Number(w.planned_qty),
      "Thực tế":           Number(w.actual_qty),
      "Tỷ lệ (%)":         pct(w.actual_qty, w.planned_qty),
      "Phế phẩm":          Number(w.scrap_qty),
      "Ngày làm việc":     w.work_days,
      "Giờ làm (ước tính)": w.work_hours,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "Tổng hợp NV");
    // Sheet 2: Detail tasks if available
    if (detail?.tasks?.length) {
      const taskData = detail.tasks.map(t => ({
        "Đơn hàng":     t.sales_order_code || "",
        "Mã LSX":        t.order_code,
        "Sản phẩm":     t.product_name,
        "Công đoạn":    t.stage,
        "Kế hoạch":     Number(t.quantity),
        "Thực tế":      t.status === "Hoàn thành" ? (Number(t.actual_qty) ?? Number(t.quantity)) : 0,
        "Phế phẩm":     Number(t.scrap_qty),
        "Trạng thái":   t.status,
        "Ca":           t.shift || "",
        "Ngày":         fmtDate(t.planned_date) || "",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(taskData), `Chi tiết ${selected?.worker || ""}`);
    }
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob  = new Blob([wbout], { type: "application/octet-stream" });
    const url   = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `hieu-suat-nhan-vien-${from}-${to}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* unique options for dropdowns from loaded data */
  const stageOptions  = [...new Set(workers.flatMap(w => (w.stages || "").split(", ").filter(Boolean)))];
  const shiftOptions  = [...new Set(workers.flatMap(w => (w.shifts || "").split(", ").filter(Boolean)))];
  const teamOptions   = [...new Set(workers.map(w => w.team).filter(Boolean))];

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users size={22} className="text-indigo-600" />
            <h1 className="text-xl font-bold text-slate-800">Hiệu suất nhân viên sản xuất</h1>
          </div>
          <p className="text-sm text-slate-500">Báo cáo theo ca làm việc · Chọn nhân viên để xem chi tiết</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadWorkers} disabled={loading} className="btn-ghost flex items-center gap-2 text-sm">
            <RefreshCcw size={14} className={loading ? "animate-spin" : ""} /> Làm mới
          </button>
          <button onClick={exportExcel} className="btn-primary flex items-center gap-2 text-sm">
            <Download size={14} /> Xuất Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bộ lọc</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Từ ngày</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/40" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Đến ngày</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/40" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Công đoạn</label>
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/40 bg-white">
              <option value="">Tất cả</option>
              {stageOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Ca làm việc</label>
            <select value={shiftFilter} onChange={e => setShiftFilter(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/40 bg-white">
              <option value="">Tất cả</option>
              {shiftOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nhà máy / Đội</label>
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/40 bg-white">
              <option value="">Tất cả</option>
              {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Mã đơn hàng</label>
            <input value={orderFilter} onChange={e => setOrderFilter(e.target.value)}
              placeholder="LSX-00001…"
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/40" />
          </div>
        </div>
      </div>

      {/* Employee table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-800 text-sm">Danh sách nhân viên</div>
            <div className="text-xs text-slate-400 mt-0.5">Nhấn vào hàng để xem chi tiết · {workers.length} nhân viên</div>
          </div>
          {selected && (
            <button onClick={() => { setSelected(null); setDetail(null); }}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
              <X size={12} /> Bỏ chọn
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
              <RefreshCcw size={16} className="animate-spin" /> Đang tải…
            </div>
          ) : workers.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">Không có dữ liệu trong khoảng thời gian này</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="text-left py-3 px-4">#</th>
                  <th className="text-left py-3 px-4">Nhân viên</th>
                  <th className="text-left py-3 px-4">Đội / Nhà máy</th>
                  <th className="text-left py-3 px-4">Công đoạn</th>
                  <th className="text-center py-3 px-4">Số lệnh</th>
                  <th className="text-right py-3 px-4">KH</th>
                  <th className="text-right py-3 px-4">Thực tế</th>
                  <th className="text-center py-3 px-4 min-w-32">Tiến độ</th>
                  <th className="text-left py-3 px-4">Ca</th>
                  <th className="text-center py-3 px-4">Ngày làm</th>
                  <th className="text-center py-3 px-4">Giờ (ước)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workers.map((w, idx) => {
                  const p = pct(w.actual_qty, w.planned_qty);
                  const isSelected = selected?.worker === w.worker;
                  return (
                    <tr
                      key={w.worker}
                      onClick={() => handleSelectWorker(w)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-indigo-50 border-l-4 border-l-indigo-500"
                          : "hover:bg-slate-50 border-l-4 border-l-transparent"
                      }`}
                    >
                      <td className="py-3 px-4 text-slate-400 text-xs">{idx + 1}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            isSelected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
                          }`}>
                            {w.worker?.[0]?.toUpperCase() || "?"}
                          </div>
                          <span className={`font-semibold ${isSelected ? "text-indigo-700" : "text-slate-800"}`}>
                            {w.worker}
                          </span>
                          {isSelected && <ChevronRight size={12} className="text-indigo-400" />}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-xs">{w.team || "—"}</td>
                      <td className="py-3 px-4 text-slate-500 text-xs">{w.stages || "—"}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-semibold text-slate-700">{w.tasks_count}</span>
                        <div className="flex justify-center gap-1 mt-0.5">
                          {w.done_count   > 0 && <span className="text-xs text-emerald-500">{w.done_count}✓</span>}
                          {w.active_count > 0 && <span className="text-xs text-blue-500">{w.active_count}⚙</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-600">{fmt(w.planned_qty)}</td>
                      <td className={`py-3 px-4 text-right font-bold ${pctColor(p)}`}>{fmt(w.actual_qty)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pctBg(p)}`} style={{ width: `${Math.min(p, 100)}%` }} />
                          </div>
                          <span className={`text-xs font-bold ${pctColor(p)} w-9 text-right`}>{p}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">{w.shifts || "—"}</td>
                      <td className="py-3 px-4 text-center text-sm font-semibold text-slate-600">{w.work_days ?? "—"}</td>
                      <td className="py-3 px-4 text-center text-sm font-semibold text-slate-600">
                        {w.work_hours > 0 ? `${w.work_hours}h` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail section */}
      {selected && (
        <EmployeeDetail
          workerData={selected}
          detail={detail}
          loading={detailLoading}
        />
      )}
    </div>
  );
}
