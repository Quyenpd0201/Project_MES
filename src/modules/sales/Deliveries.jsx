import React, { useState, useEffect, useCallback } from "react";
import { RotateCcw, Plus, Trash2, Pencil, ArrowLeft, Save, Printer, FileText } from "lucide-react";
import { deliveries as api, resource } from "../../mesApi.js";

const ordersApi = resource("sales-orders");
import { usePerm } from "../../perm.jsx";
import {  inputCls, fmt, fmtDate, statusClass , toast } from "../../ui.js";
import { specShort } from "../../specs.js";
import { PageHeader, Section, ListHeader, DataTable, Logo, UnitSelect } from "../../components.jsx";

const STATUSES = ["Đã xuất hóa đơn", "Chờ thanh toán", "Đã thanh toán 1 phần", "Đã thanh toán", "Đã hủy"];
const today = () => new Date().toISOString().slice(0, 10);

// Thông tin đơn vị bán hàng (in trên phiếu xuất kho)
const COMPANY = {
  name: "CÔNG TY TNHH THƯƠNG MẠI SẢN XUẤT BAO BÌ NGỌC AN THƯ",
  tax: "0316748578",
  address: "Số 8F3, Đường DD6, Khu Phố 4, P. Tân Hưng Thuận, Quận 12, TP. HCM",
  phone: "0938 446 156",
};
const MIN_ROWS = 8; // số dòng tối thiểu của bảng (in giấy cho đẹp)

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 mb-1.5">{label} {required && <span className="text-rose-500">*</span>}</label>
    {children}
  </div>
);

