import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Pencil, ArrowLeft, Save, FileText, Printer } from "lucide-react";
import { resource } from "../mesApi.js";
import { usePerm } from "../perm.jsx";
import { inputCls, fmt, fmtDate, statusClass } from "../ui.js";
import { PageHeader, Section, ListHeader, usePager } from "../components.jsx";

const ordersApi = resource("sales-orders");
const STATUSES = ["Mới", "Đang sản xuất", "Hoàn thành", "Đã hủy"];

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 mb-1.5">{label} {required && <span className="text-rose-500">*</span>}</label>
    {children}
  </div>
);

/* ---- Form đơn hàng ---- */
function OrderForm({ lookups, editId, onBack, onSaved, onPrint }) {
  const { can, fperm } = usePerm();
  const fhid = (k) => fperm("orders", k) === "hidden";
  const fdis = (k) => fperm("orders", k) !== "edit";
  const today = new Date().toISOString().slice(0, 10);
  const [editing, setEditing] = useState(!editId); // tạo mới = sửa ngay; mở sẵn = xem
  const [f, setF] = useState({ customer_id: "", order_date: today, due_date: "", status: "Mới", note: "" });
  const [items, setItems] = useState([{ _k: 1, product_id: "", quantity: "", unit: "", attr_color: "", attr_size: "", attr_thickness: "", note: "" }]);
  const [seq, setSeq] = useState(2);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const loadData = useCallback(() => {
    if (!editId) return;
    ordersApi.get(editId).then((d) => {
      setF({ customer_id: d.customer_id, order_date: d.order_date?.slice(0, 10) || today, due_date: d.due_date?.slice(0, 10) || "", status: d.status, note: d.note || "" });
      setItems((d.items || []).map((it, i) => ({ _k: i + 1, product_id: it.product_id, quantity: it.quantity, unit: it.unit || "", attr_color: it.attr_color || "", attr_size: it.attr_size || "", attr_thickness: it.attr_thickness || "", note: it.note || "" })));
      setSeq((d.items?.length || 0) + 1);
    }).catch((e) => alert("Lỗi tải đơn: " + e.message));
  }, [editId]); // eslint-disable-line
  useEffect(() => { loadData(); }, [loadData]);

  const addItem = () => { setItems((a) => [...a, { _k: seq, product_id: "", quantity: "", unit: "", attr_color: "", attr_size: "", attr_thickness: "", note: "" }]); setSeq((s) => s + 1); };
  const rmItem = (k) => setItems((a) => a.filter((x) => x._k !== k));
  const upItem = (k, fld, v) => setItems((a) => a.map((x) => {
    if (x._k !== k) return x;
    const nx = { ...x, [fld]: v };
    if (fld === "product_id") { const p = lookups.products.find((pp) => pp.id === v); if (p && !x.unit) nx.unit = p.unit || ""; }
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
      <PageHeader title={!editId ? "Tạo đơn hàng" : editing ? "Sửa đơn hàng" : "Chi tiết đơn hàng"} onBack={onBack}
        actions={editId && !editing ? (<>
          <button onClick={() => onPrint?.(editId)} className="btn-ghost"><Printer size={16} /> In phiếu</button>
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
        <fieldset disabled={fdis("items")}>
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left py-2 font-medium">Sản phẩm</th>
              <th className="text-left py-2 font-medium w-24">SL</th>
              <th className="text-left py-2 font-medium w-20">ĐVT</th>
              <th className="text-left py-2 font-medium w-28">Màu</th>
              <th className="text-left py-2 font-medium w-28">Kích thước</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it._k}>
                <td className="py-1.5 pr-2">
                  <select className={inputCls} value={it.product_id} onChange={(e) => upItem(it._k, "product_id", e.target.value)}>
                    <option value="">-- Chọn --</option>
                    {lookups.products.map((p) => <option key={p.id} value={p.id}>{p.product_code} · {p.product_name}</option>)}
                  </select>
                </td>
                <td className="py-1.5 pr-2"><input type="number" min="0" className={inputCls} value={it.quantity} onChange={(e) => upItem(it._k, "quantity", e.target.value)} /></td>
                <td className="py-1.5 pr-2"><input className={inputCls} value={it.unit} onChange={(e) => upItem(it._k, "unit", e.target.value)} /></td>
                <td className="py-1.5 pr-2"><input className={inputCls} list="colors" value={it.attr_color} onChange={(e) => upItem(it._k, "attr_color", e.target.value)} /></td>
                <td className="py-1.5 pr-2"><input className={inputCls} list="sizes" value={it.attr_size} onChange={(e) => upItem(it._k, "attr_size", e.target.value)} /></td>
                <td className="py-1.5 text-center"><button onClick={() => rmItem(it._k)} className="text-slate-400 hover:text-rose-600 p-1"><Trash2 size={16} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="colors">{(lookups.colors || []).map((s) => <option key={s} value={s} />)}</datalist>
        <datalist id="sizes">{(lookups.sizes || []).map((s) => <option key={s} value={s} />)}</datalist>
        </fieldset>
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
        <div className="text-center border-b border-slate-200 pb-4 mb-4">
          <div className="text-lg font-bold text-slate-800">CÔNG TY BAO BÌ NHỰA</div>
          <div className="text-xs text-slate-500">Nhà máy sản xuất bao bì nhựa</div>
          <h2 className="text-xl font-bold text-slate-900 mt-3 uppercase">Phiếu đặt hàng</h2>
          <div className="text-sm text-slate-600 mt-1">Số: <b>{o.order_code}</b></div>
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
              {["STT", "Sản phẩm", "Màu", "Kích thước", "Độ dày", "SL", "ĐVT"].map((h) =>
                <th key={h} className="border border-slate-300 px-2 py-1.5 text-left">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {o.items.map((it, i) => (
              <tr key={it.id}>
                <td className="border border-slate-300 px-2 py-1.5 text-center">{i + 1}</td>
                <td className="border border-slate-300 px-2 py-1.5">{it.product_name}</td>
                <td className="border border-slate-300 px-2 py-1.5">{it.attr_color || "—"}</td>
                <td className="border border-slate-300 px-2 py-1.5">{it.attr_size || "—"}</td>
                <td className="border border-slate-300 px-2 py-1.5">{it.attr_thickness || "—"}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right">{fmt(it.quantity)}</td>
                <td className="border border-slate-300 px-2 py-1.5">{it.unit}</td>
              </tr>
            ))}
            <tr className="font-semibold bg-slate-50">
              <td colSpan={5} className="border border-slate-300 px-2 py-1.5 text-right">Tổng số lượng</td>
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
export default function OrdersModule({ lookups }) {
  const { can } = usePerm();
  const [view, setView] = useState("list");
  const [editId, setEditId] = useState(null);
  const [voucherId, setVoucherId] = useState(null);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const { slice, Pager, Filler } = usePager(rows);

  const load = useCallback(async () => {
    try { setRows(await ordersApi.list({ q })); } catch (e) { alert("Lỗi tải đơn hàng: " + e.message); }
  }, [q]);
  useEffect(() => { load(); }, [load]);

  const del = async (id) => { if (!confirm("Xóa đơn hàng này?")) return; try { await ordersApi.remove(id); load(); } catch (e) { alert("Lỗi xóa: " + e.message); } };

  if (view === "form") return <OrderForm lookups={lookups} editId={editId}
    onBack={() => { setView("list"); setEditId(null); }} onSaved={() => { setView("list"); setEditId(null); load(); }}
    onPrint={(id) => { setVoucherId(id); setView("voucher"); }} />;
  if (view === "voucher") return <OrderVoucher id={voucherId} onBack={() => setView("list")} />;

  return (
    <div className="space-y-5">
      <ListHeader title="Đơn hàng" actions={
        can("orders", "create") && <button onClick={() => { setEditId(null); setView("form"); }} className="btn-primary"><Plus size={16} /> Tạo đơn hàng</button>
      } />
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <input placeholder="Tìm mã đơn / khách hàng" className={inputCls + " md:w-1/2"} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>{["Mã đơn", "Khách hàng", "Ngày đặt", "Ngày giao", "Số dòng", "Tổng SL", "Trạng thái", ""].map((h) =>
              <th key={h} className="text-left px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {slice.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <button onClick={() => { setEditId(r.id); setView("form"); }} className="font-medium text-blue-600 hover:underline">{r.order_code}</button>
                </td>
                <td className="px-4 py-3 text-slate-800">{r.customer_name}</td>
                <td className="px-4 py-3">{fmtDate(r.order_date)}</td>
                <td className="px-4 py-3">{fmtDate(r.due_date)}</td>
                <td className="px-4 py-3 text-center">{r.item_count}</td>
                <td className="px-4 py-3 text-right">{fmt(r.total_qty)}</td>
                <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass(r.status)}`}>{r.status}</span></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => { setVoucherId(r.id); setView("voucher"); }} title="Xem phiếu" className="text-slate-400 hover:text-emerald-600 p-1"><FileText size={15} /></button>
                  <button onClick={() => { setEditId(r.id); setView("form"); }} title="Sửa" className="text-slate-400 hover:text-blue-600 p-1"><Pencil size={15} /></button>
                  <button onClick={() => del(r.id)} title="Xóa" className="text-slate-400 hover:text-rose-600 p-1"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Chưa có đơn hàng</td></tr>}
            <Filler cols={8} />
          </tbody>
        </table>
      </div>
      <Pager />
    </div>
  );
}
