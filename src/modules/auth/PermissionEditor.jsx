import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ShieldCheck, Search, Plus, Filter, Edit, Trash2, X, ChevronRight,
  Package, Factory, LayoutDashboard, Calendar, ClipboardList,
  BarChart2, Settings, Save, Users
} from "lucide-react";
import { ListHeader } from "../../components.jsx";
import { roles } from "../../mesApi.js";
import { toast, statusClass } from "../../ui.js";

/* ─── 1. KẾT CẤU CÂY MODULE & THAO TÁC (RBAC) ─── */
const ACTION_LABELS = {
  view: "Xem", create: "Tạo mới", edit: "Sửa", delete: "Xóa",
  approve: "Duyệt", publish: "Phát hành", assign: "Phân công",
  execute: "Thực thi", import: "Import", export: "Xuất Excel"
};

const PERM_TREE = [
  {
    category: "Hệ thống chung",
    icon: LayoutDashboard,
    modules: [
      { key: "dashboard", label: "Dashboard", actions: ["view"] }
    ]
  },
  {
    category: "Kinh doanh & Kế hoạch",
    icon: Calendar,
    modules: [
      { key: "orders", label: "Đơn hàng", actions: ["view", "create", "edit", "delete", "approve"] },
      { key: "planning", label: "Kế hoạch sản xuất", actions: ["view", "create", "edit", "publish"] },
    ]
  },
  {
    category: "Sản xuất",
    icon: Factory,
    modules: [
      { key: "production", label: "Lệnh sản xuất", actions: ["view", "create", "edit", "delete", "publish", "assign", "export"] },
      { key: "execution", label: "Thực thi sản xuất", actions: ["view", "execute"] },
      { key: "prod_output", label: "Sản lượng", actions: ["view", "edit", "export"] },
    ]
  },
  {
    category: "Kho",
    icon: Package,
    modules: [
      { key: "inventory", label: "Tồn kho", actions: ["view", "export"] },
      { key: "inv_inbound", label: "Nhập kho", actions: ["view", "create", "edit", "delete", "approve"] },
      { key: "inv_outbound", label: "Xuất kho", actions: ["view", "create", "edit", "delete", "approve"] },
      { key: "inv_transfer", label: "Chuyển kho", actions: ["view", "create", "approve"] },
    ]
  },
  {
    category: "Báo cáo",
    icon: BarChart2,
    modules: [
      { key: "reports", label: "Báo cáo KPI", actions: ["view", "export"] },
      { key: "rep_inv", label: "Báo cáo kho", actions: ["view", "export"] },
    ]
  },
  {
    category: "Quản trị danh mục",
    icon: Settings,
    modules: [
      { key: "products", label: "Sản phẩm", actions: ["view", "create", "edit", "delete"] },
      { key: "bom", label: "Định mức (BOM)", actions: ["view", "create", "edit", "delete"] },
      { key: "md_employees", label: "Nhân viên", actions: ["view", "create", "edit"] },
      { key: "md_machines", label: "Máy móc", actions: ["view", "create", "edit"] },
      { key: "md_roles", label: "Vai trò", actions: ["view", "create", "edit", "delete"] },
    ]
  }
];

// Helper: Lấy thông tin module từ key
const getModuleInfo = (key) => {
  for (const cat of PERM_TREE) {
    const mod = cat.modules.find(m => m.key === key);
    if (mod) return { category: cat.category, ...mod };
  }
  return { category: "Khác", key, label: key, actions: ["view"] };
};

