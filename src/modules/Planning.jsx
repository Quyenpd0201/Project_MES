import React, { useState, useEffect, useCallback } from "react";
import { Layers, CalendarClock, RotateCcw, ShoppingCart, AlertTriangle, ClipboardList, Save } from "lucide-react";
import { ListHeader, usePager } from "../components.jsx";
import { planning } from "../mesApi.js";
import { inputCls, fmt, fmtDate, statusClass } from "../ui.js";
import { ScheduleModal } from "./Production.jsx";

const Field = ({ label, children }) => (
  <div><label className="block text-sm font-medium text-slate-600 mb-1.5">{label}</label>{children}</div>
);

/* ====== Modal phân bổ nguồn lực & tạo lệnh từ 1 lô ====== */
function AllocateModal({ lookups, batch, onClose, onDone }) {
  const [a, setA] = useState({ machine_id: "", planned_date: "", shift: "", assigned_team: "" });
  const set = (k, v) => setA((s) => ({ ...s, [k]: v }));
  const save = async () => {
    try {
      const r = await planning.generate({ item_ids: batch.items.map((i) => i.item_id), ...a });
      alert(`Đã tạo ${r.created.length} lệnh sản xuất: ${r.created.join(", ")}`);
      onDone();
    } catch (e) { alert("Lỗi tạo lệnh: " + e.message); }
  };
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-800">Phân bổ & tạo lệnh sản xuất</h3>
        <p className="text-sm text-slate-500">
          Lô: <b>{batch.product_name}</b> · {batch.attr_color || "—"} · {batch.attr_size || "—"} · {batch.attr_thickness || "—"}<br />
          {batch.items.length} dòng đơn hàng · tổng SL {fmt(batch.total_quantity)} {batch.unit}
        </p>
        <Field label="Máy">
          <select className={inputCls} value={a.machine_id} onChange={(e) => set("machine_id", e.target.value)}>
            <option value="">-- Chưa xếp (để 'Chờ duyệt') --</option>
            {lookups.machines.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.factory})</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ngày sản xuất"><input type="date" className={inputCls} value={a.planned_date} onChange={(e) => set("planned_date", e.target.value)} /></Field>
          <Field label="Ca"><select className={inputCls} value={a.shift} onChange={(e) => set("shift", e.target.value)}><option value="">--</option>{(lookups.shifts || []).map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div>
        <Field label="Đội / nhân công"><input className={inputCls} value={a.assigned_team} onChange={(e) => set("assigned_team", e.target.value)} placeholder="vd: Đội thổi A" /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost">Hủy</button>
          <button onClick={save} className="btn-primary"><Save size={16} /> Tạo {batch.items.length} lệnh</button>
        </div>
      </div>
    </div>
  );
}

