import React, { useState, useEffect } from "react";
import { Shield, Plus, Edit, Trash2, Users, AlertCircle } from "lucide-react";
import { ListHeader, DataTable, Section } from "../../components.jsx";
import { roles, users } from "../../mesApi.js";
import { toast } from "../../ui.js";
import { PermissionEditor } from "./PermissionEditor.jsx";

export default function RolesModule() {
  const [list, setList] = useState([]);
  const [userList, setUserList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const [selectedRole, setSelectedRole] = useState(null);
  const [activeTab, setActiveTab] = useState("permissions"); // 'permissions', 'users'

  // Edit user custom permissions
  const [editingUser, setEditingUser] = useState(null);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const data = await roles.list();
      setList(data || []);
    } catch (e) {
      toast.error("Không lấy được danh sách vai trò");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await users.list();
      setUserList(res.data || []);
    } catch (e) {}
  };

  useEffect(() => {
    fetchRoles();
    fetchUsers();
  }, []);

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    setActiveTab("permissions");
  };

  const filteredRoles = list.filter(r => r.name.toLowerCase().includes(q.toLowerCase()) || r.role_code.toLowerCase().includes(q.toLowerCase()));
  
  // Users belonging to the selected role
  const roleUsers = userList.filter(u => u.role_id === selectedRole?.id);

  const handleSaveRolePerms = async (newPerms) => {
    if (!selectedRole) return;
    try {
      await roles.update(selectedRole.id, { permissions: newPerms });
      toast.success("Cập nhật quyền vai trò thành công");
      fetchRoles();
      setSelectedRole({ ...selectedRole, permissions: newPerms });
    } catch (e) {
      toast.error("Cập nhật quyền thất bại");
    }
  };

  const handleSaveUserPerms = async (newPerms) => {
    if (!editingUser) return;
    try {
      await users.update(editingUser.id, { permissions: newPerms });
      toast.success("Đã lưu quyền riêng cho tài khoản");
      fetchUsers();
      setEditingUser(null);
    } catch (e) {
      toast.error("Cập nhật quyền tài khoản thất bại");
    }
  };

  if (!selectedRole) {
    return (
      <div className="space-y-4">
        <ListHeader title="Vai trò & Phân quyền" icon={Shield} onAdd={() => toast.info("Thêm vai trò đang phát triển...")} onRefresh={fetchRoles} search={q} onSearch={setQ} />
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <DataTable
            data={filteredRoles}
            loading={loading}
            columns={[
              { key: "role_code", label: "Mã VT" },
              { key: "name", label: "Tên vai trò", render: (_, r) => <div className="font-semibold text-slate-800">{r.name}</div> },
              { key: "description", label: "Mô tả" },
              { key: "status", label: "Trạng thái", render: (_, r) => (
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'Hoạt động' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{r.status}</span>
              )}
            ]}
            actions={(r) => (
              <button onClick={() => handleRoleSelect(r)} className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-sm font-medium transition">Cấu hình</button>
            )}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <button onClick={() => setSelectedRole(null)} className="px-3 py-1.5 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition">
          &larr; Quay lại
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-800">{selectedRole.name}</h2>
          <div className="text-sm text-slate-500">{selectedRole.role_code} - {selectedRole.description}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-2 gap-4">
          <button onClick={() => setActiveTab("permissions")} className={`pb-2 px-2 border-b-2 font-medium text-sm transition ${activeTab === 'permissions' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Quyền truy cập</button>
          <button onClick={() => setActiveTab("users")} className={`pb-2 px-2 border-b-2 font-medium text-sm transition ${activeTab === 'users' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Tài khoản ({roleUsers.length})</button>
        </div>

        <div className="p-4 bg-white flex-1 min-h-[500px]">
          {activeTab === "permissions" && (
            <PermissionEditor roleName={selectedRole.name} initialPerms={selectedRole.permissions || {}} onSave={handleSaveRolePerms} onCancel={() => setSelectedRole(null)} />
          )}
          
          {activeTab === "users" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Users size={18}/> Danh sách tài khoản mang vai trò {selectedRole.name}</h3>
                <button onClick={() => toast.info("Gắn tài khoản vào vai trò đang phát triển...")} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-medium flex items-center gap-1"><Plus size={16}/> Thêm tài khoản</button>
              </div>
              <DataTable
                data={roleUsers}
                columns={[
                  { key: "username", label: "Tài khoản", render: (_, u) => <span className="font-medium text-slate-800">{u.username}</span> },
                  { key: "full_name", label: "Họ tên" },
                  { key: "team", label: "Tổ/Đội" },
                  { key: "status", label: "Trạng thái" }
                ]}
                actions={(u) => (
                  <button onClick={() => setEditingUser(u)} className="px-3 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded text-sm font-medium">Quyền riêng</button>
                )}
              />
            </div>
          )}
        </div>
      </div>

      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-indigo-50">
              <div>
                <h3 className="text-lg font-bold text-indigo-900">Quyền bổ sung: {editingUser.full_name || editingUser.username}</h3>
                <div className="text-sm text-indigo-700 flex items-center gap-1"><AlertCircle size={14}/> Các quyền dưới đây sẽ ĐƯỢC CỘNG THÊM hoặc GHI ĐÈ lên quyền gốc của vai trò {selectedRole.name}</div>
              </div>
              <button onClick={() => setEditingUser(null)} className="p-2 text-slate-400 hover:bg-white rounded-lg transition"><Trash2 size={20}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
              <PermissionEditor roleName={editingUser.username} initialPerms={editingUser.permissions || {}} onSave={handleSaveUserPerms} onCancel={() => setEditingUser(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
