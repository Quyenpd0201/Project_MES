import React, { useState, useEffect, useCallback } from "react";
import { RotateCcw, ChevronDown, Save, ShieldCheck, Eraser } from "lucide-react";
import { ListHeader } from "../components.jsx";
import { roles } from "../mesApi.js";
import {  inputCls , toast } from "../ui.js";

/* Đăng ký ứng dụng + trường để phân quyền */
const APPS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "products", label: "Sản phẩm", fields: [
    ["product_name", "Tên sản phẩm"], ["product_type", "Loại sản phẩm"], ["production_area", "Khu vực SX"],
    ["category", "Danh mục"], ["product_group", "Nhóm SP"], ["unit", "Đơn vị tính"], ["barcode_type", "Loại mã vạch"],
    ["tracking_type", "Hình thức theo dõi"], ["is_pqc_required", "Cần kiểm tra PQC"], ["status", "Trạng thái"],
    ["description", "Mô tả"], ["attributes", "Thuộc tính sản phẩm"] ] },
  { key: "bom", label: "Định mức (BOM)", fields: [
    ["name", "Tên định mức"], ["bom_type", "Loại định mức"], ["product_id", "Sản phẩm đầu ra"],
    ["output_quantity", "Định mức SL"], ["lines", "Thành phần / NVL"] ] },
  { key: "orders", label: "Đơn hàng", fields: [
    ["customer_id", "Khách hàng"], ["order_date", "Ngày đặt"], ["due_date", "Ngày giao"],
    ["status", "Trạng thái"], ["note", "Ghi chú"], ["items", "Dòng hàng"] ] },
  { key: "deliveries", label: "Phiếu giao hàng & thanh toán", fields: [
    ["customer_id", "Khách hàng"], ["delivery_date", "Ngày giao"], ["status", "Trạng thái"],
    ["items", "Dòng hàng"], ["amounts", "Thông tin tiền (đơn giá / tổng / đã trả / công nợ)"] ] },
  { key: "process", label: "Quy trình công nghệ" },
  { key: "planning", label: "Kế hoạch" },
  { key: "production", label: "Sản xuất", fields: [
    ["product_id", "Sản phẩm"], ["customer_id", "Khách hàng"], ["quantity", "Số lượng"],
    ["attributes", "Thông số (màu/KT/dày)"], ["finishing", "Yêu cầu gia công"], ["tasks", "Phân công / lô"] ] },
  { key: "execution", label: "Thực thi sản xuất" },
  { key: "qrlabels", label: "Tem QR" },
  { key: "qrscan", label: "Quét QR" },
  { key: "workschedule", label: "Lịch làm việc" },
  { key: "inventory", label: "Tồn kho" },
  { key: "masterdata", label: "Danh mục (master data)" },
];
const ACTIONS = [["view", "Xem"], ["create", "Thêm"], ["edit", "Sửa"], ["delete", "Xoá"]];
const FIELD_PERMS = [["edit", "Cho sửa"], ["view", "Chỉ xem"], ["hidden", "Ẩn"]];

export default function PermissionsModule() {
  const [roleList, setRoleList] = useState([]);
  const [roleId, setRoleId] = useState("");
  const [perms, setPerms] = useState({});
  const [open, setOpen] = useState({});

  useEffect(() => { roles.list().then((r) => { setRoleList(r); if (r[0]) selectRole(r[0].id); }).catch(() => {}); }, []); // eslint-disable-line

  const selectRole = useCallback(async (id) => {
    setRoleId(id);
    if (!id) { setPerms({}); return; }
    try { const r = await roles.get(id); setPerms(r.permissions || {}); }
    catch (e) { toast.error("Lỗi tải vai trò: " + e.message); }
  }, []);

  const ap = (k) => perms[k] || {};
  const setApp = (k, patch) => setPerms((p) => ({ ...p, [k]: { ...(p[k] || {}), ...patch } }));
  const setField = (k, fk, v) => setPerms((p) => ({ ...p, [k]: { ...(p[k] || {}), fields: { ...((p[k] || {}).fields || {}), [fk]: v } } }));
  const fieldVal = (k, fk) => ap(k).fields?.[fk] || "edit";

  const grantAll = () => {
    const all = {};
    APPS.forEach((a) => { all[a.key] = { view: true, create: true, edit: true, delete: true, fields: Object.fromEntries((a.fields || []).map(([fk]) => [fk, "edit"])) }; });
    setPerms(all);
  };
  const save = async () => {
    try { await roles.savePermissions(roleId, perms); toast.error("Đã lưu phân quyền cho vai trò."); }
    catch (e) { toast.error("Lỗi lưu: " + e.message); }
  };

  return (
    <div className="space-y-5">
      <ListHeader title="Phân quyền theo vai trò" actions={
        <button onClick={load} className="btn-ghost"><RotateCcw size={16} /> Làm mới</button>
      } />

      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Vai trò</label>
          <select className={inputCls} value={roleId} onChange={(e) => selectRole(e.target.value)}>
            <option value="">-- Chọn vai trò --</option>
            {roleList.map((r) => <option key={r.id} value={r.id}>{r.role_code} · {r.name}</option>)}
          </select>
        </div>
        <button onClick={grantAll} disabled={!roleId} className="btn-ghost"><ShieldCheck size={16} /> Cấp toàn quyền</button>
        <button onClick={() => setPerms({})} disabled={!roleId} className="btn-ghost"><Eraser size={16} /> Bỏ hết</button>
        <button onClick={save} disabled={!roleId} className="btn-primary"><Save size={16} /> Lưu phân quyền</button>
      </div>

      {!roleId && <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400">Chọn một vai trò để cấu hình quyền.</div>}

      {roleId && (
        <div className="space-y-3">
          {APPS.map((a) => {
            const p = ap(a.key);
            const hasFields = !!a.fields;
            const isOpen = open[a.key];
            return (
              <div key={a.key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/50">
                  <button onClick={() => hasFields && setOpen((o) => ({ ...o, [a.key]: !o[a.key] }))}
                    className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
                    {hasFields && <ChevronDown size={16} className={`transition ${isOpen ? "rotate-180" : ""}`} />}
                    {a.label}
                    {hasFields && <span className="text-[11px] text-slate-400 font-normal">({a.fields.length} trường)</span>}
                  </button>
                  <div className="flex items-center gap-4 text-sm shrink-0">
                    {ACTIONS.map(([k, lb]) => (
                      <label key={k} className="flex items-center gap-1.5 text-slate-600">
                        <input type="checkbox" checked={!!p[k]} onChange={(e) => setApp(a.key, { [k]: e.target.checked })} className="w-4 h-4 accent-blue-600" />
                        {lb}
                      </label>
                    ))}
                  </div>
                </div>
                {hasFields && isOpen && (
                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {a.fields.map(([fk, flb]) => (
                      <div key={fk} className="flex items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2">
                        <span className="text-sm text-slate-700">{flb}</span>
                        <select className="px-2 py-1 rounded-md border border-slate-300 text-xs" value={fieldVal(a.key, fk)}
                          onChange={(e) => setField(a.key, fk, e.target.value)}>
                          {FIELD_PERMS.map(([v, lb]) => <option key={v} value={v}>{lb}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