/* ====== Tab: Lập kế hoạch từ đơn hàng ====== */
function OrderPlanningTab({ lookups }) {
  const [batches, setBatches] = useState([]);
  const [demandLines, setDemandLines] = useState(0);
  const [allocating, setAllocating] = useState(null);
  const { slice, Pager } = usePager(batches);

  const load = useCallback(async () => {
    try { const r = await planning.fromOrders(); setBatches(r.batches); setDemandLines(r.demand_lines); }
    catch (e) { alert("Lỗi tải kế hoạch: " + e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Gom dòng đơn hàng còn mở thành <b>lô trùng</b> (sản phẩm + màu + kích thước + độ dày), ưu tiên theo <b>ngày giao</b>. Phân bổ máy/ca → sinh lệnh SX.</p>
        <button onClick={load} className="btn-ghost"><RotateCcw size={16} /> Làm mới</button>
      </div>
      <div className="flex gap-4">
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-3"><div className="text-2xl font-bold text-slate-800">{batches.length}</div><div className="text-xs text-slate-500">Lô cần sản xuất</div></div>
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-3"><div className="text-2xl font-bold text-slate-800">{demandLines}</div><div className="text-xs text-slate-500">Dòng đơn hàng chờ</div></div>
      </div>
      {!batches.length && <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400">Không có đơn hàng nào cần lên kế hoạch. Tạo đơn hàng ở mục Đơn hàng trước.</div>}
      <div className="space-y-4">
        {slice.map((b, idx) => (
          <div key={b.batch_key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                <span className="font-semibold text-slate-800">{b.product_name} · {b.attr_color || "—"} · {b.attr_size || "—"} · {b.attr_thickness || "—"}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-slate-500">{b.items.length} dòng</span>
                <span className="font-semibold text-slate-700">Σ {fmt(b.total_quantity)} {b.unit}</span>
                {b.earliest_due && <span className="text-rose-600">Giao: {fmtDate(b.earliest_due)}</span>}
                <button onClick={() => setAllocating(b)} className="btn-primary py-1.5"><CalendarClock size={15} /> Phân bổ & tạo lệnh</button>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-slate-400 text-xs uppercase">
                <tr>{["Đơn hàng", "Khách", "Số lượng", "Ngày giao"].map((h) => <th key={h} className="text-left px-4 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {b.items.map((it) => (
                  <tr key={it.item_id}>
                    <td className="px-4 py-2 font-medium text-blue-600">{it.order_code}</td>
                    <td className="px-4 py-2 text-slate-600">{it.customer_name || "—"}</td>
                    <td className="px-4 py-2">{fmt(it.quantity)} {it.unit}</td>
                    <td className="px-4 py-2">{fmtDate(it.due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <Pager />
      {allocating && <AllocateModal lookups={lookups} batch={allocating} onClose={() => setAllocating(null)} onDone={() => { setAllocating(null); load(); }} />}
    </div>
  );
}

/* ====== Tab 1: Gom nhóm chạy hàng loạt ====== */
function GroupingTab({ lookups, onOpenOrder }) {
  const [groups, setGroups] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [scheduling, setScheduling] = useState(null);
  const { slice, Pager } = usePager(groups);

  const load = useCallback(async () => {
    try { const r = await planning.groups(true); setGroups(r.groups); setTotalOrders(r.total_orders); }
    catch (e) { alert("Lỗi tải kế hoạch: " + e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Gom nhóm lệnh cùng <b>màu + kích thước</b> để chạy hàng loạt, giảm phế phẩm chuyển đổi máy.</p>
        <button onClick={load} className="btn-ghost"><RotateCcw size={16} /> Làm mới</button>
      </div>
      <div className="flex gap-4">
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-3">
          <div className="text-2xl font-bold text-slate-800">{groups.length}</div>
          <div className="text-xs text-slate-500">Nhóm chạy hàng loạt</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-3">
          <div className="text-2xl font-bold text-slate-800">{totalOrders}</div>
          <div className="text-xs text-slate-500">Lệnh chờ lên kế hoạch</div>
        </div>
      </div>
      {!groups.length && <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400">Không có lệnh nào cần lên kế hoạch.</div>}
      <div className="space-y-4">
        {slice.map((g) => (
          <div key={g.group_key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <Layers size={18} className="text-blue-500" />
                <span className="font-semibold text-slate-800">{g.attr_color || "(không màu)"} · {g.attr_size || "(không kích thước)"}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-slate-500">{g.order_count} lệnh</span>
                <span className="font-semibold text-slate-700">Σ {fmt(g.total_quantity)}</span>
                {g.earliest_due && <span className="text-rose-600">Giao sớm nhất: {fmtDate(g.earliest_due)}</span>}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-slate-400 text-xs uppercase">
                <tr>{["Mã lệnh", "Sản phẩm", "Khách", "SL", "Máy", "Ngày SX", "Ngày giao", "Trạng thái", ""].map((h) =>
                  <th key={h} className="text-left px-4 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {g.orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2"><button onClick={() => onOpenOrder?.(o.id)} className="font-medium text-blue-600 hover:underline">{o.order_code}</button></td>
                    <td className="px-4 py-2">{o.product_name}</td>
                    <td className="px-4 py-2 text-slate-600">{o.customer_name || "—"}</td>
                    <td className="px-4 py-2 text-right">{fmt(o.quantity)} {o.unit}</td>
                    <td className="px-4 py-2">{o.machine_name || <span className="text-slate-400">Chưa xếp</span>}</td>
                    <td className="px-4 py-2">{fmtDate(o.planned_date)}{o.shift ? ` · ${o.shift}` : ""}</td>
                    <td className="px-4 py-2">{fmtDate(o.due_date)}</td>
                    <td className="px-4 py-2"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass(o.status)}`}>{o.status}</span></td>
                    <td className="px-4 py-2 text-right"><button onClick={() => setScheduling(o)} className="text-slate-400 hover:text-blue-600 p-1" title="Lập lịch / xếp máy"><CalendarClock size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <Pager />
      {scheduling && <ScheduleModal lookups={lookups} order={scheduling} onClose={() => setScheduling(null)} onSaved={() => { setScheduling(null); load(); }} />}
    </div>
  );
}

/* ====== Tab 2: Nhu cầu NVL cần mua ====== */
function MaterialTab({ onOpenProduct }) {
  const [data, setData] = useState({ requirements: [], missing_bom: [], order_count: 0 });
  const { slice, Pager, Filler } = usePager(data.requirements);
  const load = useCallback(async () => {
    try { setData(await planning.materialRequirements()); } catch (e) { alert("Lỗi tính NVL: " + e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Tổng hợp NVL cần dùng theo <b>{data.order_count} lệnh sản xuất</b> × định mức (BOM), trừ tồn kho ⇒ lượng cần mua.</p>
        <button onClick={load} className="btn-ghost"><RotateCcw size={16} /> Tính lại</button>
      </div>

      {data.missing_bom.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <div className="flex items-center gap-2 font-medium mb-1"><AlertTriangle size={16} /> {data.missing_bom.length} lệnh chưa có định mức (BOM) — chưa tính được NVL:</div>
          <div className="text-amber-700">{data.missing_bom.map((m) => `${m.order_code} (${m.product_name})`).join(", ")}</div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Mã NVL</th>
              <th className="text-left px-4 py-3 font-semibold">Nguyên vật liệu</th>
              <th className="text-right px-4 py-3 font-semibold">Cần dùng</th>
              <th className="text-right px-4 py-3 font-semibold">Tồn kho</th>
              <th className="text-right px-4 py-3 font-semibold">Cần mua</th>
              <th className="text-left px-4 py-3 font-semibold">ĐVT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {slice.map((r) => (
              <tr key={r.material_id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3"><button onClick={() => onOpenProduct?.(r.material_id)} className="font-medium text-blue-600 hover:underline">{r.material_code}</button></td>
                <td className="px-4 py-3 text-slate-800">{r.material_name}</td>
                <td className="px-4 py-3 text-right">{fmt(r.required_qty)}</td>
                <td className="px-4 py-3 text-right text-slate-500">{fmt(r.on_hand_qty)}</td>
                <td className={`px-4 py-3 text-right font-bold ${r.to_purchase_qty > 0 ? "text-rose-600" : "text-emerald-600"}`}>{fmt(r.to_purchase_qty)}</td>
                <td className="px-4 py-3">{r.unit}</td>
              </tr>
            ))}
            {!data.requirements.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Chưa có nhu cầu NVL (cần lệnh SX + định mức).</td></tr>}
            <Filler cols={6} />
          </tbody>
        </table>
      </div>
      <Pager />
    </div>
  );
}

/* ====== Hub Kế hoạch ====== */
export default function PlanningModule({ lookups, onOpenOrder, onOpenProduct }) {
  const [tab, setTab] = useState("orders");
  const tabs = [
    { key: "orders", label: "Đơn hàng cần SX", icon: ClipboardList },
    { key: "group", label: "Đã lên lịch", icon: Layers },
    { key: "material", label: "Nhu cầu NVL", icon: ShoppingCart },
  ];
  return (
    <div className="space-y-5">
      <ListHeader title="Kế hoạch sản xuất" />
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition flex items-center gap-2 ${
              tab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>
      {tab === "orders" && <OrderPlanningTab lookups={lookups} />}
      {tab === "group" && <GroupingTab lookups={lookups} onOpenOrder={onOpenOrder} />}
      {tab === "material" && <MaterialTab onOpenProduct={onOpenProduct} />}
    </div>
  );
}
