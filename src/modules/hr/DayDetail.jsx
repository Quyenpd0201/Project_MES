// [HR-G3] Chi tiết 1 ngày công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// Dùng chung cho màn "Ngày công" và "Cần xử lý": lần chấm (kèm ảnh), kết quả tính, sửa công, tạo yêu cầu sửa công.
import React, { useState, useEffect, useCallback } from "react";
import { Image as ImageIcon, Plus } from "lucide-react";
import { Link } from "react-router-dom"; // [HR-G4]
import { Modal, LoadError, useSaving } from "../../components.jsx";
import { hrWorkday, hrAttendance } from "../../mesApi.js";
import { inputCls, fmtDate, fmtDateTime, statusClass, toast } from "../../ui.js";
import { usePerm } from "../../perm.jsx";

export const fmtMin = (m) => {
  const n = Number(m) || 0;
  if (!n) return "—";
  const h = Math.floor(n / 60); const r = n % 60;
  return h ? `${h} giờ${r ? ` ${r} phút` : ""}` : `${r} phút`;
};
export const fmtHm = (d) => (d ? new Date(d).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }) : "—");
export const Badge = ({ s }) => <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${statusClass(s)}`}>{s}</span>;
const KIND_LABEL = { add_in: "Bổ sung giờ vào", add_out: "Bổ sung giờ ra", ignore_punch: "Bỏ lần chấm sai" };

/** 'YYYY-MM-DD' + 'HH:MM' (giờ VN) → ISO */
const toIso = (date, hm, nextDay) => new Date(Date.parse(`${date}T${hm}:00+07:00`) + (nextDay ? 86400000 : 0)).toISOString();

function CorrectionForm({ employeeId, date, punches, onDone, onClose }) {
  const [v, setV] = useState({ kind: "add_out", time: "", nextDay: false, punch_id: "", reason: "" });
  const [saving, guard] = useSaving();
  const set = (k) => (x) => setV((s) => ({ ...s, [k]: x }));
  const submit = () => guard(async () => {
    try {
      const d = { employee_id: employeeId, work_date: date, kind: v.kind, reason: v.reason };
      if (v.kind === "ignore_punch") d.punch_id = v.punch_id; else d.new_time = toIso(date, v.time, v.nextDay);
      await hrWorkday.createCorrection(d);
      toast.success("Đã gửi yêu cầu sửa công — chờ người khác duyệt");
      onDone(); onClose();
    } catch (e) { toast.error(e.message); }
  });
  const valid = v.reason.trim() && (v.kind === "ignore_punch" ? v.punch_id : /^\d{2}:\d{2}$/.test(v.time));
  return (
    <Modal title={`Yêu cầu sửa công — ${fmtDate(date)}`} onClose={onClose} size="md" locked={saving} dirty={!!(v.time || v.reason)}
      footer={(close) => <>
        <button type="button" className="btn-ghost" onClick={close} disabled={saving}>Hủy</button>
        <button type="button" className="btn-primary disabled:opacity-60" onClick={submit} disabled={saving || !valid}>{saving ? "Đang gửi…" : "Gửi yêu cầu"}</button>
      </>}>
      <div className="space-y-3">
        <label className="block"><span className="text-sm font-medium text-slate-600">Loại sửa <span className="text-rose-600">*</span></span>
          <select className={inputCls + " mt-1"} value={v.kind} onChange={(e) => set("kind")(e.target.value)}>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        {v.kind === "ignore_punch" ? (
          <label className="block"><span className="text-sm font-medium text-slate-600">Lần chấm cần bỏ <span className="text-rose-600">*</span></span>
            <select className={inputCls + " mt-1"} value={v.punch_id} onChange={(e) => set("punch_id")(e.target.value)}>
              <option value="">-- Chọn --</option>
              {punches.map((p) => <option key={p.id} value={p.id}>{fmtDateTime(p.punched_at)}</option>)}
            </select>
          </label>
        ) : (
          <div className="flex items-end gap-3">
            <label className="block flex-1"><span className="text-sm font-medium text-slate-600">Giờ <span className="text-rose-600">*</span></span>
              <input type="time" className={inputCls + " mt-1"} value={v.time} onChange={(e) => set("time")(e.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
              <input type="checkbox" checked={v.nextDay} onChange={(e) => set("nextDay")(e.target.checked)} className="h-4 w-4 rounded border-slate-300" /> Sáng hôm sau (ca đêm)
            </label>
          </div>
        )}
        <label className="block"><span className="text-sm font-medium text-slate-600">Lý do <span className="text-rose-600">*</span></span>
          <textarea className={inputCls + " mt-1"} rows={3} maxLength={500} value={v.reason} placeholder="VD: Công nhân quên chấm ra, tổ trưởng xác nhận có mặt đến 17:00…" onChange={(e) => set("reason")(e.target.value)} />
        </label>
        <p className="text-xs text-slate-500">Yêu cầu sẽ do người khác (trưởng xưởng / nhân sự) duyệt. Lần chấm gốc không bị sửa.</p>
      </div>
    </Modal>
  );
}

export function DayDetailModal({ employeeId, date, onClose, onChanged }) {
  const { can } = usePerm();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [photo, setPhoto] = useState(null);
  const [correcting, setCorrecting] = useState(false);
  const load = useCallback(async () => {
    setErr("");
    try { setData(await hrWorkday.day(employeeId, date)); } catch (e) { setErr(e.message); }
  }, [employeeId, date]);
  useEffect(() => { load(); }, [load]);

  const openPhoto = async (p) => {
    try { const { url } = await hrAttendance.photoUrl(p.photo_id); setPhoto({ url, at: p.punched_at }); } catch (e) { toast.error(e.message); }
  };
  const d = data?.day;
  return (
    <Modal title={data ? `${data.employee?.name} — ${fmtDate(date)}` : "Chi tiết ngày công"} onClose={onClose} size="lg" closeOnBackdrop>
      {err ? <LoadError message={`Không tải được (${err})`} onRetry={load} /> : !data ? <div className="text-sm text-slate-400">Đang tải…</div> : (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {d ? <Badge s={d.status} /> : <span className="text-slate-400">Chưa tính</span>}
            <span className="text-slate-600">Ca: <b className="text-slate-800">{d?.shift_name || "—"}</b>{data.assignment && <span className="text-xs text-slate-500"> (đã gán)</span>}</span>
            <span className="text-slate-600">Vào <b className="tabular-nums">{fmtHm(d?.first_in)}</b> · Ra <b className="tabular-nums">{fmtHm(d?.last_out)}</b></span>
            <span className="text-slate-600">Làm <b>{fmtMin(d?.worked_min)}</b></span>
            {d?.late_min > 0 && <span className="text-amber-700">Muộn {fmtMin(d.late_min)}</span>}
            {d?.early_min > 0 && <span className="text-amber-700">Sớm {fmtMin(d.early_min)}</span>}
            {d && d.ot_status !== "none" && (
              <span className="text-slate-600">Tăng ca: thường {fmtMin(d.ot_calc_min)} · đêm {fmtMin(d.ot_calc_night_min)} · nghỉ/lễ {fmtMin(d.ot_calc_holiday_min)}
                {d.ot_status === "pending" ? <span className="text-amber-700"> (chờ duyệt)</span> : <span className="text-emerald-700"> (đã duyệt)</span>}</span>
            )}
          </div>
          {d?.flags?.length > 0 && <p className="text-xs text-slate-500">Ghi chú: {d.flags.join(" · ")}</p>}
          {d?.leave_request_id && ( /* [HR-G4] */
            <p className="text-sm text-slate-600">Nghỉ theo đơn ({{ FULL: "cả ngày", AM: "buổi sáng", PM: "buổi chiều" }[d.leave_part]}) —{" "}
              <Link className="text-blue-700 hover:underline" to={`/hr/leave?open=${d.leave_request_id}`}>xem đơn nghỉ</Link></p>
          )}

          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Lần chấm</h3>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {data.punches.length === 0 && <tr><td className="py-2 text-slate-400">Không có lần chấm</td></tr>}
                {data.punches.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 tabular-nums">{fmtDateTime(p.punched_at)}</td>
                    <td className="py-2 text-slate-500">{p.source === "offline" ? "Offline" : "Online"}{!p.pin_verified && " · không PIN"}</td>
                    <td className="py-2 text-xs">
                      {p.needs_review ? (p.decision === "accept" ? <span className="text-emerald-700">Đã duyệt</span>
                        : p.decision === "reject" ? <span className="text-rose-700">Đã từ chối</span>
                        : <span className="text-amber-700">Cần xác nhận: {p.review_reason}</span>) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="py-2 text-right">
                      {p.photo_id && !p.photo_purged && can("hr_photo", "view") && (
                        <button type="button" className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" title="Xem ảnh" aria-label="Xem ảnh" onClick={() => openPhoto(p)}><ImageIcon size={15} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700">Sửa công</h3>
              {can("hr_attendance", "create") && !d?.locked && <button type="button" className="btn-ghost text-sm" onClick={() => setCorrecting(true)}><Plus size={14} /> Tạo yêu cầu sửa công</button>}
            </div>
            {data.corrections.length === 0 ? <p className="text-slate-400">Chưa có</p> : (
              <ul className="space-y-2">
                {data.corrections.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Badge s={c.status} />
                    <span>{KIND_LABEL[c.kind]}{c.new_time && <> <b className="tabular-nums">{fmtDateTime(c.new_time)}</b></>}</span>
                    <span className="text-slate-500">— {c.reason}</span>
                    <span className="text-xs text-slate-400">Tạo: {c.requested_by_name || "—"}{c.decided_by_name && ` · Xử lý: ${c.decided_by_name}`}{c.reject_reason && ` · Lý do từ chối: ${c.reject_reason}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      {photo && (
        <Modal title="Ảnh chấm công" onClose={() => setPhoto(null)} size="md" closeOnBackdrop z="z-[60]">
          <div className="text-center space-y-2">
            <img src={photo.url} alt="Ảnh chấm công" width={480} height={360} className="mx-auto rounded-lg max-h-[60vh] w-auto" />
            <p className="text-sm text-slate-500 tabular-nums">{fmtDateTime(photo.at)} · lượt xem đã được ghi lại</p>
          </div>
        </Modal>
      )}
      {correcting && <CorrectionForm employeeId={employeeId} date={date} punches={data?.punches || []}
        onClose={() => setCorrecting(false)} onDone={() => { load(); onChanged?.(); }} />}
    </Modal>
  );
}
