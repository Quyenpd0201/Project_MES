// [HR-G4] Chuông thông báo trong app — 2026-10-26, CHƯA PHÁT HÀNH (file mới)
// Hỏi máy chủ mỗi 60 giây. Bấm 1 thông báo → đánh dấu đã đọc + mở màn liên quan.
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { notificationsApi } from "../../mesApi.js";
import { fmtDateTime } from "../../ui.js";

const POLL_MS = 60000;
const ROUTE = { leave_request: "/hr/leave" };

export default function NotificationBell() {
  const [data, setData] = useState({ unread: 0, data: [] });
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(() => notificationsApi.list().then(setData).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, POLL_MS); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const go = async (n) => {
    if (!n.read_at) await notificationsApi.read(n.id).catch(() => {});
    setOpen(false); load();
    if (ROUTE[n.ref_type]) navigate(`${ROUTE[n.ref_type]}?open=${n.ref_id}`);
  };

  return (
    <div className="relative" ref={boxRef}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={`Thông báo${data.unread ? ` (${data.unread} chưa đọc)` : ""}`} title="Thông báo"
        className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors">
        <Bell size={18} aria-hidden="true" />
        {data.unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">{data.unread > 9 ? "9+" : data.unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Thông báo" className="absolute bottom-full left-0 mb-2 w-80 max-h-96 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-700">Thông báo</span>
            {data.unread > 0 && <button type="button" className="text-xs text-blue-700 hover:underline" onClick={() => notificationsApi.readAll().then(load)}>Đánh dấu đã đọc hết</button>}
          </div>
          {data.data.length === 0 ? <p className="px-3 py-6 text-sm text-slate-400 text-center">Chưa có thông báo</p> : (
            <ul className="divide-y divide-slate-100">
              {data.data.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => go(n)} className={`w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors ${n.read_at ? "" : "bg-blue-50/50"}`}>
                    <div className={`text-sm ${n.read_at ? "text-slate-600" : "text-slate-800 font-medium"}`}>{n.title}</div>
                    {n.body && <div className="text-xs text-slate-500 truncate">{n.body}</div>}
                    <div className="text-[11px] text-slate-400 tabular-nums">{fmtDateTime(n.created_at)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
