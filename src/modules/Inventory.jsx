import React, { useState, useEffect, useCallback } from "react";
import { RotateCcw, PackagePlus, Save, Warehouse, History, ExternalLink, Plus, Trash2, ChevronRight, Layers, Boxes } from "lucide-react";
import { ListHeader, DataTable, PageHeader, Section } from "../components.jsx";
import { inventory } from "../mesApi.js";
import { usePerm } from "../perm.jsx";
import {  inputCls, fmt, fmtDate, statusClass , toast } from "../ui.js";
import { PRODUCT_SPECS, splitNU, specShort } from "../specs.js";

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 mb-1.5">
      {label} {required && <span className="text-rose-500">*</span>}
    </label>
    {children}
  </div>
);

/* Bộ ô nhập thông số kỹ thuật (dùng ở Nhập/Xuất & thêm dòng tồn) */
function SpecFields({ specs, onChange, disabled, cls = inputCls }) {
  const get = (n) => specs?.[n] || "";
  const setV = (n, v) => { const next = { ...specs }; if (v) next[n] = v; else delete next[n]; onChange(next); };
  return (
    <>
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
    </>
  );
}

function AdjustModal({ lookups, onClose, onSaved }) {
  const [f, setF] = useState({ product_id: "", trx_type: "Nhập", quantity: "", unit: "", location_id: "", lot_code: "", note: "" });
  const [specs, setSpecs] = useState({});
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const onProduct = (id) => {
    const p = lookups.products.find((x) => x.id === id);
    setF((s) => ({ ...s, product_id: id, unit: p?.unit || s.unit }));
  };
  const save = async () => {
    if (!f.product_id) return toast.error("Chọn sản phẩm");
    if (!f.quantity || Number(f.quantity) <= 0) return toast.error("Nhập số lượng hợp lệ");
    try { await inventory.adjust({ ...f, specs }); onSaved(); }
    catch (e) { toast.error("Lỗi: " + e.message); }
  };
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-800">Nhập / Xuất / Điều chỉnh tồn</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Sản phẩm" required>
            <select className={inputCls} value={f.product_id} onChange={(e) => onProduct(e.target.value)}>
              <option value="">-- Chọn --</option>
              {lookups.products.map((p) => <option key={p.id} value={p.id}>{p.product_code} · {p.product_name}</option>)}
            </select>
          </Field>
          <Field label="Loại giao dịch" required>
            <select className={inputCls} value={f.trx_type} onChange={(e) => set("trx_type", e.target.value)}>
              <option>Nhập</option><option>Xuất</option><option>Điều chỉnh</option>
            </select>
          </Field>
          <Field label="Số lượng" required>
            <input type="number" min="0" className={inputCls} value={f.quantity} onChange={(e) => set("quantity", e.target.value)} />
          </Field>
          <Field label="Đơn vị">
            <input className={inputCls} list="units" value={f.unit} onChange={(e) => set("unit", e.target.value)} />
          </Field>
          <Field label="Vị trí lưu trữ">
            <select className={inputCls} value={f.location_id} onChange={(e) => set("location_id", e.target.value)}>
              <option value="">-- Không xác định --</option>
              {lookups.locations.map((l) => <option key={l.id} value={l.id}>{l.warehouse_name} · {l.name}</option>)}
            </select>
          </Field>
          <Field label="Lô sản xuất">
            <input className={inputCls} value={f.lot_code} placeholder="VD: LSX00007 / Thủ công" onChange={(e) => set("lot_code", e.target.value)} />
          </Field>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase mb-1.5">Thông số kỹ thuật</div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <SpecFields specs={specs} onChange={setSpecs} />
          </div>
        </div>
        <Field label="Ghi chú"><input className={inputCls} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost">Hủy</button>
          <button onClick={save} className="btn-primary"><Save size={16} /> Lưu</button>
        </div>
      </div>
    </div>
  );
}

