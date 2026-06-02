import React, { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard, Package, ShoppingCart, Warehouse, Search, Plus, Trash2,
  Upload, Download, RotateCcw, ArrowLeft, Save, CheckCircle2, Activity, Cog,
  Factory, ClipboardList, Database, FlaskConical, ChevronDown, Users, Wrench, MapPin, Pencil, Clock, CalendarDays, QrCode, ScanLine, Shield, ShieldCheck, UserCog, LogOut, GitBranch,
} from "lucide-react";
import { getLookups, getDashboard, auth, setToken } from "./src/mesApi.js";
import Login from "./src/Login.jsx";
import UsersModule from "./src/modules/Users.jsx";
import { PermProvider, usePerm } from "./src/perm.jsx";
import { fmt, fmtDate, statusClass } from "./src/ui.js";
import ProductionModule from "./src/modules/Production.jsx";
import PlanningModule from "./src/modules/Planning.jsx";
import InventoryModule from "./src/modules/Inventory.jsx";
import MasterDataScreen from "./src/modules/MasterData.jsx";
import BomModule from "./src/modules/Bom.jsx";
import OrdersModule from "./src/modules/Orders.jsx";
import WorkScheduleModule from "./src/modules/WorkSchedule.jsx";
import QrLabelsModule from "./src/modules/QrLabels.jsx";
import QrScanModule from "./src/modules/QrScan.jsx";
import ProcessModule from "./src/modules/Process.jsx";
import PermissionsModule from "./src/modules/Permissions.jsx";
import { PageHeader, Section, ListHeader, usePager } from "./src/components.jsx";

/* =====================================================================
   MES — Quản lý Sản phẩm & Dashboard (single-file demo)
   - Mock API thay cho backend Node/Express khi chạy artifact.
   - Trọng tâm: ProductForm xử lý thêm/xóa dòng "Thuộc tính sản phẩm".
   ===================================================================== */

/* ----------------------------- Mock data ----------------------------- */
const PRODUCT_TYPES = ["Thành phẩm", "Bán thành phẩm", "NVL", "Dịch vụ"];
const ATTRIBUTE_NAMES = ["Kích thước", "Độ dày", "Màu sắc", "Trọng lượng", "Chất liệu"];
const AREAS = ["Xưởng thổi", "Xưởng cắt"];

/* ----------------------------- API client ----------------------------- */
/* Gọi backend Node/Express thật. Đổi VITE_API_BASE nếu API chạy nơi khác. */
const API_BASE = import.meta.env?.VITE_API_BASE || "http://localhost:4000";

async function http(path, opts) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j?.message) msg = j.message; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

const api = {
  // Trả về mảng sản phẩm (lấy field data từ response phân trang)
  list: async ({ code, name, type, area } = {}) => {
    const q = new URLSearchParams();
    if (code) q.set("code", code);
    if (name) q.set("name", name);
    if (type) q.set("type", type);
    if (area) q.set("area", area);
    q.set("pageSize", "100");
    const { data } = await http(`/api/products?${q.toString()}`);
    return data;
  },
  get: (id) => http(`/api/products/${id}`),
  create: (payload) => http(`/api/products`, { method: "POST", body: JSON.stringify(payload) }),
  update: (id, payload) => http(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  remove: (id) => http(`/api/products/${id}`, { method: "DELETE" }),
};

/* ----------------------------- UI helpers ----------------------------- */
const StatusBadge = ({ status }) => {
  const active = status === "Hoạt động";
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
      active ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-rose-500"}`} />
      {status}
    </span>
  );
};

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 mb-1.5">
      {label} {required && <span className="text-rose-500">*</span>}
    </label>
    {children}
  </div>
);

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition";

