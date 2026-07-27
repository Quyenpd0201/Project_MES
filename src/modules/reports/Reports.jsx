import React, { useState, useEffect } from 'react';
import { PageHeader, Section, ListHeader } from '../../components.jsx';
import { reports } from '../../mesApi.js';
import { Download, Activity, Factory, PieChart as PieChartIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { fmt, fmtDate, statusClass } from '../../ui.js';

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6'];

export default function ReportsModule() {
  const [tab, setTab] = useState('kpi'); // kpi, detailed, machines
  
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader title="Hệ thống Báo cáo" icon={Activity} />
      
      <div className="flex gap-2 border-b border-slate-200">
        <TabButton id="kpi" label="Báo cáo KPI" current={tab} onClick={setTab} icon={PieChartIcon} />
        <TabButton id="detailed" label="Báo cáo Chi tiết" current={tab} onClick={setTab} icon={Factory} />
        <TabButton id="machines" label="Báo cáo Máy móc" current={tab} onClick={setTab} icon={Activity} />
      </div>

      <div className="pt-2">
        {tab === 'kpi' && <KpiReport />}
        {tab === 'detailed' && <DetailedReport />}
        {tab === 'machines' && <MachineReport />}
      </div>
    </div>
  );
}

function TabButton({ id, label, current, onClick, icon: Icon }) {
  const active = current === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

// ==========================================
// 1. KPI Report
// ==========================================
function KpiReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reports.kpi().then(res => {
      setData(res);
      setLoading(false);
    });
  }, []);

  if (loading) return <div>Đang tải dữ liệu...</div>;
  if (!data) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <KpiCard title="Tổng Lệnh Sản Xuất" value={data.total_production_orders} color="blue" />
      <KpiCard title="Lệnh Đang Sản Xuất" value={data.active_production_orders} color="emerald" />
      <KpiCard title="Máy Đang Hoạt Động" value={data.active_machines} color="amber" />
      <KpiCard title="Tổng Số Tồn Kho" value={fmt(data.total_inventory_items)} color="purple" />
    </div>
  );
}

function KpiCard({ title, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200'
  };
  return (
    <div className={`p-6 rounded-2xl border ${colors[color]} shadow-sm`}>
      <h3 className="text-sm font-semibold mb-2 opacity-80">{title}</h3>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
}

// ==========================================
// 2. Detailed Report
// ==========================================
function DetailedReport() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState({ from: '', to: '' });

  const loadData = () => {
    setLoading(true);
    reports.detailed(dates.from || null, dates.to || null).then(res => {
      setData(res);
      setLoading(false);
    });
  };

  useEffect(() => { loadData(); }, []);

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(data.map(d => ({
      'Mã Lệnh': d.order_code,
      'Sản phẩm': d.product_name,
      'Khách hàng': d.customer_name || 'Khách lẻ',
      'Số lượng': d.quantity,
      'ĐVT': d.unit,
      'Trạng thái': d.status,
      'Ngày kế hoạch': fmtDate(d.planned_date),
      'Ngày đến hạn': fmtDate(d.due_date)
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Chi Tiết Lệnh SX");
    XLSX.writeFile(wb, "BaoCaoChiTiet_LenhSX.xlsx");
  };

  return (
    <Section>
      <div className="p-4 border-b border-slate-100 flex flex-wrap gap-4 items-end bg-slate-50 rounded-t-xl">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Từ ngày</label>
          <input type="date" value={dates.from} onChange={e => setDates({...dates, from: e.target.value})} className="px-3 py-1.5 border rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Đến ngày</label>
          <input type="date" value={dates.to} onChange={e => setDates({...dates, to: e.target.value})} className="px-3 py-1.5 border rounded-lg text-sm" />
        </div>
        <button onClick={loadData} className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium transition">
          Lọc
        </button>
        <button onClick={exportExcel} className="ml-auto flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition shadow-sm">
          <Download size={16} /> Xuất Excel
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
            <tr>
              <th className="p-4">Mã Lệnh</th>
              <th className="p-4">Sản phẩm</th>
              <th className="p-4">Khách hàng</th>
              <th className="p-4">Số lượng</th>
              <th className="p-4">Trạng thái</th>
              <th className="p-4">Ngày KH</th>
              <th className="p-4">Hạn chót</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan="7" className="p-8 text-center text-slate-500">Đang tải...</td></tr> :
             data.map(d => (
              <tr key={d.id} className="hover:bg-slate-50/50">
                <td className="p-4 font-medium text-blue-600">{d.order_code}</td>
                <td className="p-4">{d.product_name}</td>
                <td className="p-4">{d.customer_name || '-'}</td>
                <td className="p-4">{fmt(d.quantity)} {d.unit}</td>
                <td className="p-4"><span className={statusClass(d.status)}>{d.status}</span></td>
                <td className="p-4">{fmtDate(d.planned_date)}</td>
                <td className="p-4">{fmtDate(d.due_date)}</td>
              </tr>
            ))}
            {!loading && data.length === 0 && (
              <tr><td colSpan="7" className="p-8 text-center text-slate-500">Không có dữ liệu</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ==========================================
// 3. Machine Report
// ==========================================
function MachineReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reports.machines().then(res => {
      setData(res);
      setLoading(false);
    });
  }, []);

  if (loading) return <div>Đang tải dữ liệu...</div>;
  if (!data) return null;

  const pieData = data.status_distribution.map(d => ({
    name: d.status,
    value: d.count
  }));

  const predData = data.prediction.map(d => ({
    date: fmtDate(d.date),
    output: parseFloat(d.predicted_output)
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section className="p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Phân Bố Trạng Thái Máy</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} fill="#8884d8" dataKey="value" label>
                  {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section className="p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Dự Đoán Sản Lượng (7 Ngày Tới)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={predData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{fontSize: 12}} />
                <YAxis tick={{fontSize: 12}} />
                <Tooltip />
                <Line type="monotone" dataKey="output" stroke="#3b82f6" strokeWidth={3} dot={{r: 4}} name="Dự đoán (SP)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <Section className="p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-6">Tuổi Thọ & Hoạt Động Máy</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b">
              <tr>
                <th className="p-4">Mã Máy</th>
                <th className="p-4">Tên Máy</th>
                <th className="p-4">Trạng thái</th>
                <th className="p-4">Công suất / Giờ</th>
                <th className="p-4">Giờ Đã Chạy</th>
                <th className="p-4">Tuổi Thọ Dự Kiến</th>
                <th className="p-4">Tiến Độ Tuổi Thọ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.machine_stats.map(m => {
                const run = parseFloat(m.current_run_hours) || 0;
                const life = parseFloat(m.expected_lifespan_hours) || 1; // avoid / 0
                let percent = (run / life) * 100;
                if (m.expected_lifespan_hours == 0) percent = 0;
                if (percent > 100) percent = 100;

                return (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="p-4 font-medium">{m.machine_code}</td>
                    <td className="p-4">{m.name}</td>
                    <td className="p-4"><span className={statusClass(m.status)}>{m.status}</span></td>
                    <td className="p-4">{fmt(m.capacity_per_hour)} SP/h</td>
                    <td className="p-4 font-semibold text-slate-700">{fmt(run)} h</td>
                    <td className="p-4">{fmt(m.expected_lifespan_hours)} h</td>
                    <td className="p-4">
                      <div className="w-full bg-slate-200 rounded-full h-2.5">
                        <div className={`h-2.5 rounded-full ${percent > 80 ? 'bg-rose-500' : percent > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{width: `${percent}%`}}></div>
                      </div>
                      <span className="text-xs text-slate-500 mt-1 block">{percent.toFixed(1)}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
