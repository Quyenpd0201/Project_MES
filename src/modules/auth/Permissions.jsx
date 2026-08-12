import React, { useState, useEffect, useCallback } from "react";
import { ChevronDown, Save, ShieldCheck, Eraser, Info } from "lucide-react";
import { ListHeader } from "../../components.jsx";
import { roles } from "../../mesApi.js";
import { inputCls, toast } from "../../ui.js";

/* Đăng ký ứng dụng + trường để phân quyền */
const APPS = [
  // ── DASHBOARD ────────────────────────────────────────────────────────
  { key: "dashboard", label: "Dashboard" },

  // ── KINH DOANH ───────────────────────────────────────────────────────
  { key: "orders", label: "Đơn hàng", fields: [
    ["customer_id", "Khách hàng"], ["order_date", "Ngày đặt"], ["due_date", "Ngày giao"],
    ["status", "Trạng thái"], ["note", "Ghi chú"], ["items", "Dòng hàng"] ] },
  { key: "deliveries", label: "Phiếu giao hàng & thanh toán", fields: [
    ["customer_id", "Khách hàng"], ["delivery_date", "Ngày giao"], ["status", "Trạng thái"],
    ["items", "Dòng hàng"], ["amounts", "Thông tin tiền (đơn giá / tổng / đã trả / công nợ)"] ] },

  // ── KẾ HOẠCH ─────────────────────────────────────────────────────────
  { key: "planning", label: "Kế hoạch sản xuất" },
  { key: "workschedule", label: "Lịch sản xuất" },

  // ── SẢN XUẤT ─────────────────────────────────────────────────────────
  { key: "production", label: "Lệnh sản xuất", fields: [
    ["product_id", "Sản phẩm"], ["customer_id", "Khách hàng"], ["quantity", "Số lượng"],
    ["attributes", "Thông số (màu/KT/dày)"], ["finishing", "Yêu cầu gia công"], ["tasks", "Phân công / lô"] ] },
  { key: "orderstatus", label: "Lệnh theo trạng thái" },
  { key: "execution", label: "Thực thi sản xuất" },
  { key: "prod_output", label: "Sản lượng" },
  { key: "qrlabels", label: "In tem xuất xứ" },

  // ── KHO ──────────────────────────────────────────────────────────────
  { key: "inventory", label: "Tồn kho" },
  { key: "inv_inbound", label: "Nhập kho" },
  { key: "inv_outbound", label: "Xuất kho" },
  { key: "inv_transfer", label: "Chuyển kho" },
  { key: "inv_adjust", label: "Điều chỉnh tồn kho" },

  // ── TRUY XUẤT ────────────────────────────────────────────────────────
  { key: "qrscan", label: "Tra cứu xuất xứ" },
  { key: "trace_lot", label: "Truy xuất lô" },

  // ── BÁO CÁO ──────────────────────────────────────────────────────────
  { key: "reports", label: "Báo cáo KPI" },
  { key: "rep_inv", label: "Báo cáo kho" },

  // ── THÔNG TIN CHUNG ───────────────────────────────────────────────────
  { key: "products", label: "Sản phẩm", fields: [
    ["product_name", "Tên sản phẩm"], ["product_type", "Loại sản phẩm"], ["production_area", "Khu vực SX"],
    ["category", "Danh mục"], ["product_group", "Nhóm SP"], ["unit", "Đơn vị tính"], ["barcode_type", "Loại mã vạch"],
    ["tracking_type", "Hình thức theo dõi"], ["is_pqc_required", "Cần kiểm tra PQC"], ["status", "Trạng thái"],
    ["description", "Mô tả"], ["attributes", "Thuộc tính sản phẩm"] ] },
  { key: "bom", label: "Định mức (BOM)", fields: [
    ["name", "Tên định mức"], ["bom_type", "Loại định mức"], ["product_id", "Sản phẩm đầu ra"],
    ["output_quantity", "Định mức SL"], ["lines", "Thành phần / NVL"] ] },
  { key: "process", label: "Quy trình công nghệ" },

  // ── DANH MỤC (mỗi module riêng biệt) ────────────────────────────────────
  { key: "md_machines",  label: "Máy móc" },
  { key: "md_employees", label: "Nhân viên", fields: [
    ["full_name", "Họ tên"], ["employee_code", "Mã NV"], ["factory", "Tổ / Bộ phận"],
    ["position", "Chức vụ"], ["phone", "Số điện thoại"], ["status", "Trạng thái"] ] },
  { key: "md_shifts",    label: "Ca làm việc" },
  { key: "md_warehouses",label: "Kho (danh mục)" },
  { key: "md_locations", label: "Vị trí lưu trữ" },
  { key: "md_customers", label: "Khách hàng", fields: [
    ["name", "Tên khách hàng"], ["phone", "Điện thoại"], ["address", "Địa chỉ"],
    ["tax_code", "Mã số thuế"], ["contact", "Người liên hệ"], ["note", "Ghi chú"] ] },
  { key: "md_roles",     label: "Vai trò" },
];

