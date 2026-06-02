import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Pencil, Save, Upload, Download, FileDown } from "lucide-react";
import * as XLSX from "xlsx";
import { resource } from "../mesApi.js";
import { usePerm } from "../perm.jsx";
import { ListHeader, usePager } from "../components.jsx";
import { inputCls, statusClass } from "../ui.js";

const isObjOptions = (f) => f.type === "select" && f.options && typeof f.options[0] === "object";

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 mb-1.5">
      {label} {required && <span className="text-rose-500">*</span>}
    </label>
    {children}
  </div>
);

/* ---- Modal thêm/sửa tổng quát ---- */
function RecordModal({ cfg, record, onClose, onSaved }) {
  const isEdit = !!record?.id;
  const [f, setF] = useState(() => {
    const init = {};
    cfg.fields.forEach((fl) => { init[fl.key] = record?.[fl.key] ?? fl.default ?? ""; });
    return init;
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const api = resource(cfg.resource);

  const save = async () => {
    for (const fl of cfg.fields)
      if (fl.required && !f[fl.key]) return alert(`Vui lòng nhập ${fl.label}`);
    try {
      if (isEdit) await api.update(record.id, f); else await api.create(f);
      onSaved();
    } catch (e) { alert("Lỗi lưu: " + e.message); }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-800">{isEdit ? "Sửa" : "Thêm"} {cfg.title.toLowerCase()}</h3>
        <div className="grid grid-cols-2 gap-3">
          {cfg.fields.map((fl) => (
            <div key={fl.key} className={fl.full ? "col-span-2" : ""}>
              <Field label={fl.label} required={fl.required}>
                {fl.type === "select" ? (
                  <select className={inputCls} value={f[fl.key]} onChange={(e) => set(fl.key, e.target.value)}>
                    <option value="">-- Chọn --</option>
                    {fl.options.map((o) =>
                      typeof o === "string"
                        ? <option key={o} value={o}>{o}</option>
                        : <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input type={fl.type || "text"} className={inputCls} value={f[fl.key]}
                    onChange={(e) => set(fl.key, e.target.value)} placeholder={fl.placeholder || ""} />
                )}
              </Field>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost">Hủy</button>
          <button onClick={save} className="btn-primary"><Save size={16} /> Lưu</button>
        </div>
      </div>
    </div>
  );
}

/* ---- Bảng danh mục tổng quát ---- */
function MasterTable({ cfg }) {
  const { can } = usePerm();
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null); // record hoặc {} để thêm mới
  const api = resource(cfg.resource);
  const { slice, Pager, Filler } = usePager(rows);

  const load = useCallback(async () => {
    try { setRows(await api.list()); } catch (e) { alert("Lỗi tải: " + e.message); }
  }, [cfg.resource]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const del = async (id) => {
    if (!confirm("Xóa bản ghi này?")) return;
    try { await api.remove(id); load(); } catch (e) { alert("Lỗi xóa: " + e.message); }
  };

  // ---- Export Excel ----
  const exportExcel = () => {
    const data = rows.map((r) => {
      const o = {};
      const codeCol = cfg.columns[0];
      o[codeCol.label] = r[codeCol.key];
      cfg.fields.forEach((f) => {
        let v = r[f.key];
        if (isObjOptions(f)) v = f.options.find((op) => op.value === v)?.label ?? "";
        o[f.label] = v ?? "";
      });
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, cfg.title.slice(0, 31));
    XLSX.writeFile(wb, `${cfg.title}.xlsx`);
  };

  // ---- Tải file mẫu (chỉ tiêu đề các trường nhập) ----
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([cfg.fields.map((f) => f.label)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mau");
    XLSX.writeFile(wb, `Mau_${cfg.title}.xlsx`);
  };

  // ---- Import Excel ----
  const importExcel = async (file) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const payloads = json.map((row) => {
        const p = {};
        cfg.fields.forEach((f) => {
          let v = row[f.label];
          if (v === undefined || v === "") return;
          if (isObjOptions(f)) v = f.options.find((op) => String(op.label) === String(v))?.value ?? v;
          p[f.key] = typeof v === "string" ? v.trim() : v;
        });
        return p;
      }).filter((p) => Object.keys(p).length);
      if (!payloads.length) return alert("Không đọc được dòng dữ liệu hợp lệ. Kiểm tra tiêu đề cột khớp file mẫu.");
      const res = await api.importRows(payloads);
      let msg = `Đã nhập ${res.inserted}/${payloads.length} dòng.`;
      if (res.failed) msg += `\nLỗi ${res.failed} dòng:\n` + res.errors.map((e) => `· Dòng ${e.row}: ${e.message}`).join("\n");
      alert(msg);
      load();
    } catch (e) { alert("Lỗi đọc file: " + e.message); }
  };

  return (
    <div className="space-y-4">
      <ListHeader title={cfg.title} actions={<>
        <button onClick={downloadTemplate} className="btn-ghost"><FileDown size={16} /> Tải mẫu</button>
        {can("masterdata", "create") && (
          <label className="btn-ghost cursor-pointer">
            <Upload size={16} /> Nhập Excel
            <input type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(e) => { if (e.target.files[0]) importExcel(e.target.files[0]); e.target.value = ""; }} />
          </label>
        )}
        <button onClick={exportExcel} className="btn-ghost"><Download size={16} /> Xuất Excel</button>
        {can("masterdata", "create") && <button onClick={() => setEditing({})} className="btn-primary"><Plus size={16} /> Thêm mới</button>}
      </>} />
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide sticky top-[68px] z-10">
            <tr>
              {cfg.columns.map((c) => <th key={c.key} className="text-left px-4 py-3 font-semibold">{c.label}</th>)}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {slice.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/70">
                {cfg.columns.map((c, ci) => (
                  <td key={c.key} className="px-4 py-3 text-slate-700">
                    {ci === 0 ? <button onClick={() => setEditing(r)} className="font-medium text-blue-600 hover:underline">{r[c.key] || "—"}</button>
                      : c.badge ? <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass(r[c.key])}`}>{r[c.key]}</span>
                      : c.render ? c.render(r) : (r[c.key] || "—")}
                  </td>
                ))}
                <td className="px-4 py-3 text-right">
                  {can("masterdata", "edit") && <button onClick={() => setEditing(r)} className="text-slate-400 hover:text-blue-600 p-1"><Pencil size={15} /></button>}
                  {can("masterdata", "delete") && <button onClick={() => del(r.id)} className="text-slate-400 hover:text-rose-600 p-1"><Trash2 size={15} /></button>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={cfg.columns.length + 1} className="px-4 py-10 text-center text-slate-400">Chưa có dữ liệu</td></tr>}
            <Filler cols={cfg.columns.length + 1} />
          </tbody>
        </table>
      </div>
      <Pager />
      {editing && (
        <RecordModal cfg={cfg} record={editing.id ? editing : null}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

/* ---- Cấu hình từng danh mục ---- */
function buildConfigs(lookups) {
  const warehouseOptions = (lookups.warehouses || []).map((w) => ({ value: w.id, label: w.name }));
  const warehouseName = (id) => (lookups.warehouses || []).find((w) => w.id === id)?.name || "—";

  return {
    customers: {
      title: "Khách hàng", resource: "customers",
      columns: [
        { key: "customer_code", label: "Mã KH" }, { key: "name", label: "Tên khách hàng" },
        { key: "customer_type", label: "Loại" }, { key: "phone", label: "Điện thoại" },
        { key: "address", label: "Địa chỉ" }, { key: "status", label: "Trạng thái", badge: true },
      ],
      fields: [
        { key: "name", label: "Tên khách hàng", required: true, full: true },
        { key: "customer_type", label: "Loại", type: "select", options: ["Khách sỉ", "Khách lẻ"], default: "Khách sỉ" },
        { key: "status", label: "Trạng thái", type: "select", options: ["Hoạt động", "Không hoạt động"], default: "Hoạt động" },
        { key: "phone", label: "Điện thoại" }, { key: "email", label: "Email" },
        { key: "address", label: "Địa chỉ", full: true },
      ],
    },
    machines: {
      title: "Máy móc", resource: "machines",
      columns: [
        { key: "machine_code", label: "Mã máy" }, { key: "name", label: "Tên máy" },
        { key: "factory", label: "Nhà máy" }, { key: "machine_type", label: "Loại máy" },
        { key: "status", label: "Trạng thái", badge: true },
      ],
      fields: [
        { key: "name", label: "Tên máy", required: true, full: true },
        { key: "factory", label: "Nhà máy", type: "select", required: true, options: ["Nhà máy thổi", "Nhà máy cắt"] },
        { key: "machine_type", label: "Loại máy", placeholder: "Máy thổi lớn / Máy cắt..." },
        { key: "status", label: "Trạng thái", type: "select", options: ["Hoạt động", "Bảo trì", "Ngừng"], default: "Hoạt động" },
      ],
    },
    warehouses: {
      title: "Kho", resource: "warehouses",
      columns: [
        { key: "warehouse_code", label: "Mã kho" }, { key: "name", label: "Tên kho" },
        { key: "warehouse_type", label: "Loại kho" },
      ],
      fields: [
        { key: "name", label: "Tên kho", required: true, full: true },
        { key: "warehouse_type", label: "Loại kho", type: "select", options: ["NVL", "BTP", "TP"], default: "NVL" },
      ],
    },
    locations: {
      title: "Vị trí lưu trữ", resource: "locations",
      columns: [
        { key: "location_code", label: "Mã vị trí" }, { key: "name", label: "Tên vị trí" },
        { key: "warehouse_id", label: "Thuộc kho", render: (r) => warehouseName(r.warehouse_id) },
      ],
      fields: [
        { key: "warehouse_id", label: "Kho", type: "select", required: true, options: warehouseOptions },
        { key: "name", label: "Tên vị trí", required: true, full: true },
      ],
    },
    shifts: {
      title: "Ca làm việc", resource: "shifts",
      columns: [
        { key: "shift_code", label: "Mã ca" }, { key: "name", label: "Tên ca" },
        { key: "start_time", label: "Bắt đầu" }, { key: "end_time", label: "Kết thúc" },
        { key: "status", label: "Trạng thái", badge: true },
      ],
      fields: [
        { key: "name", label: "Tên ca", required: true, full: true },
        { key: "start_time", label: "Giờ bắt đầu", type: "time" },
        { key: "end_time", label: "Giờ kết thúc", type: "time" },
        { key: "status", label: "Trạng thái", type: "select", options: ["Hoạt động", "Không hoạt động"], default: "Hoạt động" },
      ],
    },
    employees: {
      title: "Nhân viên", resource: "employees",
      columns: [
        { key: "employee_code", label: "Mã NV" }, { key: "name", label: "Họ và tên" },
        { key: "factory", label: "Đơn vị" }, { key: "position", label: "Chức vụ" },
        { key: "skill_level", label: "Bậc thợ" }, { key: "phone", label: "Điện thoại" },
        { key: "status", label: "Trạng thái", badge: true },
      ],
      fields: [
        { key: "name", label: "Họ và tên", required: true, full: true },
        { key: "factory", label: "Đơn vị", type: "select", options: ["Nhà máy thổi", "Nhà máy cắt", "Quản lý"] },
        { key: "position", label: "Chức vụ" },
        { key: "skill_level", label: "Bậc thợ", placeholder: "Bậc 1..5" },
        { key: "phone", label: "Điện thoại" },
        { key: "status", label: "Trạng thái", type: "select", options: ["Hoạt động", "Không hoạt động"], default: "Hoạt động" },
      ],
    },
    roles: {
      title: "Vai trò", resource: "roles",
      columns: [
        { key: "role_code", label: "Mã VT" }, { key: "name", label: "Tên vai trò" },
        { key: "description", label: "Mô tả" }, { key: "status", label: "Trạng thái", badge: true },
      ],
      fields: [
        { key: "name", label: "Tên vai trò", required: true, full: true },
        { key: "description", label: "Mô tả", full: true },
        { key: "status", label: "Trạng thái", type: "select", options: ["Hoạt động", "Không hoạt động"], default: "Hoạt động" },
      ],
    },
  };
}

/* ---- Màn 1 danh mục (mỗi danh mục là 1 app riêng dưới nhóm Danh mục) ---- */
export default function MasterDataScreen({ lookups, entity }) {
  const cfg = buildConfigs(lookups)[entity];
  if (!cfg) return <div className="text-slate-400 text-sm py-10">Danh mục không hợp lệ.</div>;
  return <MasterTable key={entity} cfg={cfg} />;
}
