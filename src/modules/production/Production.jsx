import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, ArrowLeft, Save, CalendarClock, Factory, List, GanttChartSquare, Pencil, Printer, GitBranch, Copy } from "lucide-react";
import { production, processes } from "../../mesApi.js";
import { usePerm } from "../../perm.jsx";
import { inputCls, fmt, fmtDate, statusClass, toast } from "../../ui.js";
import { PageHeader, Section, ListHeader, DataTable, UnitSelect } from "../../components.jsx";
import Qr from "../../Qr.jsx";
import ProductionGantt from "./ProductionGantt.jsx";

const STATUSES = ["Chờ duyệt", "Đã lên kế hoạch", "Đang sản xuất", "Hoàn thành", "Đã hủy"];

/* ---- Form tạo / sửa lệnh sản xuất ---- */
function ProductionForm({ lookups, editId, copyId, onBack, onSaved }) {
  const { can, fperm } = usePerm();
  const fhid = (k) => fperm("production", k) === "hidden";
  const fdis = (k) => fperm("production", k) !== "edit";
  const [f, setF] = useState({
    attr_size: "", attr_thickness: "", attr_color: "", due_date: "", note: "", priority: "Trung bình"
  });
  const [finishing, setFinishing] = useState(
    (lookups.finishingOptions || []).map((name) => ({ name, checked: false }))
  );
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const toggleFin = (i) => setFinishing((a) => a.map((x, k) => (k === i ? { ...x, checked: !x.checked } : x)));

  // Phân công (lệnh nhỏ): công đoạn + sản lượng + máy + ca + đội
  const [tasks, setTasks] = useState([]);
  const [taskSeq, setTaskSeq] = useState(1);
  const addTask = () => {
    setTasks((a) => [...a, { _k: taskSeq, stage: "Thổi", quantity: "", actual_qty: "", scrap_qty: "", machine_id: "", shift: "", planned_date: "", planned_end_date: "", assigned_team: "", assigned_worker: "", status: "Chờ" }]);
    setTaskSeq((s) => s + 1);
  };
  const rmTask = (k) => setTasks((a) => a.filter((x) => x._k !== k));
  const upTask = (k, field, v) => setTasks((a) => a.map((x) => (x._k === k ? { ...x, [field]: v } : x)));
  // Đội / Công nhân (chọn từ danh sách, công nhân lọc theo đội)
  const emps = lookups.employees || [];
  const teams = [...new Set(emps.map((e) => e.factory).filter(Boolean))];
  const workersOf = (team) => emps.filter((e) => !team || e.factory === team);
  const setTaskTeam = (k, v) => setTasks((a) => a.map((x) => {
    if (x._k !== k) return x;
    const keep = emps.find((e) => e.name === x.assigned_worker && (!v || e.factory === v));
    return { ...x, assigned_team: v, assigned_worker: keep ? x.assigned_worker : "" };
  }));

  // Sinh phân công theo Quy trình công nghệ của sản phẩm (silent = tự động, không báo)
  const genFromProcess = async (productId, quantity, { silent = false, defaults = {} } = {}) => {
    if (!productId) { if (!silent) toast.error("Hãy chọn Sản phẩm trước."); return; }
    try {
      const list = await processes.list({ product_id: productId });
      if (!list.length) { if (!silent) toast.error("Sản phẩm này chưa có quy trình công nghệ. Tạo ở mục Quy trình CN."); return; }
      const proc = await processes.get(list[0].id);
      if (!proc.steps?.length) { if (!silent) toast.error("Quy trình chưa có bước nào."); return; }
      let avail = [];
      try { avail = await production.machineAvailability(); } catch { /* không chặn nếu lỗi */ }
      const mapStage = (s) => /c[ắa]t/i.test(`${s.name || ""} ${s.workshop || ""} ${s.machine_name || ""} ${s.machine_type || ""}`) ? "Cắt" : "Thổi";
      // Gợi ý máy: ưu tiên máy đang rảnh (Hoạt động + tải thấp nhất) và DÙNG 1 MÁY xuyên suốt cho cùng công đoạn
      const chosen = {}; // xưởng/công đoạn -> machine_id đã chọn
      
      const newTasks = [];
      let seq = 1;
      const baseQty = Number(quantity) || 0;
      
      for (const s of proc.steps) {
        const stage = mapStage(s);
        const mids = (s.machine_ids && s.machine_ids.length > 0) ? s.machine_ids : (s.machine_id ? [s.machine_id] : [null]);
        
        // Chia số lượng nếu 1 công đoạn làm trên nhiều máy
        const qtyPerTask = baseQty > 0 ? Math.round(baseQty / mids.length) : "";

        mids.forEach((mId, i) => {
          let chosenMId = mId;
          if (!chosenMId) {
             const wantWs = s.workshop || (stage === "Cắt" ? "Nhà máy cắt" : "Nhà máy thổi");
             if (chosen[wantWs]) chosenMId = chosen[wantWs];
             else {
               let pool = avail.filter((m) => m.status === "Hoạt động" && m.factory === wantWs);
               if (!pool.length) pool = avail.filter((m) => m.status === "Hoạt động" && (stage === "Cắt" ? /c[ắa]t/i.test(`${m.factory} ${m.machine_type}`) : /th[ổô]i/i.test(`${m.factory} ${m.machine_type}`)));
               if (pool.length) { 
                 pool = [...pool].sort((a, b) => (a.load || 0) - (b.load || 0));
                 chosenMId = pool[0].id; chosen[wantWs] = chosenMId; 
               }
             }
          } else {
             chosen[s.workshop || stage] = chosenMId;
          }

          // Máy cuối cùng sẽ ôm phần dư do làm tròn
          const taskQty = (i === mids.length - 1 && baseQty > 0) ? (baseQty - qtyPerTask * (mids.length - 1)) : qtyPerTask;

          // Kế thừa đội/công nhân CHỈ khi cùng nhà máy với công đoạn (1 công nhân chỉ thuộc 1 nhà máy)
          const stageTeam = stage === "Cắt" ? "Nhà máy cắt" : "Nhà máy thổi";
          const teamMatch = defaults.assigned_team && defaults.assigned_team === stageTeam;
          newTasks.push({
            _k: Date.now() + seq, stage, quantity: taskQty, actual_qty: "", scrap_qty: "",
            machine_id: chosenMId || "", shift: defaults.shift || "",
            planned_date: defaults.planned_date || "", planned_end_date: "",
            assigned_team: teamMatch ? defaults.assigned_team : "", assigned_worker: teamMatch ? defaults.assigned_worker : "",
            status: "Chờ", note: s.name || ""
          });
          seq++;
        });
      }
      setTasks(newTasks); setTaskSeq(Date.now() + seq + 1);
      if (!silent) {
        const nMc = newTasks.filter((t) => t.machine_id).length;
        toast.success(`Đã tạo ${newTasks.length} phân công theo quy trình "${proc.name}". Gợi ý máy rảnh cho ${nMc}/${newTasks.length} công đoạn (ưu tiên 1 máy/công đoạn). Hãy kiểm tra ca/ngày rồi Lưu.`);
      }
    } catch (e) { if (!silent) toast.error("Lỗi: " + e.message); }
  };
  const applyProcess = () => genFromProcess(f.product_id, f.quantity, meta ? {
    defaults: { shift: meta.shift, assigned_team: meta.assigned_team, assigned_worker: meta.assigned_worker, machine_id: meta.machine_id, planned_date: meta.planned_date?.slice(0, 10) },
  } : {});

  const [editing, setEditing] = useState(!editId); // tạo mới = sửa ngay; mở sẵn = xem
  const [meta, setMeta] = useState(null); // dữ liệu lệnh đã nạp (mã lệnh, SP, đơn...) cho tem QR

  // Nạp dữ liệu khi sửa
  const loadData = useCallback(() => {
    if (!editId) return;
    production.get(editId).then((d) => {
      setMeta(d);
      setF({
        product_id: d.product_id, customer_id: d.customer_id || "", quantity: d.quantity, unit: d.unit || "",
        attr_size: d.attr_size || "", attr_thickness: d.attr_thickness || "", attr_color: d.attr_color || "",
        due_date: d.due_date?.slice(0, 10) || "", note: d.note || "", priority: d.priority || "Trung bình"
      });
      const saved = new Map((d.finishing || []).map((x) => [x.name, !!x.checked]));
      const names = [...new Set([...(lookups.finishingOptions || []), ...saved.keys()])];
      setFinishing(names.map((name) => ({ name, checked: saved.get(name) || false })));
      production.getTasks(editId).then((rows) => {
        if (rows && rows.length) {
          setTasks(rows.map((t, i) => ({
            _k: i + 1, task_code: t.task_code, stage: t.stage, quantity: t.quantity, actual_qty: t.actual_qty ?? "", scrap_qty: t.scrap_qty ?? "",
            machine_id: t.machine_id || "", shift: t.shift || "",
            planned_date: t.planned_date?.slice(0, 10) || "", planned_end_date: t.planned_end_date?.slice(0, 10) || "",
            assigned_team: t.assigned_team || "", assigned_worker: t.assigned_worker || "", status: t.status,
          })));
          setTaskSeq(rows.length + 1);
        } else {
          // Mặc định: chưa có phân công → tự dựng theo quy trình công nghệ, SL = SL lệnh
          // Kế thừa ca/đội/công nhân/máy đã phân bổ ở màn Kế hoạch (lưu ở cấp lệnh)
          genFromProcess(d.product_id, d.quantity, {
            silent: true,
            defaults: { shift: d.shift, assigned_team: d.assigned_team, assigned_worker: d.assigned_worker, machine_id: d.machine_id, planned_date: d.planned_date?.slice(0, 10) },
          });
        }
      }).catch(() => {});
    }).catch((e) => toast.error("Lỗi tải lệnh sản xuất: " + e.message));
  }, [editId]); // eslint-disable-line
  useEffect(() => { loadData(); }, [loadData]);

  // Sao chép từ lệnh nguồn → lệnh mới (không copy phân công; sẽ tự dựng theo quy trình khi mở sửa)
  useEffect(() => {
    if (editId || !copyId) return;
    production.get(copyId).then((d) => {
      setF({
        product_id: d.product_id, customer_id: d.customer_id || "", quantity: d.quantity, unit: d.unit || "",
        attr_size: d.attr_size || "", attr_thickness: d.attr_thickness || "", attr_color: d.attr_color || "",
        due_date: d.due_date?.slice(0, 10) || "", note: d.note || "", priority: d.priority || "Trung bình"
      });
      const saved = new Map((d.finishing || []).map((x) => [x.name, !!x.checked]));
      const names = [...new Set([...(lookups.finishingOptions || []), ...saved.keys()])];
      setFinishing(names.map((name) => ({ name, checked: saved.get(name) || false })));
    }).catch((e) => toast.error("Lỗi tải lệnh nguồn: " + e.message));
  }, [copyId, editId]); // eslint-disable-line

  // auto đổ đơn vị theo sản phẩm + tự dựng phân công theo quy trình (khi tạo mới)
  const onProduct = (id) => {
    const p = lookups.products.find((x) => x.id === id);
    setF((s) => ({ ...s, product_id: id, unit: p?.unit || s.unit }));
    if (!editId && id) genFromProcess(id, f.quantity, { silent: true });
  };
  // đổi SL lệnh → đồng bộ vào các phân công chưa có sản lượng thực tế
  const onQuantity = (v) => {
    setF((s) => ({ ...s, quantity: v }));
    setTasks((a) => a.map((t) => (t.actual_qty === "" || t.actual_qty == null ? { ...t, quantity: v } : t)));
  };

  const save = async () => {
    if (!f.product_id) return toast.error("Vui lòng chọn Sản phẩm");
    if (!f.quantity || Number(f.quantity) <= 0) return toast.error("Vui lòng nhập Số lượng hợp lệ");
    try {
      if (editId) {
        await production.update(editId, { ...f, finishing });
        await production.saveTasks(editId, tasks.filter((t) => t.stage));
        toast.success("Lưu lệnh sản xuất thành công");
      } else {
        await production.create({ ...f, finishing });
        toast.success("Tạo lệnh sản xuất mới thành công");
      }
      onSaved();
    } catch (e) { toast.error("Lỗi lưu lệnh sản xuất: " + e.message); }
  };

  const del = async () => {
    if (!confirm("Xóa lệnh sản xuất này?")) return;
    try { await production.remove(editId); toast.success("Đã xóa lệnh sản xuất thành công"); onSaved(); } catch (e) { toast.error("Lỗi xóa: " + e.message); }
  };

  return (
    <div className="space-y-5">
      <PageHeader title={!editId ? (copyId ? "Tạo lệnh sản xuất (sao chép)" : "Tạo lệnh sản xuất") : editing ? "Sửa lệnh sản xuất" : "Chi tiết lệnh sản xuất"} onBack={onBack}
        actions={editId && !editing ? (<>
          {can("production", "edit") && <button onClick={() => setEditing(true)} className="btn-ghost"><Pencil size={16} /> Sửa</button>}
          {can("production", "delete") && <button onClick={del} className="btn-ghost" style={{ color: "#e11d48" }}><Trash2 size={16} /> Xóa</button>}
        </>) : (<>
          {editId && <button onClick={() => { setEditing(false); loadData(); }} className="btn-ghost">Hủy</button>}
          <button onClick={save} className="btn-primary"><Save size={16} /> Lưu lệnh sản xuất</button>
        </>)} />

      <fieldset disabled={!editing} className="space-y-5">
      <Section title="Thông tin sản xuất cơ bản">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          {!fhid("product_id") && <Field label="Sản phẩm" required>
            <select className={inputCls} disabled={fdis("product_id")} value={f.product_id} onChange={(e) => onProduct(e.target.value)}>
              <option value="">-- Chọn sản phẩm --</option>
              {lookups.products.map((p) => <option key={p.id} value={p.id}>{p.product_code} · {p.product_name}</option>)}
            </select>
          </Field>}
          {!fhid("customer_id") && <Field label="Khách hàng">
            <select className={inputCls} disabled={fdis("customer_id")} value={f.customer_id} onChange={(e) => set("customer_id", e.target.value)}>
              <option value="">-- Không / Khách lẻ --</option>
              {lookups.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>}
          {!fhid("quantity") && <Field label="Số lượng cần sản xuất" required>
            <input type="number" min="0" className={inputCls} disabled={fdis("quantity")} value={f.quantity} onChange={(e) => onQuantity(e.target.value)} />
          </Field>}
          <Field label="Đơn vị">
            <UnitSelect value={f.unit} onChange={(v) => set("unit", v)} />
          </Field>
          <Field label="Ngày giao (deadline)">
            <input type="date" className={inputCls} value={f.due_date} onChange={(e) => set("due_date", e.target.value)} />
          </Field>
          {!fhid("priority") && <Field label="Độ ưu tiên">
            <select className={inputCls} disabled={fdis("priority")} value={f.priority} onChange={(e) => set("priority", e.target.value)}>
              <option value="Cao">Cao (Gấp)</option>
              <option value="Trung bình">Trung bình</option>
              <option value="Thấp">Thấp</option>
            </select>
          </Field>}
          <Field label="Ghi chú">
            <input className={inputCls} value={f.note} onChange={(e) => set("note", e.target.value)} />
          </Field>
        </div>
      </Section>

      {editId && meta && (() => {
        const target = Number(f.quantity) || 0;
        const produced = Number(meta.produced_qty) || 0;
        const scrap = Number(meta.scrap_qty) || 0;
        const pctDone = target > 0 ? Math.min(100, Math.round((produced / target) * 100)) : 0;
        const pctScrap = produced + scrap > 0 ? Math.round((scrap / (produced + scrap)) * 100) : 0;
        const remain = Math.max(0, target - produced);
        const stat = (label, value, sub, cls = "text-slate-800") => (
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <div className="text-xs text-slate-500 mb-1">{label}</div>
            <div className={`text-2xl font-bold ${cls}`}>{value}</div>
            {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
          </div>
        );
        return (
          <Section title="Kết quả thực tế">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {stat("Trạng thái", <span className={`inline-flex px-2.5 py-0.5 rounded-full text-sm font-medium ${statusClass(meta.status)}`}>{meta.status}</span>, `${meta.task_done || 0}/${meta.task_count || 0} việc xong`)}
              {stat("Số lượng cần SX", fmt(target), f.unit)}
              {stat("Đã sản xuất", fmt(produced), `Còn lại ${fmt(remain)} ${f.unit || ""}`, pctDone >= 100 ? "text-emerald-600" : "text-blue-600")}
              {stat("% đã sản xuất", pctDone + "%", null, pctDone >= 100 ? "text-emerald-600" : "text-blue-600")}
              {stat("Phế phẩm", fmt(scrap), f.unit, scrap > 0 ? "text-rose-600" : "text-slate-800")}
              {stat("% phế phẩm", pctScrap + "%", "trên tổng SX", pctScrap > 0 ? "text-rose-600" : "text-slate-800")}
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Tiến độ sản xuất</span><span>{fmt(produced)}/{fmt(target)} {f.unit}</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full rounded-full ${pctDone >= 100 ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${Math.max(pctDone, 2)}%` }} />
              </div>
            </div>
          </Section>
        );
      })()}

      {!fhid("attributes") && (
      <Section title={<>Thông số đặc thù <span className="text-slate-400 font-normal">(kế thừa xuyên suốt)</span></>}>
        <fieldset disabled={fdis("attributes")}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Chiều dài (Cm)">
            <input className={inputCls} list="sizes" value={(f.attr_size || "").split('x')[0] || ""} onChange={(e) => {
              const r = (f.attr_size || "").split('x')[1] || "";
              set("attr_size", e.target.value ? `${e.target.value}x${r}` : (r ? `x${r}` : ""));
            }} placeholder="vd: 30" />
            <datalist id="sizes">{(lookups.sizes || []).map((s) => <option key={s} value={s.split('x')[0]} />)}</datalist>
          </Field>
          <Field label="Chiều rộng (Cm)">
            <input className={inputCls} value={(f.attr_size || "").split('x')[1] || ""} onChange={(e) => {
              const d = (f.attr_size || "").split('x')[0] || "";
              set("attr_size", e.target.value ? `${d}x${e.target.value}` : (d ? `${d}x` : ""));
            }} placeholder="vd: 20" />
          </Field>
          <Field label="Độ dày">
            <input className={inputCls} list="thicknesses" value={f.attr_thickness} onChange={(e) => set("attr_thickness", e.target.value)} placeholder="vd: 20mic" />
            <datalist id="thicknesses">{(lookups.thicknesses || []).map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="Màu sắc">
            <input className={inputCls} list="colors" value={f.attr_color} onChange={(e) => set("attr_color", e.target.value)} placeholder="vd: Trắng sữa" />
            <datalist id="colors">{(lookups.colors || []).map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
        </div>
        </fieldset>
      </Section>
      )}

      {!fhid("finishing") && (
      <Section title="Yêu cầu gia công hoàn thiện">
        <fieldset disabled={fdis("finishing")}>
        <div className="flex flex-wrap gap-3">
          {finishing.map((x, i) => (
            <label key={x.name} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition ${
              x.checked ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <input type="checkbox" checked={x.checked} onChange={() => toggleFin(i)} className="w-4 h-4 accent-blue-600" />
              {x.name}
            </label>
          ))}
        </div>
        </fieldset>
      </Section>
      )}

      {editId && !fhid("tasks") && (
        <Section title="Phân công sản xuất — chia lệnh nhỏ (công đoạn + sản lượng)"
          action={!fdis("tasks") && <div className="flex gap-2">
            <button onClick={applyProcess} className="btn-ghost text-blue-600 border-blue-200 hover:bg-blue-50"><GitBranch size={16} /> Theo quy trình</button>
            <button onClick={addTask} className="btn-ghost text-blue-600 border-blue-200 hover:bg-blue-50"><Plus size={16} /> Thêm phân công</button>
          </div>}>
          <fieldset disabled={fdis("tasks")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="text-slate-400 text-xs uppercase">
                <tr>
                  <th className="text-left py-2 font-medium min-w-[110px]">Công đoạn</th>
                  <th className="text-left py-2 font-medium min-w-[110px]">Sản lượng</th>
                  <th className="text-left py-2 font-medium min-w-[180px]">Máy</th>
                  <th className="text-left py-2 font-medium min-w-[100px]">Ca</th>
                  <th className="text-left py-2 font-medium min-w-[140px]">Từ ngày</th>
                  <th className="text-left py-2 font-medium min-w-[140px]">Đến ngày</th>
                  <th className="text-left py-2 font-medium min-w-[130px]">Đội</th>
                  <th className="text-left py-2 font-medium min-w-[160px]">Công nhân</th>
                  <th className="text-left py-2 font-medium min-w-[100px]">Thực tế</th>
                  <th className="text-left py-2 font-medium min-w-[100px]">Phế phẩm</th>
                  <th className="text-left py-2 font-medium min-w-[130px]">Trạng thái</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const factory = t.stage === "Thổi" ? "Nhà máy thổi" : "Nhà máy cắt";
                  const machinesForStage = lookups.machines.filter((m) => m.factory === factory);
                  return (
                    <tr key={t._k}>
                      <td className="py-1.5 pr-2"><select className={inputCls} value={t.stage} onChange={(e) => upTask(t._k, "stage", e.target.value)}><option>Thổi</option><option>Cắt</option></select></td>
                      <td className="py-1.5 pr-2"><input type="number" min="0" className={inputCls} value={t.quantity} onChange={(e) => upTask(t._k, "quantity", e.target.value)} /></td>
                      <td className="py-1.5 pr-2"><select className={inputCls} value={t.machine_id} onChange={(e) => upTask(t._k, "machine_id", e.target.value)}><option value="">-- Chọn máy --</option>{machinesForStage.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></td>
                      <td className="py-1.5 pr-2"><select className={inputCls} value={t.shift} onChange={(e) => upTask(t._k, "shift", e.target.value)}><option value="">--</option>{(lookups.shifts || []).map((c) => <option key={c}>{c}</option>)}</select></td>
                      <td className="py-1.5 pr-2"><input type="date" className={inputCls} value={t.planned_date} onChange={(e) => upTask(t._k, "planned_date", e.target.value)} /></td>
                      <td className="py-1.5 pr-2"><input type="date" className={inputCls} value={t.planned_end_date} onChange={(e) => upTask(t._k, "planned_end_date", e.target.value)} /></td>
                      <td className="py-1.5 pr-2">
                        <select className={inputCls} value={t.assigned_team} onChange={(e) => setTaskTeam(t._k, e.target.value)}>
                          <option value="">-- Đội --</option>
                          {teams.map((tm) => <option key={tm}>{tm}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 pr-2">
                        <select className={inputCls} value={t.assigned_worker} onChange={(e) => upTask(t._k, "assigned_worker", e.target.value)}>
                          <option value="">-- Công nhân --</option>
                          {workersOf(t.assigned_team).map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 pr-2"><input type="number" min="0" className={inputCls} value={t.actual_qty} onChange={(e) => upTask(t._k, "actual_qty", e.target.value)} placeholder="SL thực" /></td>
                      <td className="py-1.5 pr-2"><input type="number" min="0" className={inputCls} value={t.scrap_qty} onChange={(e) => upTask(t._k, "scrap_qty", e.target.value)} /></td>
                      <td className="py-1.5 pr-2"><select className={inputCls} value={t.status} onChange={(e) => upTask(t._k, "status", e.target.value)}><option>Chờ</option><option>Đang sản xuất</option><option>Hoàn thành</option><option>Đã hủy</option></select></td>
                      <td className="py-1.5 text-center"><button onClick={() => rmTask(t._k)} className="text-slate-400 hover:text-rose-600 p-1"><Trash2 size={16} /></button></td>
                    </tr>
                  );
                })}
                {!tasks.length && <tr><td colSpan={11} className="py-4 text-center text-slate-400 text-sm">Chưa có phân công. Bấm "Thêm phân công" để chia lệnh nhỏ.</td></tr>}
              </tbody>
            </table>
          </div>
          <datalist id="emp-dl">{(lookups.employees || []).map((e) => <option key={e.id} value={e.name} />)}</datalist>
          <div className="mt-3 text-sm flex gap-6">
            {["Thổi", "Cắt"].map((stg) => {
              const sum = tasks.filter((t) => t.stage === stg).reduce((s, t) => s + (Number(t.quantity) || 0), 0);
              if (!sum) return null;
              const ok = sum === Number(f.quantity);
              return <span key={stg} className={ok ? "text-emerald-600 font-medium" : "text-amber-600"}>Σ {stg}: {fmt(sum)} / {fmt(f.quantity)} {ok ? "✓" : "(≠ SL lệnh)"}</span>;
            })}
          </div>
          </fieldset>
        </Section>
      )}
      </fieldset>

      {editId && (
        <Section title="Mã truy xuất các lô"
          action={tasks.some((t) => t.task_code) && <button onClick={() => window.print()} className="btn-ghost"><Printer size={16} /> In danh sách</button>}>
          <div className="po-qr-area flex flex-wrap gap-3">
            {tasks.filter((t) => t.task_code).map((t) => (
              <div key={t._k} className="label-card flex flex-col gap-2 border border-slate-300 rounded-lg p-3 bg-white" style={{ width: 220 }}>
                <div className="text-[12px] leading-snug text-slate-700 min-w-0">
                  <div className="font-semibold text-slate-800">{t.task_code}</div>
                  <div className="text-slate-400">{meta?.order_code} · {t.stage} ({t.stage === "Cắt" ? "TP" : "BTP"})</div>
                  <div className="truncate">{meta?.product_name}</div>
                  <div>{[meta?.attr_color, meta?.attr_size, meta?.attr_thickness].filter(Boolean).join(" · ") || "—"}</div>
                  <div>SL: <b>{fmt(t.quantity)} {meta?.unit}</b></div>
                  <div className="text-slate-400">{fmtDate(t.planned_date)}</div>
                </div>
              </div>
            ))}
            {!tasks.some((t) => t.task_code) && <p className="text-sm text-slate-400">Chưa có lô. Thêm phân công và Lưu để sinh tem QR cho từng lô.</p>}
          </div>
          <style>{`@media print { body * { visibility:hidden!important; } .po-qr-area, .po-qr-area * { visibility:visible!important; } .po-qr-area { position:absolute; left:0; top:0; } .label-card { break-inside:avoid; } }`}</style>
        </Section>
      )}
    </div>
  );
}

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 mb-1.5">
      {label} {required && <span className="text-rose-500">*</span>}
    </label>
    {children}
  </div>
);

/* ---- Module chính ---- */
/* ---- Modal lập lịch (popup) ---- */
export function ScheduleModal({ lookups, order, onClose, onSaved }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    production.getTasks(order.id).then((d) => {
      setTasks(d);
      setLoading(false);
    }).catch(e => { toast.error("Lỗi tải phân công: " + e.message); onClose(); });
  }, [order.id, onClose]);

  const save = async () => {
    try {
      await production.saveTasks(order.id, tasks.filter(t => t.stage));
      toast.success("Lưu lịch phân công thành công");
      onSaved();
    } catch (e) {
      toast.error("Lỗi lưu lập lịch: " + e.message);
    }
  };

  const setTask = (id, k, v) => setTasks(ts => ts.map(t => t.id === id ? { ...t, [k]: v } : t));

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">Phân công - {order.order_code}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">&times;</button>
        </div>
        <div className="p-4 overflow-y-auto">
          {loading ? <p className="text-slate-500">Đang tải...</p> : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Công đoạn</th>
                    <th className="px-3 py-2 text-left">Máy</th>
                    <th className="px-3 py-2 text-left">Ngày</th>
                    <th className="px-3 py-2 text-left">Ca</th>
                    <th className="px-3 py-2 text-left">Nhân công</th>
                    <th className="px-3 py-2 text-left">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tasks.length === 0 && <tr><td colSpan="6" className="p-4 text-center text-slate-500">Lệnh chưa được chia công đoạn. Vui lòng vào Chi tiết lệnh để Phân công.</td></tr>}
                  {tasks.map(t => {
                    const dis = t.status === "Hoàn thành" || t.status === "Đã hủy" || t.status === "Đang sản xuất";
                    return (
                      <tr key={t.id}>
                        <td className="px-3 py-2 font-medium text-slate-700">{t.stage}</td>
                        <td className="px-3 py-2">
                          <select disabled={dis} className={inputCls} value={t.machine_id || ""} onChange={e => setTask(t.id, "machine_id", e.target.value)}>
                            <option value="">- Chọn máy -</option>
                            {(lookups.machines || []).filter(m => !t.stage || m.machine_type?.toLowerCase().includes(t.stage.toLowerCase())).map(m => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input disabled={dis} type="date" className={inputCls} value={t.planned_date?.slice(0, 10) || ""} onChange={e => setTask(t.id, "planned_date", e.target.value)} />
                        </td>
                        <td className="px-3 py-2">
                          <input disabled={dis} className={inputCls} placeholder="VD: Ca 1" value={t.shift || ""} onChange={e => setTask(t.id, "shift", e.target.value)} />
                        </td>
                        <td className="px-3 py-2">
                          <input disabled={dis} className={inputCls} placeholder="Nhân công..." value={t.assigned_worker || ""} onChange={e => setTask(t.id, "assigned_worker", e.target.value)} />
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(t.status)}`}>{t.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-lg">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Hủy</button>
          <button onClick={save} disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"><Save size={16}/> Lưu thay đổi</button>
        </div>
      </div>
    </div>
  );
}

export default function ProductionModule({ lookups, focusId, onFocusConsumed, onExit }) {
  const { can } = usePerm();
  const [view, setView] = useState("list");
  const [mode, setMode] = useState("table"); // table | gantt
  const [editId, setEditId] = useState(null);
  const [copyId, setCopyId] = useState(null);
  const [scheduling, setScheduling] = useState(null);
  const [rows, setRows] = useState([]);
  const [cameFromFocus, setCameFromFocus] = useState(false); // mở từ module khác → back về đúng chỗ

  const load = useCallback(async () => {
    try { setRows(await production.list({})); }
    catch (e) { toast.error("Lỗi tải lệnh sản xuất: " + e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Mở sẵn chi tiết lệnh khi được điều hướng từ module khác (vd: Kế hoạch)
  useEffect(() => {
    if (focusId) { setEditId(focusId); setView("form"); setCameFromFocus(true); onFocusConsumed?.(); }
  }, [focusId]);

  const openForm = ({ edit = null, copy = null } = {}) => { setEditId(edit); setCopyId(copy); setView("form"); };
  const backFromForm = () => {
    setCopyId(null);
    if (cameFromFocus && onExit) { setCameFromFocus(false); setEditId(null); onExit(); }
    else { setView("list"); setEditId(null); }
  };

  const del = async (id) => {
    if (!confirm("Xóa lệnh sản xuất này?")) return;
    try { await production.remove(id); toast.success("Đã xóa lệnh sản xuất thành công"); load(); } catch (e) { toast.error("Lỗi xóa: " + e.message); }
  };

  if (view === "form")
    return <ProductionForm lookups={lookups} editId={editId} copyId={copyId}
      onBack={backFromForm}
      onSaved={() => { setView("list"); setEditId(null); setCopyId(null); load(); }} />;

  const columns = [
    { key: "order_code", label: "Mã lệnh", filter: "text", render: (r) => <button onClick={() => openForm({ edit: r.id })} className="font-medium text-blue-600 hover:underline">{r.order_code}</button> },
    { key: "product_name", label: "Sản phẩm", filter: "text", tdClass: "text-slate-800" },
    { key: "customer_name", label: "Khách hàng", filter: "text", tdClass: "text-slate-600", render: (r) => r.customer_name || "—" },
    { key: "quantity", label: "SL", align: "right", render: (r) => `${fmt(r.quantity)} ${r.unit || ""}` },
    { key: "attr_color", label: "Màu", filter: "select", render: (r) => r.attr_color || "—" },
    { key: "attr_size", label: "Kích thước", filter: "select", render: (r) => r.attr_size || "—" },
    { key: "machine_name", label: "Máy", filter: "select", render: (r) => r.machine_name_display || r.machine_name || <span className="text-slate-400">Chưa xếp</span> },
    { key: "planned_date", label: "Ngày SX", filter: "date", render: (r) => {
        const d = r.planned_date_display || r.planned_date;
        const s = r.shift_display || r.shift;
        if (!d && !s) return "—";
        return `${d ? fmtDate(d) : ""}${s ? " · " + s : ""}`.replace(/^ · | · $/, '');
      } },
    { key: "due_date", label: "Ngày giao", filter: "date", render: (r) => fmtDate(r.due_date) },
    { key: "_progress", label: "Tiến độ", render: (r) => r.task_count > 0 ? (
        <div className="w-28">
          <div className="flex justify-between text-xs text-slate-500 mb-0.5">
            <span>{fmt(r.produced_qty)}/{fmt(r.quantity)}</span>
            <span>{Math.min(100, Math.round((Number(r.produced_qty) / Number(r.quantity)) * 100))}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full rounded-full ${Number(r.produced_qty) >= Number(r.quantity) ? "bg-emerald-500" : "bg-blue-500"}`}
              style={{ width: `${Math.max(Math.min(100, (Number(r.produced_qty) / Number(r.quantity)) * 100), 2)}%` }} />
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{r.task_done}/{r.task_count} việc xong{Number(r.scrap_qty) > 0 && <span className="text-rose-500"> · phế {fmt(r.scrap_qty)}</span>}</div>
        </div>
      ) : <span className="text-slate-400 text-xs">Chưa phân công</span> },
    { key: "priority", label: "Ưu tiên", filter: "select", render: (r) => {
        if (r.priority === 'Cao') return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-rose-100 text-rose-700 whitespace-nowrap">Cao</span>;
        if (r.priority === 'Thấp') return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 whitespace-nowrap">Thấp</span>;
        return <span className="text-slate-500 text-xs whitespace-nowrap">Trung bình</span>;
      } },
    { key: "status", label: "Trạng thái", filter: "select", render: (r) => <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass(r.status)}`}>{r.status}</span> },
    { key: "_act", label: "", align: "right", render: (r) => (<>
        <button onClick={() => setScheduling(r)} disabled={!can("production", "update")} className="text-slate-400 hover:text-blue-600 p-1" title="Lập lịch / xếp máy"><CalendarClock size={16} /></button>
        {can("production", "create") && <button onClick={() => openForm({ copy: r.id })} title="Sao chép" className="text-slate-400 hover:text-blue-600 p-1"><Copy size={16} /></button>}
        <button onClick={() => del(r.id)} title="Xóa" className="text-slate-400 hover:text-rose-600 p-1"><Trash2 size={16} /></button>
      </>) },
  ];

  return (
    <div className="space-y-5">
      <ListHeader title="Lệnh sản xuất" actions={<>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
          <button onClick={() => setMode("table")} className={`flex items-center gap-1.5 px-3 py-1.5 ${mode === "table" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}><List size={15} /> Bảng</button>
          <button onClick={() => setMode("gantt")} className={`flex items-center gap-1.5 px-3 py-1.5 ${mode === "gantt" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}><GanttChartSquare size={15} /> Gantt</button>
        </div>
        {can("production", "create") && <button onClick={() => openForm({})} className="btn-primary"><Plus size={16} /> Tạo lệnh SX</button>}
      </>} />

      {mode === "gantt" && <ProductionGantt onOpenOrder={(id) => openForm({ edit: id })} />}

      {mode === "table" && <DataTable dense columns={columns} rows={rows} rowKey={(r) => r.id} emptyText="Chưa có lệnh sản xuất" />}
      {scheduling && <ScheduleModal lookups={lookups} order={scheduling} onClose={() => setScheduling(null)} onSaved={() => { setScheduling(null); load(); }} />}
    </div>
  );
}
