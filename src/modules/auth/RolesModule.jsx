import React, { useState, useEffect, useCallback } from "react";
import { Shield, Search, Plus, Edit, Trash2, ShieldCheck, Users, Save, X } from "lucide-react";
import { ListHeader, DataTable } from "../../components.jsx";
import { roles, http } from "../../mesApi.js"; // Assuming http is exported, if not we'll use resource methods
import { toast, statusClass } from "../../ui.js";
import { PermissionEditor } from "./PermissionEditor.jsx";

// Assume we export API base from mesApi.js, or we can use fetch
const API_BASE = import.meta.env?.VITE_API_BASE || "http://localhost:4000";
import { getToken } from "../../mesApi.js";

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
  const [loading, setLoading] = useState(true);
  
  const [selectedRole, setSelectedRole] = useState(null); // { id, name, description, status, permissions }
  const [activeTab, setActiveTab] = useState("users"); // "users" | "permissions"
  const [roleUsers, setRoleUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  
  // For assigning users
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await roles.list();
      const data = res?.data || res || [];
      setRoleList(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error("Lỗi lấy danh sách vai trò: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  const loadRoleDetail = async (r) => {
    try {
      const res = await roles.get(r.id);
      setSelectedRole({
        ...r,
        permissions: res.permissions || {}
      });
      loadRoleUsers(r.id);
      setActiveTab("users");
    } catch (err) {
      toast.error("Lỗi lấy thông tin: " + err.message);
    }
  };

  const loadRoleUsers = async (roleId) => {
    setUsersLoading(true);
    try {
      const { data } = await customHttp(`/api/roles/${roleId}/users`);
      setRoleUsers(data || []);
    } catch (err) {
      toast.error("Lỗi lấy danh sách người dùng: " + err.message);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleSavePermissions = async (draft) => {
    try {
      await customHttp(`/api/roles/${selectedRole.id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions: draft }) });
      toast.success("Lưu phân quyền thành công!");
      setSelectedRole(prev => ({ ...prev, permissions: draft }));
    } catch (err) {
      toast.error("Lỗi lưu phân quyền: " + err.message);
    }
  };

  const openAssignModal = async () => {
    try {
      const res = await customHttp('/api/users');
      setAllUsers(res.data || []);
      setSelectedUserIds(roleUsers.map(u => u.id));
      setShowAssignModal(true);
    } catch (err) {
      toast.error("Lỗi lấy danh sách người dùng: " + err.message);
    }
  };

  const handleAssignUsers = async () => {
    try {
      await customHttp(`/api/roles/${selectedRole.id}/users`, {
        method: 'PUT',
        body: JSON.stringify({ user_ids: selectedUserIds })
      });
      toast.success("Cập nhật thành viên thành công!");
      setShowAssignModal(false);
      loadRoleUsers(selectedRole.id);
    } catch (err) {
      toast.error("Lỗi phân tài khoản: " + err.message);
    }
  };

  const toggleUserSelection = (id) => {
    setSelectedUserIds(prev => prev.includes(id) ? prev.filter(uid => uid !== id) : [...prev, id]);
  };

  // ─── MAIN VIEW ───
  if (!selectedRole) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Shield className="text-blue-600" size={24} />
              Quản lý Vai trò
            </h1>
            <p className="text-sm text-slate-500 mt-1">Danh sách vai trò và phân quyền tương ứng</p>
          </div>
          <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
            <Plus size={18} /> Thêm mới
          </button>
        </div>

        <div className="p-6 pb-2">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input type="text" placeholder="Tìm kiếm vai trò..." className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 pb-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <ListHeader columns={[
              { label: "Mã VT", align: "left", width: "120px" },
              { label: "Tên vai trò", align: "left" },
              { label: "Trạng thái", align: "center", width: "150px" },
              { label: "Thao tác", align: "right", width: "120px" }
            ]} />
            
            <div className="divide-y divide-slate-100">
              {roleList.map((r) => (
                <div key={r.id} className="flex items-center px-4 py-3 hover:bg-slate-50 transition cursor-pointer" onClick={() => loadRoleDetail(r)}>
                  <div className="w-[120px] font-semibold text-blue-600">{r.role_code}</div>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-700">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.description}</div>
                  </div>
                  <div className="w-[150px] text-center">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusClass(r.status)}`}>{r.status || "Hoạt động"}</span>
                  </div>
                  <div className="w-[120px] flex items-center justify-end gap-2">
                     <button className="text-slate-400 hover:text-blue-600 p-1"><Edit size={16} /></button>
                     <button className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
              {!loading && roleList.length === 0 && <div className="p-8 text-center text-slate-500">Không có dữ liệu.</div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── DETAIL VIEW ───
  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 pt-6 px-6 shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
          <button onClick={() => setSelectedRole(null)} className="hover:text-blue-600 font-medium cursor-pointer">Vai trò</button>
          <span>/</span>
          <span className="text-slate-700 font-semibold">{selectedRole.name}</span>
        </div>

        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Shield size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{selectedRole.name}</h1>
              <p className="text-sm text-slate-500 mt-1">{selectedRole.description || "Không có mô tả"}</p>
            </div>
          </div>
          <div>
             <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium border ${statusClass(selectedRole.status)}`}>
               {selectedRole.status || "Hoạt động"}
             </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-slate-200">
          <button onClick={() => setActiveTab("users")}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${activeTab === "users" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"}`}>
            <Users size={16} /> Người dùng ({roleUsers.length})
          </button>
          <button onClick={() => setActiveTab("permissions")}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${activeTab === "permissions" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"}`}>
            <ShieldCheck size={16} /> Quyền truy cập
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "users" && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-700 text-sm">Tài khoản thuộc vai trò</h2>
              <button onClick={openAssignModal} className="flex items-center gap-1.5 bg-blue-50 text-blue-600 px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-100 transition">
                <Plus size={16} /> Thêm người dùng
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                  <th className="text-left py-3 px-5 font-medium">Tài khoản</th>
                  <th className="text-left py-3 px-5 font-medium">Họ tên</th>
                  <th className="text-left py-3 px-5 font-medium">Phòng ban</th>
                  <th className="text-center py-3 px-5 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersLoading ? (
                  <tr><td colSpan={4} className="py-8 text-center text-slate-400">Đang tải...</td></tr>
                ) : roleUsers.length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-slate-400">Chưa có người dùng nào thuộc vai trò này.</td></tr>
                ) : (
                  roleUsers.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-5 font-medium text-slate-700">{u.username}</td>
                      <td className="py-3 px-5 text-slate-600">{u.full_name || "—"}</td>
                      <td className="py-3 px-5 text-slate-500">{u.team || "—"}</td>
                      <td className="py-3 px-5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(u.status)}`}>{u.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "permissions" && (
           <PermissionEditor 
             roleName={selectedRole.name} 
             initialPerms={selectedRole.permissions} 
             onSave={handleSavePermissions} 
             onCancel={() => setSelectedRole(null)} 
             compact={true} 
           />
        )}
      </div>

      {/* Assign Users Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <h2 className="text-lg font-bold text-slate-800">Chọn người dùng cho vai trò</h2>
              <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
               <table className="w-full text-sm">
                 <tbody className="divide-y divide-slate-100">
                   {allUsers.map(u => (
                     <tr key={u.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => toggleUserSelection(u.id)}>
                       <td className="p-3 w-10 text-center">
                         <input type="checkbox" checked={selectedUserIds.includes(u.id)} onChange={() => toggleUserSelection(u.id)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
                       </td>
                       <td className="p-3 font-medium text-slate-700">{u.username}</td>
                       <td className="p-3 text-slate-500">{u.full_name}</td>
                       <td className="p-3 text-slate-400 text-xs">{u.team}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
              <button onClick={() => setShowAssignModal(false)} className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Hủy</button>
              <button onClick={handleAssignUsers} className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-all focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                <Save size={18} /> Lưu thay đổi ({selectedUserIds.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
