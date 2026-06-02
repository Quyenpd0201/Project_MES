import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Pencil, ArrowLeft, Save, FlaskConical } from "lucide-react";
import { resource } from "../mesApi.js";
import { usePerm } from "../perm.jsx";
import { inputCls, fmt, statusClass } from "../ui.js";
import { PageHeader, Section, ListHeader, usePager } from "../components.jsx";

const bomApi = resource("boms");
const BOM_TYPES = ["Định mức NVL", "Công thức pha màu"];

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 mb-1.5">
      {label} {required && <span className="text-rose-500">*</span>}
    </label>
    {children}
  </div>
);

/* ---- Form định mức ---- */
function BomForm({ lookups, editId, onBack, onSaved }) {
  const { can, fperm } = usePerm();
  const fhid = (k) => fperm("bom", k) === "hidden";
  const fdis = (k) => fperm("bom", k) !== "edit";
  const outputs = lookups.products.filter((p) => ["Thành phẩm", "Bán thành phẩm"].includes(p.product_type));
  const materials = lookups.products.filter((p) => ["NVL", "Bán thành phẩm"].includes(p.product_type));

  const [f, setF] = useState({
    product_id: "", name: "", bom_type: "Định mức NVL",
    output_quantity: 1, output_unit: "", status: "Hoạt động", note: "",
  });
  const [lines, setLines] = useState([{ _k: 1, material_id: "", quantity: "", unit: "", ratio_percent: "", note: "" }]);
  const [seq, setSeq] = useState(2);
  const [editing, setEditing] = useState(!editId); // tạo mới = sửa ngay; mở sẵn = xem
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const loadData = useCallback(() => {
    if (!editId) return;
    bomApi.get(editId).then((d) => {
      setF({ product_id: d.product_id, name: d.name, bom_type: d.bom_type,
        output_quantity: d.output_quantity, output_unit: d.output_unit || "", status: d.status, note: d.note || "" });
      setLines((d.lines || []).map((l, i) => ({
        _k: i + 1, material_id: l.material_id, quantity: l.quantity, unit: l.unit || "",
        ratio_percent: l.ratio_percent ?? "", note: l.note || "" })));
      setSeq((d.lines?.length || 0) + 1);
    }).catch((e) => alert("Lỗi tải định mức: " + e.message));
  }, [editId]);
  useEffect(() => { loadData(); }, [loadData]);

  const addLine = () => { setLines((a) => [...a, { _k: seq, material_id: "", quantity: "", unit: "", ratio_percent: "", note: "" }]); setSeq((s) => s + 1); };
  const rmLine = (k) => setLines((a) => a.filter((x) => x._k !== k));
  const upLine = (k, field, v) => setLines((a) => a.map((x) => (x._k === k ? { ...x, [field]: v } : x)));

  const isColor = f.bom_type === "Công thức pha màu";
  const ratioSum = lines.reduce((s, l) => s + (Number(l.ratio_percent) || 0), 0);

  const save = async () => {
    if (!f.product_id) return alert("Chọn sản phẩm đầu ra");
    if (!f.name) return alert("Nhập tên định mức");
    const payload = { ...f, lines: lines.filter((l) => l.material_id) };
    try {
      if (editId) await bomApi.update(editId, payload); else await bomApi.create(payload);
      onSaved();
    } catch (e) { alert("Lỗi lưu định mức: " + e.message); }
  };

  const del = async () => {
    if (!confirm("Xóa định mức này?")) return;
    try { await bomApi.remove(editId); onSaved(); } catch (e) { alert("Lỗi xóa: " + e.message); }
  };

  return (
    <div className="space-y-5">
      <PageHeader title={!editId ? "Tạo định mức / công thức" : editing ? "Sửa định mức / công thức" : "Chi tiết định mức / công thức"} onBack={onBack}
        actions={editId && !editing ? (<>
          {can("bom", "edit") && <button onClick={() => setEditing(true)} className="btn-ghost"><Pencil size={16} /> Sửa</button>}
          {can("bom", "delete") && <button onClick={del} className="btn-ghost" style={{ color: "#e11d48" }}><Trash2 size={16} /> Xóa</button>}
        </>) : (<>
          {editId && <button onClick={() => { setEditing(false); loadData(); }} className="btn-ghost">Hủy</button>}
          <button onClick={save} className="btn-primary"><Save size={16} /> Lưu định mức</button>
        </>)} />

      <fieldset disabled={!editing} className="space-y-5">

      <Section title="Thông tin chung">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          {!fhid("product_id") && <Field label="Sản phẩm đầu ra" required>
            <select className={inputCls} disabled={fdis("product_id")} value={f.product_id} onChange={(e) => set("product_id", e.target.value)}>
              <option value="">-- Chọn TP / BTP --</option>
              {outputs.map((p) => <option key={p.id} value={p.id}>{p.product_code} · {p.product_name}</option>)}
            </select>
          </Field>}
          {!fhid("bom_type") && <Field label="Loại định mức" required>
            <select className={inputCls} disabled={fdis("bom_type")} value={f.bom_type} onChange={(e) => set("bom_type", e.target.value)}>
              {BOM_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>}
          {!fhid("name") && <Field label="Tên định mức" required>
            <input className={inputCls} disabled={fdis("name")} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="vd: Công thức pha màu Trắng sữa" />
          </Field>}
          <div className="grid grid-cols-2 gap-3">
            {!fhid("output_quantity") && <Field label="Định mức cho SL"><input type="number" min="0" className={inputCls} disabled={fdis("output_quantity")} value={f.output_quantity} onChange={(e) => set("output_quantity", e.target.value)} /></Field>}
            <Field label="Đơn vị"><input className={inputCls} value={f.output_unit} onChange={(e) => set("output_unit", e.target.value)} placeholder="kg, cái..." /></Field>
          </div>
          <Field label="Trạng thái">
            <select className={inputCls} value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option>Hoạt động</option><option>Không hoạt động</option>
            </select>
          </Field>
          <Field label="Ghi chú"><input className={inputCls} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>
        </div>
      </Section>

      {!fhid("lines") && (
      <Section
        title={<span className="flex items-center gap-2">{isColor && <FlaskConical size={16} className="text-blue-500" />}{isColor ? "Thành phần pha (NVL / phụ gia)" : "Nguyên liệu / bán thành phẩm đầu vào"}</span>}
        action={!fdis("lines") && <button onClick={addLine} className="btn-ghost text-blue-600 border-blue-200 hover:bg-blue-50"><Plus size={16} /> Thêm dòng</button>}>
        <fieldset disabled={fdis("lines")}>
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left py-2 font-medium">Nguyên liệu</th>
              <th className="text-left py-2 font-medium w-24">Số lượng</th>
              <th className="text-left py-2 font-medium w-20">Đơn vị</th>
              {isColor && <th className="text-left py-2 font-medium w-20">Tỷ lệ %</th>}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l._k}>
                <td className="py-1.5 pr-2">
                  <select className={inputCls} value={l.material_id} onChange={(e) => upLine(l._k, "material_id", e.target.value)}>
                    <option value="">-- Chọn NVL/BTP --</option>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.product_code} · {m.product_name}</option>)}
                  </select>
                </td>
                <td className="py-1.5 pr-2"><input type="number" min="0" className={inputCls} value={l.quantity} onChange={(e) => upLine(l._k, "quantity", e.target.value)} /></td>
                <td className="py-1.5 pr-2"><input className={inputCls} value={l.unit} onChange={(e) => upLine(l._k, "unit", e.target.value)} /></td>
                {isColor && <td className="py-1.5 pr-2"><input type="number" min="0" className={inputCls} value={l.ratio_percent} onChange={(e) => upLine(l._k, "ratio_percent", e.target.value)} /></td>}
                <td className="py-1.5 text-center">
                  <button onClick={() => rmLine(l._k)} className="text-slate-400 hover:text-rose-600 p-1"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isColor && (
          <div className={`mt-3 text-sm font-medium ${Math.abs(ratioSum - 100) < 0.01 ? "text-emerald-600" : "text-amber-600"}`}>
            Tổng tỷ lệ: {ratioSum}% {Math.abs(ratioSum - 100) < 0.01 ? "✓" : "(nên = 100%)"}
          </div>
        )}
        </fieldset>
      </Section>
      )}
      </fieldset>
    </div>
  );
}

