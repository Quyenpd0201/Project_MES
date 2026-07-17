import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Layers, CalendarClock, RotateCcw, ShoppingCart, AlertTriangle, ClipboardList, Save, ChevronLeft, ChevronRight, CalendarRange, Star } from "lucide-react";
import { ListHeader, usePager, DataTable } from "../components.jsx";
import { planning, production } from "../mesApi.js";
import { inputCls, fmt, fmtDate, statusClass } from "../ui.js";
import { ScheduleModal } from "./Production.jsx";

const Field = ({ label, children }) => (
  <div><label className="block text-sm font-medium text-slate-600 mb-1.5">{label}</label>{children}</div>
);

// % hoàn thành so với chỉ tiêu
const pctOf = (done, target) => { const t = Number(target) || 0; return t > 0 ? Math.min(100, Math.round((Number(done) || 0) / t * 100)) : 0; };
const ProgressMini = ({ done, target, unit }) => {
  const pct = pctOf(done, target);
  const full = pct >= 100;
  return (
    <div className="w-28">
      <div className="flex justify-between text-[11px] text-slate-500 mb-0.5">
        <span>{fmt(done)}/{fmt(target)}{unit ? " " + unit : ""}</span>
        <span className={full ? "text-emerald-600 font-semibold" : ""}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${full ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${Math.max(pct, done > 0 ? 4 : 0)}%` }} />
      </div>
    </div>
  );
};

/* ====== Modal phân bổ nguồn lực & tạo lệnh từ 1 lô ====== */
function AllocateModal({ lookups, batch, onClose, onDone }) {
  const [a, setA] = useState({ machine_id: "", planned_date: "", shift: "", assigned_team: "", assigned_worker: "" });
  const rem = (it) => Number(it.remaining ?? it.quantity) || 0;
  const [qty, setQty] = useState(() => Object.fromEntries(batch.items.map((i) => [i.item_id, String(rem(i))])));
  const set = (k, v) => setA((s) => ({ ...s, [k]: v }));
  const emps = lookups.employees || [];
  const teams = [...new Set(emps.map((e) => e.factory).filter(Boolean))];
  const workers = emps.filter((e) => !a.assigned_team || e.factory === a.assigned_team);
  const setTeam = (v) => setA((s) => ({ ...s, assigned_team: v, assigned_worker: emps.find((e) => e.name === s.assigned_worker && (!v || e.factory === v)) ? s.assigned_worker : "" }));
  const planItems = batch.items.map((i) => ({ item_id: i.item_id, qty: qty[i.item_id] })).filter((x) => Number(x.qty) > 0);

  const save = async () => {
    if (!planItems.length) return alert("Nhập số lượng sản xuất cho ít nhất 1 dòng.");
    try {
      const r = await planning.generate({ items: planItems, ...a });
      alert(`Đã tạo ${r.created.length} lệnh sản xuất: ${r.created.join(", ")}`);
      onDone();
    } catch (e) { alert("Lỗi tạo lệnh: " + e.message); }
  };
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-800">Phân bổ & tạo lệnh sản xuất</h3>
        <p className="text-sm text-slate-500">
          Lô: <b>{batch.product_name}</b> · {batch.attr_color || "—"} · {batch.attr_size || "—"} · {batch.attr_thickness || "—"}<br />
          {batch.items.length} dòng đơn hàng · còn lại {fmt(batch.total_quantity)} {batch.unit}
        </p>

        <div>
          <div className="text-sm font-medium text-slate-600 mb-1.5">Số lượng sản xuất theo dòng đơn (có thể lập một phần)</div>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr><th className="text-left px-3 py-2">Đơn hàng</th><th className="text-left px-3 py-2">Khách</th>
                  <th className="text-right px-3 py-2">Còn lại</th><th className="text-right px-3 py-2 w-28">SL sản xuất</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batch.items.map((it) => (
                  <tr key={it.item_id}>
                    <td className="px-3 py-2 font-medium text-blue-600">{it.order_code}</td>
                    <td className="px-3 py-2 text-slate-600">{it.customer_name || "—"}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{fmt(rem(it))} {it.unit}</td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min="0" max={rem(it)} className={inputCls + " text-right py-1"}
                        value={qty[it.item_id]} onChange={(e) => setQty((p) => ({ ...p, [it.item_id]: e.target.value }))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Nhập nhỏ hơn số còn lại nếu chỉ sản xuất trước một phần — phần còn lại vẫn nằm chờ trong kế hoạch.</p>
        </div>

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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Đội">
            <select className={inputCls} value={a.assigned_team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">-- Chọn đội --</option>
              {teams.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Công nhân">
            <select className={inputCls} value={a.assigned_worker} onChange={(e) => set("assigned_worker", e.target.value)}>
              <option value="">-- Chọn công nhân --</option>
              {workers.map((e) => <option key={e.id} value={e.name}>{e.name}{e.position ? ` · ${e.position}` : ""}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost">Hủy</button>
          <button onClick={save} className="btn-primary"><Save size={16} /> Tạo {planItems.length} lệnh</button>
        </div>
      </div>
    </div>
  );
}

/* Chiều ngang (số) của lô — lấy từ thông số kỹ thuật */
function batchWidth(b) {
  const w = b.specs && b.specs["Chiều ngang"];
  if (w != null) { const m = String(w).match(/[\d.]+/); if (m) return Number(m[0]); }
  return null;
}

/* Tính 5 lô ưu tiên & sắp xếp lại:
 *  - Lô "neo" (anchor) = lô có NGÀY GIAO sớm nhất (ưu tiên #1).
 *  - >5 ngày tới hạn  : gom theo CHIỀU NGANG gần anchor nhất (giảm đổi khổ), vẫn ưu tiên giao sớm.
 *  - <=5 ngày (gấp)   : ưu tiên giao sớm, các lô sau theo chiều ngang gần anchor.
 *  → Cả 2 trường hợp: neo = giao sớm nhất, phần còn lại xếp theo |chiều ngang − anchor| (rồi ngày giao),
 *    nên các lô CÙNG chiều ngang nằm cạnh nhau ⇒ nên chạy 1 lần.
 */
function computePriority(batches) {
  if (!batches || !batches.length) return { rankMap: {}, ordered: batches || [], anchorDays: null };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const meta = batches.map((b) => ({ b, due: b.earliest_due ? new Date(b.earliest_due) : null, width: batchWidth(b) }));
  const dueT = (m) => (m.due ? m.due.getTime() : Infinity);
  const anchor = [...meta].sort((a, c) => dueT(a) - dueT(c))[0];
  const anchorDays = anchor.due ? Math.ceil((anchor.due - today) / 86400000) : null;
  const aw = anchor.width;
  const widthDist = (m) => (aw == null || m.width == null) ? Infinity : Math.abs(m.width - aw);
  const urgent = anchorDays != null && anchorDays <= 5;
  const rest = meta.filter((m) => m !== anchor).sort((a, c) =>
    urgent
      ? (dueT(a) - dueT(c)) || (widthDist(a) - widthDist(c))   // gấp: ngày giao trước
      : (widthDist(a) - widthDist(c)) || (dueT(a) - dueT(c))); // rộng thời gian: gom khổ trước
  const orderedMeta = [anchor, ...rest];
  const rankMap = {};
  orderedMeta.slice(0, 5).forEach((m, i) => { rankMap[m.b.batch_key] = i + 1; });
  return { rankMap, ordered: orderedMeta.map((m) => m.b), anchorDays };
}

/* ====== Tab: Lập kế hoạch từ đơn hàng ====== */
function OrderPlanningTab({ lookups }) {
  const [batches, setBatches] = useState([]);
  const [demandLines, setDemandLines] = useState(0);
  const [allocating, setAllocating] = useState(null);
  const priority = useMemo(() => computePriority(batches), [batches]);
  const { slice, Pager } = usePager(priority.ordered);

  const load = useCallback(async () => {
    try { const r = await planning.fromOrders(); setBatches(r.batches); setDemandLines(r.demand_lines); }
    catch (e) { alert("Lỗi tải kế hoạch: " + e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Gom dòng đơn hàng còn mở thành <b>lô trùng</b> (sản phẩm + màu + kích thước + độ dày). Hệ thống tự <b className="text-amber-600">highlight 5 lô ưu tiên</b>: neo theo ngày giao sớm nhất, các lô sau gom theo <b>chiều ngang</b> gần nhất để giảm đổi khổ (cùng chiều ngang nên chạy 1 lần).</p>
        <button onClick={load} className="btn-ghost"><RotateCcw size={16} /> Làm mới</button>
      </div>
      <div className="flex gap-4">
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-3"><div className="text-2xl font-bold text-slate-800">{batches.length}</div><div className="text-xs text-slate-500">Lô cần sản xuất</div></div>
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-3"><div className="text-2xl font-bold text-slate-800">{demandLines}</div><div className="text-xs text-slate-500">Dòng đơn hàng chờ</div></div>
      </div>
      {!batches.length && <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400">Không có đơn hàng nào cần lên kế hoạch. Tạo đơn hàng ở mục Đơn hàng trước.</div>}
      <div className="space-y-4">
        {slice.map((b, idx) => {
          const rank = priority.rankMap[b.batch_key];
          return (
          <div key={b.batch_key} className={`bg-white rounded-xl border overflow-hidden ${rank ? "border-amber-400 ring-2 ring-amber-200" : "border-slate-200"}`}>
            <div className={`flex items-center justify-between px-5 py-3 border-b border-slate-100 ${rank ? "bg-amber-50/70" : "bg-slate-50"}`}>
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                <span className="font-semibold text-slate-800">{b.product_name} · {b.attr_color || "—"} · {b.attr_size || "—"} · {b.attr_thickness || "—"}</span>
                {rank && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold"><Star size={12} className="fill-amber-500 text-amber-500" /> Ưu tiên #{rank}</span>}
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
                <tr>{["Đơn hàng", "Khách", "Đặt", "Còn lại", "Ngày giao"].map((h) => <th key={h} className="text-left px-4 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {b.items.map((it) => (
                  <tr key={it.item_id}>
                    <td className="px-4 py-2 font-medium text-blue-600">{it.order_code}</td>
                    <td className="px-4 py-2 text-slate-600">{it.customer_name || "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{fmt(it.quantity)} {it.unit}</td>
                    <td className="px-4 py-2 font-medium text-slate-800">{fmt(it.remaining ?? it.quantity)} {it.unit}</td>
                    <td className="px-4 py-2">{fmtDate(it.due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          );
        })}
      </div>
      <Pager />
      {allocating && <AllocateModal lookups={lookups} batch={allocating} onClose={() => setAllocating(null)} onDone={() => { setAllocating(null); load(); }} />}
    </div>
  );
}

/* ====== Tab 1: Gom nhóm chạy hàng loạt ====== */
const GROUP_SCOPES = [
  { key: "todo", label: "Cần lên lịch", statuses: "Chờ duyệt,Đã lên kế hoạch" },
  { key: "running", label: "Đang chạy", statuses: "Đang sản xuất" },
  { key: "done", label: "Hoàn thành", statuses: "Hoàn thành" },
];

function GroupingTab({ lookups, onOpenOrder }) {
  const [groups, setGroups] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [scheduling, setScheduling] = useState(null);
  const [scope, setScope] = useState("todo");
  const { slice, Pager } = usePager(groups);

  const load = useCallback(async () => {
    try {
      const sc = GROUP_SCOPES.find((s) => s.key === scope);
      const r = await planning.groups(sc.statuses);
      setGroups(r.groups); setTotalOrders(r.total_orders);
    } catch (e) { alert("Lỗi tải kế hoạch: " + e.message); }
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  const scopeLabel = GROUP_SCOPES.find((s) => s.key === scope)?.label;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500">Gom nhóm lệnh cùng <b>màu + kích thước</b> để chạy hàng loạt, giảm phế phẩm chuyển đổi máy.</p>
        <button onClick={load} className="btn-ghost"><RotateCcw size={16} /> Làm mới</button>
      </div>
      <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm w-fit">
        {GROUP_SCOPES.map((s) => (
          <button key={s.key} onClick={() => setScope(s.key)}
            className={`px-4 py-1.5 ${scope === s.key ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{s.label}</button>
        ))}
      </div>
      <div className="flex gap-4">
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-3">
          <div className="text-2xl font-bold text-slate-800">{groups.length}</div>
          <div className="text-xs text-slate-500">Nhóm (màu + kích thước)</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-3">
          <div className="text-2xl font-bold text-slate-800">{totalOrders}</div>
          <div className="text-xs text-slate-500">Lệnh · {scopeLabel}</div>
        </div>
      </div>
      {!groups.length && <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400">Không có lệnh ở trạng thái "{scopeLabel}".</div>}
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
                <span className="text-slate-500">Hoàn thành <b className={pctOf(g.total_produced, g.total_quantity) >= 100 ? "text-emerald-600" : "text-blue-600"}>{pctOf(g.total_produced, g.total_quantity)}%</b></span>
                {g.earliest_due && <span className="text-rose-600">Giao sớm nhất: {fmtDate(g.earliest_due)}</span>}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-slate-400 text-xs uppercase">
                <tr>{["Mã lệnh", "Sản phẩm", "Khách", "SL", "Tiến độ", "Máy", "Ngày SX", "Ngày giao", "Trạng thái", ""].map((h) =>
                  <th key={h} className="text-left px-4 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {g.orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2"><button onClick={() => onOpenOrder?.(o.id)} className="font-medium text-blue-600 hover:underline">{o.order_code}</button></td>
                    <td className="px-4 py-2">{o.product_name}</td>
                    <td className="px-4 py-2 text-slate-600">{o.customer_name || "—"}</td>
                    <td className="px-4 py-2 text-right">{fmt(o.quantity)} {o.unit}</td>
                    <td className="px-4 py-2">{o.produced_qty > 0 ? <ProgressMini done={o.produced_qty} target={o.quantity} /> : <span className="text-slate-300 text-xs">—</span>}</td>
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
  const load = useCallback(async () => {
    try { setData(await planning.materialRequirements()); } catch (e) { alert("Lỗi tính NVL: " + e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const columns = [
    { key: "material_code", label: "Mã NVL", filter: "text", render: (r) => <button onClick={() => onOpenProduct?.(r.material_id)} className="font-medium text-blue-600 hover:underline">{r.material_code}</button> },
    { key: "material_name", label: "Nguyên vật liệu", filter: "text", tdClass: "text-slate-800" },
    { key: "required_qty", label: "Cần dùng", align: "right", render: (r) => fmt(r.required_qty) },
    { key: "on_hand_qty", label: "Tồn kho", align: "right", tdClass: "text-slate-500", render: (r) => fmt(r.on_hand_qty) },
    { key: "to_purchase_qty", label: "Cần mua", align: "right", render: (r) => <span className={`font-bold ${r.to_purchase_qty > 0 ? "text-rose-600" : "text-emerald-600"}`}>{fmt(r.to_purchase_qty)}</span> },
    { key: "unit", label: "ĐVT", filter: "select" },
  ];

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

      <DataTable columns={columns} rows={data.requirements} rowKey={(r) => r.material_id} emptyText="Chưa có nhu cầu NVL (cần lệnh SX + định mức)." />
    </div>
  );
}

/* ====== Lịch sản xuất — bảng tuần, kéo-thả xếp lịch ====== */
const toYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mondayOf = (d) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const DOW = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function ScheduleBoard({ onOpenOrder }) {
  const [orders, setOrders] = useState([]);
  const [anchor, setAnchor] = useState(mondayOf(new Date()));
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);

  const load = useCallback(async () => {
    try {
      const rows = await production.list({});
      setOrders((rows || []).filter((o) => !["Hoàn thành", "Đã hủy"].includes(o.status)));
    } catch (e) { alert("Lỗi tải lịch: " + e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const days = [...Array(7)].map((_, i) => addDays(anchor, i));
  const dkey = (o) => { const v = o.start_date || o.planned_date; return v ? String(v).slice(0, 10) : null; };
  const unscheduled = orders.filter((o) => !dkey(o));
  const ordersOn = (d) => orders.filter((o) => dkey(o) === toYMD(d));
  const today = toYMD(new Date());
  const maxQty = Math.max(1, ...days.map((d) => ordersOn(d).reduce((s, o) => s + Number(o.quantity || 0), 0)));

  const drop = async (e, date) => {
    setOver(null);
    const id = (e && e.dataTransfer && e.dataTransfer.getData("text/plain")) || dragId;
    const o = orders.find((x) => x.id === id);
    if (!o) return;
    const nd = date ? toYMD(date) : "";
    if ((dkey(o) || "") === nd) return;
    try { await production.reschedule(o.id, nd); load(); }
    catch (e) { alert("Lỗi xếp lịch: " + e.message); }
  };

  const Card = ({ o }) => (
    <div draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.id); e.dataTransfer.effectAllowed = "move"; setDragId(o.id); }}
      onDragEnd={() => setDragId(null)}
      onClick={() => onOpenOrder?.(o.id)}
      className="cursor-move bg-white border border-slate-200 rounded-lg p-2 text-xs shadow-sm hover:shadow hover:border-blue-300 transition">
      <div className="font-semibold text-blue-600">{o.order_code}</div>
      <div className="text-slate-700 truncate">{o.product_name}</div>
      <div className="text-slate-400 truncate">{[o.attr_color, o.attr_size].filter(Boolean).join(" · ")} · {fmt(o.quantity)} {o.unit}</div>
      {Number(o.produced_qty) > 0 && (
        <div className="mt-1">
          <div className="flex justify-between text-[10px] text-slate-500"><span>{fmt(o.produced_qty)}/{fmt(o.quantity)}</span><span className={pctOf(o.produced_qty, o.quantity) >= 100 ? "text-emerald-600 font-semibold" : ""}>{pctOf(o.produced_qty, o.quantity)}%</span></div>
          <div className="h-1 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${pctOf(o.produced_qty, o.quantity) >= 100 ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${Math.max(pctOf(o.produced_qty, o.quantity), 4)}%` }} /></div>
        </div>
      )}
      <div className="flex items-center justify-between mt-1">
        <span className="text-rose-500">Giao {fmtDate(o.due_date)}</span>
        <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusClass(o.status)}`}>{o.status}</span>
      </div>
    </div>
  );

  const Column = ({ title, sub, date, items, highlight }) => (
    <div className="flex-1 min-w-[150px] flex flex-col">
      <div className={`px-2 py-1.5 rounded-t-lg text-center text-xs font-semibold border ${highlight ? "bg-blue-600 text-white border-blue-600" : "bg-slate-50 text-slate-600 border-slate-200"}`}>
        {title}{sub && <div className="text-[10px] font-normal opacity-80">{sub}</div>}
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(date === undefined ? "un" : toYMD(date)); }}
        onDragLeave={() => setOver(null)}
        onDrop={(e) => drop(e, date)}
        className={`flex-1 border border-t-0 rounded-b-lg p-1.5 space-y-1.5 min-h-[120px] ${over === (date === undefined ? "un" : toYMD(date)) ? "bg-blue-50 border-blue-300" : "border-slate-200"}`}>
        {items.map((o) => <Card key={o.id} o={o} />)}
        {!items.length && <div className="text-[11px] text-slate-300 text-center py-4">—</div>}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-500">Kéo-thả lệnh vào ngày để <b>xếp lịch / sắp thứ tự làm trước–sau</b>. Cột "Chưa xếp" gồm lệnh chưa có ngày SX.</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setAnchor(addDays(anchor, -7))} className="btn-ghost px-2"><ChevronLeft size={16} /></button>
          <span className="text-sm font-medium text-slate-700">Tuần {days[0].getDate()}/{days[0].getMonth() + 1} – {days[6].getDate()}/{days[6].getMonth() + 1}</span>
          <button onClick={() => setAnchor(addDays(anchor, 7))} className="btn-ghost px-2"><ChevronRight size={16} /></button>
          <button onClick={() => setAnchor(mondayOf(new Date()))} className="btn-ghost">Tuần này</button>
          <button onClick={load} className="btn-ghost"><RotateCcw size={16} /> Làm mới</button>
        </div>
      </div>

      {/* Biểu đồ tải theo ngày */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="text-xs font-semibold text-slate-500 mb-2">Tải sản xuất theo ngày (tổng SL)</div>
        <div className="flex items-end gap-2 h-24">
          {days.map((d) => {
            const list = ordersOn(d);
            const q = list.reduce((s, o) => s + Number(o.quantity || 0), 0);
            return (
              <div key={toYMD(d)} className="flex-1 flex flex-col items-center justify-end gap-1">
                <div className="text-[10px] text-slate-500">{q ? fmt(q) : ""}</div>
                <div className={`w-full rounded-t ${toYMD(d) === today ? "bg-blue-500" : "bg-blue-300"}`} style={{ height: `${(q / maxQty) * 100}%`, minHeight: q ? 4 : 0 }} />
                <div className={`text-[10px] ${toYMD(d) === today ? "text-blue-600 font-semibold" : "text-slate-400"}`}>{DOW[(d.getDay() + 6) % 7]} {d.getDate()}/{d.getMonth() + 1}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bảng kéo-thả */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Column title="Chưa xếp" sub={`${unscheduled.length} lệnh`} date={undefined} items={unscheduled} />
        {days.map((d) => (
          <Column key={toYMD(d)} title={`${DOW[(d.getDay() + 6) % 7]} ${d.getDate()}/${d.getMonth() + 1}`}
            date={d} items={ordersOn(d)} highlight={toYMD(d) === today} />
        ))}
      </div>
    </div>
  );
}

/* ====== Hub Kế hoạch ====== */
export default function PlanningModule({ lookups, onOpenOrder, onOpenProduct, initialTab, onTabChange }) {
  const [tab, setTabState] = useState(initialTab || "orders");
  const setTab = (k) => { setTabState(k); onTabChange?.(k); };
  const tabs = [
    { key: "orders", label: "Đơn hàng cần SX", icon: ClipboardList },
    { key: "board", label: "Lịch sản xuất", icon: CalendarRange },
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
      {tab === "board" && <ScheduleBoard onOpenOrder={onOpenOrder} />}
      {tab === "material" && <MaterialTab onOpenProduct={onOpenProduct} />}
    </div>
  );
}

/* ====== App riêng: Lệnh theo trạng thái ====== */
export function OrderStatusModule({ lookups, onOpenOrder }) {
  return (
    <div className="space-y-5">
      <ListHeader title="Lệnh theo trạng thái" />
      <GroupingTab lookups={lookups} onOpenOrder={onOpenOrder} />
    </div>
  );
}