/* ============================== SIDEBAR ============================== */
function Sidebar({ active, onNav, user, onLogout }) {
  const allItems = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, always: true },
    { key: "products", label: "Sản phẩm", icon: Package },
    { key: "bom", label: "Định mức (BOM)", icon: FlaskConical },
    { key: "process", label: "Quy trình CN", icon: GitBranch },
    { key: "orders", label: "Đơn hàng", icon: ShoppingCart },
    { key: "planning", label: "Kế hoạch", icon: ClipboardList },
    { key: "production", label: "Sản xuất", icon: Factory },
    { key: "qrlabels", label: "Tem QR", icon: QrCode },
    { key: "qrscan", label: "Quét QR", icon: ScanLine },
    { key: "workschedule", label: "Lịch làm việc", icon: CalendarDays },
    { key: "inventory", label: "Tồn kho", icon: Warehouse },
    { key: "permissions", label: "Phân quyền", icon: ShieldCheck, adminOnly: true },
    { key: "users", label: "Tài khoản", icon: UserCog, adminOnly: true },
    {
      key: "masterdata", label: "Danh mục", icon: Database, perm: "masterdata",
      children: [
        { key: "md:customers", label: "Khách hàng", icon: Users },
        { key: "md:machines", label: "Máy móc", icon: Wrench },
        { key: "md:employees", label: "Nhân viên", icon: Users },
        { key: "md:shifts", label: "Ca làm việc", icon: Clock },
        { key: "md:warehouses", label: "Kho", icon: Warehouse },
        { key: "md:locations", label: "Vị trí lưu trữ", icon: MapPin },
        { key: "md:roles", label: "Vai trò", icon: Shield },
      ],
    },
  ];
  const isAdmin = !!user?.is_admin;
  const canSee = (it) => {
    if (isAdmin || it.always) return true;
    if (it.adminOnly) return false;
    return !!user?.permissions?.[it.perm || it.key]?.view;
  };
  const items = allItems.filter(canSee);
  const [expanded, setExpanded] = useState({});
  const itemCls = (on) =>
    `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
      on ? "bg-blue-600 text-white" : "hover:bg-slate-800 hover:text-white"}`;

  return (
    <aside className="w-60 shrink-0 bg-slate-900 text-slate-300 h-screen flex flex-col">
      <div className="px-4 py-5 border-b border-slate-800 shrink-0">
        <div className="bg-white rounded-lg px-3 py-2.5">
          <img src="/logo.png" alt="Bao Bì Ngọc An Thư" className="w-full h-auto" />
        </div>
        <div className="text-[11px] text-slate-400 mt-2 text-center">Bao Bì Ngọc An Thư · Hệ thống MES</div>
      </div>
      <nav className="nav-scroll flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1">
        {items.map((it) => {
          const Icon = it.icon;
          if (it.children) {
            const childActive = it.children.some((c) => c.key === active);
            const open = expanded[it.key] ?? childActive;
            return (
              <div key={it.key}>
                <button onClick={() => setExpanded((e) => ({ ...e, [it.key]: !(e[it.key] ?? childActive) }))}
                  className={itemCls(false)}>
                  <Icon size={18} /> <span className="flex-1 text-left">{it.label}</span>
                  <ChevronDown size={16} className={`transition ${open ? "rotate-180" : ""}`} />
                </button>
                {open && (
                  <div className="mt-1 ml-4 pl-3 border-l border-slate-700 space-y-1">
                    {it.children.map((c) => (
                      <button key={c.key} onClick={() => onNav(c.key)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                          active === c.key ? "bg-blue-600 text-white" : "hover:bg-slate-800 hover:text-white"}`}>
                        <c.icon size={15} /> {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          const on = active === it.key || (it.key === "products" && (active === "product-form" || active === "product-detail"));
          return (
            <button key={it.key} onClick={() => onNav(it.key)} className={itemCls(on)}>
              <Icon size={18} /> {it.label}
            </button>
          );
        })}
      </nav>
      <div className="px-4 py-3 border-t border-slate-800 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
            {(user?.full_name || user?.username || "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm text-white truncate">{user?.full_name || user?.username}</div>
            <div className="text-[11px] text-slate-400 truncate">{user?.role_name || (user?.is_admin ? "Quản trị" : "—")}</div>
          </div>
        </div>
        <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition">
          <LogOut size={16} /> Đăng xuất
        </button>
      </div>
    </aside>
  );
}

/* ============================ PRODUCT LIST ============================ */
function ProductList({ onOpen, onCreate }) {
  const { can } = usePerm();
  const [filters, setFilters] = useState({ area: "", code: "", name: "", type: "" });
  const [rows, setRows] = useState([]);
  const { slice, Pager, Filler } = usePager(rows);

  const load = useCallback(async () => {
    try { setRows(await api.list(filters)); }
    catch (e) { console.error(e); alert("Lỗi tải danh sách: " + e.message); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const reset = () => setFilters({ area: "", code: "", name: "", type: "" });
  const del = async (id) => {
    if (!confirm("Xóa sản phẩm này?")) return;
    try { await api.remove(id); load(); }
    catch (e) { alert("Lỗi xóa sản phẩm: " + e.message); }
  };

  return (
    <div className="space-y-5">
      <ListHeader title="Danh sách sản phẩm" actions={<>
        <button className="btn-ghost"><Download size={16} /> Xuất file</button>
        <button className="btn-ghost"><Upload size={16} /> Nhập file</button>
        <button onClick={reset} className="btn-ghost"><RotateCcw size={16} /> Đặt lại</button>
        {can("products", "create") && <button onClick={onCreate} className="btn-primary"><Plus size={16} /> Thêm mới</button>}
      </>} />

      {/* Search bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <select value={filters.area} onChange={(e) => setFilters({ ...filters, area: e.target.value })} className={inputCls}>
          <option value="">Đơn vị sản xuất</option>
          {AREAS.map((a) => <option key={a}>{a}</option>)}
        </select>
        <input placeholder="Mã sản phẩm" value={filters.code}
          onChange={(e) => setFilters({ ...filters, code: e.target.value })} className={inputCls} />
        <input placeholder="Tên sản phẩm" value={filters.name}
          onChange={(e) => setFilters({ ...filters, name: e.target.value })} className={inputCls} />
        <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className={inputCls}>
          <option value="">Loại sản phẩm</option>
          {PRODUCT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Mã SP</th>
              <th className="text-left px-4 py-3 font-semibold">Tên sản phẩm</th>
              <th className="text-left px-4 py-3 font-semibold">Trạng thái</th>
              <th className="text-left px-4 py-3 font-semibold">Loại</th>
              <th className="text-left px-4 py-3 font-semibold">Mô tả</th>
              <th className="text-center px-4 py-3 font-semibold">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {slice.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <button onClick={() => onOpen(p.id)} className="text-blue-600 font-medium hover:underline">
                    {p.product_code}
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-800">{p.product_name}</td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-3 text-slate-600">{p.product_type}</td>
                <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{p.description}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => del(p.id)} className="text-slate-400 hover:text-rose-600 transition p-1">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Không có dữ liệu</td></tr>
            )}
            <Filler cols={6} />
          </tbody>
        </table>
      </div>
      <Pager />
    </div>
  );
}

/* ===== Trường thông tin sản phẩm — DÙNG CHUNG cho màn xem & sửa ===== */
/* disabled=true → chế độ xem (chỉ đọc); false → chỉnh sửa. Cùng một layout. */
function ProductFields({ form, set, attributes, addAttr, removeAttr, updateAttr, disabled }) {
  const { fperm } = usePerm();
  const hid = (k) => fperm("products", k) === "hidden";
  const dis = (k) => disabled || fperm("products", k) !== "edit";
  const cls = (k, extra = "") => inputCls + extra + (dis(k) ? " bg-slate-50 text-slate-800" : "");
  return (
    <>
      <Section title="Thông tin chung">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          {!hid("product_name") && <Field label="Tên sản phẩm" required>
            <input className={cls("product_name")} disabled={dis("product_name")} value={form.product_name} onChange={(e) => set("product_name", e.target.value)} />
          </Field>}
          {!hid("production_area") && <Field label="Khu vực sản xuất">
            <select className={cls("production_area")} disabled={dis("production_area")} value={form.production_area || ""} onChange={(e) => set("production_area", e.target.value)}>
              <option value="">-- Chọn --</option>{AREAS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </Field>}
          {!hid("category") && <Field label="Danh mục">
            <input className={cls("category")} disabled={dis("category")} value={form.category || ""} onChange={(e) => set("category", e.target.value)} />
          </Field>}
          {!hid("product_type") && <Field label="Loại sản phẩm" required>
            <select className={cls("product_type")} disabled={dis("product_type")} value={form.product_type} onChange={(e) => set("product_type", e.target.value)}>
              {PRODUCT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>}
          {!hid("product_group") && <Field label="Nhóm sản phẩm">
            <input className={cls("product_group")} disabled={dis("product_group")} value={form.product_group || ""} onChange={(e) => set("product_group", e.target.value)} />
          </Field>}
          {!hid("unit") && <Field label="Đơn vị tính">
            <input className={cls("unit")} disabled={dis("unit")} value={form.unit || ""} onChange={(e) => set("unit", e.target.value)} placeholder="kg, cái, cuộn..." />
          </Field>}
          {!hid("barcode_type") && <Field label="Loại mã vạch">
            <select className={cls("barcode_type")} disabled={dis("barcode_type")} value={form.barcode_type || ""} onChange={(e) => set("barcode_type", e.target.value)}>
              <option value="">-- Chọn --</option><option>CODE128</option><option>QR</option><option>EAN13</option>
            </select>
          </Field>}
          {!hid("tracking_type") && <Field label="Hình thức theo dõi">
            <select className={cls("tracking_type")} disabled={dis("tracking_type")} value={form.tracking_type || ""} onChange={(e) => set("tracking_type", e.target.value)}>
              <option>Theo lô</option><option>Theo serial</option>
            </select>
          </Field>}
          {!hid("description") && <Field label="Mô tả">
            <input className={cls("description")} disabled={dis("description")} value={form.description || ""} onChange={(e) => set("description", e.target.value)} />
          </Field>}
          <div className="flex items-end gap-6">
            {!hid("is_pqc_required") && <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" disabled={dis("is_pqc_required")} checked={!!form.is_pqc_required}
                onChange={(e) => set("is_pqc_required", e.target.checked)} className="w-4 h-4 accent-blue-600" />
              Cần kiểm tra PQC
            </label>}
            {!hid("status") && <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" disabled={dis("status")} checked={form.status === "Hoạt động"}
                onChange={(e) => set("status", e.target.checked ? "Hoạt động" : "Không hoạt động")}
                className="w-4 h-4 accent-emerald-600" />
              Hoạt động
            </label>}
          </div>
        </div>
      </Section>

      {!hid("attributes") && (
      <Section title="Thuộc tính sản phẩm"
        action={!dis("attributes") && <button onClick={addAttr} className="btn-ghost text-blue-600 border-blue-200 hover:bg-blue-50"><Plus size={16} /> Thêm thuộc tính</button>}>
        {attributes.length === 0 && (
          <p className="text-sm text-slate-400 py-4 text-center">{dis("attributes") ? "Không có thuộc tính" : 'Chưa có thuộc tính. Bấm "Thêm thuộc tính".'}</p>
        )}
        <div className="space-y-2">
          {attributes.map((attr) => (
            <div key={attr._key} className="flex items-center gap-3 attr-row">
              <select className={cls("attributes", " flex-1")} disabled={dis("attributes")} value={attr.name}
                onChange={(e) => updateAttr(attr._key, "name", e.target.value)}>
                <option value="">-- Tên thuộc tính --</option>
                {[...new Set([...ATTRIBUTE_NAMES, attr.name].filter(Boolean))].map((n) => <option key={n}>{n}</option>)}
              </select>
              <input className={cls("attributes", " flex-1")} disabled={dis("attributes")} placeholder="Giá trị" value={attr.value}
                onChange={(e) => updateAttr(attr._key, "value", e.target.value)} />
              {!dis("attributes") && (
                <button onClick={() => removeAttr(attr._key)}
                  className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition">
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          ))}
        </div>
      </Section>
      )}
    </>
  );
}

/* ============================ PRODUCT FORM ============================ */
function ProductForm({ productId, onBack, onSaved }) {
  const [form, setForm] = useState({
    product_name: "", production_area: "", category: "", product_type: "Thành phẩm",
    product_group: "", unit: "", barcode_type: "", tracking_type: "Theo lô",
    is_pqc_required: false, status: "Hoạt động", description: "",
  });
  // mỗi attr có _key ổn định để React render mượt khi thêm/xóa
  const [attributes, setAttributes] = useState([{ _key: 1, name: "", value: "" }]);
  const [keySeq, setKeySeq] = useState(2);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Nạp dữ liệu khi sửa
  useEffect(() => {
    if (!productId) return;
    api.get(productId).then((d) => {
      setForm({
        product_name: d.product_name || "", production_area: d.production_area || "", category: d.category || "",
        product_type: d.product_type || "Thành phẩm", product_group: d.product_group || "", unit: d.unit || "",
        barcode_type: d.barcode_type || "", tracking_type: d.tracking_type || "Theo lô",
        is_pqc_required: !!d.is_pqc_required, status: d.status || "Hoạt động", description: d.description || "",
      });
      const attrs = (d.attributes || []).map((a, i) => ({ _key: i + 1, name: a.name, value: a.value }));
      setAttributes(attrs.length ? attrs : [{ _key: 1, name: "", value: "" }]);
      setKeySeq((attrs.length || 1) + 1);
    }).catch((e) => alert("Lỗi tải sản phẩm: " + e.message));
  }, [productId]);

  const addAttr = () => {
    setAttributes((a) => [...a, { _key: keySeq, name: "", value: "" }]);
    setKeySeq((s) => s + 1);
  };
  const removeAttr = (key) => setAttributes((a) => a.filter((x) => x._key !== key));
  const updateAttr = (key, field, val) =>
    setAttributes((a) => a.map((x) => (x._key === key ? { ...x, [field]: val } : x)));

  const save = async () => {
    if (!form.product_name) return alert("Vui lòng nhập Tên sản phẩm");
    const cleanAttrs = attributes
      .filter((a) => a.name && a.value)
      .map(({ name, value }) => ({ name, value }));
    try {
      if (productId) await api.update(productId, { ...form, attributes: cleanAttrs });
      else await api.create({ ...form, attributes: cleanAttrs });
      onSaved();
    } catch (e) {
      alert("Lỗi lưu sản phẩm: " + e.message);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title={productId ? "Sửa sản phẩm" : "Thêm mới sản phẩm"} onBack={onBack}
        actions={<button onClick={save} className="btn-primary"><Save size={16} /> Lưu sản phẩm</button>} />

      <ProductFields form={form} set={set} attributes={attributes}
        addAttr={addAttr} removeAttr={removeAttr} updateAttr={updateAttr} disabled={false} />

      <style>{`
        .attr-row { animation: slideIn .18s ease; }
        @keyframes slideIn { from { opacity:0; transform: translateY(-4px);} to {opacity:1; transform:none;} }
      `}</style>
    </div>
  );
}

/* =========================== PRODUCT DETAIL =========================== */
function ProductDetail({ id, onBack, onDeleted }) {
  const { can } = usePerm();
  const [tab, setTab] = useState("info");
  const [p, setP] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [attributes, setAttributes] = useState([]);
  const [keySeq, setKeySeq] = useState(1);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const addAttr = () => { setAttributes((a) => [...a, { _key: keySeq, name: "", value: "" }]); setKeySeq((s) => s + 1); };
  const removeAttr = (key) => setAttributes((a) => a.filter((x) => x._key !== key));
  const updateAttr = (key, fld, val) => setAttributes((a) => a.map((x) => (x._key === key ? { ...x, [fld]: val } : x)));

  const load = () => api.get(id).then((d) => {
    setP(d);
    setForm({
      product_name: d.product_name || "", production_area: d.production_area || "", category: d.category || "",
      product_type: d.product_type || "Thành phẩm", product_group: d.product_group || "", unit: d.unit || "",
      barcode_type: d.barcode_type || "", tracking_type: d.tracking_type || "Theo lô",
      is_pqc_required: !!d.is_pqc_required, status: d.status || "Hoạt động", description: d.description || "",
    });
    const attrs = (d.attributes || []).map((a, i) => ({ _key: i + 1, name: a.name, value: a.value }));
    setAttributes(attrs.length ? attrs : [{ _key: 1, name: "", value: "" }]);
    setKeySeq((attrs.length || 1) + 1);
  }).catch((e) => alert("Lỗi tải chi tiết: " + e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  const del = async () => {
    if (!confirm("Xóa sản phẩm này?")) return;
    try { await api.remove(id); onDeleted?.(); } catch (e) { alert("Lỗi xóa: " + e.message); }
  };
  const save = async () => {
    if (!form.product_name) return alert("Vui lòng nhập Tên sản phẩm");
    const cleanAttrs = attributes.filter((a) => a.name && a.value).map(({ name, value }) => ({ name, value }));
    try { await api.update(id, { ...form, attributes: cleanAttrs }); await load(); setEditing(false); }
    catch (e) { alert("Lỗi lưu sản phẩm: " + e.message); }
  };
  const cancel = () => { load(); setEditing(false); };

  const tabs = [
    { key: "info", label: "Thông tin sản phẩm" },
    { key: "prod", label: "Thông tin sản xuất" },
    { key: "stock", label: "Thông tin tồn kho" },
  ];

  if (!p || !form) return <div className="text-slate-400 text-sm py-10">Đang tải chi tiết sản phẩm…</div>;

  return (
    <div className="space-y-5">
      <PageHeader title={p.product_name} onBack={onBack}
        badge={<StatusBadge status={p.status} />} subtitle={p.product_code}
        actions={editing ? (<>
          <button onClick={cancel} className="btn-ghost">Hủy</button>
          <button onClick={save} className="btn-primary"><Save size={16} /> Lưu</button>
        </>) : (<>
          {can("products", "edit") && <button onClick={() => { setTab("info"); setEditing(true); }} className="btn-ghost"><Pencil size={16} /> Sửa</button>}
          {can("products", "delete") && <button onClick={del} className="btn-ghost" style={{ color: "#e11d48" }}><Trash2 size={16} /> Xóa</button>}
        </>)} />

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition ${
              tab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <ProductFields disabled={!editing} form={form} set={set}
          attributes={attributes} addAttr={addAttr} removeAttr={removeAttr} updateAttr={updateAttr} />
      )}

      {tab === "prod" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 text-sm font-semibold text-slate-700 border-b border-slate-100">Danh sách định mức (BOM)</div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr><th className="text-left px-4 py-2">Mã BOM</th><th className="text-left px-4 py-2">Sản phẩm</th>
                  <th className="text-right px-4 py-2">Số lượng</th><th className="text-left px-4 py-2">Đơn vị</th>
                  <th className="text-left px-4 py-2">Loại BOM</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {p.boms.map((b) => (
                  <tr key={b.bom_code}><td className="px-4 py-2 text-blue-600">{b.bom_code}</td>
                    <td className="px-4 py-2">{b.product}</td><td className="px-4 py-2 text-right">{b.quantity}</td>
                    <td className="px-4 py-2">{b.unit}</td><td className="px-4 py-2">{b.bom_type}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 text-sm font-semibold text-slate-700 border-b border-slate-100">Danh sách quy trình</div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr><th className="text-left px-4 py-2">Bước</th><th className="text-left px-4 py-2">Công đoạn</th>
                  <th className="text-left px-4 py-2">Xưởng</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {p.processes.map((s) => (
                  <tr key={s.step}><td className="px-4 py-2">{s.step}</td><td className="px-4 py-2">{s.name}</td>
                    <td className="px-4 py-2">{s.workshop}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "stock" && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr><th className="text-left px-4 py-2">Kho</th><th className="text-right px-4 py-2">SL hiện tại</th>
                <th className="text-right px-4 py-2">SL dự kiến</th><th className="text-left px-4 py-2">Đơn vị</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {p.inventory.map((w) => (
                <tr key={w.warehouse}><td className="px-4 py-2">{w.warehouse}</td>
                  <td className="px-4 py-2 text-right font-medium">{w.current_qty.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{w.expected_qty.toLocaleString()}</td>
                  <td className="px-4 py-2">{w.unit}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================== DASHBOARD ============================== */
const KPI_COLOR = {
  emerald: "bg-emerald-50 text-emerald-600", blue: "bg-blue-50 text-blue-600",
  amber: "bg-amber-50 text-amber-600", rose: "bg-rose-50 text-rose-600",
};

function Dashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { getDashboard().then(setData).catch((e) => console.error("Dashboard lỗi:", e.message)); }, []);
  if (!data) return <div className="text-slate-400 text-sm py-10">Đang tải số liệu…</div>;

  const { kpi, machines, in_progress, due_soon, status_breakdown } = data;
  const kpis = [
    { label: "Đơn hàng đang mở", value: kpi.open_orders, icon: ShoppingCart, color: "blue" },
    { label: "Lệnh SX đang chạy", value: kpi.po_active, icon: Factory, color: "amber" },
    { label: "Lệnh SX hoàn thành", value: kpi.po_done, icon: CheckCircle2, color: "emerald" },
    { label: "Dòng đơn chờ kế hoạch", value: kpi.demand_pending, icon: ClipboardList, color: "rose" },
  ];
  const busy = machines.filter((m) => m.current_task).length;

  return (
    <div className="space-y-6">
      <ListHeader title="Tổng quan" />

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${KPI_COLOR[k.color]}`}><k.icon size={20} /></div>
            <div className="text-2xl font-bold text-slate-800">{fmt(k.value)}</div>
            <div className="text-sm text-slate-500 mt-1">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lệnh đang sản xuất + tiến độ */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50"><h2 className="text-sm font-semibold text-slate-700">Lệnh đang sản xuất</h2></div>
          <div className="p-5 space-y-4">
            {in_progress.map((o) => {
              const pct = Math.min(100, Math.round((Number(o.produced_qty) / Number(o.quantity)) * 100));
              return (
                <div key={o.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-slate-700">{o.order_code} · {o.product_name}</span>
                    <span className="text-slate-400">{fmt(o.produced_qty)}/{fmt(o.quantity)} ({pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                </div>
              );
            })}
            {!in_progress.length && <div className="text-sm text-slate-400 text-center py-4">Không có lệnh đang sản xuất.</div>}
          </div>
        </div>

        {/* Đơn hàng sắp đến hạn + phân bố trạng thái */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50"><h2 className="text-sm font-semibold text-slate-700">Đơn hàng sắp đến hạn</h2></div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {due_soon.map((o) => (
                  <tr key={o.order_code}>
                    <td className="px-5 py-2.5 font-medium text-blue-600">{o.order_code}</td>
                    <td className="px-2 py-2.5 text-slate-600">{o.customer_name}</td>
                    <td className="px-2 py-2.5 text-slate-500">{o.item_count} dòng</td>
                    <td className="px-2 py-2.5 text-rose-600">{fmtDate(o.due_date)}</td>
                    <td className="px-5 py-2.5"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(o.status)}`}>{o.status}</span></td>
                  </tr>
                ))}
                {!due_soon.length && <tr><td className="px-5 py-4 text-slate-400">Không có đơn hàng mở.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50"><h2 className="text-sm font-semibold text-slate-700">Phân bố trạng thái lệnh SX</h2></div>
            <div className="p-5 flex flex-wrap gap-2">
              {status_breakdown.map((s) => (
                <span key={s.status} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${statusClass(s.status)}`}>{s.status}: {s.n}</span>
              ))}
              {!status_breakdown.length && <span className="text-sm text-slate-400">Chưa có lệnh sản xuất.</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Trạng thái máy hôm nay */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <Cog size={16} className="text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Trạng thái máy hôm nay</h2>
          <span className="text-xs text-slate-400">· {busy}/{machines.length} máy đang chạy</span>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {machines.map((m) => {
            const t = m.current_task;
            return (
              <div key={m.id} className={`rounded-lg border p-3 ${t ? "border-blue-200 bg-blue-50/40" : "border-slate-200"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-800 text-sm">{m.name}</span>
                  <span className={`w-2 h-2 rounded-full ${t ? "bg-blue-500" : "bg-slate-300"}`} />
                </div>
                <div className="text-[11px] text-slate-400">{m.factory}</div>
                {t ? (
                  <div className="mt-1.5 text-xs text-slate-600">{t.order_code} · {t.stage}<div className="text-slate-400 truncate">{t.product}</div></div>
                ) : <div className="mt-1.5 text-xs text-slate-400">Trống</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* =============================== ROOT APP =============================== */
export default function MesApp() {
  const [view, setView] = useState("dashboard"); // dashboard|products|planning|production|inventory|...
  const [detailId, setDetailId] = useState(null);
  const [detailBack, setDetailBack] = useState("products"); // màn quay lại từ chi tiết SP
  const [productEditId, setProductEditId] = useState(null); // sản phẩm đang sửa (null = thêm mới)
  const [focusOrderId, setFocusOrderId] = useState(null);   // mở sẵn chi tiết 1 lệnh SX
  const [lookups, setLookups] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Khôi phục phiên đăng nhập
  useEffect(() => {
    auth.me().then((r) => setUser(r.user)).catch(() => { setToken(""); setUser(null); }).finally(() => setAuthLoading(false));
  }, []);

  const logout = () => { auth.logout().catch(() => {}); setToken(""); setUser(null); setView("dashboard"); };

  // Nạp dữ liệu lookup (sản phẩm, khách, máy, kho...) sau khi đăng nhập
  useEffect(() => {
    if (user) getLookups().then(setLookups).catch((e) => console.error("Lookups lỗi:", e.message));
  }, [user]);

  // Điều hướng chéo module
  const goProductDetail = (id, back = "products") => { setDetailId(id); setDetailBack(back); setView("product-detail"); };
  const goProductionOrder = (id) => { setFocusOrderId(id); setView("production"); };

  const needLookups = (Comp) =>
    lookups ? <Comp lookups={lookups} /> : <div className="text-slate-400 text-sm py-10">Đang tải dữ liệu…</div>;
  const loadingEl = <div className="text-slate-400 text-sm py-10">Đang tải dữ liệu…</div>;

  const render = () => {
    switch (view) {
      case "dashboard": return <Dashboard />;
      case "products":
        return <ProductList onCreate={() => { setProductEditId(null); setView("product-form"); }}
          onOpen={(id) => { setDetailId(id); setDetailBack("products"); setView("product-detail"); }} />;
      case "product-form":
        return <ProductForm productId={productEditId}
          onBack={() => setView(productEditId ? "product-detail" : "products")}
          onSaved={() => setView(productEditId ? "product-detail" : "products")} />;
      case "product-detail":
        return <ProductDetail id={detailId} onBack={() => setView(detailBack)}
          onDeleted={() => setView(detailBack)} />;
      case "planning":
        return lookups ? <PlanningModule lookups={lookups} onOpenOrder={goProductionOrder} onOpenProduct={(id) => goProductDetail(id, "planning")} /> : loadingEl;
      case "production":
        return lookups ? <ProductionModule lookups={lookups} focusId={focusOrderId} onFocusConsumed={() => setFocusOrderId(null)} /> : loadingEl;
      case "inventory":
        return lookups ? <InventoryModule lookups={lookups} onOpenProduct={(id) => goProductDetail(id, "inventory")} /> : loadingEl;
      case "md:customers": case "md:machines": case "md:warehouses": case "md:locations":
      case "md:employees": case "md:shifts": case "md:roles":
        return lookups ? <MasterDataScreen lookups={lookups} entity={view.slice(3)} /> : loadingEl;
      case "workschedule": return needLookups(WorkScheduleModule);
      case "qrlabels": return <QrLabelsModule />;
      case "qrscan": return <QrScanModule />;
      case "permissions": return <PermissionsModule />;
      case "users": return <UsersModule />;
      case "bom": return needLookups(BomModule);
      case "process": return needLookups(ProcessModule);
      case "orders": return needLookups(OrdersModule);
      default: return <Dashboard />;
    }
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Đang tải…</div>;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <PermProvider user={user}>
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900">
      <Sidebar active={view} onNav={(k) => setView(k)} user={user} onLogout={logout} />
      <main className="nav-scroll flex-1 p-8 overflow-y-auto">{render()}</main>
      <style>{`
        .btn-primary { display:inline-flex; align-items:center; gap:.4rem; background:#0055b3; color:#fff;
          font-size:.875rem; font-weight:500; padding:.5rem .9rem; border-radius:.6rem; transition:.15s; }
        .btn-primary:hover { background:#00428c; }
        .btn-ghost { display:inline-flex; align-items:center; gap:.4rem; background:#fff; color:#475569;
          font-size:.875rem; font-weight:500; padding:.5rem .9rem; border-radius:.6rem; border:1px solid #e2e8f0; transition:.15s; }
        .btn-ghost:hover { background:#f8fafc; }
        /* Trường chỉ-đọc (chế độ xem): rõ chữ, không bị mờ */
        input:disabled, select:disabled, textarea:disabled {
          background:#f8fafc; color:#334155; -webkit-text-fill-color:#334155; opacity:1; cursor:default; }
        fieldset { min-width:0; border:0; margin:0; padding:0; }
      `}</style>
    </div>
    </PermProvider>
  );
}