/* ---- Module chính ---- */
export default function BomModule({ lookups }) {
  const { can } = usePerm();
  const [view, setView] = useState("list");
  const [editId, setEditId] = useState(null);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const { slice, Pager, Filler } = usePager(rows);

  const load = useCallback(async () => {
    try { setRows(await bomApi.list({ q })); } catch (e) { alert("Lỗi tải định mức: " + e.message); }
  }, [q]);
  useEffect(() => { load(); }, [load]);

  const del = async (id) => {
    if (!confirm("Xóa định mức này?")) return;
    try { await bomApi.remove(id); load(); } catch (e) { alert("Lỗi xóa: " + e.message); }
  };

  if (view === "form")
    return <BomForm lookups={lookups} editId={editId} onBack={() => { setView("list"); setEditId(null); }}
      onSaved={() => { setView("list"); setEditId(null); load(); }} />;

  return (
    <div className="space-y-5">
      <ListHeader title="Định mức / Công thức (BOM)" actions={
        can("bom", "create") && <button onClick={() => { setEditId(null); setView("form"); }} className="btn-primary"><Plus size={16} /> Tạo định mức</button>
      } />
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <input placeholder="Tìm mã / tên định mức / sản phẩm" className={inputCls + " md:w-1/2"} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>{["Mã", "Tên định mức", "Sản phẩm đầu ra", "Loại", "Số dòng", "Định mức", "Trạng thái", ""].map((h) =>
              <th key={h} className="text-left px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {slice.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <button onClick={() => { setEditId(r.id); setView("form"); }} className="font-medium text-blue-600 hover:underline">{r.bom_code}</button>
                </td>
                <td className="px-4 py-3 text-slate-800">{r.name}</td>
                <td className="px-4 py-3 text-slate-600">{r.product_name}</td>
                <td className="px-4 py-3">{r.bom_type === "Công thức pha màu"
                  ? <span className="inline-flex items-center gap-1 text-blue-600"><FlaskConical size={14} /> {r.bom_type}</span> : r.bom_type}</td>
                <td className="px-4 py-3 text-center">{r.line_count}</td>
                <td className="px-4 py-3">{fmt(r.output_quantity)} {r.output_unit}</td>
                <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass(r.status)}`}>{r.status}</span></td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => { setEditId(r.id); setView("form"); }} className="text-slate-400 hover:text-blue-600 p-1"><Pencil size={15} /></button>
                  <button onClick={() => del(r.id)} className="text-slate-400 hover:text-rose-600 p-1"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Chưa có định mức</td></tr>}
            <Filler cols={8} />
          </tbody>
        </table>
      </div>
      <Pager />
    </div>
  );
}
