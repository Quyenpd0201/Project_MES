import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Pencil, ArrowLeft, Save, FileText, Printer, Copy } from "lucide-react";
import { resource } from "../mesApi.js";
import { usePerm } from "../perm.jsx";
import { inputCls, fmt, fmtDate, fmtDateTime, statusClass, dueTone } from "../ui.js";
import { PageHeader, Section, ListHeader, DataTable, Logo } from "../components.jsx";
import { PRODUCT_SPECS, SPEC_NAMES, splitNU, specShort } from "../specs.js";

const ordersApi = resource("sales-orders");
const STATUSES = [
  "Mới",
  "Đang sản xuất",
  "Hoàn thành sản xuất",
  "Chuyển hàng 1 phần",
  "Đang vận chuyển",
  "Đã vận chuyển, chưa thanh toán",
  "Đã thanh toán",
  "Hoàn thành",
  "Đã hủy",
];

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 mb-1.5">{label} {required && <span className="text-rose-500">*</span>}</label>
    {children}
  </div>
);

/* Bộ ô nhập thông số kỹ thuật cho 1 dòng hàng */
function SpecFields({ specs, onChange, disabled }) {
  const get = (n) => specs?.[n] || "";
  const setV = (n, v) => { const next = { ...specs }; if (v) next[n] = v; else delete next[n]; onChange(next); };
  const cls = inputCls + (disabled ? " bg-slate-50" : "");
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {PRODUCT_SPECS.map((spec) => {
        const lbl = <span className="block text-xs font-medium text-slate-500 mb-1">{spec.name}</span>;
        if (spec.kind === "select") return (
          <label key={spec.name}>{lbl}
            <select className={cls} disabled={disabled} value={get(spec.name)} onChange={(e) => setV(spec.name, e.target.value)}>
              <option value="">-- Chọn --</option>{spec.options.map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
        );
        if (spec.kind === "num") { const { num } = splitNU(get(spec.name)); return (
          <label key={spec.name}>{lbl}
            <div className="relative">
              <input type="number" className={cls + " pr-10"} disabled={disabled} value={num} placeholder="0"
                onChange={(e) => setV(spec.name, e.target.value ? `${e.target.value} ${spec.unit}` : "")} />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">{spec.unit}</span>
            </div>
          </label>
        ); }
        const { num, unit } = splitNU(get(spec.name)); const cu = unit || spec.units[0];
        return (
          <label key={spec.name}>{lbl}
            <div className="flex gap-1.5">
              <input type="number" className={cls + " flex-1"} disabled={disabled} value={num} placeholder="0"
                onChange={(e) => setV(spec.name, e.target.value ? `${e.target.value} ${cu}` : "")} />
              <select className={cls + " w-20"} disabled={disabled} value={cu}
                onChange={(e) => setV(spec.name, num ? `${num} ${e.target.value}` : "")}>
                {spec.units.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
          </label>
        );
      })}
    </div>
  );
}

/* ---- Tag Nguyên vật liệu cho từng dòng hàng (định mức từ BOM) ---- */
function MaterialTag({ materials }) {
  if (!materials || !materials.length) return null;
  return (
    <div className="pl-8">
      <div className="text-xs font-semibold text-slate-400 uppercase mb-1.5">Nguyên vật liệu</div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-100 text-slate-500">
            <tr>
              {["Mã NVL", "Tên vật tư", "ĐVT", "Định mức", "Tồn kho", "Cần bổ sung", "Đã dùng cho đơn"].map((h) =>
                <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <tr key={m.material_id} className="border-t border-slate-100">
                <td className="px-2 py-1.5 font-medium text-slate-700 whitespace-nowrap">{m.material_code}</td>
                <td className="px-2 py-1.5 text-slate-700">{m.material_name}</td>
                <td className="px-2 py-1.5 text-slate-500">{m.unit}</td>
                <td className="px-2 py-1.5 text-right">{fmt(m.required)}</td>
                <td className="px-2 py-1.5 text-right">{fmt(m.on_hand)}</td>
                <td className={"px-2 py-1.5 text-right font-medium " + (Number(m.to_replenish) > 0 ? "text-rose-600" : "text-emerald-600")}>{fmt(m.to_replenish)}</td>
                <td className="px-2 py-1.5 text-right text-slate-600">{fmt(m.used)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---- Danh sách Lệnh sản xuất gắn với dòng hàng (1 dòng → nhiều LSX) ---- */
function LsxLinks({ orders }) {
  return (
    <div className="pl-8">
      <div className="text-xs font-semibold text-slate-400 uppercase mb-1.5">Lệnh sản xuất</div>
      {orders && orders.length ? (
        <div className="flex flex-wrap gap-2">
          {orders.map((o) => (
            <span key={o.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs">
              <span className="font-semibold text-slate-700">{o.order_code}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500">{fmt(o.quantity)} {o.unit}</span>
              <span className={"px-1.5 py-0.5 rounded-full text-[10px] " + statusClass(o.status)}>{o.status}</span>
            </span>
          ))}
        </div>
      ) : (
        <div className="text-xs text-slate-400 italic">Chưa có lệnh sản xuất — tạo ở màn Kế hoạch SX.</div>
      )}
    </div>
  );
}

/* ---- Form đơn hàng ---- */
function OrderForm({ lookups, editId, copyId, onBack, onSaved, onPrint, onCreateDelivery }) {
  const { can, fperm } = usePerm();
  const fhid = (k) => fperm("orders", k) === "hidden";
  const fdis = (k) => fperm("orders", k) !== "edit";
  const today = new Date().toISOString().slice(0, 10);
  const [editing, setEditing] = useState(!editId); // tạo mới = sửa ngay; mở sẵn = xem
  const [f, setF] = useState({ customer_id: "", order_date: today, due_date: "", status: "Mới", note: "" });
  const [items, setItems] = useState([{ _k: 1, product_id: "", quantity: "", unit: "", specs: {}, core_weight: "", total_weight: "", note: "", planned_start_date: "", planned_end_date: "" }]);
  const [seq, setSeq] = useState(2);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const loadData = useCallback(() => {
    if (!editId) return;
    ordersApi.get(editId).then((d) => {
      setF({ customer_id: d.customer_id, order_date: d.order_date?.slice(0, 10) || today, due_date: d.due_date?.slice(0, 10) || "", status: d.status, note: d.note || "" });
      setItems((d.items || []).map((it, i) => ({ _k: i + 1, id: it.id, product_id: it.product_id, quantity: it.quantity, unit: it.unit || "", specs: it.specs || {}, core_weight: it.core_weight ?? "", total_weight: it.total_weight ?? "", note: it.note || "", planned_start_date: it.planned_start_date?.slice(0, 10) || "", planned_end_date: it.planned_end_date?.slice(0, 10) || "", actual_start_date: it.actual_start_date || null, actual_end_date: it.actual_end_date || null, materials: it.materials || [], production_orders: it.production_orders || [] })));
      setSeq((d.items?.length || 0) + 1);
    }).catch((e) => alert("Lỗi tải đơn: " + e.message));
  }, [editId]); // eslint-disable-line
  useEffect(() => { loadData(); }, [loadData]);

  // Sao chép từ đơn nguồn → đơn mới (không gắn editId nên Lưu sẽ tạo mới)
  useEffect(() => {
    if (editId || !copyId) return;
    ordersApi.get(copyId).then((d) => {
      setF({ customer_id: d.customer_id, order_date: today, due_date: "", status: "Mới", note: d.note || "" });
      setItems((d.items || []).map((it, i) => ({ _k: i + 1, product_id: it.product_id, quantity: it.quantity, unit: it.unit || "", specs: it.specs || {}, core_weight: it.core_weight ?? "", total_weight: it.total_weight ?? "", note: it.note || "", planned_start_date: "", planned_end_date: "" })));
      setSeq((d.items?.length || 0) + 1);
    }).catch((e) => alert("Lỗi tải đơn nguồn để sao chép: " + e.message));
  }, [copyId, editId]); // eslint-disable-line

  const addItem = () => { setItems((a) => [...a, { _k: seq, product_id: "", quantity: "", unit: "", specs: {}, core_weight: "", total_weight: "", note: "", planned_start_date: "", planned_end_date: "" }]); setSeq((s) => s + 1); };
  const rmItem = (k) => setItems((a) => a.filter((x) => x._k !== k));
  const upItem = (k, fld, v) => setItems((a) => a.map((x) => {
    if (x._k !== k) return x;
    const nx = { ...x, [fld]: v };
    if (fld === "product_id") { const p = lookups.products.find((pp) => pp.id === v); if (p) nx.unit = p.unit || x.unit || ""; }
    // Hàng cuộn: tổng khối lượng = số lượng + khối lượng lõi (lõi trống tính = 0)
    if (fld === "quantity" || fld === "core_weight") {
      const q = Number(nx.quantity);
      const c = (nx.core_weight === "" || nx.core_weight == null) ? 0 : Number(nx.core_weight);
      if (nx.quantity !== "" && nx.quantity != null && !Number.isNaN(q) && !Number.isNaN(c))
        nx.total_weight = String(q + c);
    }
    return nx;
  }));

  const save = async () => {
    if (!f.customer_id) return alert("Chọn khách hàng");
    const valid = items.filter((it) => it.product_id && it.quantity);
    if (!valid.length) return alert("Cần ít nhất 1 dòng hàng");
    try {
      if (editId) await ordersApi.update(editId, { ...f, items: valid }); else await ordersApi.create({ ...f, items: valid });
      onSaved();
    } catch (e) { alert("Lỗi lưu đơn hàng: " + e.message); }
  };

  const del = async () => {
    if (!confirm("Xóa đơn hàng này?")) return;
    try { await ordersApi.remove(editId); onSaved(); } catch (e) { alert("Lỗi xóa: " + e.message); }
  };

  return (
    <div className="space-y-5">
      <PageHeader title={!editId ? (copyId ? "Tạo đơn hàng (sao chép)" : "Tạo đơn hàng") : editing ? "Sửa đơn hàng" : "Chi tiết đơn hàng"} onBack={onBack}
        actions={editId && !editing ? (<>
          <button onClick={() => onPrint?.(editId)} className="btn-ghost"><Printer size={16} /> In phiếu</button>
          {onCreateDelivery && <button onClick={() => onCreateDelivery(editId)} className="btn-ghost text-blue-600 border-blue-200 hover:bg-blue-50"><FileText size={16} /> Tạo phiếu giao hàng</button>}
          {can("orders", "edit") && <button onClick={() => setEditing(true)} className="btn-ghost"><Pencil size={16} /> Sửa</button>}
          {can("orders", "delete") && <button onClick={del} className="btn-ghost" style={{ color: "#e11d48" }}><Trash2 size={16} /> Xóa</button>}
        </>) : (<>
          {editId && <button onClick={() => { setEditing(false); loadData(); }} className="btn-ghost">Hủy</button>}
          <button onClick={save} className="btn-primary"><Save size={16} /> Lưu đơn hàng</button>
        </>)} />

      <fieldset disabled={!editing} className="space-y-5">
      <Section title="Thông tin đơn hàng">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
        {!fhid("customer_id") && <Field label="Khách hàng" required>
          <select className={inputCls} disabled={fdis("customer_id")} value={f.customer_id} onChange={(e) => set("customer_id", e.target.value)}>
            <option value="">-- Chọn khách hàng --</option>
            {lookups.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>}
        {!fhid("status") && <Field label="Trạng thái">
          <select className={inputCls} disabled={fdis("status")} value={f.status} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>}
        {!fhid("order_date") && <Field label="Ngày đặt"><input type="date" className={inputCls} disabled={fdis("order_date")} value={f.order_date} onChange={(e) => set("order_date", e.target.value)} /></Field>}
        {!fhid("due_date") && <Field label="Ngày giao"><input type="date" className={inputCls} disabled={fdis("due_date")} value={f.due_date} onChange={(e) => set("due_date", e.target.value)} /></Field>}
        {!fhid("note") && <Field label="Ghi chú"><input className={inputCls} disabled={fdis("note")} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>}
        </div>
      </Section>

      {!fhid("items") && (
      <Section title="Dòng hàng" action={!fdis("items") && <button onClick={addItem} className="btn-ghost text-blue-600 border-blue-200 hover:bg-blue-50"><Plus size={16} /> Thêm dòng</button>}>
        <div className="space-y-3">
          {items.map((it, idx) => (
            <div key={it._k} className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/40">
              <div className="flex items-start gap-3">
                <span className="mt-2.5 text-xs font-semibold text-slate-400 w-5 shrink-0">#{idx + 1}</span>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-7">
                    <span className="block text-xs font-medium text-slate-500 mb-1">Sản phẩm</span>
                    <select className={inputCls} disabled={fdis("items")} value={it.product_id} onChange={(e) => upItem(it._k, "product_id", e.target.value)}>
                      <option value="">-- Chọn --</option>
                      {lookups.products.map((p) => <option key={p.id} value={p.id}>{p.product_code} · {p.product_name}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <span className="block text-xs font-medium text-slate-500 mb-1">Số lượng</span>
                    <input type="number" min="0" className={inputCls} disabled={fdis("items")} value={it.quantity} onChange={(e) => upItem(it._k, "quantity", e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <span className="block text-xs font-medium text-slate-500 mb-1">ĐVT</span>
                    <input className={inputCls} disabled={fdis("items")} value={it.unit} onChange={(e) => upItem(it._k, "unit", e.target.value)} />
                  </div>
                </div>
                {!fdis("items") && <button onClick={() => rmItem(it._k)} className="mt-6 text-slate-400 hover:text-rose-600 p-1 shrink-0"><Trash2 size={16} /></button>}
              </div>
              <div className="pl-8">
                <div className="text-xs font-semibold text-slate-400 uppercase mb-1.5">Thông số kỹ thuật</div>
                <SpecFields specs={it.specs} disabled={fdis("items")} onChange={(s) => upItem(it._k, "specs", s)} />
              </div>
              <div className="pl-8">
                <div className="text-xs font-semibold text-slate-400 uppercase mb-1.5">Khối lượng (hàng cuộn)</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <label>
                    <span className="block text-xs font-medium text-slate-500 mb-1">KL lõi cuộn (kg)</span>
                    <input type="number" min="0" className={inputCls} disabled={fdis("items")} value={it.core_weight}
                      placeholder="0" onChange={(e) => upItem(it._k, "core_weight", e.target.value)} />
                  </label>
                  <label>
                    <span className="block text-xs font-medium text-slate-500 mb-1">Tổng khối lượng (kg)</span>
                    <input type="number" min="0" className={inputCls} disabled={fdis("items")} value={it.total_weight}
                      placeholder="= SL + lõi" onChange={(e) => upItem(it._k, "total_weight", e.target.value)} />
                  </label>
                </div>
              </div>
              <div className="pl-8">
                <div className="text-xs font-semibold text-slate-400 uppercase mb-1.5">Tiến độ</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <label>
                    <span className="block text-xs font-medium text-slate-500 mb-1">Bắt đầu dự kiến</span>
                    <input type="date" className={inputCls} disabled={fdis("items")} value={it.planned_start_date || ""}
                      onChange={(e) => upItem(it._k, "planned_start_date", e.target.value)} />
                  </label>
                  <label>
                    <span className="block text-xs font-medium text-slate-500 mb-1">Kết thúc dự kiến</span>
                    <input type="date" className={inputCls} disabled={fdis("items")} value={it.planned_end_date || ""}
                      onChange={(e) => upItem(it._k, "planned_end_date", e.target.value)} />
                  </label>
                  <div>
                    <span className="block text-xs font-medium text-slate-500 mb-1">Bắt đầu thực tế</span>
                    <div className={inputCls + " bg-slate-100 text-slate-600"}>{it.actual_start_date ? fmtDateTime(it.actual_start_date) : "—"}</div>
                  </div>
                  <div>
                    <span className="block text-xs font-medium text-slate-500 mb-1">Kết thúc thực tế</span>
                    <div className={inputCls + " bg-slate-100 text-slate-600"}>{it.actual_end_date ? fmtDateTime(it.actual_end_date) : "—"}</div>
                  </div>
                </div>
              </div>
              <div className="pl-8">
                <span className="block text-xs font-medium text-slate-500 mb-1">Ghi chú</span>
                <textarea rows={2} className={inputCls + " resize-y"} disabled={fdis("items")} value={it.note || ""}
                  placeholder="Ghi chú riêng cho dòng hàng (vd: cho tẩy thêm, pha 8-2…)"
                  onChange={(e) => upItem(it._k, "note", e.target.value)} />
              </div>
              {editId && <MaterialTag materials={it.materials} />}
              {editId && <LsxLinks orders={it.production_orders} />}
            </div>
          ))}
        </div>
      </Section>
      )}
      </fieldset>
    </div>
  );
}

/* ---- Phiếu đặt hàng (in được) ---- */
function OrderVoucher({ id, onBack }) {
  const [o, setO] = useState(null);
  useEffect(() => { ordersApi.get(id).then(setO).catch((e) => alert("Lỗi: " + e.message)); }, [id]);
  if (!o) return <div className="text-slate-400 text-sm py-10">Đang tải phiếu…</div>;
  const totalQty = (o.items || []).reduce((s, it) => s + Number(it.quantity || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 text-sm"><ArrowLeft size={18} /> Quay lại</button>
        <button onClick={() => window.print()} className="btn-primary"><Printer size={16} /> In phiếu</button>
      </div>

      <div className="print-area bg-white rounded-xl border border-slate-200 p-8 max-w-3xl mx-auto">
        <div className="flex items-center gap-4 border-b-2 border-blue-700 pb-3 mb-4">
          <Logo className="h-14 w-auto shrink-0" />
          <div className="flex-1 text-center">
            <div className="text-sm font-semibold text-slate-700">CÔNG TY TNHH THƯƠNG MẠI SẢN XUẤT BAO BÌ NGỌC AN THƯ</div>
            <h2 className="text-xl font-bold text-slate-900 mt-2 uppercase">Phiếu đặt hàng</h2>
            <div className="text-sm text-slate-600 mt-0.5">Số: <b>{o.order_code}</b></div>
          </div>
          <div className="w-14 shrink-0" />
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm mb-5">
          <div><span className="text-slate-500">Khách hàng:</span> <b>{o.customer_name}</b></div>
          <div><span className="text-slate-500">Điện thoại:</span> {o.customer_phone || "—"}</div>
          <div className="col-span-2"><span className="text-slate-500">Địa chỉ:</span> {o.customer_address || "—"}</div>
          <div><span className="text-slate-500">Ngày đặt:</span> {fmtDate(o.order_date)}</div>
          <div><span className="text-slate-500">Ngày giao:</span> {fmtDate(o.due_date)}</div>
          <div><span className="text-slate-500">Trạng thái:</span> {o.status}</div>
        </div>

        <table className="w-full text-sm border border-slate-300 border-collapse">
          <thead className="bg-slate-100">
            <tr>
              {["STT", "Sản phẩm", "Thông số kỹ thuật", "SL", "ĐVT"].map((h) =>
                <th key={h} className="border border-slate-300 px-2 py-1.5 text-left">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {o.items.map((it, i) => (
              <tr key={it.id}>
                <td className="border border-slate-300 px-2 py-1.5 text-center">{i + 1}</td>
                <td className="border border-slate-300 px-2 py-1.5">
                  {it.product_name}
                  {(it.core_weight != null || it.total_weight != null) && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      {it.core_weight != null && <>Lõi: {fmt(it.core_weight)} kg</>}
                      {it.total_weight != null && <> · Tổng KL: {fmt(it.total_weight)} kg</>}
                    </div>
                  )}
                  {it.note && <div className="text-xs text-slate-500 italic mt-0.5 whitespace-pre-line">{it.note}</div>}
                </td>
                <td className="border border-slate-300 px-2 py-1.5">{specShort(it.specs) || "—"}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right">{fmt(it.quantity)}</td>
                <td className="border border-slate-300 px-2 py-1.5">{it.unit}</td>
              </tr>
            ))}
            <tr className="font-semibold bg-slate-50">
              <td colSpan={3} className="border border-slate-300 px-2 py-1.5 text-right">Tổng số lượng</td>
              <td className="border border-slate-300 px-2 py-1.5 text-right">{fmt(totalQty)}</td>
              <td className="border border-slate-300 px-2 py-1.5" />
            </tr>
          </tbody>
        </table>

        {o.note && <div className="text-sm mt-4"><span className="text-slate-500">Ghi chú:</span> {o.note}</div>}

        <div className="grid grid-cols-2 gap-4 mt-10 text-center text-sm">
          <div><div className="font-medium">Người lập phiếu</div><div className="text-slate-400 text-xs">(Ký, ghi rõ họ tên)</div></div>
          <div><div className="font-medium">Khách hàng</div><div className="text-slate-400 text-xs">(Ký, ghi rõ họ tên)</div></div>
        </div>
      </div>

      <style>{`@media print {
        body * { visibility: hidden !important; }
        .print-area, .print-area * { visibility: visible !important; }
        .print-area { position: absolute; left: 0; top: 0; width: 100%; border: none !important; }
        .no-print { display: none !important; }
      }`}</style>
    </div>
  );
}

/* ---- Module chính ---- */
export default function OrdersModule({ lookups, focusId, onFocusConsumed, onCreateDelivery }) {
  const { can } = usePerm();
  const [view, setView] = useState("list");
  const [editId, setEditId] = useState(null);
  const [copyId, setCopyId] = useState(null);
  const [voucherId, setVoucherId] = useState(null);
  const [rows, setRows] = useState([]);
  const openForm = ({ edit = null, copy = null } = {}) => { setEditId(edit); setCopyId(copy); setView("form"); };

  const load = useCallback(async () => {
    try { setRows(await ordersApi.list({})); } catch (e) { alert("Lỗi tải đơn hàng: " + e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Mở sẵn chi tiết đơn khi được điều hướng từ màn khác (vd: Khách hàng)
  useEffect(() => {
    if (focusId) { setEditId(focusId); setView("form"); onFocusConsumed?.(); }
  }, [focusId]);

  const del = async (id) => { if (!confirm("Xóa đơn hàng này?")) return; try { await ordersApi.remove(id); load(); } catch (e) { alert("Lỗi xóa: " + e.message); } };

  if (view === "form") return <OrderForm lookups={lookups} editId={editId} copyId={copyId}
    onBack={() => { setView("list"); setEditId(null); setCopyId(null); }} onSaved={() => { setView("list"); setEditId(null); setCopyId(null); load(); }}
    onPrint={(id) => { setVoucherId(id); setView("voucher"); }} onCreateDelivery={onCreateDelivery} />;
  if (view === "voucher") return <OrderVoucher id={voucherId} onBack={() => setView("list")} />;

  const columns = [
    { key: "order_code", label: "Mã đơn", filter: "text", render: (r) => <button onClick={() => openForm({ edit: r.id })} className="font-medium text-blue-600 hover:underline">{r.order_code}</button> },
    { key: "customer_name", label: "Khách hàng", filter: "text", tdClass: "text-slate-800" },
    { key: "order_date", label: "Ngày đặt", filter: "date", render: (r) => fmtDate(r.order_date) },
    { key: "due_date", label: "Ngày giao", filter: "date", render: (r) => {
        const done = ["Hoàn thành", "Đã hủy"].includes(r.status);
        const tone = dueTone(r.due_date);
        return <span className={`inline-flex items-center gap-1.5 ${done ? "text-slate-500" : tone.text}`}>
          {!done && r.due_date && <span className={`w-2 h-2 rounded-full ${tone.dot}`} title={tone.label} />}{fmtDate(r.due_date)}</span>;
      } },
    { key: "item_count", label: "Số dòng", align: "center" },
    { key: "total_qty", label: "Tổng SL", align: "right", render: (r) => fmt(r.total_qty) },
    { key: "status", label: "Trạng thái", filter: "select", render: (r) => <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass(r.status)}`}>{r.status}</span> },
    { key: "_act", label: "", align: "right", render: (r) => (<>
        <button onClick={() => { setVoucherId(r.id); setView("voucher"); }} title="Xem phiếu" className="text-slate-400 hover:text-emerald-600 p-1"><FileText size={15} /></button>
        {can("orders", "create") && <button onClick={() => openForm({ copy: r.id })} title="Sao chép thành đơn mới" className="text-slate-400 hover:text-blue-600 p-1"><Copy size={15} /></button>}
        <button onClick={() => openForm({ edit: r.id })} title="Sửa" className="text-slate-400 hover:text-blue-600 p-1"><Pencil size={15} /></button>
        <button onClick={() => del(r.id)} title="Xóa" className="text-slate-400 hover:text-rose-600 p-1"><Trash2 size={15} /></button>
      </>) },
  ];

  return (
    <div className="space-y-5">
      <ListHeader title="Đơn hàng" actions={
        can("orders", "create") && <button onClick={() => openForm({})} className="btn-primary"><Plus size={16} /> Tạo đơn hàng</button>
      } />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyText="Chưa có đơn hàng" />
    </div>
  );
}
