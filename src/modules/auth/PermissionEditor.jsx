import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ShieldCheck, Search, Plus, Filter, Edit, Trash2, X, ChevronRight, ChevronDown, ChevronUp,
  Package, Factory, LayoutDashboard, Calendar, ClipboardList, Check, Minus, ArrowLeft, RotateCcw,
  BarChart2, Settings, Save, Users
} from "lucide-react";
import { ListHeader } from "../../components.jsx";
import { roles } from "../../mesApi.js";
import { toast, statusClass } from "../../ui.js";

/* ─── 1. KẾT CẤU CÂY MODULE & THAO TÁC (RBAC) ─── */
export const ACTION_LABELS = {
  view: "Xem", create: "Tạo mới", edit: "Sửa", delete: "Xóa",
  approve: "Duyệt", publish: "Phát hành", assign: "Phân công",
  execute: "Thực thi", import: "Import", export: "Xuất Excel",
  print: "In tem"
};

export const PERM_TREE = [
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
      { key: "deliveries", label: "Phiếu giao hàng", actions: ["view", "create", "edit", "delete", "approve"] },
      { key: "planning", label: "Kế hoạch sản xuất", actions: ["view", "create", "edit", "publish"] },
      { key: "workschedule", label: "Lịch sản xuất", actions: ["view", "create", "edit", "publish"] },
    ]
  },
  {
    category: "Sản xuất",
    icon: Factory,
    modules: [
      { key: "production", label: "Lệnh sản xuất", actions: ["view", "create", "edit", "delete", "publish", "assign", "export"] },
      { key: "orderstatus", label: "Lệnh theo trạng thái", actions: ["view", "edit"] },
      { key: "execution", label: "Thực thi sản xuất", actions: ["view", "execute"] },
      { key: "prod_output", label: "Sản lượng", actions: ["view", "edit", "export"] },
      { key: "qrlabels", label: "In tem xuất xứ", actions: ["view", "create", "print"] },
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
      { key: "inv_adjust", label: "Điều chỉnh tồn kho", actions: ["view", "create", "approve"] },
    ]
  },
  {
    category: "Truy xuất",
    icon: Search,
    modules: [
      { key: "qrscan", label: "Tra cứu xuất xứ", actions: ["view"] },
      { key: "trace_lot", label: "Truy xuất lô", actions: ["view"] },
    ]
  },
  {
    category: "Báo cáo",
    icon: BarChart2,
    modules: [
      { key: "reports", label: "Báo cáo KPI", actions: ["view", "export"] },
      { key: "rep_inv", label: "Báo cáo kho", actions: ["view", "export"] },
      { key: "rep_employee", label: "Hiệu suất nhân viên", actions: ["view", "export"] },
    ]
  },
  {
    category: "Quản trị danh mục",
    icon: Settings,
    modules: [
      { key: "products", label: "Sản phẩm", actions: ["view", "create", "edit", "delete"] },
      { key: "bom", label: "Định mức (BOM)", actions: ["view", "create", "edit", "delete"] },
      { key: "process", label: "Quy trình công nghệ", actions: ["view", "create", "edit", "delete"] },
      { key: "md_machines", label: "Máy móc", actions: ["view", "create", "edit"] },
      { key: "md_employees", label: "Nhân viên", actions: ["view", "create", "edit"] },
      { key: "md_shifts", label: "Ca làm việc", actions: ["view", "create", "edit", "delete"] },
      { key: "md_warehouses", label: "Kho (danh mục)", actions: ["view", "create", "edit", "delete"] },
      { key: "md_zones", label: "Khu vực", actions: ["view", "create", "edit", "delete"] },
      { key: "md_locations", label: "Vị trí lưu trữ", actions: ["view", "create", "edit", "delete"] },
      { key: "md_customers", label: "Khách hàng", actions: ["view", "create", "edit", "delete"] },
      { key: "md_roles", label: "Vai trò", actions: ["view", "create", "edit", "delete"] },
    ]
  }
];

// Helper: Lấy thông tin module từ key
export const getModuleInfo = (key) => {
  for (const cat of PERM_TREE) {
    const mod = cat.modules.find(m => m.key === key);
    if (mod) return { category: cat.category, ...mod };
  }
  return { category: "Khác", key, label: key, actions: ["view"] };
};

