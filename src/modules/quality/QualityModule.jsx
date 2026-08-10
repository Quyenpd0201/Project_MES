import React, { useState, useEffect } from "react";
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Settings, ClipboardCheck, CheckSquare, AlertTriangle, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { toast, statusClass } from "../../ui.js";
import { PageHeader } from "../../components.jsx";
import { http, auth } from "../../mesApi.js";

function QualityConfig({ lookups }) {
  const [activeTab, setActiveTab] = useState('items'); // 'items' | 'criteria'

  return (
    <div className="p-6 h-full flex flex-col">
      <PageHeader title="Cấu hình chất lượng" />

      <div className="mt-4 flex gap-4 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('items')}
          className={`pb-2 px-1 font-medium ${activeTab === 'items' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Hạng mục kiểm tra
        </button>
        <button
          onClick={() => setActiveTab('criteria')}
          className={`pb-2 px-1 font-medium ${activeTab === 'criteria' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Bộ tiêu chí kiểm tra
        </button>
      </div>

      <div className="flex-1 mt-4 bg-white rounded-lg shadow overflow-hidden flex flex-col">
        {activeTab === 'items' ? <InspectionItems /> : <InspectionCriteria lookups={lookups} />}
      </div>
    </div>
  );
}

// ---------------- HẠNG MỤC KIỂM TRA ----------------
function InspectionItems() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null or record object

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await http('/api/quality/items');
      setItems(data);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    try {
      if (editing.id) {
        await http(`/api/quality/items/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        toast.success("Cập nhật thành công");
      } else {
        await http('/api/quality/items', { method: 'POST', body: JSON.stringify(payload) });
        toast.success("Thêm mới thành công");
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Xóa hạng mục này?")) return;
    try {
      await http(`/api/quality/items/${id}`, { method: 'DELETE' });
      toast.success("Đã xóa");
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (editing) {
    return (
      <div className="p-4 h-full flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setEditing(null)} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><X size={18} /></button>
          <h3 className="text-lg font-bold">{editing.id ? 'Sửa Hạng mục' : 'Thêm Hạng mục mới'}</h3>
        </div>
        <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mã hạng mục</label>
              <input name="item_code" defaultValue={editing.item_code} required className="w-full px-3 py-2 border rounded-lg" placeholder="VD: KT001" disabled={!!editing.id} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tên hạng mục</label>
              <input name="name" defaultValue={editing.name} required className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Loại dữ liệu</label>
              <select name="data_type" defaultValue={editing.data_type || 'NUMBER'} className="w-full px-3 py-2 border rounded-lg">
                <option value="NUMBER">Số (Number)</option>
                <option value="BOOLEAN">Đạt/Không đạt (Boolean)</option>
                <option value="TEXT">Văn bản (Text)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Đơn vị đo</label>
              <input name="unit" defaultValue={editing.unit} className="w-full px-3 py-2 border rounded-lg" placeholder="VD: mm, kg..." />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Mô tả</label>
              <textarea name="description" defaultValue={editing.description} className="w-full px-3 py-2 border rounded-lg" rows={2} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Trạng thái</label>
              <select name="status" defaultValue={editing.status || 'Hoạt động'} className="w-full px-3 py-2 border rounded-lg">
                <option value="Hoạt động">Hoạt động</option>
                <option value="Không hoạt động">Không hoạt động</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn-primary"><Save size={16} /> Lưu Hạng mục</button>
        </form>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <div className="relative">
          <input placeholder="Tìm kiếm hạng mục..." className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm w-64" />
          <Settings size={16} className="absolute left-3 top-2.5 text-slate-400" />
        </div>
        <button onClick={() => setEditing({})} className="btn-primary"><Plus size={16} /> Thêm hạng mục</button>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 uppercase sticky top-0">
            <tr>
              <th className="px-4 py-3 font-medium">Mã</th>
              <th className="px-4 py-3 font-medium">Tên hạng mục</th>
              <th className="px-4 py-3 font-medium">Loại dữ liệu</th>
              <th className="px-4 py-3 font-medium">Đơn vị</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? <tr><td colSpan={6} className="p-4 text-center">Đang tải...</td></tr> : items.map(it => (
              <tr key={it.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{it.item_code}</td>
                <td className="px-4 py-3 text-slate-900">{it.name}</td>
                <td className="px-4 py-3 text-slate-500">{it.data_type === 'NUMBER' ? 'Số' : it.data_type === 'BOOLEAN' ? 'Đạt/Không đạt' : 'Văn bản'}</td>
                <td className="px-4 py-3 text-slate-500">{it.unit || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusClass(it.status)}`}>{it.status}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setEditing(it)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded mr-1"><Pencil size={16} /></button>
                  <button onClick={() => handleDelete(it.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- BỘ TIÊU CHÍ KIỂM TRA ----------------
function InspectionCriteria({ lookups }) {
  const [criteria, setCriteria] = useState([]);
  const [itemsList, setItemsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: cData }, { data: iData }] = await Promise.all([
        http('/api/quality/criteria'),
        http('/api/quality/items')
      ]);
      setCriteria(cData);
      setItemsList(iData.filter(i => i.status === 'Hoạt động'));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleEdit = async (id) => {
    try {
      const data = await http(`/api/quality/criteria/${id}`);
      setEditing(data);
    } catch (e) { toast.error(e.message); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const payload = { ...editing }; // contains details
    try {
      if (editing.id) {
        await http(`/api/quality/criteria/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        toast.success("Cập nhật thành công");
      } else {
        await http('/api/quality/criteria', { method: 'POST', body: JSON.stringify(payload) });
        toast.success("Thêm mới thành công");
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Xóa bộ tiêu chí này?")) return;
    try {
      await http(`/api/quality/criteria/${id}`, { method: 'DELETE' });
      toast.success("Đã xóa");
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (editing) {
    return (
      <div className="p-4 h-full flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setEditing(null)} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><X size={18} /></button>
          <h3 className="text-lg font-bold">{editing.id ? 'Sửa Bộ tiêu chí' : 'Thêm Bộ tiêu chí mới'}</h3>
        </div>
        <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mã bộ tiêu chí</label>
              <input value={editing.criteria_code || ''} onChange={e => setEditing({ ...editing, criteria_code: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="Tự sinh nếu để trống" disabled={!!editing.id} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tên bộ tiêu chí *</label>
              <input value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} required className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Áp dụng cho Sản phẩm</label>
              <select value={editing.target_product_id || ''} onChange={e => setEditing({ ...editing, target_product_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                <option value="">-- Tất cả / Không chỉ định --</option>
                {lookups?.products?.map(p => <option key={p.id} value={p.id}>{p.product_code} - {p.product_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Áp dụng cho Công đoạn</label>
              <input value={editing.target_operation || ''} onChange={e => setEditing({ ...editing, target_operation: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="VD: Đóng gói" />
            </div>
          </div>

          <div className="flex-1 overflow-auto border border-slate-200 rounded-lg">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h4 className="font-semibold text-slate-700">Chi tiết Hạng mục kiểm tra</h4>
              <select onChange={(e) => {
                if (!e.target.value) return;
                const item = itemsList.find(i => i.id === e.target.value);
                if (item && !(editing.details || []).find(d => d.item_id === item.id)) {
                  setEditing({ ...editing, details: [...(editing.details || []), { item_id: item.id, item_name: item.name, data_type: item.data_type, is_required: true, boolean_expected: true }] });
                }
                e.target.value = '';
              }} className="px-3 py-1.5 border rounded text-sm bg-white">
                <option value="">+ Thêm hạng mục</option>
                {itemsList.map(i => <option key={i.id} value={i.id}>{i.name} ({i.data_type})</option>)}
              </select>
            </div>
            <table className="w-full text-sm text-left">
              <thead className="bg-white border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-4 py-2">Hạng mục</th>
                  <th className="px-4 py-2">Tiêu chuẩn (Min - Max / Đạt)</th>
                  <th className="px-4 py-2 text-center">Bắt buộc</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(editing.details || []).map((d, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium">{d.item_name}</td>
                    <td className="px-4 py-2">
                      {d.data_type === 'NUMBER' ? (
                        <div className="flex items-center gap-2">
                          <input type="number" step="any" placeholder="Min" className="w-20 px-2 py-1 border rounded" value={d.min_value || ''} onChange={e => {
                            const newD = [...editing.details]; newD[i].min_value = e.target.value; setEditing({ ...editing, details: newD });
                          }} />
                          <span>-</span>
                          <input type="number" step="any" placeholder="Max" className="w-20 px-2 py-1 border rounded" value={d.max_value || ''} onChange={e => {
                            const newD = [...editing.details]; newD[i].max_value = e.target.value; setEditing({ ...editing, details: newD });
                          }} />
                        </div>
                      ) : d.data_type === 'BOOLEAN' ? (
                        <select className="px-2 py-1 border rounded bg-white" value={d.boolean_expected !== false ? 'true' : 'false'} onChange={e => {
                          const newD = [...editing.details]; newD[i].boolean_expected = e.target.value === 'true'; setEditing({ ...editing, details: newD });
                        }}>
                          <option value="true">Đạt (True)</option>
                          <option value="false">Không đạt (False)</option>
                        </select>
                      ) : (
                        <span className="text-slate-400 italic">Kiểm tra ghi chú văn bản</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <input type="checkbox" checked={d.is_required} onChange={e => {
                        const newD = [...editing.details]; newD[i].is_required = e.target.checked; setEditing({ ...editing, details: newD });
                      }} className="w-4 h-4 accent-blue-600" />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button type="button" onClick={() => {
                        const newD = editing.details.filter((_, idx) => idx !== i);
                        setEditing({ ...editing, details: newD });
                      }} className="text-rose-500 hover:bg-rose-50 p-1 rounded"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
                {!(editing.details?.length) && <tr><td colSpan={4} className="p-4 text-center text-slate-400">Chưa có hạng mục nào. Chọn từ dropdown bên trên.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-200">
            <button type="submit" className="btn-primary"><Save size={16} /> Lưu Bộ tiêu chí</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <div className="relative">
          <input placeholder="Tìm kiếm bộ tiêu chí..." className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm w-64" />
          <Settings size={16} className="absolute left-3 top-2.5 text-slate-400" />
        </div>
        <button onClick={() => setEditing({ details: [] })} className="btn-primary"><Plus size={16} /> Tạo Bộ tiêu chí</button>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 uppercase sticky top-0">
            <tr>
              <th className="px-4 py-3 font-medium">Mã TC</th>
              <th className="px-4 py-3 font-medium">Tên bộ tiêu chí</th>
              <th className="px-4 py-3 font-medium">Sản phẩm áp dụng</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? <tr><td colSpan={5} className="p-4 text-center">Đang tải...</td></tr> : criteria.map(c => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{c.criteria_code}</td>
                <td className="px-4 py-3 text-slate-900">{c.name}</td>
                <td className="px-4 py-3 text-slate-500">{c.product_name || <span className="text-slate-400 italic">Tất cả</span>}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusClass(c.status)}`}>{c.status}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleEdit(c.id)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded mr-1"><Pencil size={16} /></button>
                  <button onClick={() => handleDelete(c.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- THỰC HIỆN KIỂM TRA (INSPECTIONS) ----------------
function InspectionExecution({ lookups }) {
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Create Form State
  const [orders, setOrders] = useState([]);
  const [criteria, setCriteria] = useState([]);
  const [form, setForm] = useState({ production_order_id: '', criteria_id: '', inspector_name: '', note: '' });
  const [formDetails, setFormDetails] = useState([]);
  const { user } = auth();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await http('/api/quality/inspections');
      setInspections(data);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = async () => {
    setCreating(true);
    try {
      const [{ data: oData }, { data: cData }] = await Promise.all([
        http('/api/production/orders'),
        http('/api/quality/criteria')
      ]);
      setOrders(oData.filter(o => o.status !== 'Hoàn thành' && o.status !== 'Đã hủy'));
      setCriteria(cData.filter(c => c.status === 'Hoạt động'));
    } catch (e) { toast.error(e.message); }
  };

  if (creating) {
    return (
      <CreateInspectionForm
        orders={orders}
        criteria={criteria}
        onCancel={() => setCreating(false)}
        onSaved={() => { setCreating(false); load(); }}
      />
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <PageHeader title="Kiểm tra chất lượng & Kết quả" />
        <button onClick={openCreate} className="btn-primary"><ClipboardCheck size={16} /> Thực hiện kiểm tra mới</button>
      </div>
      <div className="flex-1 bg-white rounded-lg shadow overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase sticky top-0">
              <tr>
                <th className="px-4 py-3 font-medium">Mã phiếu</th>
                <th className="px-4 py-3 font-medium">Thời gian</th>
                <th className="px-4 py-3 font-medium">Lệnh SX</th>
                <th className="px-4 py-3 font-medium">Sản phẩm</th>
                <th className="px-4 py-3 font-medium">Bộ tiêu chí</th>
                <th className="px-4 py-3 font-medium">Người KT</th>
                <th className="px-4 py-3 font-medium">Kết luận</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? <tr><td colSpan={7} className="p-4 text-center">Đang tải...</td></tr> : inspections.map(i => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-blue-600">{i.inspection_code}</td>
                  <td className="px-4 py-3">{new Date(i.inspection_date).toLocaleString('vi-VN')}</td>
                  <td className="px-4 py-3 font-medium">{i.po_code}</td>
                  <td className="px-4 py-3">{i.product_name}</td>
                  <td className="px-4 py-3">{i.criteria_name}</td>
                  <td className="px-4 py-3">{i.inspector_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-bold ${i.status === 'Đạt' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{i.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function CreateInspectionForm({ orders, criteria, initialOrder, onCancel, onSaved }) {
  const [form, setForm] = useState({ production_order_id: initialOrder || '', criteria_id: '', inspector_name: '', note: '' });
  const [formDetails, setFormDetails] = useState([]);
  const { user } = auth();

  // If initialOrder is provided, try to auto-select criteria
  useEffect(() => {
    if (initialOrder && orders.length && criteria.length) {
      const po = orders.find(o => o.id === initialOrder);
      if (po) {
        const matched = criteria.find(c => c.target_product_id === po.product_id);
        if (matched) {
          selectCriteria(matched.id, initialOrder);
        }
      }
    }
  }, [initialOrder, orders, criteria]);

  useEffect(() => {
    if (!form.inspector_name && user?.full_name) {
      setForm(f => ({ ...f, inspector_name: user.full_name }));
    }
  }, [user]);

  const selectCriteria = async (cId, poId) => {
    setForm({ ...form, criteria_id: cId, production_order_id: poId || form.production_order_id });
    if (!cId) { setFormDetails([]); return; }
    try {
      const data = await http(`/api/quality/criteria/${cId}`);
      setFormDetails(data.details.map(d => ({
        criteria_detail_id: d.id,
        item_name: d.item_name,
        data_type: d.data_type,
        min_value: d.min_value,
        max_value: d.max_value,
        boolean_expected: d.boolean_expected,
        is_required: d.is_required,
        result_number: '',
        result_boolean: '',
        result_text: '',
        note: ''
      })));
    } catch (e) { toast.error(e.message); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const results = formDetails.map(d => {
      let is_passed = true;
      if (d.data_type === 'NUMBER') {
        const val = Number(d.result_number);
        if (d.min_value !== null && val < Number(d.min_value)) is_passed = false;
        if (d.max_value !== null && val > Number(d.max_value)) is_passed = false;
      } else if (d.data_type === 'BOOLEAN') {
        is_passed = (d.result_boolean === String(d.boolean_expected));
      }
      return { ...d, is_passed };
    });

    try {
      await http('/api/quality/inspections', { method: 'POST', body: JSON.stringify({ ...form, results }) });
      toast.success("Đã ghi nhận kết quả kiểm tra");
      onSaved();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="p-4 h-full flex flex-col bg-white">
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={onCancel} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><X size={18} /></button>
        <h3 className="text-lg font-bold">Thực hiện kiểm tra chất lượng</h3>
      </div>
      <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden w-full max-w-4xl mx-auto">
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Lệnh sản xuất *</label>
            <select required value={form.production_order_id} onChange={e => {
              const poId = e.target.value;
              setForm({ ...form, production_order_id: poId });
              const po = orders.find(o => o.id === poId);
              if (po) {
                const matched = criteria.find(c => c.target_product_id === po.product_id);
                if (matched) selectCriteria(matched.id, poId);
              }
            }} className="w-full px-3 py-2 border rounded-lg" disabled={!!initialOrder}>
              <option value="">-- Chọn lệnh SX --</option>
              {orders.map(o => <option key={o.id} value={o.id}>{o.order_code} - {o.product_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Bộ tiêu chí áp dụng *</label>
            <select required value={form.criteria_id} onChange={e => selectCriteria(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
              <option value="">-- Chọn bộ tiêu chí --</option>
              {criteria.map(c => <option key={c.id} value={c.id}>{c.name} {c.target_product_id ? '(Chỉ định SP)' : '(Dùng chung)'}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Người kiểm tra</label>
            <input value={form.inspector_name} onChange={e => setForm({ ...form, inspector_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ghi chú chung</label>
            <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
          </div>
        </div>

        <div className="flex-1 overflow-auto border border-slate-200 rounded-lg bg-white">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase sticky top-0">
              <tr>
                <th className="px-4 py-3 font-medium">Hạng mục kiểm tra</th>
                <th className="px-4 py-3 font-medium">Tiêu chuẩn (Min-Max/Đạt)</th>
                <th className="px-4 py-3 font-medium">Kết quả thực tế *</th>
                <th className="px-4 py-3 font-medium">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {formDetails.map((d, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{d.item_name} {d.is_required && <span className="text-rose-500">*</span>}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {d.data_type === 'NUMBER' ? `${d.min_value || '-'} ~ ${d.max_value || '-'}` : d.data_type === 'BOOLEAN' ? (d.boolean_expected ? 'Đạt' : 'Không đạt') : 'Ghi nhận'}
                  </td>
                  <td className="px-4 py-3">
                    {d.data_type === 'NUMBER' ? (
                      <input type="number" step="any" required={d.is_required} className="w-full px-3 py-1.5 border rounded" value={d.result_number} onChange={e => {
                        const newD = [...formDetails]; newD[i].result_number = e.target.value; setFormDetails(newD);
                      }} />
                    ) : d.data_type === 'BOOLEAN' ? (
                      <select required={d.is_required} className="w-full px-3 py-1.5 border rounded bg-white" value={d.result_boolean} onChange={e => {
                        const newD = [...formDetails]; newD[i].result_boolean = e.target.value; setFormDetails(newD);
                      }}>
                        <option value="">-- Chọn --</option>
                        <option value="true">Đạt (Pass)</option>
                        <option value="false">Không đạt (NG)</option>
                      </select>
                    ) : (
                      <input type="text" required={d.is_required} className="w-full px-3 py-1.5 border rounded" value={d.result_text} onChange={e => {
                        const newD = [...formDetails]; newD[i].result_text = e.target.value; setFormDetails(newD);
                      }} />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <input type="text" placeholder="Ghi chú thêm..." className="w-full px-3 py-1.5 border rounded" value={d.note} onChange={e => {
                      const newD = [...formDetails]; newD[i].note = e.target.value; setFormDetails(newD);
                    }} />
                  </td>
                </tr>
              ))}
              {formDetails.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400">Vui lòng chọn Bộ tiêu chí để load hạng mục.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-200">
          <button type="submit" disabled={formDetails.length === 0} className="btn-primary disabled:opacity-50"><Save size={16} /> Hoàn tất & Đánh giá</button>
        </div>
      </form>
    </div>
  );
}
// ---------------- XỬ LÝ HÀNG KHÔNG PHÙ HỢP (NG) ----------------
function NonConformities() {
  const [ngList, setNgList] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const load = async () => {
    setLoading(true);
    try {
      const { data } = await http('/api/quality/ng');
      setNgList(data);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleUpdate = async (id, current) => {
    const disp = prompt("Phương án xử lý (Rework, Scrap, Trả về...):", current.disposition || '');
    if (disp === null) return;
    const status = confirm("Đánh dấu Đã Đóng (Hoàn tất xử lý)?") ? 'Đã đóng' : 'Đang xử lý';
    try {
      await http(`/api/quality/ng/${id}`, { method: 'PUT', body: JSON.stringify({ reason_details: current.reason_details, disposition: disp, status }) });
      toast.success("Cập nhật thành công");
      load();
    } catch(e) { toast.error(e.message); }
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <PageHeader title="Xử lý hàng Không Phù Hợp (NG)" />
      <div className="flex-1 mt-6 bg-white rounded-lg shadow overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase sticky top-0">
              <tr>
                <th className="px-4 py-3 font-medium">Mã NG</th>
                <th className="px-4 py-3 font-medium">Ngày phát hiện</th>
                <th className="px-4 py-3 font-medium">Phiếu KT</th>
                <th className="px-4 py-3 font-medium">Lệnh SX</th>
                <th className="px-4 py-3 font-medium">Sản phẩm</th>
                <th className="px-4 py-3 font-medium">Phương án xử lý</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? <tr><td colSpan={8} className="p-4 text-center">Đang tải...</td></tr> : ngList.map(n => (
                <tr key={n.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-rose-600">{n.nc_code}</td>
                  <td className="px-4 py-3">{new Date(n.created_at).toLocaleString('vi-VN')}</td>
                  <td className="px-4 py-3 text-blue-600">{n.inspection_code}</td>
                  <td className="px-4 py-3 font-medium">{n.po_code}</td>
                  <td className="px-4 py-3">{n.product_name}</td>
                  <td className="px-4 py-3 font-bold text-amber-600">{n.disposition || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${n.status === 'Đã đóng' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>{n.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleUpdate(n.id, n)} className="text-blue-600 hover:underline">Cập nhật</button>
                  </td>
                </tr>
              ))}
              {ngList.length === 0 && !loading && <tr><td colSpan={8} className="p-8 text-center text-slate-500">Tuyệt vời! Không có sự cố NG nào cần xử lý.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------- PLACEHOLDER ----------------
function Placeholder({ title }) {
  return (
    <div className="p-6">
      <PageHeader title={title} />
      <div className="mt-4 bg-white rounded-lg shadow p-6 text-center text-slate-500 py-12">
        Giao diện {title} đang được phát triển cho Phase 2...
      </div>
    </div>
  );
}

export default function QualityModule({ lookups }) {
  const { pathname } = useLocation();
  const tabs = [
    { id: "inspection", label: "Kiểm tra", icon: ClipboardCheck, path: "/quality/inspection" },
    { id: "results", label: "Kết quả", icon: CheckSquare, path: "/quality/results" },
    { id: "ng", label: "Xử lý NG", icon: AlertTriangle, path: "/quality/ng" },
    { id: "config", label: "Cấu hình", icon: Settings, path: "/quality/config" },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50/50">
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex gap-2 overflow-x-auto">
        {tabs.map(t => {
          const active = pathname.startsWith(t.path);
          const Icon = t.icon;
          return (
            <NavLink key={t.id} to={t.path} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
              <Icon size={16} className={active ? "text-blue-600" : "text-slate-400"} />
              {t.label}
            </NavLink>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto">
        <Routes>
          <Route path="config" element={<QualityConfig lookups={lookups} />} />
          <Route path="inspection" element={<InspectionExecution lookups={lookups} />} />
          <Route path="results" element={<Navigate to="../inspection" replace />} />
          <Route path="ng" element={<NonConformities />} />
          <Route path="*" element={<Navigate to="config" replace />} />
        </Routes>
      </div>
    </div>
  );
}
