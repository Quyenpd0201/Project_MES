import React, { useState, useEffect, useCallback } from "react";
import { RotateCcw, Save, RefreshCcw, History, ArrowRight } from "lucide-react";
import { DataTable, PageHeader, UnitSelect } from "../../components.jsx";
import { inventory } from "../../mesApi.js";
import { usePerm } from "../../perm.jsx";
import { inputCls, fmt, toast } from "../../ui.js";

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 mb-1.5">
      {label} {required && <span className="text-rose-500">*</span>}
    </label>
    {children}
  </div>
);

function TransferForm({ lookups, onSaved }) {
  const [form, setForm] = useState({
    product_id: "", quantity: "", unit: "", lot_code: "",
    from_location_id: "", to_location_id: "", note: ""
  });
  const [available, setAvailable] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }));

  const onProductChange = async (id) => {
    const p = (lookups.products || []).find(x => x.id === id);
    set("product_id", id);
    if (p) set("unit", p.unit || "");
    setAvailable(null);
    if (id) {
      try {
        const tree = await inventory.tree({ product_id: id });
        const total = (tree || []).find(x => x.product_id === id)?.total || 0;
        setAvailable(total);
      } catch { /* ignore */ }
    }
  };

  const save = async () => {
    if (!form.product_id) return toast.error("Chọn sản phẩm cần chuyển");
    if (!form.quantity || Number(form.quantity) <= 0) return toast.error("Nhập số lượng > 0");
    if (!form.from_location_id) return toast.error("Chọn kho/vị trí nguồn");
    if (!form.to_location_id) return toast.error("Chọn kho/vị trí đích");
    if (form.from_location_id === form.to_location_id) return toast.error("Kho nguồn và đích không được giống nhau");

    setSaving(true);
    try {
      // 1. Xuất kho nguồn
      await inventory.adjust({
        product_id: form.product_id,
        quantity: Number(form.quantity),
        unit: form.unit,
        location_id: form.from_location_id,
        lot_code: form.lot_code || "",
        trx_type: "Xuất",
        ref_code: null,
        note: `Chuyển kho → ${(lookups.locations || []).find(l => l.id === form.to_location_id)?.name || "đích"}${form.note ? " | " + form.note : ""}`,
      });
      // 2. Nhập kho đích
      await inventory.adjust({
        product_id: form.product_id,
        quantity: Number(form.quantity),
        unit: form.unit,
        location_id: form.to_location_id,
        lot_code: form.lot_code || "",
        trx_type: "Nhập",
        ref_code: null,
        note: `Chuyển kho ← ${(lookups.locations || []).find(l => l.id === form.from_location_id)?.name || "nguồn"}${form.note ? " | " + form.note : ""}`,
      });
      toast.success("Chuyển kho thành công!");
      setForm({
        product_id: "", quantity: "", unit: "", lot_code: "",
        from_location_id: "", to_location_id: "", note: ""
      });
      setAvailable(null);
      onSaved();
    } catch (e) {
      toast.error("Lỗi chuyển kho: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const fromLoc = (lookups.locations || []).find(l => l.id === form.from_location_id);
  const toLoc = (lookups.locations || []).find(l => l.id === form.to_location_id);
  const overQty = available !== null && Number(form.quantity) > available;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 bg-blue-50 border-b border-blue-100 flex items-center gap-3">
        <RotateCcw size={20} className="text-blue-600" />
        <h3 className="font-semibold text-blue-800">Tạo phiếu chuyển kho</h3>
      </div>

      <div className="p-5 space-y-5">
        {/* Product & qty */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Sản phẩm" required>
            <select className={inputCls} value={form.product_id} onChange={e => onProductChange(e.target.value)}>
              <option value="">-- Chọn sản phẩm --</option>
              {(lookups.products || []).map(p => (
                <option key={p.id} value={p.id}>{p.product_code} · {p.product_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Tồn kho hiện tại">
            <div className={`${inputCls} flex items-center bg-slate-50 text-slate-600 cursor-default`}>
              {available !== null ? <><span className={available <= 0 ? "text-rose-600 font-bold" : ""}>{fmt(available)}</span><span className="ml-1 text-slate-400 text-xs">{form.unit}</span></> : <span className="text-slate-300">—</span>}
            </div>
          </Field>
          <Field label="Số lượng chuyển" required>
            <input type="number" min="0" className={`${inputCls} ${overQty ? "border-rose-400" : ""}`}
              value={form.quantity} onChange={e => set("quantity", e.target.value)} />
            {overQty && <p className="text-rose-500 text-xs mt-1">⚠ Vượt tồn kho hiện có</p>}
          </Field>
          <Field label="Đơn vị">
            <UnitSelect value={form.unit} onChange={v => set("unit", v)} />
          </Field>
        </div>

        {/* From → To visual */}
        <div className="bg-slate-50 rounded-xl p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Field label="Kho / Vị trí nguồn" required>
                <select className={inputCls} value={form.from_location_id} onChange={e => set("from_location_id", e.target.value)}>
                  <option value="">-- Kho xuất hàng --</option>
                  {(lookups.locations || []).map(l => (
                    <option key={l.id} value={l.id}>{l.warehouse_name} · {l.name}</option>
                  ))}
                </select>
              </Field>
              {fromLoc && <div className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-600">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span>{fromLoc.warehouse_name}</span>
              </div>}
            </div>

            <div className="flex flex-col items-center shrink-0 gap-1">
              <ArrowRight size={28} className="text-slate-400" />
              <span className="text-xs text-slate-400">{form.quantity ? fmt(form.quantity) : "?"} {form.unit}</span>
            </div>

            <div className="flex-1">
              <Field label="Kho / Vị trí đích" required>
                <select className={inputCls} value={form.to_location_id} onChange={e => set("to_location_id", e.target.value)}>
                  <option value="">-- Kho nhận hàng --</option>
                  {(lookups.locations || []).filter(l => l.id !== form.from_location_id).map(l => (
                    <option key={l.id} value={l.id}>{l.warehouse_name} · {l.name}</option>
                  ))}
                </select>
              </Field>
              {toLoc && <div className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-600">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>{toLoc.warehouse_name}</span>
              </div>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Số lô">
            <input className={inputCls} placeholder="Mã lô sản xuất (nếu có)" value={form.lot_code}
              onChange={e => set("lot_code", e.target.value)} />
          </Field>
          <Field label="Ghi chú">
            <input className={inputCls} placeholder="Lý do chuyển kho…" value={form.note}
              onChange={e => set("note", e.target.value)} />
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
            <Save size={16} /> {saving ? "Đang chuyển…" : "Xác nhận chuyển kho"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferHistory() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Get both inbound+outbound for "Chuyển kho" notes
      const all = await inventory.transactions({});
      setRows((all || []).filter(r => (r.note || "").includes("Chuyển kho")));
    } catch (e) { toast.error("Lỗi: " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const TRX_COLOR = { "Nhập": "bg-emerald-50 text-emerald-700", "Xuất": "bg-rose-50 text-rose-700" };
  const columns = [
    { key: "created_at", label: "Thời gian", render: r => new Date(r.created_at).toLocaleString("vi-VN") },
    { key: "trx_type", label: "Loại", render: r => <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${TRX_COLOR[r.trx_type] || ""}`}>{r.trx_type}</span> },
    { key: "product_code", label: "Mã SP", filter: "text", tdClass: "font-medium text-blue-600" },
    { key: "product_name", label: "Sản phẩm", filter: "text" },
    { key: "quantity", label: "Số lượng", align: "right", render: r => <span className="font-semibold">{fmt(r.quantity)}</span> },
    { key: "warehouse_name", label: "Kho/Vị trí", render: r => r.warehouse_name ? `${r.warehouse_name}${r.location_name ? " · " + r.location_name : ""}` : "—" },
    { key: "note", label: "Chi tiết", tdClass: "text-slate-500 text-xs" },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-slate-700">
          <History size={16} /> Lịch sử chuyển kho
        </div>
        <button onClick={load} className="btn-ghost text-sm flex items-center gap-1.5">
          <RefreshCcw size={14} className={loading ? "animate-spin" : ""} /> Làm mới
        </button>
      </div>
      <div className="p-4">
        <DataTable dense columns={columns} rows={rows} rowKey={r => r.id}
          emptyText={loading ? "Đang tải…" : "Chưa có giao dịch chuyển kho"} />
      </div>
    </div>
  );
}

export default function TransferModule({ lookups }) {
  const { can } = usePerm();
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="space-y-6">
      <PageHeader title="Chuyển kho" icon={RotateCcw} />
      {(can("inv_transfer", "create") || can("inv_transfer", "edit")) && (
        <TransferForm lookups={lookups} onSaved={() => setRefreshKey(k => k + 1)} />
      )}
      {can("inv_transfer", "view") && (
        <TransferHistory key={refreshKey} />
      )}
    </div>
  );
}
