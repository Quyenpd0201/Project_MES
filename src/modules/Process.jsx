import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Pencil, ArrowLeft, Save, GitBranch, ArrowRight, ArrowDown } from "lucide-react";
import { processes } from "../mesApi.js";
import { inputCls, fmt, statusClass } from "../ui.js";
import { PageHeader, Section, ListHeader, usePager } from "../components.jsx";
import { usePerm } from "../perm.jsx";

const procApi = processes;

const Field = ({ label, required, children }) => (
  <div><label className="block text-sm font-medium text-slate-600 mb-1.5">{label} {required && <span className="text-rose-500">*</span>}</label>{children}</div>
);

/* ---- Lưu đồ quy trình ---- */
function FlowChart({ steps, pname }) {
  if (!steps.length) return <p className="text-sm text-slate-400">Chưa có bước nào để vẽ lưu đồ.</p>;
  return (
    <div className="flex flex-wrap items-stretch gap-2 overflow-x-auto py-2">
      {steps.map((s, i) => (
        <React.Fragment key={s._k ?? i}>
          <div className="min-w-[200px] flex-1 border border-slate-300 rounded-xl bg-white overflow-hidden">
            <div className="px-3 py-2 bg-blue-600 text-white text-sm font-semibold">Bước {i + 1}: {s.name || "(chưa đặt tên)"}</div>
            <div className="p-3 space-y-2 text-sm">
              {s.machine_type && <div className="text-xs text-slate-400">{s.machine_type}</div>}
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5">
                <div className="text-[11px] text-slate-400">Đầu vào</div>
                <div className="font-medium text-slate-700">{pname(s.input_product_id) || "—"}</div>
              </div>
              <div className="flex justify-center text-slate-300"><ArrowDown size={16} /></div>
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5">
                <div className="text-[11px] text-emerald-600">Đầu ra</div>
                <div className="font-medium text-emerald-800">{pname(s.output_product_id) || "—"}</div>
              </div>
              <div className="flex gap-2 text-xs">
                {s.yield_percent !== "" && s.yield_percent != null && <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">TP {fmt(s.yield_percent)}%</span>}
                {s.scrap_percent !== "" && s.scrap_percent != null && <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">Phế {fmt(s.scrap_percent)}%</span>}
              </div>
            </div>
          </div>
          {i < steps.length - 1 && <div className="flex items-center text-slate-400 shrink-0"><ArrowRight size={22} /></div>}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ---- Form quy trình ---- */
function ProcessForm({ lookups, editId, onBack, onSaved }) {
  const { can } = usePerm();
  const [editing, setEditing] = useState(!editId);
  const [f, setF] = useState({ name: "", product_id: "", status: "Hoạt động", note: "" });
  const [steps, setSteps] = useState([]);
  const [seq, setSeq] = useState(1);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const pname = (id) => lookups.products.find((p) => p.id === id)?.product_name;

  const loadData = useCallback(() => {
    if (!editId) return;
    procApi.get(editId).then((d) => {
      setF({ name: d.name, product_id: d.product_id || "", status: d.status, note: d.note || "" });
      setSteps((d.steps || []).map((s, i) => ({
        _k: i + 1, name: s.name, machine_type: s.machine_type || "", input_product_id: s.input_product_id || "",
        output_product_id: s.output_product_id || "", yield_percent: s.yield_percent ?? "", scrap_percent: s.scrap_percent ?? "",
      })));
      setSeq((d.steps?.length || 0) + 1);
    }).catch((e) => alert("Lỗi tải quy trình: " + e.message));
  }, [editId]);
  useEffect(() => { loadData(); }, [loadData]);

  const addStep = () => { setSteps((a) => [...a, { _k: seq, name: "", machine_type: "", input_product_id: "", output_product_id: "", yield_percent: "", scrap_percent: "" }]); setSeq((s) => s + 1); };
  const rmStep = (k) => setSteps((a) => a.filter((x) => x._k !== k));
  const upStep = (k, fld, v) => setSteps((a) => a.map((x) => (x._k === k ? { ...x, [fld]: v } : x)));

  const save = async () => {
    if (!f.name) return alert("Nhập tên quy trình");
    try {
      const payload = { ...f, steps: steps.filter((s) => s.name) };
      if (editId) { await procApi.update(editId, payload); loadData(); setEditing(false); }
      else { await procApi.create(payload); onSaved(); }
    } catch (e) { alert("Lỗi lưu: " + e.message); }
  };
  const del = async () => { if (!confirm("Xóa quy trình này?")) return; try { await procApi.remove(editId); onSaved(); } catch (e) { alert("Lỗi xóa: " + e.message); } };

  return (
    <div className="space-y-5">
      <PageHeader title={!editId ? "Tạo quy trình công nghệ" : editing ? "Sửa quy trình" : "Chi tiết quy trình công nghệ"} onBack={onBack}
        actions={editId && !editing ? (<>
          {can("process", "edit") && <button onClick={() => setEditing(true)} className="btn-ghost"><Pencil size={16} /> Sửa</button>}
          {can("process", "delete") && <button onClick={del} className="btn-ghost" style={{ color: "#e11d48" }}><Trash2 size={16} /> Xóa</button>}
        </>) : (<>
          {editId && <button onClick={() => { setEditing(false); loadData(); }} className="btn-ghost">Hủy</button>}
          <button onClick={save} className="btn-primary"><Save size={16} /> Lưu quy trình</button>
        </>)} />

      <fieldset disabled={!editing} className="space-y-5">
        <Section title="Thông tin chung">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
            <Field label="Tên quy trình" required><input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="vd: Quy trình túi HD" /></Field>
            <Field label="Thành phẩm cuối">
              <select className={inputCls} value={f.product_id} onChange={(e) => set("product_id", e.target.value)}>
                <option value="">-- Chọn --</option>
                {lookups.products.map((p) => <option key={p.id} value={p.id}>{p.product_code} · {p.product_name}</option>)}
              </select>
            </Field>
            <Field label="Trạng thái"><select className={inputCls} value={f.status} onChange={(e) => set("status", e.target.value)}><option>Hoạt động</option><option>Không hoạt động</option></select></Field>
            <Field label="Ghi chú"><input className={inputCls} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>
          </div>
        </Section>

        <Section title="Các bước công đoạn" action={<button onClick={addStep} className="btn-ghost text-blue-600 border-blue-200 hover:bg-blue-50"><Plus size={16} /> Thêm bước</button>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="text-slate-400 text-xs uppercase">
                <tr>
                  <th className="text-left py-2 font-medium w-12">Bước</th>
                  <th className="text-left py-2 font-medium">Công đoạn</th>
                  <th className="text-left py-2 font-medium w-36">Máy / Xưởng</th>
                  <th className="text-left py-2 font-medium">NVL/BTP vào</th>
                  <th className="text-left py-2 font-medium">BTP/TP ra</th>
                  <th className="text-left py-2 font-medium w-24">% TP</th>
                  <th className="text-left py-2 font-medium w-24">% phế</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {steps.map((s, i) => (
                  <tr key={s._k}>
                    <td className="py-1.5 pr-2 text-center text-slate-500">{i + 1}</td>
                    <td className="py-1.5 pr-2"><input className={inputCls} value={s.name} onChange={(e) => upStep(s._k, "name", e.target.value)} placeholder="Thổi màng…" /></td>
                    <td className="py-1.5 pr-2"><input className={inputCls} value={s.machine_type} onChange={(e) => upStep(s._k, "machine_type", e.target.value)} placeholder="Xưởng thổi" /></td>
                    <td className="py-1.5 pr-2"><select className={inputCls} value={s.input_product_id} onChange={(e) => upStep(s._k, "input_product_id", e.target.value)}><option value="">-- Chọn --</option>{lookups.products.map((p) => <option key={p.id} value={p.id}>{p.product_code} · {p.product_name}</option>)}</select></td>
                    <td className="py-1.5 pr-2"><select className={inputCls} value={s.output_product_id} onChange={(e) => upStep(s._k, "output_product_id", e.target.value)}><option value="">-- Chọn --</option>{lookups.products.map((p) => <option key={p.id} value={p.id}>{p.product_code} · {p.product_name}</option>)}</select></td>
                    <td className="py-1.5 pr-2"><input type="number" min="0" className={inputCls} value={s.yield_percent} onChange={(e) => upStep(s._k, "yield_percent", e.target.value)} /></td>
                    <td className="py-1.5 pr-2"><input type="number" min="0" className={inputCls} value={s.scrap_percent} onChange={(e) => upStep(s._k, "scrap_percent", e.target.value)} /></td>
                    <td className="py-1.5 text-center"><button onClick={() => rmStep(s._k)} className="text-slate-400 hover:text-rose-600 p-1"><Trash2 size={16} /></button></td>
                  </tr>
                ))}
                {!steps.length && <tr><td colSpan={8} className="py-4 text-center text-slate-400 text-sm">Chưa có bước. Bấm "Thêm bước".</td></tr>}
              </tbody>
            </table>
          </div>
        </Section>
      </fieldset>

      <Section title={<span className="flex items-center gap-2"><GitBranch size={16} className="text-blue-500" /> Lưu đồ quy trình</span>}>
        <FlowChart steps={steps} pname={pname} />
      </Section>
    </div>
  );
}

/* ---- Module chính ---- */
export default function ProcessModule({ lookups }) {
  const { can } = usePerm();
  const [view, setView] = useState("list");
  const [editId, setEditId] = useState(null);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const { slice, Pager, Filler } = usePager(rows);
  const load = useCallback(async () => { try { setRows(await procApi.list({ q })); } catch (e) { alert("Lỗi tải quy trình: " + e.message); } }, [q]);
  useEffect(() => { load(); }, [load]);
  const del = async (id) => { if (!confirm("Xóa quy trình này?")) return; try { await procApi.remove(id); load(); } catch (e) { alert("Lỗi xóa: " + e.message); } };

  if (view === "form") return <ProcessForm lookups={lookups} editId={editId} onBack={() => { setView("list"); setEditId(null); }} onSaved={() => { setView("list"); setEditId(null); load(); }} />;

  return (
    <div className="space-y-5">
      <ListHeader title="Quy trình công nghệ" actions={
        can("process", "create") && <button onClick={() => { setEditId(null); setView("form"); }} className="btn-primary"><Plus size={16} /> Tạo quy trình</button>
      } />
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <input placeholder="Tìm mã / tên quy trình" className={inputCls + " md:w-1/2"} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>{["Mã", "Tên quy trình", "Thành phẩm", "Số bước", "Trạng thái", ""].map((h) => <th key={h} className="text-left px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {slice.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3"><button onClick={() => { setEditId(r.id); setView("form"); }} className="font-medium text-blue-600 hover:underline">{r.process_code}</button></td>
                <td className="px-4 py-3 text-slate-800">{r.name}</td>
                <td className="px-4 py-3 text-slate-600">{r.product_name || "—"}</td>
                <td className="px-4 py-3 text-center">{r.step_count}</td>
                <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass(r.status)}`}>{r.status}</span></td>
                <td className="px-4 py-3 text-right">
                  {can("process", "delete") && <button onClick={() => del(r.id)} className="text-slate-400 hover:text-rose-600 p-1"><Trash2 size={15} /></button>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Chưa có quy trình</td></tr>}
            <Filler cols={6} />
          </tbody>
        </table>
      </div>
      <Pager />
    </div>
  );
}