/* ---- Form phiếu giao hàng & thanh toán ---- */
function DeliveryForm({ lookups, editId, initialOrderId, onBack, onSaved, onPrint }) {
  const { can, fpermSecret } = usePerm();
  const moneyPerm = fpermSecret("deliveries", "amounts");
  const showMoney = moneyPerm !== "hidden";
  const moneyEdit = moneyPerm === "edit";
  const [editing, setEditing] = useState(!editId);
  const [f, setF] = useState({ sales_order_id: "", customer_id: "", delivery_date: today(), status: "Đã xuất hóa đơn", note: "", paid_amount: "" });
  const [items, setItems] = useState([{ _k: 1, product_id: "", product_name: "", specs: {}, quantity: "", unit: "", unit_price: "" }]);
  const [seq, setSeq] = useState(2);
  const [orders, setOrders] = useState([]);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  useEffect(() => { ordersApi.list({}).then(setOrders).catch(() => {}); }, []);

  const load = useCallback(() => {
    if (!editId) return;
    api.get(editId).then((d) => {
      setF({ sales_order_id: d.sales_order_id || "", customer_id: d.customer_id, delivery_date: d.delivery_date?.slice(0, 10) || today(), status: d.status, note: d.note || "", paid_amount: d.paid_amount ?? "" });
      setItems((d.items || []).map((it, i) => ({ _k: i + 1, product_id: it.product_id || "", product_name: it.product_name || "", specs: it.specs || {}, quantity: it.quantity, unit: it.unit || "", unit_price: it.unit_price })));
      setSeq((d.items?.length || 0) + 1);
    }).catch((e) => toast.error("Lỗi tải phiếu: " + e.message));
  }, [editId]);
  useEffect(() => { load(); }, [load]);
  // Mở từ chi tiết đơn hàng → tự nạp sẵn
  useEffect(() => { if (!editId && initialOrderId) onPickOrder(initialOrderId); }, [initialOrderId]); // eslint-disable-line

  // Chọn đơn hàng → nạp khách + dòng hàng
  const onPickOrder = async (orderId) => {
    set("sales_order_id", orderId);
    if (!orderId) return;
    try {
      const d = await api.fromOrder(orderId);
      setF((s) => ({ ...s, sales_order_id: d.sales_order_id, customer_id: d.customer_id || s.customer_id }));
      setItems((d.items || []).map((it, i) => ({ _k: i + 1, product_id: it.product_id || "", product_name: it.product_name || "", specs: it.specs || {}, quantity: it.quantity, unit: it.unit || "", unit_price: "" })));
      setSeq((d.items?.length || 0) + 1);
    } catch (e) { toast.error("Lỗi nạp đơn hàng: " + e.message); }
  };

  const addItem = () => { setItems((a) => [...a, { _k: seq, product_id: "", product_name: "", specs: {}, quantity: "", unit: "", unit_price: "" }]); setSeq((s) => s + 1); };
  const rmItem = (k) => setItems((a) => a.filter((x) => x._k !== k));
  const upItem = (k, fld, v) => setItems((a) => a.map((x) => {
    if (x._k !== k) return x;
    const nx = { ...x, [fld]: v };
    if (fld === "product_id") { const p = lookups.products.find((pp) => pp.id === v); if (p) { nx.product_name = p.product_name; nx.unit = p.unit || nx.unit || ""; } }
    return nx;
  }));

  const total = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
  const debt = total - (Number(f.paid_amount) || 0);

  const save = async () => {
    if (!f.customer_id) return toast.error("Chọn khách hàng");
    const valid = items.filter((it) => (it.product_id || it.product_name) && it.quantity);
    if (!valid.length) return toast.error("Cần ít nhất 1 dòng hàng");
    try {
      if (editId) await api.update(editId, { ...f, items: valid }); else await api.create({ ...f, items: valid });
      toast.success("Đã lưu thành công"); onSaved();
    } catch (e) { toast.error("Lỗi lưu phiếu: " + e.message); }
  };
  const del = async () => { if (!confirm("Xóa phiếu này?")) return; try { await api.remove(editId); toast.success("Đã xóa thành công"); onSaved(); } catch (e) { toast.error("Lỗi xóa: " + e.message); } };

  return (
    <div className="space-y-5">
      <PageHeader title={!editId ? "Tạo phiếu giao hàng" : editing ? "Sửa phiếu giao hàng" : "Chi tiết phiếu giao hàng"} onBack={onBack}
        actions={editId && !editing ? (<>
          <button onClick={() => onPrint?.(editId)} className="btn-ghost"><Printer size={16} /> In phiếu</button>
          {can("deliveries", "edit") && <button onClick={() => setEditing(true)} className="btn-ghost"><Pencil size={16} /> Sửa</button>}
          {can("deliveries", "delete") && <button onClick={del} className="btn-ghost" style={{ color: "#e11d48" }}><Trash2 size={16} /> Xóa</button>}
        </>) : (<>
          {editId && <button onClick={() => { setEditing(false); load(); }} className="btn-ghost">Hủy</button>}
          <button onClick={save} className="btn-primary"><Save size={16} /> Lưu phiếu</button>
        </>)} />

      <fieldset disabled={!editing} className="space-y-5">
        <Section title="Thông tin phiếu">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
            <Field label="Từ đơn hàng">
              <select className={inputCls} value={f.sales_order_id} onChange={(e) => onPickOrder(e.target.value)}>
                <option value="">-- Chọn đơn hàng (tùy chọn) --</option>
                {orders.map((o) => <option key={o.id} value={o.id}>{o.order_code} · {o.customer_name}</option>)}
              </select>
            </Field>
            <Field label="Khách hàng" required>
              <select className={inputCls} value={f.customer_id} onChange={(e) => set("customer_id", e.target.value)}>
                <option value="">-- Chọn khách hàng --</option>
                {lookups.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Trạng thái">
              <select className={inputCls} value={f.status} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
            </Field>
            <Field label="Ngày giao"><input type="date" className={inputCls} value={f.delivery_date} onChange={(e) => set("delivery_date", e.target.value)} /></Field>
            <Field label="Ghi chú"><input className={inputCls} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>
            {showMoney && <Field label="Tổng tiền 1 đơn">
              <div className={inputCls + " bg-slate-50 font-semibold text-slate-800"}>{fmt(total)} đ</div>
            </Field>}
            {showMoney && <Field label="Số tiền đã trả">
              <input type="number" min="0" className={inputCls} disabled={!moneyEdit} value={f.paid_amount} placeholder="0" onChange={(e) => set("paid_amount", e.target.value)} />
            </Field>}
            {showMoney && <Field label="Công nợ (còn lại)">
              <div className={inputCls + " bg-slate-50 font-bold " + (debt > 0 ? "text-rose-600" : "text-emerald-600")}>{fmt(debt)} đ</div>
            </Field>}
          </div>
        </Section>

        <Section title="Dòng hàng" action={editing && <button onClick={addItem} className="btn-ghost text-blue-600 border-blue-200 hover:bg-blue-50"><Plus size={16} /> Thêm dòng</button>} bodyClass="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2.5">Sản phẩm</th>
                <th className="text-left px-4 py-2.5">Thông số</th>
                <th className="text-right px-4 py-2.5 w-24">SL</th>
                <th className="text-left px-4 py-2.5 w-20">ĐVT</th>
                {showMoney && <th className="text-right px-4 py-2.5 w-32">Đơn giá</th>}
                {showMoney && <th className="text-right px-4 py-2.5 w-36">Thành tiền</th>}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it) => {
                const amount = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
                return (
                  <tr key={it._k}>
                    <td className="px-4 py-1.5">
                      <select className={inputCls} value={it.product_id} onChange={(e) => upItem(it._k, "product_id", e.target.value)}>
                        <option value="">{it.product_name || "-- Chọn --"}</option>
                        {lookups.products.map((p) => <option key={p.id} value={p.id}>{p.product_code} · {p.product_name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-1.5 text-slate-500">{specShort(it.specs) || "—"}</td>
                    <td className="px-4 py-1.5"><input type="number" min="0" className={inputCls + " text-right"} value={it.quantity} onChange={(e) => upItem(it._k, "quantity", e.target.value)} /></td>
                    <td className="px-4 py-1.5"><UnitSelect value={it.unit} onChange={(v) => upItem(it._k, "unit", v)} /></td>
                    {showMoney && <td className="px-4 py-1.5"><input type="number" min="0" className={inputCls + " text-right"} disabled={!moneyEdit} value={it.unit_price} onChange={(e) => upItem(it._k, "unit_price", e.target.value)} /></td>}
                    {showMoney && <td className="px-4 py-1.5 text-right font-semibold text-slate-800">{fmt(amount)}</td>}
                    <td className="px-4 py-1.5 text-center">{editing && <button onClick={() => rmItem(it._k)} className="text-slate-400 hover:text-rose-600 p-1"><Trash2 size={16} /></button>}</td>
                  </tr>
                );
              })}
            </tbody>
            {showMoney && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/60 font-bold text-slate-800">
                  <td colSpan={5} className="px-4 py-3 text-right">TỔNG TIỀN</td>
                  <td className="px-4 py-3 text-right text-blue-700 text-base">{fmt(total)} đ</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </Section>
      </fieldset>
    </div>
  );
}

/* ---- Phiếu in (template chung giao hàng + thanh toán) ---- */
function DeliveryVoucher({ id, onBack }) {
  const { fpermSecret } = usePerm();
  const showMoney = fpermSecret("deliveries", "amounts") !== "hidden";
  const [d, setD] = useState(null);
  useEffect(() => { api.get(id).then(setD).catch((e) => toast.error("Lỗi: " + e.message)); }, [id]);
  if (!d) return <div className="text-slate-400 text-sm py-10">Đang tải phiếu…</div>;
  const totalQty = (d.items || []).reduce((s, it) => s + Number(it.quantity || 0), 0);
  const dt = d.delivery_date ? new Date(d.delivery_date) : null;
  const items = d.items || [];
  // padding cho đủ số dòng tối thiểu (in giấy)
  const rows = [...items, ...Array(Math.max(0, MIN_ROWS - items.length)).fill(null)];

  const td = "border border-slate-400 px-2 py-1.5 align-top";
  const th = "border border-slate-400 px-2 py-1.5 text-center font-bold";
  const cols = showMoney ? 7 : 5; // STT,NỘI DUNG,ĐVT,SL,(ĐƠN GIÁ,THÀNH TIỀN),GHI CHÚ

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 text-sm"><ArrowLeft size={18} /> Quay lại</button>
        <button onClick={() => window.print()} className="btn-primary"><Printer size={16} /> In / Xuất PDF</button>
      </div>

      <div className="print-area bg-white rounded-xl border border-slate-200 p-8 max-w-3xl mx-auto text-slate-900">
        {/* Header: logo + tiêu đề */}
        <div className="flex items-center gap-4 border-b-2 border-blue-700 pb-3">
          <Logo className="h-14 w-auto shrink-0" />
          <div className="flex-1 text-center">
            <h1 className="text-2xl font-extrabold text-blue-800 tracking-wide uppercase">Phiếu xuất kho</h1>
            <div className="text-sm mt-0.5">
              Ngày {dt ? dt.getDate() : "...."} tháng {dt ? dt.getMonth() + 1 : "...."} năm {dt ? dt.getFullYear() : "20...."}
            </div>
            <div className="text-sm">Số phiếu: <b className="text-rose-600">{d.note_code}</b></div>
          </div>
          <div className="w-12 shrink-0" />
        </div>

        {/* Đơn vị bán hàng */}
        <div className="text-sm mt-3 leading-relaxed">
          <div><b>Đơn vị bán hàng:</b> {COMPANY.name}</div>
          <div><b>Mã số thuế:</b> {COMPANY.tax}</div>
          <div><b>Địa chỉ:</b> {COMPANY.address}</div>
          <div><b>Số điện thoại:</b> {COMPANY.phone}</div>
        </div>

        {/* Người mua hàng */}
        <div className="text-sm mt-2 leading-relaxed border-t border-slate-300 pt-2">
          <div><b>Người mua hàng:</b> {d.customer_name || ""}</div>
          <div><b>Tên đơn vị:</b> {d.customer_name || ""}</div>
          <div><b>Địa chỉ:</b> {d.customer_address || ""}</div>
          <div><b>Số điện thoại:</b> {d.customer_phone || ""}</div>
        </div>

        {/* Bảng hàng */}
        <table className="w-full text-sm border-collapse mt-3">
          <thead className="bg-blue-50">
            <tr>
              <th className={th + " w-10"}>STT</th>
              <th className={th}>NỘI DUNG</th>
              <th className={th + " w-16"}>ĐVT</th>
              <th className={th + " w-20"}>SL</th>
              {showMoney && <th className={th + " w-24"}>ĐƠN GIÁ</th>}
              {showMoney && <th className={th + " w-28"}>THÀNH TIỀN</th>}
              <th className={th + " w-28"}>GHI CHÚ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((it, i) => (
              <tr key={i} style={{ height: 30 }}>
                <td className={td + " text-center"}>{it ? i + 1 : ""}</td>
                <td className={td}>{it ? <><span className="font-medium">{it.product_name}</span>{specShort(it.specs) ? <span className="text-slate-500"> · {specShort(it.specs)}</span> : null}</> : ""}</td>
                <td className={td + " text-center"}>{it ? it.unit : ""}</td>
                <td className={td + " text-right"}>{it ? fmt(it.quantity) : ""}</td>
                {showMoney && <td className={td + " text-right"}>{it ? fmt(it.unit_price) : ""}</td>}
                {showMoney && <td className={td + " text-right"}>{it ? fmt(it.amount) : ""}</td>}
                <td className={td}>{it ? (it.note || "") : ""}</td>
              </tr>
            ))}
            <tr className="font-bold bg-blue-50">
              <td className={td + " text-center"} colSpan={3}>TỔNG CỘNG</td>
              <td className={td + " text-right"}>{fmt(totalQty)}</td>
              {showMoney && <td className={td} />}
              {showMoney && <td className={td + " text-right text-blue-800"}>{fmt(d.total_amount)} đ</td>}
              <td className={td} />
            </tr>
          </tbody>
        </table>

        {/* Tổng tiền / công nợ (chỉ khi có quyền tiền) */}
        {showMoney && (Number(d.paid_amount) > 0 || Number(d.total_amount) - Number(d.paid_amount) !== 0) && (
          <div className="flex justify-end mt-2 text-sm">
            <table>
              <tbody>
                <tr><td className="px-3 py-0.5 text-right text-slate-600">Đã trả:</td><td className="px-3 py-0.5 text-right font-semibold text-emerald-700">{fmt(d.paid_amount)} đ</td></tr>
                <tr><td className="px-3 py-0.5 text-right font-bold">Còn nợ:</td><td className={`px-3 py-0.5 text-right font-bold ${Number(d.total_amount) - Number(d.paid_amount) > 0 ? "text-rose-600" : "text-emerald-600"}`}>{fmt(Number(d.total_amount) - Number(d.paid_amount))} đ</td></tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Chữ ký */}
        <div className="grid grid-cols-4 gap-2 mt-8 text-center text-sm">
          {["Người lập phiếu", "Người giao hàng", "Kế toán", "Người nhận hàng"].map((s) => (
            <div key={s}><div className="font-semibold">{s}</div><div className="text-slate-400 text-[11px]">(Ký, ghi rõ họ tên)</div><div className="h-12" /></div>
          ))}
        </div>

        <div className="text-center font-bold text-sm mt-4 border-t border-slate-300 pt-2 uppercase">
          K.H vui lòng kiểm tra hàng hóa trước khi ký nhận
        </div>
      </div>

      <style>{`@media print {
        body * { visibility: hidden !important; }
        .print-area, .print-area * { visibility: visible !important; }
        .print-area { position: absolute; left: 0; top: 0; width: 100%; border: none !important; padding: 0 !important; }
        .no-print { display: none !important; }
        @page { size: A4; margin: 12mm; }
      }`}</style>
    </div>
  );
}

/* ---- Module chính ---- */
export default function DeliveriesModule({ lookups, focusOrderId, onFocusConsumed }) {
  const { can, fpermSecret } = usePerm();
  const showMoney = fpermSecret("deliveries", "amounts") !== "hidden";
  const [view, setView] = useState("list");
  const [editId, setEditId] = useState(null);
  const [newOrderId, setNewOrderId] = useState(null);
  const [voucherId, setVoucherId] = useState(null);
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    try { setRows((await api.list({})) || []); } catch (e) { toast.error("Lỗi tải phiếu: " + e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Điều hướng từ chi tiết đơn hàng → mở form tạo phiếu, nạp sẵn đơn
  useEffect(() => {
    if (focusOrderId) { setEditId(null); setNewOrderId(focusOrderId); setView("form"); onFocusConsumed?.(); }
  }, [focusOrderId]); // eslint-disable-line

  const del = async (id) => { if (!confirm("Xóa phiếu này?")) return; try { await api.remove(id); toast.success("Đã xóa thành công"); load(); } catch (e) { toast.error("Lỗi xóa: " + e.message); } };

  const resetToList = () => { setView("list"); setEditId(null); setNewOrderId(null); };
  if (view === "form") return <DeliveryForm lookups={lookups} editId={editId} initialOrderId={newOrderId}
    onBack={resetToList} onSaved={() => { resetToList(); load(); }}
    onPrint={(id) => { setVoucherId(id); setView("voucher"); }} />;
  if (view === "voucher") return <DeliveryVoucher id={voucherId} onBack={() => setView("list")} />;

  const columns = [
    { key: "note_code", label: "Số phiếu", filter: "text", render: (r) => <button onClick={() => { setEditId(r.id); setView("form"); }} className="font-medium text-blue-600 hover:underline">{r.note_code}</button> },
    { key: "customer_name", label: "Khách hàng", filter: "text", tdClass: "text-slate-800" },
    { key: "sales_order_code", label: "Đơn hàng", filter: "text", render: (r) => r.sales_order_code || "—" },
    { key: "delivery_date", label: "Ngày giao", filter: "date", render: (r) => fmtDate(r.delivery_date) },
    { key: "item_count", label: "Số dòng", align: "center" },
    ...(showMoney ? [
      { key: "total_amount", label: "Tổng tiền", align: "right", render: (r) => <span className="font-semibold">{fmt(r.total_amount)} đ</span> },
      { key: "debt", label: "Công nợ", align: "right", render: (r) => { const dbt = Number(r.total_amount || 0) - Number(r.paid_amount || 0); return <span className={`font-semibold ${dbt > 0 ? "text-rose-600" : "text-emerald-600"}`}>{fmt(dbt)} đ</span>; } },
    ] : []),
    { key: "status", label: "Trạng thái", filter: "select", render: (r) => <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass(r.status)}`}>{r.status}</span> },
    { key: "_act", label: "", align: "right", render: (r) => (<>
        <button onClick={() => { setVoucherId(r.id); setView("voucher"); }} title="In phiếu" className="text-slate-400 hover:text-emerald-600 p-1"><FileText size={15} /></button>
        <button onClick={() => { setEditId(r.id); setView("form"); }} title="Sửa" className="text-slate-400 hover:text-blue-600 p-1"><Pencil size={15} /></button>
        {can("deliveries", "delete") && <button onClick={() => del(r.id)} title="Xóa" className="text-slate-400 hover:text-rose-600 p-1"><Trash2 size={15} /></button>}
      </>) },
  ];

  return (
    <div className="space-y-5">
      <ListHeader title="Phiếu giao hàng & thanh toán" actions={<>
        <button onClick={load} className="btn-ghost"><RotateCcw size={16} /> Làm mới</button>
        {can("deliveries", "create") && <button onClick={() => { setEditId(null); setView("form"); }} className="btn-primary"><Plus size={16} /> Tạo phiếu</button>}
      </>} />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyText="Chưa có phiếu giao hàng" />
    </div>
  );
}
