import React, { useState, useRef, useEffect } from "react";
import { Search, Save, CheckCircle2 } from "lucide-react";
import { ListHeader } from "../../components.jsx";
import { production } from "../../mesApi.js";
import {  inputCls, fmt, fmtDate, statusClass , toast } from "../../ui.js";

const TASK_RE = /(LSX\d+-\d+)/i;
const STATUSES = ["Chờ", "Đang sản xuất", "Hoàn thành", "Đã hủy"];

export default function QrScanModule() {
  const [input, setInput] = useState("");
  const [task, setTask] = useState(null);
  const [form, setForm] = useState({ status: "", actual_qty: "", scrap_qty: "" });
  const [log, setLog] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const lookup = async (raw) => {
    const code = (raw.match(TASK_RE)?.[1] || raw.trim()).toUpperCase();
    setInput("");
    if (!code) return;
    try {
      const t = await production.taskByCode(code);
      setTask(t);
      setForm({ status: t.status || "Đang sản xuất", actual_qty: t.actual_qty ?? "", scrap_qty: t.scrap_qty ?? "" });
    } catch (e) { setTask(null); toast.error(e.message); inputRef.current?.focus(); }
  };

  const save = async () => {
    if (!task) return;
    try {
      const r = await production.updateTask(task.id, form);
      setLog((l) => [{ code: task.task_code, status: form.status, prod: r.produced, time: new Date().toLocaleTimeString("vi-VN") }, ...l].slice(0, 12));
      setTask(null); setForm({ status: "", actual_qty: "", scrap_qty: "" });
      inputRef.current?.focus();
    } catch (e) { toast.error("Lỗi cập nhật: " + e.message); }
  };

  const F = ({ label, children }) => (<div><label className="block text-sm font-medium text-slate-600 mb-1.5">{label}</label>{children}</div>);

  return (
    <div className="space-y-5">
      <ListHeader title="Tra cứu mã truy xuất (Cập nhật sản xuất)" />

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input ref={inputRef} className={inputCls + " pl-10"} value={input} placeholder="Nhập mã truy xuất — ví dụ: LSX00004-1 — rồi ấn Enter"
              onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookup(input); } }} />
          </div>
          <button onClick={() => lookup(input)} className="btn-primary">Tra cứu</button>
        </div>
      </div>

      {task && (
        <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
          <div className="px-5 py-3 bg-blue-50/60 border-b border-blue-100 flex items-center justify-between">
            <span className="font-semibold text-slate-800">Lô {task.task_code} · {task.stage} ({task.stage === "Cắt" ? "TP" : "BTP"})</span>
            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass(task.status)}`}>{task.status}</span>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
              <div><span className="text-slate-400">Lệnh SX:</span> <b>{task.order_code}</b></div>
              <div><span className="text-slate-400">Đơn hàng:</span> <b>{task.sales_order_code || "—"}</b></div>
              <div><span className="text-slate-400">Khách:</span> {task.customer_name || "—"}</div>
              <div><span className="text-slate-400">Sản phẩm:</span> <b>{task.product_name}</b></div>
              <div><span className="text-slate-400">Màu/KT/Dày:</span> {[task.attr_color, task.attr_size, task.attr_thickness].filter(Boolean).join(" / ") || "—"}</div>
              <div><span className="text-slate-400">Máy:</span> {task.machine_name || "—"}</div>
              <div><span className="text-slate-400">SL kế hoạch:</span> <b>{fmt(task.quantity)} {task.unit}</b></div>
              <div><span className="text-slate-400">Ngày SX:</span> {fmtDate(task.planned_date)}</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
              <F label="Trạng thái">
                <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
              </F>
              <F label="Sản lượng thực"><input type="number" min="0" className={inputCls} value={form.actual_qty} onChange={(e) => setForm({ ...form, actual_qty: e.target.value })} placeholder={`mặc định ${fmt(task.quantity)}`} /></F>
              <F label="Phế phẩm"><input type="number" min="0" className={inputCls} value={form.scrap_qty} onChange={(e) => setForm({ ...form, scrap_qty: e.target.value })} /></F>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setTask(null)} className="btn-ghost">Bỏ qua</button>
              <button onClick={save} className="btn-primary"><Save size={16} /> Cập nhật lô</button>
            </div>
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 text-sm font-semibold text-slate-700">Lần tra cứu gần đây</div>
          <div className="divide-y divide-slate-100">
            {log.map((l, i) => (
              <div key={i} className="px-5 py-2.5 text-sm flex items-center gap-3">
                <CheckCircle2 size={16} className="text-emerald-500" />
                <span className="font-medium text-blue-600">{l.code}</span>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(l.status)}`}>{l.status}</span>
                <span className="text-slate-400 ml-auto">{l.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
