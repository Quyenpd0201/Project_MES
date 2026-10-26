// [HR-G2] Kiosk chấm công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// Lịch sử chấm công: các lần chấm GỐC từ tablet (chưa tính công — tính công ở G3). Bấm "Xem ảnh" → link ký 5 phút, có ghi log.
import React, { useState, useEffect, useCallback } from "react";
import { Image as ImageIcon } from "lucide-react";
import { ListHeader, DataTable, Modal, LoadError, DateInput, SearchSelect } from "../../components.jsx";
import { hrAttendance, hrConfig } from "../../mesApi.js";
import { fmtDateTime, fmtDate, todayYmd, toast } from "../../ui.js";
import { usePerm } from "../../perm.jsx";

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString("en-CA"); };

export default function PunchHistory() {
  const { can } = usePerm();
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(todayYmd());
  const [unit, setUnit] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [units, setUnits] = useState([]);
  const [photo, setPhoto] = useState(null);
  const [truncated, setTruncated] = useState(0);

  useEffect(() => { hrConfig.orgUnits().then(setUnits).catch(() => setUnits([])); }, []);
  const load = useCallback(async () => {
    setErr(""); setRows(null);
    try {
      const r = await hrAttendance.punches({ from, to, org_unit_id: unit, needs_review: reviewOnly ? "1" : "" });
      setRows(r.data); setTruncated(r.truncated ? r.max_rows : 0);
    }
    catch (e) { setErr(e.message || "Lỗi máy chủ"); }
  }, [from, to, unit, reviewOnly]);
  useEffect(() => { load(); }, [load]);

  if (!can("hr_attendance", "view")) return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Bạn không có quyền xem lịch sử chấm công.</div>;

  const openPhoto = async (r) => {
    try { const { url } = await hrAttendance.photoUrl(r.photo_id); setPhoto({ url, who: r.employee_name, at: r.punched_at }); }
    catch (e) { toast.error(e.message); }
  };

  const columns = [
    { key: "punched_at", label: "Thời điểm", render: (r) => <span className="tabular-nums">{fmtDateTime(r.punched_at)}</span> },
    { key: "work_date", label: "Ngày công", render: (r) => <span className="tabular-nums">{fmtDate(r.work_date)}</span> },
    { key: "employee_name", label: "Nhân viên", filter: "text", render: (r) => <><div>{r.employee_name}</div><div className="text-xs text-slate-500 font-mono">{r.employee_code}</div></> },
    { key: "org_unit_name", label: "Tổ", filter: "select" },
    { key: "direction", label: "Vào / Ra", filter: "select", filterValue: (r) => (r.direction === "IN" ? "Vào" : "Ra"), render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.direction === "IN" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{r.direction === "IN" ? "Vào" : "Ra"}</span>) },
    { key: "source", label: "Nguồn", filter: "select", filterValue: (r) => (r.source === "offline" ? "Offline" : "Online"), render: (r) => (r.source === "offline" ? "Offline" : "Online") },
    { key: "needs_review", label: "Cần xác nhận", render: (r) => (r.needs_review
      ? <span className="text-amber-700 text-xs" title={r.review_reason || ""}>{r.review_reason || "Cần xác nhận"}</span>
      : <span className="text-slate-400">—</span>) },
    { key: "device_name", label: "Tablet", render: (r) => r.device_name || <span className="text-slate-400">—</span> },
    { key: "_photo", label: "", align: "right", render: (r) => (!r.photo_id ? <span className="text-xs text-slate-400">Không ảnh</span>
      : r.photo_purged ? <span className="text-xs text-slate-400">Ảnh đã xóa</span>
      : can("hr_photo", "view") ? <button type="button" className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" title="Xem ảnh" aria-label={`Xem ảnh ${r.employee_name}`} onClick={() => openPhoto(r)}><ImageIcon size={15} /></button>
      : null) },
  ];

  return (
    <div className="space-y-4">
      <ListHeader title="Lịch sử chấm công" subtitle="Các lần chấm gốc từ tablet — chưa tính công" />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">Từ ngày<div className="mt-1 w-40"><DateInput value={from} onChange={(e) => setFrom(e.target.value)} /></div></label>
        <label className="text-sm text-slate-600">Đến ngày<div className="mt-1 w-40"><DateInput value={to} onChange={(e) => setTo(e.target.value)} /></div></label>
        <label className="text-sm text-slate-600">Đơn vị<div className="mt-1 w-56">
          <SearchSelect value={unit} onChange={setUnit} options={units.map((u) => ({ value: u.id, label: u.name }))} placeholder="-- Tất cả --" ariaLabel="Lọc theo đơn vị" />
        </div></label>
        <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
          <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} className="h-4 w-4 rounded border-slate-300" /> Chỉ lần cần xác nhận
        </label>
      </div>
      {truncated > 0 && <p role="status" className="text-sm text-amber-700">Chỉ hiện {truncated} lần chấm mới nhất — thu hẹp khoảng ngày hoặc lọc theo đơn vị để xem đủ (tối đa 62 ngày).</p>}
      {err ? <LoadError message={`Không tải được lịch sử chấm công (${err})`} onRetry={load} />
        : <DataTable columns={columns} rows={rows || []} rowKey={(r) => r.id} loading={!rows} stateKey="hr:punches" pageSize={20} emptyText="Không có lần chấm nào trong khoảng này" />}
      {photo && (
        <Modal title={`Ảnh chấm công — ${photo.who}`} onClose={() => setPhoto(null)} size="md" closeOnBackdrop>
          <div className="space-y-2 text-center">
            <img src={photo.url} alt={`Ảnh chấm công của ${photo.who}`} width={480} height={360} className="mx-auto rounded-lg max-h-[60vh] w-auto" />
            <p className="text-sm text-slate-500 tabular-nums">{fmtDateTime(photo.at)} · lượt xem đã được ghi lại</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
