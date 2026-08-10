import React, { useState, useEffect, useCallback } from "react";
import { Save, RotateCcw, Factory, CalendarClock, Package, Boxes, AlertTriangle, Play, Pause, CheckCircle2, ClipboardCheck, X } from "lucide-react";
import { production, http } from "../../mesApi.js";
import { usePerm } from "../../perm.jsx";
import { ListHeader } from "../../components.jsx";
import {  inputCls, fmt, fmtDate, statusClass , toast } from "../../ui.js";
import { CreateInspectionForm } from "../quality/QualityModule.jsx";

/* ---- Modal: Ghi nhận QC ---- */
function QCModal({ task, onClose }) {
  const [orders, setOrders] = useState([]);
  const [criteria, setCriteria] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      http('/api/production/orders').then(r => r.data),
      http('/api/quality/criteria').then(r => r.data)
    ]).then(([o, c]) => {
      setOrders(o);
      setCriteria(c.filter(x => x.status === 'Hoạt động'));
      setLoading(false);
    }).catch(e => {
      toast.error(e.message);
      onClose(false);
    });
  }, []);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => onClose(false)}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {loading ? <div className="p-10 text-center">Đang tải biểu mẫu QC...</div> : (
          <CreateInspectionForm 
            orders={orders} 
            criteria={criteria} 
            initialOrder={task.production_order_id} 
            onCancel={() => onClose(false)} 
            onSaved={() => onClose(true)} 
          />
        )}
      </div>
    </div>
  );
}

