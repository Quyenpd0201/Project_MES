import React, { useState, useEffect, useCallback } from "react";
import { PackagePlus, Save, Warehouse, History } from "lucide-react";
import { ListHeader, usePager } from "../components.jsx";
import { inventory } from "../mesApi.js";
import { usePerm } from "../perm.jsx";
import { inputCls, fmt, fmtDate, statusClass } from "../ui.js";

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 mb-1.5">
      {label} {required && <span className="text-rose-500">*</span>}
    </label>
    {children}
  </div>
);

function AdjustModal({ lookups, onClose, onSaved }) {
  const [f, setF] = useState({
    product_id: "", trx_type: "Nhập", quantity: "", unit: "",
    attr_size: "", attr_thickness: "", attr_color: "", location_id: "", note: "",
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const onProduct = (id) => {
    const p = lookups.products.find((x) => x.id === id);
    setF((s) => ({ ...s, product_id: id, unit: p?.unit || s.unit }));
  };
  const save = async () => {
    if (!f.product_id) return alert("Chọn sản phẩm");
    if (!f.quantity || Number(f.quantity) <= 0) return alert("Nhập số lượng hợp lệ");
    try { await inventory.adjust(f); onSaved(); }
    catch (e) { alert("Lỗi: " + e.message); }
  };
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-800">Nhập / Xuất / Điều chỉnh tồn</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sản phẩm" required>
            <select className={inputCls} value={f.product_id} onChange={(e) => onProduct(e.target.value)}>
              <option value="">-- Chọn --</option>
              {lookups.products.map((p) => <option key={p.id} value={p.id}>{p.product_code} · {p.product_name}</option>)}
            </select>
          </Field>
          <Field label="Loại giao dịch" required>
            <select className={inputCls} value={f.trx_type} onChange={(e) => set("trx_type", e.target.value)}>
              <option>Nhập</option><option>Xuất</option><option>Điều chỉnh</option>
            </select>
          </Field>
          <Field label="Số lượng" required>
            <input type="number" min="0" className={inputCls} value={f.quantity} onChange={(e) => set("quantity", e.target.value)} />
          </Field>
          <Field label="Đơn vị">
            <input className={inputCls} value={f.unit} onChange={(e) => set("unit", e.target.value)} />
          </Field>
          <Field label="Vị trí lưu trữ">
            <select className={inputCls} value={f.location_id} onChange={(e) => set("location_id", e.target.value)}>
              <option value="">-- Không xác định --</option>
              {lookups.locations.map((l) => <option key={l.id} value={l.id}>{l.warehouse_name} · {l.name}</option>)}
            </select>
          </Field>
          <Field label="Màu sắc">
            <input className={inputCls} list="colors" value={f.attr_color} onChange={(e) => set("attr_color", e.target.value)} />
          </Field>
          <Field label="Kích thước">
            <input className={inputCls} list="sizes" value={f.attr_size} onChange={(e) => set("attr_size", e.target.value)} />
          </Field>
          <Field label="Độ dày">
            <input className={inputCls} list="thicknesses" value={f.attr_thickness} onChange={(e) => set("attr_thickness", e.target.value)} />
          </Field>
        </div>
        <Field label="Ghi chú"><input className={inputCls} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost">Hủy</button>
          <button onClick={save} className="btn-primary"><Save size={16} /> Lưu</button>
        </div>
      </div>
    </div>
  );
}

function StockTab({ lookups, onOpenProduct }) {
  const { can } = usePerm();
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ warehouse_id: "", q: "" });
  const [adjusting, setAdjusting] = useState(false);
  const { slice, Pager, Filler } = usePager(rows);

  const load = useCallback(async () => {
    try { setRows(await inventory.list(filters)); }
    catch (e) { alert("Lỗi tải tồn kho: " + e.message); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {(can("inventory", "edit") || can("inventory", "create")) && <button onClick={() => setAdjusting(true)} className="btn-primary"><PackagePlus size={16} /> Nhập / Xuất kho</button>}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <input placeholder="Tìm sản phẩm" className={inputCls} value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select className={inputCls} value={filters.warehouse_id} onChange={(e) => setFilters({ ...filters, warehouse_id: e.target.value })}>
          <option value="">Tất cả kho</option>
          {lookups.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>{["Mã SP", "Sản phẩm", "Loại", "Màu", "Kích thước", "Độ dày", "Kho / Vị trí", "Tồn", "ĐVT"].map((h) =>
              <th key={h} className="text-left px-3 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {slice.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/70">
                <td className="px-3 py-3">
                  <button onClick={() => onOpenProduct?.(s.product_id)} className="font-medium text-blue-600 hover:underline">{s.product_code}</button>
                </td>
                <td className="px-3 py-3 text-slate-800">{s.product_name}</td>
                <td className="px-3 py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass(s.product_type)}`}>{s.product_type}</span></td>
                <td className="px-3 py-3">{s.attr_color || "—"}</td>
                <td className="px-3 py-3">{s.attr_size || "—"}</td>
                <td className="px-3 py-3">{s.attr_thickness || "—"}</td>
                <td className="px-3 py-3 text-slate-600">{s.warehouse_name ? `${s.warehouse_name} · ${s.location_name}` : "—"}</td>
                <td className={`px-3 py-3 text-right font-semibold ${Number(s.quantity) < 0 ? "text-rose-600" : ""}`}>{fmt(s.quantity)}</td>
                <td className="px-3 py-3">{s.unit}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Chưa có tồn kho</td></tr>}
            <Filler cols={9} />
          </tbody>
        </table>
      </div>
      <Pager />

      {adjusting && <AdjustModal lookups={lookups} onClose={() => setAdjusting(false)} onSaved={() => { setAdjusting(false); load(); }} />}
    </div>
  );
}

/* ---- Tab: Lịch sử giao dịch kho ---- */
const TRX_COLOR = { "Nhập": "bg-emerald-50 text-emerald-700", "Xuất": "bg-rose-50 text-rose-700", "Điều chỉnh": "bg-amber-50 text-amber-700" };
function TransactionsTab() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ trx_type: "", q: "" });
  const { slice, Pager, Filler } = usePager(rows);
  const load = useCallback(async () => {
    try { setRows(await inventory.transactions(filters)); } catch (e) { alert("Lỗi tải lịch sử: " + e.message); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <input placeholder="Tìm sản phẩm / mã chứng từ" className={inputCls} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select className={inputCls} value={filters.trx_type} onChange={(e) => setFilters({ ...filters, trx_type: e.target.value })}>
          <option value="">Tất cả loại</option><option>Nhập</option><option>Xuất</option><option>Điều chỉnh</option>
        </select>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>{["Thời gian", "Loại", "Mã SP", "Sản phẩm", "Thuộc tính", "Số lượng", "Kho/Vị trí", "Chứng từ", "Ghi chú"].map((h) =>
              <th key={h} className="text-left px-3 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {slice.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50/70">
                <td className="px-3 py-3 text-slate-500">{new Date(t.created_at).toLocaleString("vi-VN")}</td>
                <td className="px-3 py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${TRX_COLOR[t.trx_type] || ""}`}>{t.trx_type}</span></td>
                <td className="px-3 py-3 font-medium text-blue-600">{t.product_code}</td>
                <td className="px-3 py-3 text-slate-800">{t.product_name}</td>
                <td className="px-3 py-3 text-slate-500">{[t.attr_color, t.attr_size, t.attr_thickness].filter(Boolean).join(" · ") || "—"}</td>
                <td className={`px-3 py-3 text-right font-semibold ${t.trx_type === "Xuất" ? "text-rose-600" : "text-emerald-600"}`}>{t.trx_type === "Xuất" ? "−" : "+"}{fmt(t.quantity)}</td>
                <td className="px-3 py-3 text-slate-600">{t.warehouse_name ? `${t.warehouse_name} · ${t.location_name}` : "—"}</td>
                <td className="px-3 py-3 text-slate-600">{t.ref_code || "—"}</td>
                <td className="px-3 py-3 text-slate-400">{t.note || ""}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Chưa có giao dịch</td></tr>}
            <Filler cols={9} />
          </tbody>
        </table>
      </div>
      <Pager />
    </div>
  );
}

/* ---- Hub Kho ---- */
export default function InventoryModule({ lookups, onOpenProduct }) {
  const [tab, setTab] = useState("stock");
  const tabs = [
    { key: "stock", label: "Tồn kho", icon: Warehouse },
    { key: "trx", label: "Lịch sử giao dịch", icon: History },
  ];
  return (
    <div className="space-y-5">
      <ListHeader title="Kho" />
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition flex items-center gap-2 ${
              tab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>
      {tab === "stock" ? <StockTab lookups={lookups} onOpenProduct={onOpenProduct} /> : <TransactionsTab />}
    </div>
  );
}