/* ─── 2. COMPONENT EDITOR (THÊM / SỬA QUYỀN TRÊN MÀN HÌNH RIÊNG) ─── */
export function PermissionEditor({ roleName, initialPerms, onSave, onCancel }) {
  // Format: { [moduleKey]: { [actionKey]: { status: 'ALLOW', scope: 'ALL', scopeValue: '' } } }
  const [draft, setDraft] = useState(initialPerms || {});
  
  const [searchQuery, setSearchQuery] = useState("");
  const [appFilter, setAppFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL, SELECTED, UNSELECTED
  const [expandedCard, setExpandedCard] = useState(null); // module key mở rộng

  useEffect(() => {
    setDraft(initialPerms || {});
  }, [initialPerms]);

  // Tính trạng thái của một module: ALL, PARTIAL, NONE
  const getModuleState = (modKey) => {
    const modInfo = getModuleInfo(modKey);
    const totalActions = modInfo.actions.length;
    const modDraft = draft[modKey] || {};
    const activeActions = Object.values(modDraft).filter(v => v.status === "ALLOW" || v === true).length;

    if (activeActions === 0) return 'NONE';
    if (activeActions === totalActions) return 'ALL';
    return 'PARTIAL';
  };

  const totalModules = useMemo(() => PERM_TREE.reduce((sum, cat) => sum + cat.modules.length, 0), []);
  const selectedModulesCount = useMemo(() => {
    let count = 0;
    PERM_TREE.forEach(cat => {
      cat.modules.forEach(mod => {
        if (getModuleState(mod.key) !== 'NONE') count++;
      });
    });
    return count;
  }, [draft]);

  const toggleModule = (modKey) => {
    const state = getModuleState(modKey);
    const modInfo = getModuleInfo(modKey);
    if (state === 'ALL' || state === 'PARTIAL') {
      const newDraft = { ...draft };
      delete newDraft[modKey];
      setDraft(newDraft);
    } else {
      const newModDraft = {};
      modInfo.actions.forEach(act => {
        newModDraft[act] = { status: "ALLOW", scope: "ALL", scopeValue: "" };
      });
      setDraft({ ...draft, [modKey]: newModDraft });
    }
  };

  const toggleAction = (modKey, actKey) => {
    const modDraft = { ...(draft[modKey] || {}) };
    const current = modDraft[actKey];
    if (current?.status === "ALLOW" || current === true) {
      delete modDraft[actKey];
    } else {
      modDraft[actKey] = { status: "ALLOW", scope: "ALL", scopeValue: "" };
    }
    
    if (Object.keys(modDraft).length === 0) {
      const newDraft = { ...draft };
      delete newDraft[modKey];
      setDraft(newDraft);
    } else {
      setDraft({ ...draft, [modKey]: modDraft });
    }
  };

  const changeScope = (modKey, actKey, field, val) => {
    const actDraft = (draft[modKey] || {})[actKey] || { status: "ALLOW", scope: "ALL", scopeValue: "" };
    setDraft({
      ...draft,
      [modKey]: {
        ...draft[modKey],
        [actKey]: { ...actDraft, [field]: val }
      }
    });
  };

  const handleSelectAll = () => {
    const newDraft = {};
    PERM_TREE.forEach(cat => {
      cat.modules.forEach(mod => {
        newDraft[mod.key] = {};
        mod.actions.forEach(act => {
          newDraft[mod.key][act] = { status: "ALLOW", scope: "ALL", scopeValue: "" };
        });
      });
    });
    setDraft(newDraft);
  };

  const handleClearAll = () => {
    setDraft({});
  };

  const filteredTree = useMemo(() => {
    return PERM_TREE.map(cat => {
      if (appFilter !== "ALL" && cat.category !== appFilter) return null;
      
      const filteredModules = cat.modules.filter(mod => {
        const state = getModuleState(mod.key);
        const textMatch = mod.label.toLowerCase().includes(searchQuery.toLowerCase()) || mod.key.toLowerCase().includes(searchQuery.toLowerCase());
        if (!textMatch) return false;
        if (statusFilter === "SELECTED" && state === 'NONE') return false;
        if (statusFilter === "UNSELECTED" && state !== 'NONE') return false;
        return true;
      });

      if (filteredModules.length === 0) return null;
      return { ...cat, modules: filteredModules };
    }).filter(Boolean);
  }, [draft, searchQuery, appFilter, statusFilter]);

  return (
    <div className="bg-slate-50 flex flex-col h-[calc(100vh-80px)] overflow-hidden font-sans border border-slate-200 rounded-xl shadow-sm">
      {/* Header Panel */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-800 font-semibold flex items-center gap-2 transition-colors">
            <ArrowLeft size={18} /> Danh sách quyền
          </button>
          <div className="h-6 w-px bg-slate-200"></div>
          <div>
            <div className="text-sm text-slate-500">Đang cấu hình cho vai trò</div>
            <div className="font-bold text-slate-800">{roleName}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setDraft(initialPerms || {})} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium rounded-lg flex items-center gap-2 transition-colors text-sm">
             <RotateCcw size={16} /> Đặt lại
          </button>
          <button onClick={() => onSave(draft)} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-md text-sm">
            <Save size={16} /> Lưu cấu hình
          </button>
        </div>
      </div>

      {/* Main Content Scroll */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Danh mục Tài nguyên */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Section Header */}
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="text-teal-500" size={24} />
                <h3 className="font-bold text-slate-800 text-lg">Phân quyền Tài nguyên & Menu</h3>
                <span className="bg-slate-100 text-slate-600 font-semibold px-2.5 py-1 rounded-md text-sm border border-slate-200">
                  {selectedModulesCount} / {totalModules} đã chọn
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleSelectAll} className="px-4 py-1.5 border border-slate-200 rounded-md text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Chọn tất cả ({totalModules})</button>
                <button onClick={handleClearAll} className="px-4 py-1.5 border border-slate-200 rounded-md text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Bỏ chọn tất cả</button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-2 rounded-lg border border-slate-100">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Tìm kiếm tài nguyên theo tên, mã..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-teal-500 focus:border-teal-500 outline-none"
                />
              </div>
              <div className="w-56">
                <select 
                  value={appFilter}
                  onChange={e => setAppFilter(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-teal-500 outline-none text-slate-700 font-medium"
                >
                  <option value="ALL">Tất cả ứng dụng ({PERM_TREE.length})</option>
                  {PERM_TREE.map(c => <option key={c.category} value={c.category}>{c.category}</option>)}
                </select>
              </div>
              <div className="flex bg-white rounded-md border border-slate-300 overflow-hidden">
                <button onClick={() => setStatusFilter('ALL')} className={`px-4 py-2 text-sm font-medium ${statusFilter==='ALL' ? 'bg-teal-50 text-teal-700 border-b-2 border-teal-500' : 'text-slate-600 hover:bg-slate-50'}`}>Tất cả ({totalModules})</button>
                <button onClick={() => setStatusFilter('SELECTED')} className={`px-4 py-2 text-sm font-medium border-l border-slate-300 ${statusFilter==='SELECTED' ? 'bg-teal-50 text-teal-700 border-b-2 border-teal-500' : 'text-slate-600 hover:bg-slate-50'}`}>Đã chọn ({selectedModulesCount})</button>
                <button onClick={() => setStatusFilter('UNSELECTED')} className={`px-4 py-2 text-sm font-medium border-l border-slate-300 ${statusFilter==='UNSELECTED' ? 'bg-teal-50 text-teal-700 border-b-2 border-teal-500' : 'text-slate-600 hover:bg-slate-50'}`}>Chưa chọn ({totalModules - selectedModulesCount})</button>
              </div>
            </div>
          </div>

          {/* Categories & Cards */}
          <div className="p-5 space-y-8">
            {filteredTree.length === 0 ? (
              <div className="text-center py-12 text-slate-400">Không tìm thấy tài nguyên nào phù hợp.</div>
            ) : filteredTree.map(cat => {
              const catSelected = cat.modules.filter(m => getModuleState(m.key) !== 'NONE').length;
              return (
                <div key={cat.category} className="space-y-4">
                  {/* Category Header */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600 shadow-sm border border-teal-100">
                      <cat.icon size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">{cat.category}</h4>
                      <div className="text-xs text-slate-500 uppercase tracking-wide">APP_{cat.category.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}</div>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                       <span className="text-sm font-semibold text-slate-500">{catSelected} / {cat.modules.length} đã chọn</span>
                    </div>
                  </div>

                  {/* Cards Grid */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pl-11">
                    {cat.modules.map(mod => {
                      const state = getModuleState(mod.key);
                      const isExpanded = expandedCard === mod.key;

                      return (
                        <div key={mod.key} className={`border rounded-xl bg-white transition-all overflow-hidden ${state !== 'NONE' ? 'border-teal-200 shadow-sm ring-1 ring-teal-50' : 'border-slate-200'}`}>
                          {/* Card Header (Click to toggle expand) */}
                          <div 
                            className={`p-4 flex items-start gap-4 cursor-pointer hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-slate-50/50' : ''}`}
                            onClick={() => setExpandedCard(isExpanded ? null : mod.key)}
                          >
                            {/* Checkbox (Click to toggle module) */}
                            <div 
                              onClick={(e) => { e.stopPropagation(); toggleModule(mod.key); }}
                              className={`mt-1 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer
                                ${state === 'ALL' ? 'bg-teal-500 border-teal-500 text-white' : 
                                  state === 'PARTIAL' ? 'bg-teal-500 border-teal-500 text-white' : 'border-slate-300 bg-white hover:border-teal-400'}`}
                            >
                              {state === 'ALL' && <Check size={12} strokeWidth={3} />}
                              {state === 'PARTIAL' && <div className="w-2.5 h-0.5 bg-white rounded-full" />}
                            </div>

                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <div className="font-bold text-slate-800">{mod.label}</div>
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase border border-slate-200">MENU</span>
                              </div>
                              <div className="text-xs text-slate-500 font-mono bg-slate-50 inline-block px-1.5 py-0.5 rounded border border-slate-100 uppercase">MOD_{mod.key}</div>
                            </div>

                            <div className="mt-1 text-slate-400">
                              <ChevronRight size={20} className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                            </div>
                          </div>

                          {/* Expanded Content (Fine-grained actions) */}
                          {isExpanded && (
                            <div className="border-t border-slate-100 p-4 bg-slate-50/50 space-y-3">
                              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Cấu hình thao tác chi tiết</div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {mod.actions.map(actKey => {
                                  const actVal = (draft[mod.key] || {})[actKey];
                                  const isChecked = actVal?.status === "ALLOW" || actVal === true;

                                  return (
                                    <div key={actKey} className={`border rounded-lg p-3 transition-colors ${isChecked ? 'bg-white border-teal-200 shadow-sm' : 'bg-transparent border-slate-200'}`}>
                                      <label className="flex items-center gap-3 cursor-pointer select-none">
                                        <input 
                                          type="checkbox" 
                                          checked={isChecked} 
                                          onChange={() => toggleAction(mod.key, actKey)}
                                          className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500" 
                                        />
                                        <span className={`font-semibold text-sm ${isChecked ? 'text-teal-700' : 'text-slate-600'}`}>{ACTION_LABELS[actKey] || actKey}</span>
                                      </label>

                                      {/* Action Scopes */}
                                      {isChecked && (
                                        <div className="mt-3">
                                          <div className="flex flex-wrap gap-2">
                                            {["ALL", "FACTORY", "WAREHOUSE", "CUSTOM"].map(scopeCode => {
                                              const scopeLabels = { ALL: "Toàn bộ", FACTORY: "Nhà máy", WAREHOUSE: "Kho", CUSTOM: "Tùy chỉnh" };
                                              const sChecked = (actVal?.scope || "ALL") === scopeCode;
                                              return (
                                                <label key={scopeCode} className={`flex items-center gap-1.5 px-2 py-1.5 rounded border cursor-pointer transition-all ${sChecked ? "bg-teal-50 border-teal-500 text-teal-700 font-medium" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-600 text-xs"}`}>
                                                  <input 
                                                    type="radio" 
                                                    name={`scope_${mod.key}_${actKey}`} 
                                                    className="hidden"
                                                    checked={sChecked}
                                                    onChange={() => changeScope(mod.key, actKey, "scope", scopeCode)}
                                                  />
                                                  <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${sChecked ? "border-teal-500" : "border-slate-300"}`}>
                                                    {sChecked && <div className="w-1.5 h-1.5 rounded-full bg-teal-500" />}
                                                  </div>
                                                  <span className="text-[11px]">{scopeLabels[scopeCode]}</span>
                                                </label>
                                              );
                                            })}
                                          </div>

                                          {/* Scope Selectors */}
                                          {(actVal?.scope === "FACTORY" || actVal?.scope === "WAREHOUSE") && (
                                            <div className="mt-2 p-2 bg-slate-50 rounded border border-slate-100">
                                              <select 
                                                className="w-full text-xs border-slate-300 rounded focus:ring-teal-500 focus:border-teal-500 py-1"
                                                value={actVal?.scopeValue || ""} 
                                                onChange={e => changeScope(mod.key, actKey, "scopeValue", e.target.value)}
                                              >
                                                <option value="">-- Chọn {actVal.scope === "FACTORY" ? "Nhà máy" : "Kho"} --</option>
                                                {actVal.scope === "FACTORY" ? (
                                                  <>
                                                    <option value="Nhà máy thổi">Nhà máy thổi</option>
                                                    <option value="Nhà máy cắt">Nhà máy cắt</option>
                                                    <option value="Nhà máy in">Nhà máy in</option>
                                                  </>
                                                ) : (
                                                  <>
                                                    <option value="Kho Nguyên vật liệu">Kho Nguyên vật liệu</option>
                                                    <option value="Kho Thành phẩm">Kho Thành phẩm</option>
                                                    <option value="Kho Phế liệu">Kho Phế liệu</option>
                                                  </>
                                                )}
                                              </select>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
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
