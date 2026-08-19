import React, { useState, useEffect, useMemo } from "react";
import { Search, Save, Settings, Package, Factory, LayoutDashboard, Calendar, BarChart2, ShieldCheck, ChevronRight, X, UserCircle } from "lucide-react";
import { statusClass } from "../../ui.js";

const ACTION_LABELS = {
  view: "Xem", create: "Tạo mới", edit: "Sửa", delete: "Xóa",
  approve: "Duyệt", publish: "Phát hành", assign: "Phân công",
  execute: "Thực thi", import: "Import", export: "Xuất Excel"
};

const PERM_TREE = [
  {
    category: "Hệ thống chung", icon: LayoutDashboard,
    modules: [{ key: "dashboard", label: "Dashboard", actions: ["view"] }]
  },
  {
    category: "Kinh doanh & Kế hoạch", icon: Calendar,
    modules: [
      { key: "orders", label: "Đơn hàng", actions: ["view", "create", "edit", "delete", "approve"] },
      { key: "planning", label: "Kế hoạch sản xuất", actions: ["view", "create", "edit", "publish"] },
    ]
  },
  {
    category: "Sản xuất", icon: Factory,
    modules: [
      { key: "production", label: "Lệnh sản xuất", actions: ["view", "create", "edit", "delete", "publish", "assign", "export"] },
      { key: "execution", label: "Thực thi sản xuất", actions: ["view", "execute"] },
      { key: "prod_output", label: "Sản lượng", actions: ["view", "edit", "export"] },
    ]
  },
  {
    category: "Kho", icon: Package,
    modules: [
      { key: "inventory", label: "Tồn kho", actions: ["view", "export"] },
      { key: "inv_inbound", label: "Nhập kho", actions: ["view", "create", "edit", "delete", "approve"] },
      { key: "inv_outbound", label: "Xuất kho", actions: ["view", "create", "edit", "delete", "approve"] },
      { key: "inv_transfer", label: "Chuyển kho", actions: ["view", "create", "approve"] },
    ]
  },
  {
    category: "Báo cáo", icon: BarChart2,
    modules: [
      { key: "reports", label: "Báo cáo KPI", actions: ["view", "export"] },
      { key: "rep_inv", label: "Báo cáo kho", actions: ["view", "export"] },
    ]
  },
  {
    category: "Quản trị danh mục", icon: Settings,
    modules: [
      { key: "products", label: "Sản phẩm", actions: ["view", "create", "edit", "delete"] },
      { key: "bom", label: "Định mức (BOM)", actions: ["view", "create", "edit", "delete"] },
      { key: "md_employees", label: "Nhân viên", actions: ["view", "create", "edit"] },
      { key: "md_machines", label: "Máy móc", actions: ["view", "create", "edit"] },
      { key: "md_roles", label: "Vai trò", actions: ["view", "create", "edit", "delete"] },
    ]
  }
];

