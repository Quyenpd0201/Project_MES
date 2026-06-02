import React, { useState, useEffect, useCallback } from "react";
import QRCode from "qrcode";
import { Printer, QrCode } from "lucide-react";
import { ListHeader } from "../components.jsx";
import { production } from "../mesApi.js";
import { inputCls, fmt, fmtDate } from "../ui.js";

/* Ảnh QR sinh từ chuỗi text */
function QR({ text, size }) {
  const [url, setUrl] = useState("");
  useEffect(() => { QRCode.toDataURL(text || " ", { width: size, margin: 1 }).then(setUrl).catch(() => {}); }, [text, size]);
  return url ? <img src={url} width={size} height={size} alt="QR" /> : <div style={{ width: size, height: size }} className="bg-slate-100 rounded" />;
}

const ALL_FIELDS = [
  { key: "sales_order", label: "Mã đơn hàng" },
  { key: "po", label: "Mã lệnh SX" },
  { key: "task", label: "Mã lô" },
  { key: "stage", label: "Công đoạn" },
  { key: "type", label: "Loại (TP/BTP)" },
  { key: "product", label: "Sản phẩm" },
  { key: "color", label: "Màu sắc" },
  { key: "size", label: "Kích thước" },
  { key: "thickness", label: "Độ dày" },
  { key: "qty", label: "Số lượng" },
  { key: "machine", label: "Máy" },
  { key: "date", label: "Ngày SX" },
  { key: "customer", label: "Khách hàng" },
];
const DEFAULT_ON = ["sales_order", "task", "stage", "type", "product", "color", "size", "qty", "date"];
const QR_PX = { S: 84, M: 116, L: 150 };

export default function QrLabelsModule() {
  const [orderList, setOrderList] = useState([]);
  const [orderId, setOrderId] = useState("");
  const [order, setOrder] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [copies, setCopies] = useState(1);
  const [size, setSize] = useState("M");
  const [fields, setFields] = useState(Object.fromEntries(ALL_FIELDS.map((f) => [f.key, DEFAULT_ON.includes(f.key)])));

  useEffect(() => { production.list().then(setOrderList).catch(() => {}); }, []);

  const load = useCallback(async (id) => {
    setOrderId(id);
    if (!id) { setOrder(null); setTasks([]); return; }
    try {
      const [o, t] = await Promise.all([production.get(id), production.getTasks(id)]);
      setOrder(o); setTasks(t);
    } catch (e) { alert("Lỗi tải lệnh: " + e.message); }
  }, []);

  const dataOf = (t) => ({
    sales_order: order.sales_order_code || "—",
    po: order.order_code,
    task: t.task_code,
    stage: t.stage,
    type: t.stage === "Cắt" ? "Thành phẩm" : "Bán thành phẩm",
    product: order.product_name,
    color: order.attr_color || "—",
    size: order.attr_size || "—",
    thickness: order.attr_thickness || "—",
    qty: `${fmt(t.quantity)} ${order.unit || ""}`.trim(),
    machine: t.machine_name || "—",
    date: fmtDate(t.planned_date),
    customer: order.customer_name || "—",
  });
  const activeFields = ALL_FIELDS.filter((f) => fields[f.key]);
  const linesOf = (d) => activeFields.map((f) => `${f.label}: ${d[f.key]}`);
  const toggle = (k) => setFields((s) => ({ ...s, [k]: !s[k] }));

  // mở rộng theo số bản in
  const labels = [];
  tasks.forEach((t) => { for (let i = 0; i < Math.max(1, copies); i++) labels.push(t); });
  const qrpx = QR_PX[size];

  return (
    <div className="space-y-5">
      <ListHeader title="Tem QR sản xuất" />

      {/* Cấu hình */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 no-print">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Lệnh sản xuất</label>
            <select className={inputCls} value={orderId} onChange={(e) => load(e.target.value)}>
              <option value="">-- Chọn lệnh SX --</option>
              {orderList.map((o) => <option key={o.id} value={o.id}>{o.order_code} · {o.product_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Cỡ tem</label>
            <select className={inputCls} value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="S">Nhỏ</option><option value="M">Vừa</option><option value="L">Lớn</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Số bản in mỗi lô</label>
            <input type="number" min="1" className={inputCls} value={copies} onChange={(e) => setCopies(Number(e.target.value) || 1)} />
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-slate-600 mb-2">Thông tin in lên tem (tùy chọn)</div>
          <div className="flex flex-wrap gap-2">
            {ALL_FIELDS.map((f) => (
              <label key={f.key} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer text-sm transition ${
                fields[f.key] ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                <input type="checkbox" checked={fields[f.key]} onChange={() => toggle(f.key)} className="w-4 h-4 accent-blue-600" />
                {f.label}
              </label>
            ))}
          </div>
        </div>
        {order && tasks.length > 0 && (
          <div className="flex justify-end">
            <button onClick={() => window.print()} className="btn-primary"><Printer size={16} /> In tem ({labels.length})</button>
          </div>
        )}
      </div>

      {/* Khu tem */}
      {!order && <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 no-print">Chọn một lệnh sản xuất để sinh tem QR cho từng lô.</div>}
      {order && tasks.length === 0 && <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 no-print">Lệnh này chưa được chia lô (phân công). Vào <b>Sản xuất → mở lệnh → Phân công</b> trước.</div>}

      {order && tasks.length > 0 && (
        <div className="print-area flex flex-wrap gap-3">
          {labels.map((t, i) => {
            const d = dataOf(t);
            return (
              <div key={i} className="qr-label flex gap-3 border border-slate-300 rounded-lg p-3 bg-white" style={{ width: size === "L" ? 360 : size === "M" ? 300 : 250 }}>
                <div className="shrink-0"><QR text={[d.task, ...linesOf(d)].join("\n")} size={qrpx} /></div>
                <div className="text-[11px] leading-snug text-slate-700 min-w-0">
                  {activeFields.map((f) => (
                    <div key={f.key} className="truncate"><span className="text-slate-400">{f.label}:</span> <b>{d[f.key]}</b></div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`@media print {
        body * { visibility: hidden !important; }
        .print-area, .print-area * { visibility: visible !important; }
        .print-area { position: absolute; left: 0; top: 0; }
        .no-print { display: none !important; }
        .qr-label { break-inside: avoid; }
      }`}</style>
    </div>
  );
}