/* ---- Tab Tồn kho: cây 3 cấp Sản phẩm → Nhóm thông số → Lô sản xuất ---- */
function TreeTab({ lookups }) {
  const { can } = usePerm();
  const [data, setData] = useState([]);
  const [q, setQ] = useState("");
  const [openP, setOpenP] = useState(() => new Set());
  const [openG, setOpenG] = useState(() => new Set());
  const [adjusting, setAdjusting] = useState(false);

  const load = useCallback(async () => {
    try { setData(await inventory.tree({})); } catch (e) { toast.error("Lỗi tải tồn kho: " + e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = (set, setSet, key) => { const n = new Set(set); n.has(key) ? n.delete(key) : n.add(key); setSet(n); };
  const norm = (s) => (s || "").toString().toLowerCase();
  const rows = data.filter((p) => !q || norm(p.product_code).includes(norm(q)) || norm(p.product_name).includes(norm(q)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <input className={inputCls + " max-w-xs"} placeholder="Tìm mã / tên sản phẩm…" value={q} onChange={(e) => setQ(e.target.value)} />
        {(can("inventory", "edit") || can("inventory", "create")) &&
          <button onClick={() => setAdjusting(true)} className="btn-primary"><PackagePlus size={16} /> Nhập / Xuất kho</button>}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Tiêu đề cột */}
        <div className="grid grid-cols-12 px-4 py-2.5 bg-slate-50 text-slate-500 text-xs uppercase tracking-wide font-semibold border-b border-slate-100">
          <div className="col-span-7">Sản phẩm / Nhóm thông số / Lô</div>
          <div className="col-span-3">Kho · Vị trí</div>
          <div className="col-span-2 text-right">Tồn</div>
        </div>

        {rows.length === 0 && <div className="px-4 py-10 text-center text-slate-400 text-sm">Chưa có tồn kho</div>}

        {rows.map((p) => {
          const pOpen = openP.has(p.product_id);
          return (
            <div key={p.product_id} className="border-b border-slate-100 last:border-0">
              {/* Cấp 1: Sản phẩm */}
              <button onClick={() => toggle(openP, setOpenP, p.product_id)}
                className="w-full grid grid-cols-12 px-4 py-3 items-center hover:bg-slate-50/70 text-left">
                <div className="col-span-7 flex items-center gap-2 min-w-0">
                  <ChevronRight size={16} className={`text-slate-400 transition-transform shrink-0 ${pOpen ? "rotate-90" : ""}`} />
                  <Boxes size={16} className="text-blue-500 shrink-0" />
                  <span className="font-semibold text-blue-600 shrink-0">{p.product_code}</span>
                  <span className="text-slate-700 truncate">{p.product_name}</span>
                  <span className={`ml-1 inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${statusClass(p.product_type)}`}>{p.product_type}</span>
                  <span className="text-xs text-slate-400">· {p.groups.length} nhóm</span>
                </div>
                <div className="col-span-3 text-slate-400 text-sm">—</div>
                <div className="col-span-2 text-right font-bold text-slate-800">{fmt(p.total)} <span className="text-xs font-normal text-slate-500">{p.unit}</span></div>
              </button>

              {/* Cấp 2: Nhóm thông số kỹ thuật */}
              {pOpen && p.groups.map((g) => {
                const gkey = p.product_id + "|" + g.spec_key;
                const gOpen = openG.has(gkey);
                const label = specShort(g.specs) || "(không có thông số)";
                return (
                  <div key={gkey} className="bg-slate-50/40">
                    <button onClick={() => toggle(openG, setOpenG, gkey)}
                      className="w-full grid grid-cols-12 px-4 py-2.5 items-center hover:bg-slate-100/60 text-left border-t border-slate-100">
                      <div className="col-span-7 flex items-center gap-2 pl-6 min-w-0">
                        <ChevronRight size={14} className={`text-slate-400 transition-transform shrink-0 ${gOpen ? "rotate-90" : ""}`} />
                        <Layers size={14} className="text-violet-500 shrink-0" />
                        <span className="text-slate-700 text-sm truncate">{label}</span>
                        <span className="text-xs text-slate-400 shrink-0">· {g.lots.length} lô</span>
                      </div>
                      <div className="col-span-3 text-slate-400 text-sm">—</div>
                      <div className="col-span-2 text-right font-semibold text-slate-700">{fmt(g.total)} <span className="text-xs font-normal text-slate-400">{p.unit}</span></div>
                    </button>

                    {/* Cấp 3: Các lô sản xuất */}
                    {gOpen && g.lots.map((lot) => (
                      <div key={lot.id} className="grid grid-cols-12 px-4 py-2 items-center border-t border-slate-100 text-sm">
                        <div className="col-span-7 flex items-center gap-2 pl-14 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                          <span className="font-medium text-slate-600 shrink-0">{lot.lot_code || "(không lô)"}</span>
                          {lot.expiry_date && <span className="text-xs text-slate-400">· HSD {fmtDate(lot.expiry_date)}</span>}
                        </div>
                        <div className="col-span-3 text-slate-500">{lot.warehouse_name ? `${lot.warehouse_name}${lot.location_name ? " · " + lot.location_name : ""}` : "(chưa xác định)"}</div>
                        <div className={`col-span-2 text-right font-medium ${Number(lot.quantity) < 0 ? "text-rose-600" : "text-slate-700"}`}>{fmt(lot.quantity)} <span className="text-xs font-normal text-slate-400">{lot.unit || p.unit}</span></div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {adjusting && <AdjustModal lookups={lookups} onClose={() => setAdjusting(false)} onSaved={() => { setAdjusting(false); load(); }} />}
    </div>
  );
}

/* ---- Tab: Lịch sử giao dịch kho ---- */
const TRX_COLOR = { "Nhập": "bg-emerald-50 text-emerald-700", "Xuất": "bg-rose-50 text-rose-700", "Điều chỉnh": "bg-amber-50 text-amber-700" };
function TransactionsTab() {
  const [rows, setRows] = useState([]);
  const load = useCallback(async () => {
    try { setRows(await inventory.transactions({})); } catch (e) { toast.error("Lỗi tải lịch sử: " + e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const columns = [
    { key: "created_at", label: "Thời gian", filter: "date", tdClass: "text-slate-500", render: (t) => new Date(t.created_at).toLocaleString("vi-VN") },
    { key: "trx_type", label: "Loại", filter: "select", render: (t) => <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${TRX_COLOR[t.trx_type] || ""}`}>{t.trx_type}</span> },
    { key: "product_code", label: "Mã SP", filter: "text", tdClass: "font-medium text-blue-600" },
    { key: "product_name", label: "Sản phẩm", filter: "text", tdClass: "text-slate-800" },
    { key: "_specs", label: "Thông số", filter: "text", tdClass: "text-slate-500",
      filterValue: (t) => specShort(t.specs),
      render: (t) => specShort(t.specs) || "—" },
    { key: "lot_code", label: "Lô", filter: "text", tdClass: "text-slate-600", render: (t) => t.lot_code || "—" },
    { key: "quantity", label: "Số lượng", align: "right", render: (t) => <span className={`font-semibold ${t.trx_type === "Xuất" ? "text-rose-600" : "text-emerald-600"}`}>{t.trx_type === "Xuất" ? "−" : "+"}{fmt(t.quantity)}</span> },
    { key: "warehouse_name", label: "Kho/Vị trí", filter: "select", tdClass: "text-slate-600", render: (t) => t.warehouse_name ? `${t.warehouse_name} · ${t.location_name}` : "—" },
    { key: "ref_code", label: "Chứng từ", filter: "text", tdClass: "text-slate-600", render: (t) => t.ref_code || "—" },
    { key: "note", label: "Ghi chú", filter: "text", tdClass: "text-slate-400", render: (t) => t.note || "" },
  ];

  return <DataTable dense columns={columns} rows={rows} rowKey={(t) => t.id} emptyText="Chưa có giao dịch" />;
}

/* ---- Hub Kho ---- */
export default function InventoryModule({ lookups }) {
  const [tab, setTab] = useState("stock");
  const tabs = [
    { key: "stock", label: "Tồn kho", icon: Warehouse },
    { key: "trx", label: "Lịch sử giao dịch", icon: History },
  ];

  return (
    <div className="space-y-5">
      <ListHeader title="Kho" actions={
        <button onClick={load} className="btn-ghost"><RotateCcw size={16} /> Làm mới</button>
      } />
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition flex items-center gap-2 ${
              tab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>
      {tab === "stock" ? <TreeTab lookups={lookups} /> : <TransactionsTab />}
    </div>
  );
}