/* ─── 2. COMPONENT EDITOR (THÊM / SỬA QUYỀN TRÊN MÀN HÌNH RIÊNG) ─── */
export function PermissionEditor({ roleName, initialPerms, onSave, onCancel }) {
  const [selectedModule, setSelectedModule] = useState(null);
  
  // local state cho quyền đang chỉnh sửa:
  // Format: { [moduleKey]: { [actionKey]: { status: 'ALLOW', scope: 'ALL', scopeValue: '' } } }
  const [draft, setDraft] = useState({});

  // Reset draft khi mount
  useEffect(() => {
    setDraft(initialPerms || {});
    // Tự động chọn module đầu tiên
    setSelectedModule(PERM_TREE[0].modules[0]);
  }, [initialPerms]);

  // Xử lý tick chọn 1 thao tác
  const toggleAction = (modKey, actKey, currentVal) => {
    const modDraft = draft[modKey] || {};
    if (currentVal?.status === "ALLOW") {
      // Bỏ tick
      const newModDraft = { ...modDraft };
      delete newModDraft[actKey];
      setDraft({ ...draft, [modKey]: newModDraft });
    } else {
      // Tick -> mặc định Toàn bộ
      setDraft({ ...draft, [modKey]: { ...modDraft, [actKey]: { status: "ALLOW", scope: "ALL", scopeValue: "" } } });
    }
  };

  // Xử lý đổi Data Scope
  const changeScope = (modKey, actKey, field, val) => {
    const actDraft = draft[modKey]?.[actKey] || { status: "ALLOW", scope: "ALL", scopeValue: "" };
    setDraft({
      ...draft,
      [modKey]: {
        ...draft[modKey],
        [actKey]: { ...actDraft, [field]: val }
      }
    });
  };

  const handleSave = () => {
    onSave(draft);
  };

  const modDraft = draft[selectedModule?.key] || {};

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[calc(100vh-120px)] animate-in fade-in">
      {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Cấu hình phân quyền</h2>
            <p className="text-sm text-slate-500 mt-0.5">Vai trò: <span className="font-semibold text-indigo-600">{roleName}</span></p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onCancel} className="btn-ghost text-slate-500 hover:text-slate-700">Hủy bỏ</button>
            <button onClick={handleSave} className="btn-primary flex items-center gap-2"><Save size={16} /> Lưu quyền</button>
          </div>
        </div>

        {/* Body Drawer: 2 cột */}
        <div className="flex-1 overflow-hidden flex">
          {/* Cột trái: Cây Module */}
          <div className="w-72 bg-slate-50 border-r border-slate-200 flex flex-col h-full">
            <div className="p-4 border-b border-slate-200">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input placeholder="Tìm module..." className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {PERM_TREE.map((cat) => (
                <div key={cat.category}>
                  <div className="flex items-center gap-2 px-2 mb-1">
                    <cat.icon size={14} className="text-slate-400" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{cat.category}</span>
                  </div>
                  <div className="space-y-0.5">
                    {cat.modules.map(mod => {
                      const isSelected = selectedModule?.key === mod.key;
                      // Tính số lượng quyền đã cấp cho module này
                      const grantedCount = Object.keys(draft[mod.key] || {}).length;
                      return (
                        <button key={mod.key} onClick={() => setSelectedModule(mod)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                            isSelected ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-600 hover:bg-slate-100"
                          }`}>
                          <span>{mod.label}</span>
                          {grantedCount > 0 && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">{grantedCount}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cột phải: Cấu hình chi tiết */}
          <div className="flex-1 bg-white overflow-y-auto p-8">
            {selectedModule ? (
              <div className="max-w-4xl mx-auto">
                <div className="mb-6 pb-4 border-b border-slate-100">
                  <h3 className="text-2xl font-bold text-slate-800">{selectedModule.label}</h3>
                  <p className="text-slate-500 text-sm mt-1">Cấu hình các thao tác được phép và giới hạn phạm vi truy cập dữ liệu.</p>
                </div>

                <div className="space-y-4">
                  {selectedModule.actions.map(actKey => {
                    const val = modDraft[actKey];
                    const isChecked = val?.status === "ALLOW" || val === true; // Tương thích dữ liệu cũ
                    
                    return (
                      <div key={actKey} className={`rounded-xl border transition-all overflow-hidden ${isChecked ? "border-indigo-300 shadow-md ring-1 ring-indigo-100" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                        {/* Toggle header row */}
                        <div 
                           className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${isChecked ? "bg-indigo-50/50" : "bg-white"}`}
                           onClick={() => toggleAction(selectedModule.key, actKey, val)}
                        >
                           <div className="flex items-center gap-4">
                             <div className={`flex items-center justify-center w-10 h-10 rounded-xl transition-colors ${isChecked ? "bg-indigo-600 text-white shadow-inner" : "bg-slate-100 text-slate-400"}`}>
                               <ShieldCheck size={20} />
                             </div>
                             <div>
                               <div className={`font-bold text-base ${isChecked ? "text-indigo-900" : "text-slate-700"}`}>
                                 {ACTION_LABELS[actKey] || actKey}
                               </div>
                               {!isChecked && <div className="text-xs text-slate-400 mt-0.5 font-medium">Quyền này đang bị vô hiệu hóa</div>}
                             </div>
                           </div>
                           
                           {/* Custom Toggle Switch */}
                           <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isChecked ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                             <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isChecked ? 'translate-x-6' : 'translate-x-1'}`} />
                           </div>
                        </div>
                        
                        {/* Scope configuration body */}
                        {isChecked && (
                           <div className="p-5 border-t border-indigo-100 bg-white">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                  <Filter size={14} /> Phạm vi truy cập dữ liệu
                                </p>
                                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                                  {["ALL", "FACTORY", "WAREHOUSE", "CUSTOM"].map(scopeCode => {
                                    const scopeLabels = { ALL: "Toàn bộ", FACTORY: "Nhà máy", WAREHOUSE: "Kho", CUSTOM: "Tùy chỉnh" };
                                    return (
                                      <label key={scopeCode} className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${val?.scope === scopeCode ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200" : "border-slate-200 hover:bg-slate-50 text-slate-600"}`}>
                                        <input type="radio" name={`scope_${actKey}`} className="hidden"
                                          checked={val?.scope === scopeCode}
                                          onChange={() => changeScope(selectedModule.key, actKey, "scope", scopeCode)}
                                        />
                                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${val?.scope === scopeCode ? "border-white" : "border-slate-300"}`}>
                                          {val?.scope === scopeCode && <div className="w-2 h-2 rounded-full bg-white" />}
                                        </div>
                                        <span className="text-sm font-semibold">{scopeLabels[scopeCode]}</span>
                                      </label>
                                    );
                                  })}
                                </div>

                                {/* Form phụ thuộc Scope */}
                                {val?.scope === "FACTORY" && (
                                  <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 animate-in fade-in slide-in-from-top-2">
                                    <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">Chọn Nhà máy cho phép truy cập</label>
                                    <select className="w-full text-sm border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                                      value={val?.scopeValue || ""} onChange={e => changeScope(selectedModule.key, actKey, "scopeValue", e.target.value)}>
                                      <option value="">-- Tất cả nhà máy --</option>
                                      <option value="Nhà máy thổi">Nhà máy thổi</option>
                                      <option value="Nhà máy cắt">Nhà máy cắt</option>
                                      <option value="Nhà máy in">Nhà máy in</option>
                                    </select>
                                  </div>
                                )}
                                {val?.scope === "WAREHOUSE" && (
                                  <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 animate-in fade-in slide-in-from-top-2">
                                    <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">Chọn Kho cho phép truy cập</label>
                                    <select className="w-full text-sm border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                                      value={val?.scopeValue || ""} onChange={e => changeScope(selectedModule.key, actKey, "scopeValue", e.target.value)}>
                                      <option value="">-- Tất cả kho --</option>
                                      <option value="Kho Nguyên vật liệu">Kho Nguyên vật liệu</option>
                                      <option value="Kho Thành phẩm">Kho Thành phẩm</option>
                                      <option value="Kho Phế liệu">Kho Phế liệu</option>
                                    </select>
                                  </div>
                                )}
                                {val?.scope === "CUSTOM" && (
                                  <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2 shadow-sm">
                                    <Settings size={20} className="text-amber-500" />
                                    <span className="font-medium">Giao diện Rule Builder nâng cao đang được phát triển.</span>
                                  </div>
                                )}
                           </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">Chọn một module bên trái để cấu hình</div>
            )}
          </div>
        </div>
      </div>
  );
}


/* ─── 3. MÀN HÌNH CHÍNH ─── */
export default function PermissionsModule() {
  const [roleList, setRoleList] = useState([]);
  const [roleId, setRoleId] = useState("");
  const [parentId, setParentId] = useState("");
  const [perms, setPerms] = useState({});
  const [effectivePerms, setEffectivePerms] = useState({});
  
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchRoles = useCallback(async () => {
    try {
      const res = await roles.list();
      setRoleList(res || []);
      if (res?.length > 0 && !roleId) {
        selectRole(res[0].id, res);
      }
    } catch (e) {
      console.error(e);
    }
  }, [roleId]);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  const fetchEffectivePerms = useCallback(async (id) => {
    try {
      const ep = await roles.getEffectivePermissions(id);
      setEffectivePerms(ep);
    } catch (e) { console.error(e); }
  }, []);

  const selectRole = useCallback(async (id, list = roleList) => {
    setRoleId(id);
    if (!id) {
      setPerms({}); setParentId(""); setEffectivePerms({});
      return;
    }
    try {
      const r = await roles.get(id);
      // Chuyển đổi dữ liệu cũ (true/false) sang format mới nếu cần, 
      // nhưng ở đây ta cứ giữ nguyên JSONB trả về từ DB, lúc parse tính sau.
      setPerms(r.permissions || {});
      setParentId(r.parent_id || "");
      fetchEffectivePerms(id);
    } catch (e) { toast.error("Lỗi tải vai trò: " + e.message); }
  }, [roleList, fetchEffectivePerms]);

  const activeRole = roleList.find(r => r.id === roleId);

  // Parse flattened permissions for the Table
  // Format: [ { moduleKey, actionKey, isInherited, scope, scopeValue } ]
  const flatTableData = useMemo(() => {
    const list = [];
    // Gộp cả perms (trực tiếp) và effectivePerms (kế thừa)
    // Để phân biệt nguồn: nếu có trong perms thì là TRỰC TIẾP, nếu có trong effective nhưng k có trong perms thì KẾ THỪA
    
    // Duyệt qua tất cả effective (vì effective = inherited + direct)
    Object.entries(effectivePerms).forEach(([modKey, actions]) => {
      if (!actions) return;
      Object.entries(actions).forEach(([actKey, val]) => {
        // Bỏ qua fields cũ
        if (actKey === "fields") return;
        
        const isAllow = (typeof val === 'object' && val.status === 'ALLOW') || val === true || val === 'ALLOW';
        if (!isAllow) return;

        const isDirect = perms[modKey]?.[actKey] !== undefined;
        const scope = val?.scope || "ALL";
        const scopeValue = val?.scopeValue || "";

        list.push({
          moduleKey: modKey,
          actionKey: actKey,
          scope,
          scopeValue,
          isDirect
        });
      });
    });

    // Lọc theo tìm kiếm
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return list.filter(item => {
        const minfo = getModuleInfo(item.moduleKey);
        const actLabel = ACTION_LABELS[item.actionKey] || item.actionKey;
        return minfo.label.toLowerCase().includes(q) || actLabel.toLowerCase().includes(q);
      });
    }

    // Sắp xếp theo module -> action
    return list.sort((a, b) => a.moduleKey.localeCompare(b.moduleKey) || a.actionKey.localeCompare(b.actionKey));
  }, [effectivePerms, perms, searchQuery]);

  const [expandedModules, setExpandedModules] = useState({});

  const toggleExpand = (modKey) => {
    setExpandedModules(p => ({ ...p, [modKey]: !p[modKey] }));
  };

  const groupedData = useMemo(() => {
    const map = new Map();
    flatTableData.forEach(row => {
      if (!map.has(row.moduleKey)) {
        map.set(row.moduleKey, {
           moduleKey: row.moduleKey,
           info: getModuleInfo(row.moduleKey),
           actions: []
        });
      }
      map.get(row.moduleKey).actions.push(row);
    });
    return Array.from(map.values());
  }, [flatTableData]);

  // Handle Save from Editor
  const handleSavePerms = async (newPerms) => {
    try {
      await roles.savePermissions(roleId, newPerms, parentId || null);
      toast.success("Đã lưu phân quyền!");
      setIsEditMode(false);
      // Reload current role
      selectRole(roleId);
    } catch (e) {
      toast.error("Lỗi lưu: " + e.message);
    }
  };

  // Nhanh chóng xóa 1 quyền từ bảng
  const handleDeleteDirectPerm = async (modKey, actKey) => {
    if (!window.confirm(`Bạn có chắc muốn gỡ quyền này?`)) return;
    try {
      const newPerms = JSON.parse(JSON.stringify(perms));
      if (newPerms[modKey]) {
        delete newPerms[modKey][actKey];
        if (Object.keys(newPerms[modKey]).length === 0) delete newPerms[modKey];
      }
      await roles.savePermissions(roleId, newPerms, parentId || null);
      toast.success("Đã xóa quyền");
      selectRole(roleId);
    } catch (e) { toast.error("Lỗi: " + e.message); }
  };

  // Thống kê nhanh
  const statTotal = flatTableData.length;
  const statModules = new Set(flatTableData.map(d => d.moduleKey)).size;
  const statConstrained = flatTableData.filter(d => d.scope !== "ALL").length;
  const statFull = statTotal - statConstrained;

  if (isEditMode) {
    return (
      <div className="space-y-6">
        <ListHeader title={`Cấu hình quyền: ${activeRole?.name}`} subtitle="Chỉnh sửa chi tiết quyền và phạm vi dữ liệu cho vai trò này" />
        <PermissionEditor 
          roleName={activeRole?.name}
          initialPerms={perms}
          onSave={handleSavePerms}
          onCancel={() => setIsEditMode(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ListHeader title="Phân quyền hệ thống" subtitle="Quản lý quyền truy cập và phạm vi dữ liệu theo vai trò" />

      {/* ─── Control Bar ─── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-5">
          <div className="flex-1 min-w-[250px]">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Vai trò đang chọn</label>
            <select className="w-full border-slate-200 rounded-lg text-sm focus:ring-indigo-500" 
              value={roleId} onChange={(e) => selectRole(e.target.value)}>
              <option value="">-- Chọn vai trò --</option>
              {roleList.map((r) => <option key={r.id} value={r.id}>{r.role_code} · {r.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[250px]">
            <label className="block text-sm font-medium text-slate-500 mb-2">Kế thừa quyền từ</label>
            <select className="w-full border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500" 
              value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={!roleId}>
              <option value="">-- Không kế thừa --</option>
              {roleList.filter(r => r.id !== roleId).map((r) => <option key={r.id} value={r.id}>{r.role_code} · {r.name}</option>)}
            </select>
          </div>
          <div>
            <button onClick={() => setIsEditMode(true)} disabled={!roleId} className="btn-primary h-[38px] flex items-center gap-2 shadow-sm shadow-indigo-200">
              <Edit size={16} /> Cấu hình quyền
            </button>
          </div>
        </div>
      </div>

      {!roleId ? (
        <div className="bg-white rounded-xl border border-slate-200 border-dashed p-16 flex flex-col items-center text-center">
          <ShieldCheck size={48} className="text-slate-300 mb-4" />
          <p className="text-lg font-semibold text-slate-600">Chưa chọn vai trò</p>
          <p className="text-sm text-slate-400 mt-1">Vui lòng chọn một vai trò ở phía trên để xem và cấu hình quyền.</p>
        </div>
      ) : (
        <>
          {/* ─── Tổng quan KPI ─── */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Tổng số quyền", val: statTotal, color: "text-blue-600" },
              { label: "Module được truy cập", val: statModules, color: "text-indigo-600" },
              { label: "Quyền có ràng buộc", val: statConstrained, color: "text-amber-600" },
              { label: "Quyền toàn cục", val: statFull, color: "text-emerald-600" },
            ].map((k, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase">{k.label}</p>
                <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.val}</p>
              </div>
            ))}
          </div>

          {/* ─── Bảng quyền chi tiết ─── */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 bg-white flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2"><ShieldCheck size={18} className="text-indigo-500"/> Chi tiết quyền của vai trò</h3>
              <div className="relative w-72">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input placeholder="Tìm quyền..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
            </div>

            <div className="p-4 space-y-3 bg-slate-50 border-t border-slate-200 min-h-[300px]">
              {groupedData.length === 0 ? (
                <div className="py-12 text-center text-slate-400 bg-white rounded-lg border border-slate-200">Không có quyền nào được cấp cho vai trò này.</div>
              ) : (
                groupedData.map((group) => (
                  <div key={group.moduleKey} className="bg-white rounded-lg border border-slate-200 overflow-hidden transition-all shadow-sm">
                    {/* Header: Click to expand */}
                    <div 
                      className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-indigo-50/30 transition-colors"
                      onClick={() => toggleExpand(group.moduleKey)}
                    >
                      <div className="flex items-center gap-4">
                         <div className="w-10 h-10 bg-indigo-50 rounded-lg text-indigo-600 flex items-center justify-center">
                           <ShieldCheck size={20} />
                         </div>
                         <div>
                           <div className="font-semibold text-slate-800 text-base">{group.info.label}</div>
                           <div className="text-xs text-slate-400 uppercase tracking-wider font-medium mt-0.5">{group.info.category}</div>
                         </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                           <span className="font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">{group.actions.length}</span> thao tác
                        </div>
                        <ChevronRight className={`text-slate-400 transition-transform ${expandedModules[group.moduleKey] ? 'rotate-90' : ''}`} size={20} />
                      </div>
                    </div>
                    
                    {/* Expanded Detail */}
                    {expandedModules[group.moduleKey] && (
                      <div className="border-t border-slate-100 bg-slate-50/50 p-5">
                         <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                           {group.actions.map((row, idx) => {
                              const actLabel = ACTION_LABELS[row.actionKey] || row.actionKey;
                              const scopeLabels = { ALL: "Toàn bộ", FACTORY: "Nhà máy", WAREHOUSE: "Kho", CUSTOM: "Tùy chỉnh" };
                              
                              return (
                                <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                                  <div>
                                    <div className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                      {actLabel}
                                    </div>
                                    <div className="text-xs mt-2 pl-3.5">
                                      {row.scope === "ALL" ? (
                                        <span className="text-emerald-600 font-medium bg-emerald-50 px-2 py-1 rounded">Toàn bộ dữ liệu</span>
                                      ) : (
                                        <span className="text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded">Theo {scopeLabels[row.scope]}: <span className="font-bold">{row.scopeValue}</span></span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-3">
                                     {row.isDirect ? (
                                      <span className="text-[10px] uppercase tracking-wider text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">Trực tiếp</span>
                                    ) : (
                                      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded border border-slate-200">Kế thừa</span>
                                    )}
                                    
                                    {row.isDirect && (
                                      <button onClick={() => handleDeleteDirectPerm(row.moduleKey, row.actionKey)} className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors" title="Xóa quyền">
                                        <Trash2 size={16} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                           })}
                         </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
