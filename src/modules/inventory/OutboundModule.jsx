import React, { useState, useEffect, useCallback } from "react";
import { Upload, Save, Plus, Trash2, RefreshCcw, History, AlertTriangle } from "lucide-react";
import { DataTable, PageHeader, UnitSelect } from "../../components.jsx";
import { inventory } from "../../mesApi.js";
import { usePerm } from "../../perm.jsx";
import { inputCls, fmt, fmtDate, toast } from "../../ui.js";

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 mb-1.5">
      {label} {required && <span className="text-rose-500">*</span>}
    </label>
    {children}
  </div>
);

const OUTBOUND_PURPOSES = ["Giao cho khách hàng", "Xuất cho sản xuất", "Xuất trả NCC", "Hủy / Phế liệu", "Chuyển kho", "Khác"];

const emptyLine = () => ({
  _k: Math.random(), product_id: "", quantity: "", unit: "", lot_code: "", available: null, note: ""
});

function OutboundForm({ lookups, onSaved }) {
  const [header, setHeader] = useState({
    ref_code: "", outbound_date: new Date().toISOString().slice(0, 10),
    location_id: "", purpose: "Giao cho khách hàng", note: ""
  });
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);

  const setH = (k, v) => setHeader(s => ({ ...s, [k]: v }));
  const setLine = (k, field, v) => setLines(a => a.map(l => l._k === k ? { ...l, [field]: v } : l));

  const onProductChange = async (k, id) => {
    const p = (lookups.products || []).find(x => x.id === id);
    setLines(a => a.map(l => l._k === k ? { ...l, product_id: id, unit: p?.unit || "", available: null } : l));
    // Load current stock
    if (id) {
      try {
        const tree = await inventory.tree({ product_id: id });
        const total = (tree || []).find(x => x.product_id === id)?.total || 0;
        setLines(a => a.map(l => l._k === k ? { ...l, available: total } : l));
      } catch { /* ignore */ }
    }
  };

  const addLine = () => setLines(a => [...a, emptyLine()]);
  const rmLine = (k) => setLines(a => a.filter(l => l._k !== k));

  const save = async () => {
    if (!header.location_id) return toast.error("Chọn kho / vị trí xuất hàng");
    const validLines = lines.filter(l => l.product_id && Number(l.quantity) > 0);
    if (!validLines.length) return toast.error("Nhập ít nhất 1 sản phẩm với số lượng > 0");

    // Warn if over stock (soft check)
    const overStock = validLines.filter(l => l.available !== null && Number(l.quantity) > l.available);
    if (overStock.length > 0) {
      const names = overStock.map(l => {
        const p = (lookups.products || []).find(x => x.id === l.product_id);
        return p?.product_name || l.product_id;
      }).join(", ");
      if (!window.confirm(`Cảnh báo: ${names} có số lượng xuất vượt tồn kho hiện có. Tiếp tục?`)) return;
    }

    setSaving(true);
    try {
      await Promise.all(validLines.map(l =>
        inventory.adjust({
          product_id: l.product_id,
          quantity: Number(l.quantity),
          unit: l.unit,
          location_id: header.location_id,
          lot_code: l.lot_code || "",
          trx_type: "Xuất",
          ref_code: header.ref_code || null,
          note: [header.purpose, header.note, l.note].filter(Boolean).join(" | "),
        })
      ));
      toast.success(`Đã xuất kho ${validLines.length} dòng sản phẩm thành công!`);
      setLines([emptyLine()]);
      setHeader(h => ({ ...h, ref_code: "" }));
      onSaved();
    } catch (e) {
      toast.error("Lỗi: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 bg-rose-50 border-b border-rose-100 flex items-center gap-3">
        <Upload size={20} className="text-rose-600" />
        <h3 className="font-semibold text-rose-800">Tạo phiếu xuất kho</h3>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Số phiếu">
            <input className={inputCls} placeholder="Tự động nếu trống" value={header.ref_code}
              onChange={e => setH("ref_code", e.target.value)} />
          </Field>
          <Field label="Ngày xuất" required>
            <input type="date" className={inputCls} value={header.outbound_date}
              onChange={e => setH("outbound_date", e.target.value)} />
          </Field>
          <Field label="Mục đích xuất" required>
            <select className={inputCls} value={header.purpose} onChange={e => setH("purpose", e.target.value)}>
              {OUTBOUND_PURPOSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Kho / Vị trí xuất" required>
            <select className={inputCls} value={header.location_id} onChange={e => setH("location_id", e.target.value)}>
              <option value="">-- Chọn kho/vị trí --</option>
              {(lookups.locations || []).map(l => (
                <option key={l.id} value={l.id}>{l.warehouse_name} · {l.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-700">Danh sách hàng xuất</span>
            <button onClick={addLine} className="btn-ghost text-sm flex items-center gap-1.5">
              <Plus size={14} /> Thêm dòng
            </button>
          </div>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                  <th className="px-3 py-2.5 text-left">Sản phẩm *</th>
                  <th className="px-3 py-2.5 text-right w-28">Tồn hiện tại</th>
                  <th className="px-3 py-2.5 text-right w-28">Số lượng *</th>
                  <th className="px-3 py-2.5 w-24">Đơn vị</th>
                  <th className="px-3 py-2.5 w-32">Số lô</th>
                  <th className="px-3 py-2.5">Ghi chú</th>
                  <th className="px-3 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map(l => {
                  const overQty = l.available !== null && Number(l.quantity) > l.available;
                  return (
                    <tr key={l._k} className={`hover:bg-slate-50/50 ${overQty ? "bg-rose-50/40" : ""}`}>
                      <td className="px-3 py-2">
                        <select className={inputCls} value={l.product_id} onChange={e => onProductChange(l._k, e.target.value)}>
                          <option value="">-- Chọn sản phẩm --</option>
                          {(lookups.products || []).map(p => (
                            <option key={p.id} value={p.id}>{p.product_code} · {p.product_name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {l.available !== null
                          ? <span className={`font-medium ${l.available <= 0 ? "text-rose-600" : "text-slate-600"}`}>{fmt(l.available)}</span>
                          : <span className="text-slate-300">—</span>
                        }
                      </td>
                      <td className="px-3 py-2">
                        <div className="relative">
                          <input type="number" min="0" className={`${inputCls} text-right ${overQty ? "border-rose-400 focus:ring-rose-500/40" : ""}`}
                            value={l.quantity} onChange={e => setLine(l._k, "quantity", e.target.value)} />
                          {overQty && <AlertTriangle size={13} className="absolute right-2 top-2.5 text-rose-500" />}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <UnitSelect value={l.unit} onChange={v => setLine(l._k, "unit", v)} />
                      </td>
                      <td className="px-3 py-2">
                        <input className={inputCls} placeholder="Số lô" value={l.lot_code}
                          onChange={e => setLine(l._k, "lot_code", e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <input className={inputCls} placeholder="Ghi chú…" value={l.note}
                          onChange={e => setLine(l._k, "note", e.target.value)} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        {lines.length > 1 && (
                          <button onClick={() => rmLine(l._k)} className="text-slate-300 hover:text-rose-500 transition">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <Field label="Ghi chú phiếu">
          <input className={inputCls} placeholder="Ghi chú chung cho phiếu xuất…" value={header.note}
            onChange={e => setH("note", e.target.value)} />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
            <Save size={16} /> {saving ? "Đang lưu…" : "Xác nhận xuất kho"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OutboundHistory() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await inventory.transactions({ trx_type: "Xuất" })); }
    catch (e) { toast.error("Lỗi: " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const columns = [
    { key: "created_at", label: "Thời gian", render: r => new Date(r.created_at).toLocaleString("vi-VN") },
    { key: "product_code", label: "Mã SP", filter: "text", tdClass: "font-medium text-blue-600" },
    { key: "product_name", label: "Sản phẩm", filter: "text" },
    { key: "quantity", label: "Số lượng", align: "right", render: r => <span className="font-semibold text-rose-600">−{fmt(r.quantity)}</span> },
    { key: "warehouse_name", label: "Kho/Vị trí", render: r => r.warehouse_name ? `${r.warehouse_name}${r.location_name ? " · " + r.location_name : ""}` : "—" },
    { key: "lot_code", label: "Lô", render: r => r.lot_code || "—" },
    { key: "ref_code", label: "Số phiếu", filter: "text", render: r => r.ref_code || "—" },
    { key: "note", label: "Ghi chú / Mục đích", tdClass: "text-slate-400 text-xs" },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-slate-700">
          <History size={16} /> Lịch sử phiếu xuất
        </div>
        <button onClick={load} className="btn-ghost text-sm flex items-center gap-1.5">
          <RefreshCcw size={14} className={loading ? "animate-spin" : ""} /> Làm mới
        </button>
      </div>
      <div className="p-4">
        <DataTable dense columns={columns} rows={rows} rowKey={r => r.id}
          emptyText={loading ? "Đang tải…" : "Chưa có phiếu xuất"} />
      </div>
    </div>
  );
}

export default function OutboundModule({ lookups }) {
  const { can } = usePerm();
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="space-y-6">
      <PageHeader title="Xuất kho" icon={Upload} />
      {(can("inv_outbound", "create") || can("inv_outbound", "edit")) && (
        <OutboundForm lookups={lookups} onSaved={() => setRefreshKey(k => k + 1)} />
      )}
      {can("inv_outbound", "view") && (
        <OutboundHistory key={refreshKey} />
      )}
    </div>
  );
}