/* ---- Modal: NVL thực tế sử dụng (gợi ý từ BOM) → trừ tồn kho ---- */
function MaterialModal({ task, canEdit, completeMode = false, onClose }) {
  const [data, setData] = useState(null);
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    production.materials(task.production_order_id)
      .then((d) => { setData(d); setLines((d.lines || []).map((l) => ({ ...l, used_qty: l.used_qty ?? l.suggested_qty }))); })
      .catch((e) => toast.error("Lỗi tải NVL: " + e.message));
  }, [task.production_order_id]);
  const setQty = (mid, v) => setLines((a) => a.map((l) => (l.material_id === mid ? { ...l, used_qty: v } : l)));
  const save = async () => {
    setSaving(true);
    try {
      await production.saveMaterials(task.production_order_id, lines.map((l) => ({ material_id: l.material_id, qty: l.used_qty, unit: l.unit })));
      onClose(true);
    } catch (e) { toast.error("Lỗi ghi nhận NVL: " + e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => onClose(false)}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Boxes size={18} className="text-blue-500" /> NVL thực tế sử dụng</h3>
          <p className="text-sm text-slate-500 mt-1">Lệnh <b className="text-blue-600">{task.order_code}</b> · {task.product_name} · SL {fmt(task.quantity)} {task.unit}. Gợi ý lấy từ định mức (BOM); sửa lại theo thực tế rồi Lưu để <b>trừ tồn kho NVL</b>.</p>
          {completeMode && <p className="text-sm text-emerald-700 font-medium mt-1">Cập nhật NVL thực tế xong sẽ <b>Hoàn thành sản xuất</b> cho lô này.</p>}
        </div>

        {!data ? <div className="text-slate-400 text-sm py-6 text-center">Đang tải…</div>
          : !data.has_bom ? <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 flex items-center gap-2"><AlertTriangle size={16} /> Sản phẩm chưa có định mức (BOM) đang hoạt động — chưa gợi ý được NVL.</div>
            : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                    <tr>
                      <th className="text-left px-3 py-2">Nguyên vật liệu</th>
                      <th className="text-right px-3 py-2">Gợi ý (BOM)</th>
                      <th className="text-right px-3 py-2">Tồn kho</th>
                      <th className="text-right px-3 py-2 w-32">Thực tế dùng</th>
                      <th className="text-left px-3 py-2 w-16">ĐVT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((l) => {
                      const over = Number(l.used_qty) > Number(l.on_hand);
                      return (
                        <tr key={l.material_id}>
                          <td className="px-3 py-2"><div className="font-medium text-slate-800">{l.material_name}</div><div className="text-[11px] text-slate-400">{l.material_code}</div></td>
                          <td className="px-3 py-2 text-right text-slate-500">{fmt(l.suggested_qty)}</td>
                          <td className={`px-3 py-2 text-right ${over ? "text-rose-600 font-medium" : "text-slate-500"}`}>{fmt(l.on_hand)}{over && <span title="Vượt tồn kho"> ⚠</span>}</td>
                          <td className="px-3 py-2 text-right">
                            <input type="number" min="0" disabled={!canEdit} className={inputCls + " text-right py-1"} value={l.used_qty}
                              onChange={(e) => setQty(l.material_id, e.target.value)} />
                          </td>
                          <td className="px-3 py-2 text-slate-500">{l.unit || ""}</td>
                        </tr>
                      );
                    })}
                    {!lines.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Định mức không có dòng NVL.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={() => onClose(false)} className="btn-ghost">{completeMode ? "Hủy" : "Đóng"}</button>
          {canEdit && data?.has_bom && lines.length > 0 &&
            <button onClick={save} disabled={saving} className="btn-primary" style={completeMode ? { background: "#059669" } : undefined}>
              <Save size={16} /> {saving ? "Đang lưu…" : (completeMode ? "Lưu NVL & Hoàn thành" : "Lưu & trừ kho")}</button>}
          {/* Không có BOM mà đang hoàn thành → cho hoàn thành luôn (không có NVL để ghi) */}
          {canEdit && completeMode && data && (!data.has_bom || !lines.length) &&
            <button onClick={() => onClose(true)} className="btn-primary" style={{ background: "#059669" }}><CheckCircle2 size={16} /> Hoàn thành</button>}
        </div>
      </div>
    </div>
  );
}

const TASK_STATUSES = ["Chờ", "Đang sản xuất", "Dừng sản xuất", "Hoàn thành", "Đã hủy"];

/* ---- Thẻ 1 công việc (công nhân khai báo sản lượng) ---- */
function TaskCard({ t, canEdit, onSaved }) {
  const [actual, setActual] = useState(t.actual_qty ?? "");
  const [scrap, setScrap] = useState(t.scrap_qty ?? "");
  const [saving, setSaving] = useState(false);
  const [showMat, setShowMat] = useState(false);
  const [showQC, setShowQC] = useState(false);
  const [matMode, setMatMode] = useState(null); // "view" | "complete"
  useEffect(() => { setActual(t.actual_qty ?? ""); setScrap(t.scrap_qty ?? ""); }, [t.id]); // eslint-disable-line

  const st = t.status;
  const isRunning = st === "Đang sản xuất";       // đang chạy → cho điền
  const isDone = st === "Hoàn thành" || st === "Đã hủy";
  const editable = canEdit && isRunning;          // chỉ điền được khi ĐANG sản xuất

  const attrs = [t.attr_color, t.attr_size, t.attr_thickness].filter(Boolean).join(" · ") || "—";
  const time = t.planned_date
    ? `${fmtDate(t.planned_date)}${t.planned_end_date && t.planned_end_date !== t.planned_date ? " → " + fmtDate(t.planned_end_date) : ""}${t.shift ? " · " + t.shift : ""}`
    : "Chưa xếp lịch";
  const Info = ({ label, value, cls = "text-slate-800" }) => (
    <div><div className="text-[11px] text-slate-400">{label}</div><div className={`text-sm font-medium ${cls}`}>{value || "—"}</div></div>
  );

  const doUpdate = async (patch) => {
    setSaving(true);
    try { await production.updateTask(t.id, patch); onSaved(); }
    catch (e) { toast.error("Lỗi cập nhật: " + e.message); }
    finally { setSaving(false); }
  };
  const start = () => doUpdate({ status: "Đang sản xuất" });                                   // Bắt đầu / Tiếp tục
  const saveProgress = () => doUpdate({ status: "Đang sản xuất", actual_qty: actual, scrap_qty: scrap });
  const pause = () => doUpdate({ status: "Dừng sản xuất", actual_qty: actual, scrap_qty: scrap }); // Tạm dừng
  const complete = () => {
    const need = Number(t.quantity) || 0, act = Number(actual) || 0;
    if (act < need) return toast.error(`Chưa thể Hoàn thành: SL thực tế (${fmt(act)}) phải ≥ SL đơn hàng (${fmt(need)}).`);
    setMatMode("complete"); setShowMat(true); // bắt cập nhật NVL trước khi hoàn thành
  };
  const finishComplete = () => doUpdate({ status: "Hoàn thành", actual_qty: actual, scrap_qty: scrap });

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-blue-600">{t.order_code}</span>
          <span className="text-slate-300">·</span>
          <span className="font-medium text-slate-700">{t.stage}</span>
          {t.machine_name && <span className="text-slate-400 text-xs">({t.machine_name})</span>}
        </div>
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass(t.status)}`}>{t.status}</span>
      </div>

      <div className="p-4 space-y-3">
        {/* Sản phẩm + đặc tính: thông tin CHÍNH để sản xuất → to & đậm */}
        <div className="flex items-start gap-2">
          <Package size={22} className="text-blue-500 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-xl font-extrabold text-slate-900 leading-tight">{t.product_name}</div>
            <div className="text-xs text-slate-400">{t.product_code}</div>
          </div>
        </div>
        <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
          <div className="text-[11px] font-semibold text-blue-500 uppercase tracking-wide mb-0.5">Đặc tính sản phẩm</div>
          <div className="text-lg md:text-xl font-extrabold text-slate-900 leading-snug break-words">{attrs}</div>
          <div className="text-xl font-extrabold text-blue-700 mt-1">SL: {fmt(t.quantity)} {t.unit || ""}</div>
        </div>

        {/* Khách hàng & đơn hàng để công nhân đọc */}
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 grid grid-cols-2 gap-x-3 gap-y-1">
          <div className="col-span-2"><span className="text-[11px] text-slate-400">Khách hàng: </span><span className="text-base font-bold text-slate-900">{t.customer_name || "—"}</span>{t.customer_phone && <span className="text-sm text-slate-500"> · {t.customer_phone}</span>}</div>
          <div><span className="text-[11px] text-slate-400">Đơn hàng: </span><span className="text-sm font-semibold text-slate-700">{t.sales_order_code || "—"}</span></div>
          <div><span className="text-[11px] text-slate-400">Lệnh SX: </span><span className="text-sm font-semibold text-slate-700">{t.order_code}</span></div>
          {t.order_note && <div className="col-span-2"><span className="text-[11px] text-slate-400">Ghi chú: </span><span className="text-sm text-slate-700">{t.order_note}</span></div>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Info label="Ngày giao" value={fmtDate(t.due_date)} cls="text-rose-600" />
          <Info label="Thời gian sản xuất" value={time} />
          <Info label="Đội / Công nhân" value={[t.assigned_team, t.assigned_worker].filter(Boolean).join(" · ")} />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">SL thực tế sản xuất</label>
            <input type="number" min="0" className={inputCls + (editable ? "" : " bg-slate-50")} disabled={!editable} value={actual} onChange={(e) => setActual(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">SL phế phẩm</label>
            <input type="number" min="0" className={inputCls + (editable ? "" : " bg-slate-50")} disabled={!editable} value={scrap} onChange={(e) => setScrap(e.target.value)} placeholder="0" />
          </div>
        </div>
        {!isRunning && !isDone && <div className="text-[11px] text-slate-400">Bấm <b>"Bắt đầu sản xuất"</b> để mở nhập số lượng & NVL.</div>}

        {/* Nút điều khiển sản xuất theo trạng thái */}
        {canEdit && (
          <div className="flex flex-wrap gap-2 pt-1">
            {!isRunning && !isDone && (
              <button onClick={start} disabled={saving} className="btn-primary flex-1 justify-center">
                <Play size={16} /> {st === "Dừng sản xuất" ? "Tiếp tục sản xuất" : "Bắt đầu sản xuất"}
              </button>
            )}
            {isRunning && (<>
              <button onClick={saveProgress} disabled={saving} className="btn-ghost"><Save size={16} /> Lưu SL</button>
              <button onClick={pause} disabled={saving} className="btn-ghost text-amber-600 border-amber-200 hover:bg-amber-50"><Pause size={16} /> Tạm dừng</button>
              <button onClick={complete} disabled={saving} className="btn-primary flex-1 justify-center" style={{ background: "#059669" }}><CheckCircle2 size={16} /> Hoàn thành sản xuất</button>
            </>)}
            <button onClick={() => { setMatMode("view"); setShowMat(true); }} className="btn-ghost text-blue-600 border-blue-200 hover:bg-blue-50"><Boxes size={16} /> NVL thực tế</button>
            <button onClick={() => setShowQC(true)} className="btn-ghost text-purple-600 border-purple-200 hover:bg-purple-50"><ClipboardCheck size={16} /> Ghi nhận QC</button>
          </div>
        )}
      </div>

      {showMat && <MaterialModal task={t} canEdit={canEdit} completeMode={matMode === "complete"}
        onClose={(saved) => { const wasComplete = matMode === "complete"; setShowMat(false); setMatMode(null); if (wasComplete && saved) finishComplete(); else if (saved) onSaved?.(); }} />}
      {showQC && <QCModal task={t} onClose={(saved) => { setShowQC(false); if (saved) onSaved?.(); }} />}
    </div>
  );
}

export default function ExecutionModule({ lookups }) {
  const { can, user } = usePerm();
  const canEdit = can("execution", "edit");
  // Người dùng bị giới hạn theo Đội (không phải admin + có gắn đội) → chỉ thấy việc của đội đó
  const lockedTeam = (!user?.is_admin && user?.team) ? user.team : "";
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ team: lockedTeam, worker: "", status: "", q: "" });
  const emps = lookups.employees || [];
  const teams = [...new Set(emps.map((e) => e.factory).filter(Boolean))];
  const workers = emps.filter((e) => !filters.team || e.factory === filters.team);
  const setTeam = (v) => setFilters((s) => ({ ...s, team: v, worker: emps.find((e) => e.name === s.worker && (!v || e.factory === v)) ? s.worker : "" }));

  const load = useCallback(async () => {
    try { setRows(await production.execution(filters)); }
    catch (e) { toast.error("Lỗi tải công việc: " + e.message); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const todo = rows.filter((t) => !["Hoàn thành", "Đã hủy"].includes(t.status)).length;

  return (
    <div className="space-y-5">
      <ListHeader title="Thực thi sản xuất" actions={
        <button onClick={load} className="btn-ghost"><RotateCcw size={16} /> Làm mới</button>
      } />

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input placeholder="Tìm mã lệnh / sản phẩm" className={inputCls} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          {lockedTeam ? (
            <div className={inputCls + " bg-slate-100 text-slate-600 flex items-center"}>Đội: <b className="ml-1">{lockedTeam}</b></div>
          ) : (
            <select className={inputCls} value={filters.team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">Đội: tất cả</option>
              {teams.map((t) => <option key={t} value={t}>Đội: {t}</option>)}
            </select>
          )}
          <select className={inputCls} value={filters.worker} onChange={(e) => setFilters({ ...filters, worker: e.target.value })}>
            <option value="">Công nhân: tất cả</option>
            {workers.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
          </select>
          <select className={inputCls} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">Trạng thái: tất cả</option>
            {TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Factory size={16} /> <b className="text-slate-800">{todo}</b> việc cần làm / {rows.length} tổng
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rows.map((t) => <TaskCard key={t.id} t={t} canEdit={canEdit} onSaved={load} />)}
      </div>
      {!rows.length && <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400">Không có công việc sản xuất nào. (Tạo lệnh SX + phân công ở mục Sản xuất)</div>}
    </div>
  );
}