export function PermissionEditor({ 
  title, subtitle, 
  initialPerms = {}, 
  inheritedPerms = {}, 
  roleUsers = [], 
  isUserMode = false,
  onSave, onCancel, compact = false 
}) {
  const [selectedModule, setSelectedModule] = useState(null);
  const [draft, setDraft] = useState({});
  const [search, setSearch] = useState("");

  useEffect(() => {
    // Convert boolean permissions to object structure if needed for backward compatibility
    const normalize = (perms) => {
      const res = {};
      for (const [mod, acts] of Object.entries(perms || {})) {
        res[mod] = {};
        for (const [act, val] of Object.entries(acts || {})) {
          if (typeof val === 'boolean' || val === 'ALLOW') {
            res[mod][act] = { status: val === true || val === 'ALLOW' ? 'ALLOW' : 'DENY', scope: 'ALL', users: [] };
          } else if (typeof val === 'object') {
            res[mod][act] = val;
          }
        }
      }
      return res;
    };
    setDraft(normalize(initialPerms));
    setSelectedModule(PERM_TREE[0].modules[0]);
  }, [initialPerms]);

  const toggleAction = (modKey, actKey, currentVal) => {
    const modDraft = draft[modKey] || {};
    if (currentVal?.status === "ALLOW") {
      const newModDraft = { ...modDraft };
      delete newModDraft[actKey];
      setDraft({ ...draft, [modKey]: newModDraft });
    } else {
      setDraft({ ...draft, [modKey]: { ...modDraft, [actKey]: { status: "ALLOW", scope: "ALL", users: [] } } });
    }
  };

  const updateActionField = (modKey, actKey, field, val) => {
    const actDraft = draft[modKey]?.[actKey] || { status: "ALLOW", scope: "ALL", users: [] };
    setDraft({
      ...draft,
      [modKey]: {
        ...draft[modKey],
        [actKey]: { ...actDraft, [field]: val }
      }
    });
  };

  const toggleUserInAction = (modKey, actKey, userId) => {
    const actDraft = draft[modKey]?.[actKey] || { status: "ALLOW", scope: "ALL", users: [] };
    const currentUsers = actDraft.users || [];
    const newUsers = currentUsers.includes(userId) 
      ? currentUsers.filter(id => id !== userId)
      : [...currentUsers, userId];
    updateActionField(modKey, actKey, "users", newUsers);
  };

  const filteredTree = useMemo(() => {
    if (!search) return PERM_TREE;
    const q = search.toLowerCase();
    return PERM_TREE.map(cat => {
      const mods = cat.modules.filter(m => m.label.toLowerCase().includes(q));
      return mods.length ? { ...cat, modules: mods } : null;
    }).filter(Boolean);
  }, [search]);

  const modDraft = draft[selectedModule?.key] || {};
  const modInherited = inheritedPerms[selectedModule?.key] || {};

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col animate-in fade-in ${compact ? 'h-[calc(100vh-200px)]' : 'h-[calc(100vh-120px)]'}`}>
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{title || "Cấu hình phân quyền"}</h2>
          {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          {onCancel && <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition">Hủy bỏ</button>}
          <button onClick={() => onSave(draft)} className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm">
            <Save size={16} /> Lưu quyền
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex min-h-0">
        {/* Left Column: Modules */}
        <div className="w-72 bg-slate-50 border-r border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-200 shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Tìm module..." value={search} onChange={e => setSearch(e.target.value)} 
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {filteredTree.map((cat, i) => (
              <div key={i}>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-3 flex items-center gap-1.5">
                  <cat.icon size={14} /> {cat.category}
                </div>
                <div className="space-y-1">
                  {cat.modules.map(mod => {
                    const isSelected = selectedModule?.key === mod.key;
                    // Count allowed actions
                    const actsDraft = draft[mod.key] || {};
                    const actsInh = inheritedPerms[mod.key] || {};
                    const count = mod.actions.filter(a => actsDraft[a]?.status === 'ALLOW' || actsInh[a] === 'ALLOW' || actsInh[a]?.status === 'ALLOW').length;
                    
                    return (
                      <button key={mod.key} onClick={() => setSelectedModule(mod)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${isSelected ? "bg-blue-100 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-200/50"}`}>
                        <span>{mod.label}</span>
                        {count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSelected ? "bg-blue-200 text-blue-800" : "bg-slate-200 text-slate-500"}`}>{count}/{mod.actions.length}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Actions */}
        <div className="flex-1 overflow-y-auto bg-white p-6 relative">
          {selectedModule ? (
            <div className="max-w-4xl">
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  {selectedModule.label}
                </h3>
                <p className="text-sm text-slate-500 mt-1">Cấu hình các thao tác được phép và giới hạn phạm vi truy cập dữ liệu.</p>
              </div>

              <div className="space-y-4">
                {selectedModule.actions.map(actKey => {
                  const draftVal = modDraft[actKey];
                  const inhVal = modInherited[actKey];
                  
                  // Kế thừa: có thể là boolean, string 'ALLOW', hoặc object
                  const isInheritedAllow = inhVal === true || inhVal === 'ALLOW' || inhVal?.status === 'ALLOW';
                  const isDraftAllow = draftVal?.status === 'ALLOW';
                  
                  // Nút gạt chính hiển thị ON nếu: Đang tick (Draft) hoặc Kế thừa
                  const isAllowed = isInheritedAllow || isDraftAllow;
                  
                  // Chỉ định tài khoản
                  const hasUserOverride = draftVal?.users?.length > 0;

                  return (
                    <div key={actKey} className={`border rounded-xl p-4 transition-colors ${isAllowed ? "border-blue-200 bg-blue-50/30" : "border-slate-200 bg-white"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isAllowed ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400"}`}>
                            <ShieldCheck size={20} />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-700 flex items-center gap-2">
                              {ACTION_LABELS[actKey] || actKey}
                              {isInheritedAllow && !isDraftAllow && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Kế thừa</span>}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {isInheritedAllow 
                                ? "Quyền này được kế thừa từ vai trò cha." 
                                : isAllowed ? "Đã cấp quyền thực hiện thao tác này." : "Quyền này đang bị vô hiệu hóa."}
                            </div>
                          </div>
                        </div>

                        {/* Nút gạt chính */}
                        <button
                          type="button"
                          onClick={() => !isInheritedAllow && toggleAction(selectedModule.key, actKey, draftVal)}
                          disabled={isInheritedAllow}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isAllowed ? "bg-blue-600" : "bg-slate-300"} ${isInheritedAllow ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isAllowed ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                      </div>

                      {/* Các tùy chọn nâng cao khi đã bật quyền (và không phải kế thừa) */}
                      {isDraftAllow && !isInheritedAllow && (
                        <div className="mt-4 pt-4 border-t border-slate-100 pl-14 grid grid-cols-2 gap-6 animate-in slide-in-from-top-2">
                          
                          {/* Phạm vi dữ liệu */}
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Phạm vi dữ liệu</label>
                            <select 
                              value={draftVal?.scope || "ALL"} 
                              onChange={(e) => updateActionField(selectedModule.key, actKey, "scope", e.target.value)}
                              className="w-full text-sm border-slate-200 rounded-lg focus:ring-blue-500 bg-white"
                            >
                              <option value="ALL">Tất cả dữ liệu</option>
                              <option value="OWN">Chỉ dữ liệu cá nhân</option>
                              <option value="TEAM">Dữ liệu của phòng ban</option>
                            </select>
                          </div>

                          {/* Tài khoản áp dụng (Chỉ định từng tài khoản - chỉ hiện nếu không phải là UserMode) */}
                          {!isUserMode && roleUsers.length > 0 && (
                            <div>
                               <div className="flex items-center gap-2 mb-2">
                                  <input 
                                    type="checkbox" 
                                    id={`chk_${actKey}`}
                                    checked={hasUserOverride} 
                                    onChange={(e) => updateActionField(selectedModule.key, actKey, "users", e.target.checked ? [roleUsers[0]?.id] : [])}
                                    className="rounded text-blue-600 focus:ring-blue-500"
                                  />
                                  <label htmlFor={`chk_${actKey}`} className="text-xs font-semibold text-slate-600 uppercase tracking-wide cursor-pointer">Chỉ định tài khoản áp dụng</label>
                               </div>
                               
                               {hasUserOverride && (
                                 <div className="bg-white border border-slate-200 rounded-lg max-h-40 overflow-y-auto p-1 shadow-inner">
                                    {roleUsers.map(u => (
                                      <label key={u.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 cursor-pointer rounded">
                                        <input type="checkbox" checked={(draftVal?.users || []).includes(u.id)} onChange={() => toggleUserInAction(selectedModule.key, actKey, u.id)} className="rounded text-blue-600" />
                                        <span className="text-sm text-slate-700">{u.username} <span className="text-xs text-slate-400">({u.full_name})</span></span>
                                      </label>
                                    ))}
                                 </div>
                               )}
                               {!hasUserOverride && (
                                 <div className="text-sm text-slate-500 italic mt-2">Áp dụng cho toàn bộ {roleUsers.length} tài khoản trong vai trò.</div>
                               )}
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
            <div className="flex items-center justify-center h-full text-slate-400">
              Vui lòng chọn một module bên trái để cấu hình.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
