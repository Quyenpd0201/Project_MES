import React, { useState, useEffect, useCallback } from "react";
import { Activity, Download, RefreshCcw, TrendingUp, Package, CheckCircle2, AlertTriangle } from "lucide-react";
import { ListHeader, DataTable, PageHeader } from "../../components.jsx";
import { production } from "../../mesApi.js";
import { fmt, fmtDate, statusClass, toast } from "../../ui.js";
import * as XLSX from "xlsx";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

function KpiCard({ label, value, sub, icon: Icon, color = "blue" }) {
  const colors = {
    blue: { bg: "bg-blue-50", icon: "text-blue-500", val: "text-blue-700" },
    green: { bg: "bg-emerald-50", icon: "text-emerald-500", val: "text-emerald-700" },
    amber: { bg: "bg-amber-50", icon: "text-amber-500", val: "text-amber-700" },
    rose: { bg: "bg-rose-50", icon: "text-rose-500", val: "text-rose-700" },
  };
  const c = colors[color] || colors.blue;
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 flex items-start gap-4`}>
      <div className={`${c.bg} rounded-lg p-3 shrink-0`}>
        <Icon size={22} className={c.icon} />
      </div>
      <div className="min-w-0">
        <div className="text-sm text-slate-500 font-medium mb-0.5">{label}</div>
        <div className={`text-2xl font-bold ${c.val}`}>{value}</div>
        {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

export default function OutputReport({ lookups }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [productFilter, setProductFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await production.list({ status: "", page_size: 500 });
      setRows(Array.isArray(data) ? data : data?.data || []);
    } catch (e) {
      toast.error("Lỗi tải sản lượng: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter by date range and product
  const filtered = rows.filter(r => {
    const date = (r.start_date || r.planned_date_display || r.planned_date || r.created_at || "").slice(0, 10);
    const inRange = (!from || date >= from) && (!to || date <= to);
    const matchP = !productFilter || (r.product_name || "").toLowerCase().includes(productFilter.toLowerCase()) || (r.product_code || "").toLowerCase().includes(productFilter.toLowerCase());
    const matchT = !teamFilter || (r.assigned_team_display || r.assigned_team || "").toLowerCase().includes(teamFilter.toLowerCase());
    return inRange && matchP && matchT;
  });

  // KPI aggregations
  const totalPlanned = filtered.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const totalActual = filtered.reduce((s, r) => s + (Number(r.produced_qty) || 0), 0);
  const totalScrap = filtered.reduce((s, r) => s + (Number(r.scrap_qty) || 0), 0);
  const doneCount = filtered.filter(r => r.status === "Hoàn thành").length;
  const achieveRate = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;
  const scrapRate = (totalActual + totalScrap) > 0 ? ((totalScrap / (totalActual + totalScrap)) * 100).toFixed(1) : "0.0";

  const columns = [
    { key: "order_code", label: "Mã lệnh SX", filter: "text", tdClass: "font-medium text-blue-600" },
    {
      key: "product_code", label: "Mã SP", filter: "text", tdClass: "text-slate-600",
      render: (r) => <span>{r.product_code}<span className="block text-xs text-slate-400">{r.product_name}</span></span>
    },
    { key: "planned_date", label: "Ngày KH", filter: "date", tdClass: "text-slate-500", render: (r) => fmtDate(r.planned_date_display || r.planned_date) || "—" },
    {
      key: "quantity", label: "KH", align: "right",
      render: (r) => <span className="text-slate-700 font-medium">{fmt(r.quantity)} <span className="text-xs text-slate-400">{r.unit}</span></span>
    },
    {
      key: "actual_qty", label: "Thực tế", align: "right",
      render: (r) => {
        const actual = Number(r.produced_qty) || 0;
        const pct = r.quantity > 0 ? Math.round(actual / r.quantity * 100) : 0;
        const color = pct >= 100 ? "text-emerald-600" : pct >= 80 ? "text-amber-600" : "text-rose-600";
        return (
          <span className={`font-bold ${color}`}>
            {fmt(actual)}
            <span className="ml-1 text-xs font-normal">({pct}%)</span>
          </span>
        );
      }
    },
    {
      key: "scrap_qty", label: "Phế phẩm", align: "right",
      render: (r) => r.scrap_qty > 0
        ? <span className="text-rose-500 font-medium">{fmt(r.scrap_qty)}</span>
        : <span className="text-slate-300">—</span>
    },
    {
      key: "status", label: "Trạng thái", filter: "select",
      render: (r) => <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass(r.status)}`}>{r.status}</span>
    },
    { key: "assigned_team", label: "Đội SX", filter: "select", tdClass: "text-slate-600", render: (r) => r.assigned_team_display || r.assigned_team || "—" },
  ];

  const exportExcel = () => {
    const exportData = filtered.map(r => ({
      "Mã lệnh SX": r.order_code,
      "Mã SP": r.product_code,
      "Tên sản phẩm": r.product_name,
      "Ngày kế hoạch": fmtDate(r.planned_date_display || r.planned_date) || "",
      "SL kế hoạch": Number(r.quantity) || 0,
      "SL thực tế": Number(r.produced_qty) || 0,
      "Tỷ lệ (%)": r.quantity > 0 ? Math.round((Number(r.produced_qty) || 0) / r.quantity * 100) : 0,
      "Phế phẩm": Number(r.scrap_qty) || 0,
      "Trạng thái": r.status,
      "Đội SX": r.assigned_team_display || r.assigned_team || "",
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sản lượng");
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `san-luong-${from}-${to}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader title="Sản lượng sản xuất" icon={Activity} />
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={load} disabled={loading} className="btn-ghost flex items-center gap-2">
            <RefreshCcw size={15} className={loading ? "animate-spin" : ""} />
            Làm mới
          </button>
          <button onClick={exportExcel} className="btn-primary flex items-center gap-2">
            <Download size={15} /> Xuất Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Từ ngày</label>
            <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Đến ngày</label>
            <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Tìm sản phẩm</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              placeholder="Mã / tên sản phẩm…" value={productFilter} onChange={e => setProductFilter(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Đội sản xuất</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              placeholder="Tên đội…" value={teamFilter} onChange={e => setTeamFilter(e.target.value)} />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="SL kế hoạch" value={fmt(totalPlanned)} sub={`${filtered.length} lệnh SX`} icon={Package} color="blue" />
        <KpiCard label="SL thực tế" value={fmt(totalActual)} sub={`Đạt ${achieveRate}% kế hoạch`} icon={TrendingUp} color="green" />
        <KpiCard label="Hoàn thành" value={doneCount} sub={`/ ${filtered.length} lệnh`} icon={CheckCircle2} color="green" />
        <KpiCard label="Phế phẩm" value={fmt(totalScrap)} sub={`Tỷ lệ ${scrapRate}%`} icon={AlertTriangle} color={Number(scrapRate) > 5 ? "rose" : "amber"} />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Chi tiết sản lượng</h3>
          <span className="text-sm text-slate-500">{filtered.length} lệnh sản xuất</span>
        </div>
        <div className="p-4">
          <DataTable
            dense
            columns={columns}
            rows={filtered}
            rowKey={(r) => r.id}
            emptyText={loading ? "Đang tải dữ liệu..." : "Không có dữ liệu trong khoảng thời gian này"}
          />
        </div>
      </div>
    </div>
  );
}
