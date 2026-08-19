import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Shield, Search, Plus, Edit, Trash2, ShieldCheck, Users, Save, X, ChevronRight, CheckCircle2, UserCircle, ArrowLeft } from "lucide-react";
import { ListHeader } from "../../components.jsx";
import { roles, getToken } from "../../mesApi.js";
import { toast, statusClass } from "../../ui.js";
import { PermissionEditor } from "./PermissionEditor.jsx";

const API_BASE = import.meta.env?.VITE_API_BASE || "http://localhost:4000";

async function customHttp(path, opts) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j?.message) msg = j.message; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

export default function RolesModule() {
  const [roleList, setRoleList] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // VIEW STATE: "list" | "wizard" | "drawer"
  const [view, setView] = useState("list");
  
  // DRAWER STATE
  const [selectedRole, setSelectedRole] = useState(null);
  const [roleUsers, setRoleUsers] = useState([]);
  const [activeTab, setActiveTab] = useState("users"); // "users" | "permissions"
  const [editingUser, setEditingUser] = useState(null); // If not null, showing UserPermissionDrawer

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, uRes] = await Promise.all([
        roles.list(),
        customHttp('/api/users')
      ]);
      setRoleList(Array.isArray(rRes?.data) ? rRes.data : Array.isArray(rRes) ? rRes : []);
      setAllUsers(Array.isArray(uRes?.data) ? uRes.data : []);
    } catch (err) {
      toast.error("Lỗi lấy dữ liệu: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInitialData(); }, [fetchInitialData]);

  const loadRoleDetail = async (r) => {
    try {
      const res = await roles.get(r.id);
      setSelectedRole({
        ...r,
        permissions: res.permissions || {},
        parent_id: res.parent_id
      });
      loadRoleUsers(r.id);
      setActiveTab("users");
      setEditingUser(null);
      setView("drawer");
    } catch (err) {
      toast.error("Lỗi lấy thông tin: " + err.message);
    }
  };

  const loadRoleUsers = async (roleId) => {
    try {
      const { data } = await customHttp(`/api/roles/${roleId}/users`);
      setRoleUsers(data || []);
    } catch (err) {
      toast.error("Lỗi lấy danh sách người dùng: " + err.message);
    }
  };

  // ────────────────────────────────────────────────────────
  // RENDER: DANH SÁCH VAI TRÒ
  // ────────────────────────────────────────────────────────
  if (view === "list") {
    return (
      <div className="flex flex-col h-full bg-slate-50 animate-in fade-in duration-300">
        <div className="flex items-center justify-between px-8 py-6 bg-white border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3 tracking-tight">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                <Shield size={24} />
              </div>
              Vai trò & Phân quyền
            </h1>
            <p className="text-sm text-slate-500 mt-2">Quản lý cấu trúc vai trò, tài khoản trực thuộc và phân quyền chi tiết.</p>
          </div>
          <button onClick={() => setView("wizard")} className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-blue-700 transition shadow-sm hover:shadow">
            <Plus size={18} /> Thêm Vai trò mới
          </button>
        </div>

        <div className="p-8 pb-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="Tìm kiếm vai trò..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-all" />
          </div>
        </div>

        <div className="flex-1 overflow-auto px-8 pb-8">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <ListHeader columns={[
              { label: "Vai trò", align: "left" },
              { label: "Mô tả", align: "left" },
              { label: "Trạng thái", align: "center", width: "150px" },
              { label: "", align: "right", width: "80px" }
            ]} />
            
            <div className="divide-y divide-slate-100">
              {loading ? (
                <div className="p-12 text-center text-slate-400">Đang tải dữ liệu...</div>
              ) : roleList.length === 0 ? (
                <div className="p-12 text-center text-slate-400">Không có vai trò nào.</div>
              ) : (
                roleList.map((r) => (
                  <div key={r.id} onClick={() => loadRoleDetail(r)} className="flex items-center px-5 py-4 hover:bg-slate-50 transition cursor-pointer group">
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="font-semibold text-slate-800 text-base">{r.name}</div>
                      <div className="text-xs text-blue-600 font-medium mt-0.5">{r.role_code}</div>
                    </div>
                    <div className="flex-1 text-sm text-slate-500 truncate pr-4">{r.description || "—"}</div>
                    <div className="w-[150px] text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide ${statusClass(r.status)}`}>{r.status || "Hoạt động"}</span>
                    </div>
                    <div className="w-[80px] flex items-center justify-end text-slate-300 group-hover:text-blue-600 transition-colors">
                      <ChevronRight size={20} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────
  // RENDER: THÊM VAI TRÒ (WIZARD 4 BƯỚC)
  // ────────────────────────────────────────────────────────
  if (view === "wizard") {
    return <RoleWizard roleList={roleList} allUsers={allUsers} onCancel={() => setView("list")} onComplete={() => { fetchInitialData(); setView("list"); }} />;
  }

  // ────────────────────────────────────────────────────────
  // RENDER: DRAWER CHI TIẾT (ROLE -> USER -> PERMISSION)
  // ────────────────────────────────────────────────────────
  if (view === "drawer" && selectedRole) {
    const isEditingUser = editingUser !== null;

    const handleSaveRolePerms = async (draft) => {
      try {
        await customHttp(`/api/roles/${selectedRole.id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions: draft }) });
        toast.success("Đã lưu quyền vai trò!");
        setSelectedRole({ ...selectedRole, permissions: draft });
      } catch (err) { toast.error("Lỗi: " + err.message); }
    };

    const handleSaveUserPerms = async (draft) => {
      try {
        await customHttp(`/api/users/${editingUser.id}`, { method: 'PUT', body: JSON.stringify({ user_permissions: draft }) });
        toast.success(`Đã cập nhật quyền riêng cho ${editingUser.full_name}!`);
        // update local state
        setEditingUser({ ...editingUser, user_permissions: draft });
        setRoleUsers(roleUsers.map(u => u.id === editingUser.id ? { ...u, user_permissions: draft } : u));
      } catch (err) { toast.error("Lỗi: " + err.message); }
    };

    return (
      <div className="flex bg-slate-50 h-full relative">
        {/* Lớp phủ mờ ở sau Drawer */}
        <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-0" onClick={() => setView("list")} />
        
        {/* Drawer Panel trượt từ phải sang */}
        <div className="absolute top-0 right-0 bottom-0 w-[85vw] max-w-6xl bg-white shadow-2xl z-10 flex flex-col animate-in slide-in-from-right duration-300">
          
          {/* Drawer Header */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 bg-white">
            <div className="flex items-center gap-4">
              {isEditingUser ? (
                <button onClick={() => setEditingUser(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition">
                  <ArrowLeft size={20} />
                </button>
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow">
                  <Shield size={24} />
                </div>
              )}
              
              <div>
                {isEditingUser ? (
                  <>
                    <h2 className="text-xl font-bold text-slate-800">Quyền riêng của Tài khoản</h2>
                    <p className="text-sm text-slate-500">Người dùng: <span className="font-semibold text-blue-600">{editingUser.full_name} ({editingUser.username})</span></p>
                  </>
                ) : (
                  <>
                    <h2 className="text-2xl font-bold text-slate-800">{selectedRole.name}</h2>
                    <p className="text-sm text-slate-500">{selectedRole.description || "Chi tiết vai trò"}</p>
                  </>
                )}
              </div>
            </div>
            <button onClick={() => setView("list")} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition">
              <X size={24} />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
            {isEditingUser ? (
              /* VIEW: SỬA QUYỀN USER */
              <div className="p-6 h-full">
                 <PermissionEditor 
                   title={`Chỉnh sửa quyền cho ${editingUser.username}`}
                   subtitle="Các thao tác bật ở đây sẽ ghi đè quyền của Vai trò."
                   initialPerms={editingUser.user_permissions || {}} 
                   inheritedPerms={selectedRole.permissions || {}}
                   isUserMode={true}
                   onSave={handleSaveUserPerms}
                   onCancel={() => setEditingUser(null)}
                   compact={true}
                 />
              </div>
            ) : (
              /* VIEW: SỬA ROLE & XEM USERS */
              <>
                <div className="px-8 pt-6 pb-0 border-b border-slate-200 bg-white shrink-0">
                  <div className="flex gap-8">
                    <button onClick={() => setActiveTab("users")} className={`pb-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === "users" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                      TÀI KHOẢN TRỰC THUỘC ({roleUsers.length})
                    </button>
                    <button onClick={() => setActiveTab("permissions")} className={`pb-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === "permissions" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                      CẤU HÌNH QUYỀN VAI TRÒ
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-8">
                  {activeTab === "users" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {roleUsers.map(u => (
                        <div key={u.id} className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between shadow-sm hover:shadow transition group">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                              <UserCircle size={24} />
                            </div>
                            <div>
                              <div className="font-semibold text-slate-800">{u.full_name}</div>
                              <div className="text-sm text-slate-500">{u.username} • {u.team || "Chưa có PB"}</div>
                            </div>
                          </div>
                          <button onClick={async () => {
                              // Fetch full user to get user_permissions
                              const uDetail = await customHttp(`/api/users/${u.id}`);
                              setEditingUser(uDetail);
                            }} 
                            className="opacity-0 group-hover:opacity-100 bg-blue-50 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 transition-all">
                            Quyền riêng
                          </button>
                        </div>
                      ))}
                      {roleUsers.length === 0 && <div className="col-span-2 text-center py-10 text-slate-500">Vai trò này chưa có tài khoản nào.</div>}
                    </div>
                  )}

                  {activeTab === "permissions" && (
                    <PermissionEditor 
                      title="Quyền mặc định của Vai trò"
                      subtitle="Áp dụng cho tất cả tài khoản trong vai trò này (trừ các tài khoản có cấu hình quyền riêng)."
                      initialPerms={selectedRole.permissions}
                      inheritedPerms={{}} // Should fetch parent perms if parent_id exists
                      roleUsers={roleUsers}
                      isUserMode={false}
                      onSave={handleSaveRolePerms}
                      compact={true}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ────────────────────────────────────────────────────────
// ROLE WIZARD (THÊM MỚI VAI TRÒ 4 BƯỚC)
// ────────────────────────────────────────────────────────
function RoleWizard({ roleList, allUsers, onCancel, onComplete }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    role_code: "", name: "", description: "", status: "Hoạt động", parent_id: ""
  });
  const [parentPerms, setParentPerms] = useState({});
  const [draftPerms, setDraftPerms] = useState({});
  const [selectedUsers, setSelectedUsers] = useState([]);

  // Fetch Parent Perms when parent_id changes
  useEffect(() => {
    if (formData.parent_id) {
      customHttp(`/api/roles/${formData.parent_id}/effective_permissions`)
        .then(res => setParentPerms(res || {}))
        .catch(err => console.error("Failed to fetch parent perms", err));
    } else {
      setParentPerms({});
    }
  }, [formData.parent_id]);

  const handleNext = () => {
    if (step === 1 && (!formData.role_code || !formData.name)) return toast.error("Vui lòng điền đủ Mã và Tên vai trò.");
    if (step < 4) setStep(step + 1);
  };

  const handleFinish = async () => {
    try {
      // 1. Tạo Role
      const r = await customHttp('/api/roles', {
        method: 'POST',
        body: JSON.stringify({ ...formData, permissions: draftPerms })
      });
      // 2. Assign Users (nếu có chọn ở bước 4)
      if (selectedUsers.length > 0) {
        await customHttp(`/api/roles/${r.id}/users`, {
          method: 'PUT', body: JSON.stringify({ user_ids: selectedUsers })
        });
      }
      toast.success("Tạo vai trò thành công!");
      onComplete();
    } catch (err) { toast.error("Lỗi: " + err.message); }
  };

  const steps = ["Thông tin", "Role kế thừa", "Bổ sung quyền", "Xác nhận"];

  return (
    <div className="flex flex-col h-full bg-white animate-in slide-in-from-bottom-8 duration-500">
      {/* Wizard Header */}
      <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between shrink-0">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600"><Plus size={24} /></div>
          Thêm Vai trò mới
        </h1>
        <button onClick={onCancel} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X size={24} /></button>
      </div>

      {/* Wizard Progress */}
      <div className="px-8 py-6 bg-slate-50 border-b border-slate-200 shrink-0">
        <div className="flex items-center max-w-4xl mx-auto">
          {steps.map((label, idx) => {
            const isPast = step > idx + 1;
            const isActive = step === idx + 1;
            return (
              <React.Fragment key={idx}>
                <div className="flex flex-col items-center relative z-10 w-32">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${isPast ? "bg-green-500 text-white" : isActive ? "bg-blue-600 text-white ring-4 ring-blue-100" : "bg-white border-2 border-slate-200 text-slate-400"}`}>
                    {isPast ? <CheckCircle2 size={20} /> : idx + 1}
                  </div>
                  <span className={`mt-3 text-sm font-semibold ${isActive ? "text-blue-600" : isPast ? "text-slate-700" : "text-slate-400"}`}>{label}</span>
                </div>
                {idx < steps.length - 1 && (
                  <div className={`flex-1 h-1 rounded-full mx-2 transition-colors duration-300 ${isPast ? "bg-green-500" : "bg-slate-200"}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Wizard Body */}
      <div className="flex-1 overflow-y-auto bg-slate-50/50 p-8">
        <div className="max-w-4xl mx-auto">
          {step === 1 && (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6 animate-in fade-in">
              <h2 className="text-xl font-bold text-slate-800 mb-6">Thông tin chung</h2>
              <div className="grid grid-cols-2 gap-6">
                <div><label className="block text-sm font-medium text-slate-700 mb-2">Mã vai trò <span className="text-red-500">*</span></label><input type="text" value={formData.role_code} onChange={e=>setFormData({...formData, role_code: e.target.value})} className="w-full border-slate-300 rounded-lg focus:ring-blue-500" placeholder="VD: VT001" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-2">Tên vai trò <span className="text-red-500">*</span></label><input type="text" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} className="w-full border-slate-300 rounded-lg focus:ring-blue-500" placeholder="VD: Quản lý Sản xuất" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-slate-700 mb-2">Mô tả</label><textarea value={formData.description} onChange={e=>setFormData({...formData, description: e.target.value})} className="w-full border-slate-300 rounded-lg focus:ring-blue-500" rows={3} placeholder="Mô tả công việc của vai trò..." /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-2">Trạng thái</label><select value={formData.status} onChange={e=>setFormData({...formData, status: e.target.value})} className="w-full border-slate-300 rounded-lg focus:ring-blue-500"><option value="Hoạt động">Hoạt động</option><option value="Không hoạt động">Không hoạt động</option></select></div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6 animate-in fade-in">
              <h2 className="text-xl font-bold text-slate-800 mb-2">Vai trò kế thừa (Tùy chọn)</h2>
              <p className="text-slate-500 text-sm mb-6">Chọn một vai trò làm gốc để kế thừa toàn bộ quyền của vai trò đó.</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div onClick={() => setFormData({...formData, parent_id: ""})} className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${!formData.parent_id ? "border-blue-600 bg-blue-50/50" : "border-slate-200 hover:border-slate-300"}`}>
                  <div className="font-bold text-slate-800 mb-1">Không kế thừa</div>
                  <div className="text-sm text-slate-500">Tạo vai trò độc lập, tự thiết lập quyền từ đầu.</div>
                </div>
                {roleList.map(r => (
                  <div key={r.id} onClick={() => setFormData({...formData, parent_id: r.id})} className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${formData.parent_id === r.id ? "border-blue-600 bg-blue-50/50" : "border-slate-200 hover:border-slate-300"}`}>
                    <div className="font-bold text-slate-800 mb-1">{r.name}</div>
                    <div className="text-sm text-slate-500">{r.description || "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="h-[600px] border border-slate-200 rounded-2xl overflow-hidden shadow-sm animate-in fade-in">
              <PermissionEditor 
                title="Bổ sung quyền"
                subtitle={formData.parent_id ? "Các quyền kế thừa bị mờ. Bạn có thể bật thêm các quyền bổ sung." : "Thiết lập quyền truy cập cho vai trò này."}
                inheritedPerms={parentPerms}
                initialPerms={draftPerms}
                roleUsers={allUsers} // Cho phép chọn allUsers vào action (tạo exception trước khi gán user)
                onSave={(draft) => { setDraftPerms(draft); handleNext(); }}
                compact={true}
              />
            </div>
          )}

          {step === 4 && (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle2 size={32} /></div>
                <h2 className="text-2xl font-bold text-slate-800">Hoàn tất thiết lập</h2>
                <p className="text-slate-500 mt-2">Vui lòng kiểm tra lại thông tin và gán tài khoản cho vai trò mới.</p>
              </div>

              <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 mb-8">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-slate-500">Mã:</span> <span className="font-semibold">{formData.role_code}</span></div>
                  <div><span className="text-slate-500">Tên:</span> <span className="font-semibold">{formData.name}</span></div>
                  <div><span className="text-slate-500">Kế thừa:</span> <span className="font-semibold">{roleList.find(r=>r.id===formData.parent_id)?.name || "Không"}</span></div>
                  <div><span className="text-slate-500">Trạng thái:</span> <span className="font-semibold">{formData.status}</span></div>
                </div>
              </div>

              <h3 className="font-bold text-slate-800 mb-4">Gán tài khoản vào vai trò (Tùy chọn)</h3>
              <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-2">
                {allUsers.map(u => {
                  const isSel = selectedUsers.includes(u.id);
                  return (
                    <label key={u.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${isSel ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                      <input type="checkbox" checked={isSel} onChange={() => setSelectedUsers(prev => isSel ? prev.filter(id=>id!==u.id) : [...prev, u.id])} className="w-5 h-5 rounded text-blue-600" />
                      <div>
                        <div className="font-semibold text-slate-800 text-sm">{u.full_name}</div>
                        <div className="text-xs text-slate-500">{u.username}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Wizard Footer */}
      <div className="px-8 py-5 border-t border-slate-200 bg-white flex items-center justify-between shrink-0">
        <button onClick={() => setStep(step - 1)} disabled={step === 1} className="px-6 py-2.5 font-medium text-slate-600 hover:bg-slate-100 rounded-xl disabled:opacity-50 transition">
          Quay lại
        </button>
        {step < 4 ? (
          // Bước 3 xử lý save nội bộ của PermissionEditor, nên ẩn nút "Tiếp tục" ở đây nếu step 3 để buộc user bấm Lưu Quyền
          step !== 3 ? (
             <button onClick={handleNext} className="px-8 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 shadow-sm transition">Tiếp tục</button>
          ) : (
             <span className="text-sm text-slate-400 italic">Vui lòng bấm "Lưu quyền" ở khung trên để tiếp tục.</span>
          )
        ) : (
          <button onClick={handleFinish} className="px-8 py-2.5 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 shadow-sm transition">Hoàn tất & Lưu</button>
        )}
      </div>
    </div>
  );
}
