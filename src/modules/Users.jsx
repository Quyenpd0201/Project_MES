import React, { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Save } from "lucide-react";
import { ListHeader, usePager } from "../components.jsx";
import { users, roles } from "../mesApi.js";
import { inputCls, statusClass } from "../ui.js";

const F = ({ label, required, children }) => (
  <div><label className="block text-sm font-medium text-slate-600 mb-1.5">{label} {required && <span className="text-rose-500">*</span>}</label>{children}</div>
);

function UserModal({ record, roleList, onClose, onSaved }) {
  const isEdit = !!record?.id;
  const [f, setF] = useState({ username: record?.username || "", password: "", full_name: record?.full_name || "", role_id: record?.role_id || "", status: record?.status || "Hoạt động" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    if (!f.username) return alert("Nhập tài khoản");
    if (!isEdit && !f.password) return alert("Nhập mật khẩu");
    try { if (isEdit) await users.update(record.id, f); else await users.create(f); onSaved(); }
    catch (e) { alert("Lỗi: " + e.message); }
  };
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-800">{isEdit ? "Sửa tài khoản" : "Thêm tài khoản"}</h3>
        <F label="Tài khoản" required><input className={inputCls} value={f.username} onChange={(e) => set("username", e.target.value)} placeholder="tên đăng nhập" /></F>
        <F label={isEdit ? "Mật khẩu mới (để trống nếu không đổi)" : "Mật khẩu"} required={!isEdit}>
          <input type="password" className={inputCls} value={f.password} onChange={(e) => set("password", e.target.value)} placeholder={isEdit ? "••••••" : ""} />
        </F>
        <F label="Họ và tên"><input className={inputCls} value={f.full_name} onChange={(e) => set("full_name", e.target.value)} /></F>
        <div className="grid grid-cols-2 gap-3">
          <F label="Vai trò">
            <select className={inputCls} value={f.role_id} onChange={(e) => set("role_id", e.target.value)}>
              <option value="">-- Chọn --</option>
              {roleList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </F>
          <F label="Trạng thái">
            <select className={inputCls} value={f.status} onChange={(e) => set("status", e.target.value)}><option>Hoạt động</option><option>Không hoạt động</option></select>
          </F>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost">Hủy</button>
          <button onClick={save} className="btn-primary"><Save size={16} /> Lưu</button>
        </div>
      </div>
    </div>
  );
}

export default function UsersModule() {
  const [rows, setRows] = useState([]);
  const [roleList, setRoleList] = useState([]);
  const [editing, setEditing] = useState(null);
  const { slice, Pager, Filler } = usePager(rows);
  const load = useCallback(async () => { try { setRows(await users.list()); } catch (e) { alert("Lỗi tải tài khoản: " + e.message); } }, []);
  useEffect(() => { load(); roles.list().then(setRoleList).catch(() => {}); }, [load]);
  const del = async (id) => { if (!confirm("Xóa tài khoản này?")) return; try { await users.remove(id); load(); } catch (e) { alert("Lỗi xóa: " + e.message); } };

  return (
    <div className="space-y-5">
      <ListHeader title="Tài khoản" actions={
        <button onClick={() => setEditing({})} className="btn-primary"><Plus size={16} /> Thêm tài khoản</button>
      } />
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>{["Tài khoản", "Họ và tên", "Vai trò", "Trạng thái", ""].map((h) => <th key={h} className="text-left px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {slice.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3"><button onClick={() => setEditing(u)} className="font-medium text-blue-600 hover:underline">{u.username}</button></td>
                <td className="px-4 py-3 text-slate-700">{u.full_name || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{u.role_name || "—"}</td>
                <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass(u.status)}`}>{u.status}</span></td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setEditing(u)} className="text-slate-400 hover:text-blue-600 p-1"><Pencil size={15} /></button>
                  <button onClick={() => del(u.id)} className="text-slate-400 hover:text-rose-600 p-1"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Chưa có tài khoản</td></tr>}
            <Filler cols={5} />
          </tbody>
        </table>
      </div>
      <Pager />
      {editing && <UserModal record={editing.id ? editing : null} roleList={roleList} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}