const ACTIONS = [
  ["view", "Xem"], ["create", "Thêm"], ["edit", "Sửa"], ["delete", "Xoá"],
  ["approve", "Phê duyệt"], ["reject", "Từ chối"], ["import", "Import"], ["export", "Export"],
  ["print", "In"], ["execute", "Thực hiện"], ["assign", "Phân công"], ["cancel", "Hủy"], ["complete", "Hoàn thành"]
];

// Để giữ tính tương thích với yêu cầu: "như cấu hình hiện tại",
// Ta chỉ định những action cơ bản cho mọi module, 
// nhưng nếu sau này muốn mở rộng thì cấu hình ở đây.
const DEFAULT_ACTIONS = ["view", "create", "edit", "delete"];

const PERM_STATES = [
  { value: "INHERIT", label: "Kế thừa" },
  { value: "ALLOW", label: "Cho phép" },
  { value: "DENY", label: "Từ chối" }
];

const FIELD_PERMS = [
  { value: "INHERIT", label: "Kế thừa" },
  { value: "edit", label: "Cho sửa" },
  { value: "view", label: "Chỉ xem" },
  { value: "hidden", label: "Ẩn" }
];

export default function PermissionsModule() {
  const [roleList, setRoleList] = useState([]);
  const [roleId, setRoleId] = useState("");
  const [parentId, setParentId] = useState("");
  const [perms, setPerms] = useState({});
  const [openDetail, setOpenDetail] = useState(null); // Chỉ mở 1 chi tiết tại một thời điểm
  const [effectivePerms, setEffectivePerms] = useState({});

  const fetchRoles = useCallback(async () => {
    try {
      const r = await roles.list();
      setRoleList(r);
      if (r.length > 0 && !roleId) {
        selectRole(r[0].id, r);
      }
    } catch (e) {
      console.error(e);
    }
  }, [roleId]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const fetchEffectivePerms = useCallback(async (id) => {
    try {
      const ep = await roles.getEffectivePermissions(id);
      setEffectivePerms(ep);
    } catch (e) {
      console.error("Failed to fetch effective permissions", e);
    }
  }, []);

  const selectRole = useCallback(async (id, list = roleList) => {
    setRoleId(id);
    if (!id) {
      setPerms({});
      setParentId("");
      setEffectivePerms({});
      return;
    }
    try {
      const r = await roles.get(id);
      setPerms(r.permissions || {});
      setParentId(r.parent_id || "");
      fetchEffectivePerms(id);
    } catch (e) {
      toast.error("Lỗi tải vai trò: " + e.message);
    }
  }, [roleList, fetchEffectivePerms]);

  const ap = (k) => perms[k] || {};
  const setAppAction = (k, actionKey, value) => {
    setPerms((p) => ({
      ...p,
      [k]: { ...(p[k] || {}), [actionKey]: value }
    }));
  };
  const setField = (k, fk, v) => {
    setPerms((p) => ({
      ...p,
      [k]: {
        ...(p[k] || {}),
        fields: { ...((p[k] || {}).fields || {}), [fk]: v }
      }
    }));
  };
  
  const fieldVal = (k, fk) => ap(k).fields?.[fk] || "INHERIT";
  const actionVal = (k, actionKey) => {
    const val = ap(k)[actionKey];
    if (val === true) return "ALLOW"; // backward compatibility
    if (val === false) return "DENY";
    return val || "INHERIT";
  };

  const grantAll = () => {
    const all = {};
    APPS.forEach((a) => {
      const appPerm = {};
      DEFAULT_ACTIONS.forEach(act => appPerm[act] = "ALLOW");
      if (a.fields) {
        appPerm.fields = Object.fromEntries(a.fields.map(([fk]) => [fk, "edit"]));
      }
      all[a.key] = appPerm;
    });
    setPerms(all);
  };

  const save = async () => {
    try {
      await roles.savePermissions(roleId, perms, parentId || null);
      toast.success("Đã lưu phân quyền cho vai trò.");
      fetchEffectivePerms(roleId);
    } catch (e) {
      toast.error("Lỗi lưu: " + e.message);
    }
  };

  const parentOptions = roleList.filter(r => r.id !== roleId);

  return (
    <div className="space-y-6">
      <ListHeader title="Phân quyền hệ thống" />

      {/* Box: Phân quyền theo vai trò */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-slate-800 border-b border-slate-100 pb-2">Phân quyền theo vai trò</h3>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[250px]">
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Vai trò</label>
            <select className={inputCls} value={roleId} onChange={(e) => selectRole(e.target.value)}>
              <option value="">-- Chọn vai trò --</option>
              {roleList.map((r) => <option key={r.id} value={r.id}>{r.role_code} · {r.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[250px]">
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Vai trò cha (Kế thừa)</label>
            <select className={inputCls} value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={!roleId}>
              <option value="">-- Không kế thừa --</option>
              {parentOptions.map((r) => <option key={r.id} value={r.id}>{r.role_code} · {r.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={grantAll} disabled={!roleId} className="btn-ghost text-sm"><ShieldCheck size={16} /> Cấp toàn quyền</button>
            <button onClick={() => setPerms({})} disabled={!roleId} className="btn-ghost text-sm text-red-600 hover:bg-red-50"><Eraser size={16} /> Bỏ hết</button>
            <button onClick={save} disabled={!roleId} className="btn-primary text-sm px-6"><Save size={16} /> Lưu</button>
          </div>
        </div>
      </div>

      {!roleId && <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400">Chọn một vai trò để cấu hình quyền.</div>}

      {roleId && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {APPS.map((a) => {
            const hasFields = !!a.fields;
            const p = ap(a.key);
            const ep = effectivePerms[a.key] || {};
            
            // Tính số lượng action được ALLOW trong số mặc định
            const allowedActionsCount = DEFAULT_ACTIONS.filter(act => 
              p[act] === 'ALLOW' || p[act] === true
            ).length;
            
            const isDetailOpen = openDetail === a.key;

            return (
              <div key={a.key} className="col-span-1 flex flex-col h-full">
                <div className={`bg-white rounded-xl border transition-colors shadow-sm flex-1 flex flex-col ${isDetailOpen ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'}`}>
                  {/* Tóm tắt */}
                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-slate-800">{a.label}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {hasFields ? `${a.fields.length} trường dữ liệu` : "Không có trường"} 
                        {" · Quyền: "}
                        <span className="font-medium text-blue-600">{allowedActionsCount}/{DEFAULT_ACTIONS.length}</span>
                      </p>
                    </div>
                    <button 
                      onClick={() => setOpenDetail(isDetailOpen ? null : a.key)}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors ${
                        isDetailOpen ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Chi tiết <ChevronDown size={14} className={`transition-transform ${isDetailOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {/* Chi tiết (Accordion) */}
                  {isDetailOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/50 flex-1 p-4 flex flex-col gap-5">
                      
                      {/* Section: CRUD */}
                      <div>
                        <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Quyền thao tác (CRUD)</h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {DEFAULT_ACTIONS.map(actKey => {
                            const act = ACTIONS.find(x => x[0] === actKey);
                            if (!act) return null;
                            const [k, lb] = act;
                            const val = actionVal(a.key, k);
                            const effectiveVal = ep[k];
                            const isInheriting = val === 'INHERIT' && effectiveVal;
                            
                            return (
                              <div key={k} className="flex flex-col gap-1.5 p-2 bg-white rounded-md border border-slate-100 shadow-sm">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-slate-700 font-medium">{lb}</span>
                                  {isInheriting && <span className={`text-[10px] px-1.5 py-0.5 rounded ${effectiveVal === 'ALLOW' || effectiveVal === true ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    Thực tế: {effectiveVal === 'ALLOW' || effectiveVal === true ? 'Cho phép' : 'Từ chối'}
                                  </span>}
                                </div>
                                <select 
                                  className="w-full text-sm border-slate-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 py-1.5"
                                  value={val}
                                  onChange={(e) => setAppAction(a.key, k, e.target.value)}
                                >
                                  {PERM_STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Section: Fields */}
                      {hasFields && (
                        <div>
                          <div className="w-full h-px bg-slate-200 mb-4"></div>
                          <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Trường dữ liệu</h5>
                          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {a.fields.map(([fk, flb]) => {
                               const val = fieldVal(a.key, fk);
                               const effectiveVal = ep.fields?.[fk];
                               const isInheriting = val === 'INHERIT' && effectiveVal && effectiveVal !== 'INHERIT';
                               
                               return (
                                <div key={fk} className="flex items-center justify-between gap-2 border border-slate-200 bg-white rounded-lg px-3 py-2">
                                  <div className="flex flex-col">
                                    <span className="text-sm text-slate-700">{flb}</span>
                                    {isInheriting && <span className="text-[10px] text-blue-500">Kế thừa: {FIELD_PERMS.find(x => x.value === effectiveVal)?.label || effectiveVal}</span>}
                                  </div>
                                  <select 
                                    className="px-2 py-1.5 rounded-md border border-slate-300 text-xs shadow-sm bg-slate-50 min-w-[100px]" 
                                    value={val}
                                    onChange={(e) => setField(a.key, fk, e.target.value)}
                                  >
                                    {FIELD_PERMS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                  </select>
                                </div>
                               );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Chỗ dành cho Data Scope sau này */}
                      {/* <div>
                        <div className="w-full h-px bg-slate-200 mb-4"></div>
                        <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                          Phạm vi dữ liệu <Info size={14} className="text-slate-400" title="Đang cấu hình quản lý tập trung" />
                        </h5>
                        <p className="text-sm text-slate-500 italic">Quản lý tập trung toàn hệ thống.</p>
                      </div> */}

                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
