// [HR-G2] Kiosk chấm công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// Trang /kiosk cho tablet dùng chung ở xưởng. Không qua đăng nhập người dùng — xác thực bằng token thiết bị.
// Luồng: chạm tên → PIN → (lần đầu) đồng ý chụp ảnh → chụp → kết quả → tự về màn chờ.
// Mất mạng: chạm tên → chụp → lưu hàng đợi (IndexedDB) → tự gửi khi có mạng (server đánh dấu cần xác nhận).
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { kioskApi, getDeviceToken, setDeviceToken, getPending, setPending, cacheGet, cacheSet } from "./kioskApi.js";
import { queue, flushQueue } from "./kioskQueue.js";

const IDLE_RESET_MS = 30000;
const SYNC_MS = 20000;
const TIME_SYNC_MS = 5 * 60000;
const ROSTER_MS = 10 * 60000;
const PHOTO_MAX_SIDE = 480;

// Nội dung thông báo theo NĐ 13/2023 — chủ dự án / pháp chế rà lại câu chữ trước khi dùng thật.
const CONSENT_TEXT = [
  "Để chống chấm công hộ, mỗi lần chấm công máy sẽ chụp 1 ảnh khuôn mặt của bạn.",
  "Ảnh chỉ dùng để đối chiếu chấm công, chỉ trưởng tổ và phòng nhân sự được xem, mỗi lần xem đều được ghi lại.",
  "Ảnh được lưu tối đa 6 tháng rồi tự động xóa.",
  "Bạn có thể không đồng ý — vẫn chấm công được, nhưng mỗi lần chấm sẽ cần trưởng tổ xác nhận.",
];

const fmtClock = (ms) => new Date(ms).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const fmtDay = (ms) => new Date(ms).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
const fmtHm = (iso) => new Date(iso).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");
const dirLabel = (d) => (d === "OUT" ? "RA" : "VÀO");

const bigBtn = "min-h-16 rounded-2xl text-xl font-semibold transition-colors active:scale-[0.98] disabled:opacity-50 focus-visible:ring-4 focus-visible:ring-blue-400 outline-none";

/** Chụp 1 khung hình từ <video>, thu nhỏ cạnh dài ≤ 480px, nén WebP (Safari cũ: JPEG). */
async function captureFrame(video) {
  const w0 = video.videoWidth, h0 = video.videoHeight;
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(w0, h0));
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.translate(w, 0); ctx.scale(-1, 1); // lật như gương cho giống màn xem trước
  ctx.drawImage(video, 0, 0, w, h);
  const toBlob = (type, q) => new Promise((r) => canvas.toBlob(r, type, q));
  let blob = await toBlob("image/webp", 0.7);
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg", 0.75);
  return { blob, width: w, height: h, url: URL.createObjectURL(blob) };
}

/* ─── Đăng ký tablet ─── */
function SetupScreen({ onReady }) {
  const [pending, setP] = useState(getPending());
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const register = async () => {
    setBusy(true); setErr("");
    try { const r = await kioskApi.register(name.trim()); setPending(r); setP(r); }
    catch (e) { setErr(e.offline ? "Không kết nối được máy chủ. Kiểm tra Wi-Fi rồi thử lại." : e.message); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!pending) return undefined;
    let stop = false; let timer = null; // #20 dọn timer + bỏ kết quả của lượt poll cũ
    const poll = async () => {
      try {
        const r = await kioskApi.claim(pending);
        if (stop) return;
        if (r.status === 200 && r.body?.token) { setDeviceToken(r.body.token); setPending(null); onReady(); return; }
      } catch (e) {
        if (stop) return;
        if (e.status === 404 || e.status === 410) { setPending(null); setP(null); setErr(e.message); return; }
      }
      if (!stop) timer = setTimeout(poll, 5000);
    };
    poll();
    return () => { stop = true; clearTimeout(timer); };
  }, [pending, onReady]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 p-8 space-y-6 text-center">
        <h1 className="text-2xl font-bold text-slate-800">Đăng ký tablet chấm công</h1>
        {pending ? (
          <>
            <p className="text-lg text-slate-600">Đưa mã này cho quản trị viên để duyệt tablet:</p>
            <div className="text-5xl font-bold tracking-[0.3em] font-mono text-slate-900" aria-label={`Mã đăng ký ${pending.code}`}>{pending.code}</div>
            <p className="text-slate-500">Đang chờ duyệt… (mã hết hạn sau {pending.expires_in_minutes || 15} phút)</p>
            <button type="button" className={`${bigBtn} w-full bg-slate-100 text-slate-700 hover:bg-slate-200`} onClick={() => { setPending(null); setP(null); }}>Lấy mã mới</button>
          </>
        ) : (
          <>
            <label className="block text-left">
              <span className="text-lg text-slate-600">Tên tablet (vd: Tablet Xưởng Thổi)</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="off"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-xl focus:ring-4 focus:ring-blue-300 outline-none" />
            </label>
            <button type="button" disabled={busy} className={`${bigBtn} w-full bg-blue-600 text-white hover:bg-blue-700`} onClick={register}>
              {busy ? "Đang gửi…" : "Đăng ký tablet"}
            </button>
          </>
        )}
        {err && <p role="alert" className="text-rose-600 text-lg">{err}</p>}
      </div>
    </div>
  );
}

/* ─── Bàn phím số ─── */
function Keypad({ onDigit, onDelete, onOk, okLabel = "Xác nhận", okDisabled }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-md">
      {keys.map((k) => (
        <button key={k} type="button" className={`${bigBtn} min-h-20 text-3xl bg-white border-2 border-slate-200 text-slate-800 hover:bg-slate-50`} onClick={() => onDigit(k)}>{k}</button>
      ))}
      <button type="button" className={`${bigBtn} min-h-20 bg-slate-100 text-slate-700 hover:bg-slate-200`} onClick={onDelete} aria-label="Xóa 1 số">Xóa</button>
      <button type="button" className={`${bigBtn} min-h-20 text-3xl bg-white border-2 border-slate-200 text-slate-800 hover:bg-slate-50`} onClick={() => onDigit("0")}>0</button>
      <button type="button" disabled={okDisabled} className={`${bigBtn} min-h-20 bg-blue-600 text-white hover:bg-blue-700`} onClick={onOk}>{okLabel}</button>
    </div>
  );
}

/* ─── Camera ─── */
function CameraScreen({ who, onCaptured, onCancel }) {
  const videoRef = useRef(null);
  const [err, setErr] = useState("");
  const [shot, setShot] = useState(null);
  const shotRef = useRef(null);    // ảnh chưa gửi → revoke khi rời màn (#12)
  const sentRef = useRef(false);   // chống bấm "Chấm công" 2 lần (#11)

  useEffect(() => {
    let stream; let cancelled = false; // #4 camera mở xong SAU khi đã rời màn → tắt ngay
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
      })
      .catch(() => { if (!cancelled) setErr("Không mở được camera. Kiểm tra quyền camera của trình duyệt trên tablet."); });
    if (!navigator.mediaDevices) setErr("Trình duyệt không hỗ trợ camera (cần HTTPS).");
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (shotRef.current && !sentRef.current) URL.revokeObjectURL(shotRef.current.url);
    };
  }, []);

  const keep = (s) => { shotRef.current = s; setShot(s); };
  const take = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    keep(await captureFrame(v));
  };
  const send = () => {
    if (sentRef.current || !shot) return;
    sentRef.current = true; // bên nhận chịu trách nhiệm revoke URL
    onCaptured(shot);
  };

  return (
    <div className="flex flex-col items-center gap-5 w-full">
      <p className="text-2xl font-semibold text-slate-800">{who} — nhìn thẳng vào camera</p>
      <div className="relative w-full max-w-xl aspect-[4/3] rounded-2xl overflow-hidden bg-slate-900">
        {shot ? <img src={shot.url} alt="Ảnh vừa chụp" className="w-full h-full object-cover" width={shot.width} height={shot.height} />
          : <video ref={videoRef} playsInline muted className="w-full h-full object-cover -scale-x-100" />}
      </div>
      {err && <p role="alert" className="text-rose-600 text-lg text-center">{err}</p>}
      <div className="grid grid-cols-2 gap-4 w-full max-w-xl">
        {shot ? (
          <>
            <button type="button" className={`${bigBtn} bg-slate-100 text-slate-700 hover:bg-slate-200`} onClick={() => { URL.revokeObjectURL(shot.url); keep(null); }}>Chụp lại</button>
            <button type="button" className={`${bigBtn} bg-emerald-600 text-white hover:bg-emerald-700`} onClick={send}>Chấm công</button>
          </>
        ) : (
          <>
            <button type="button" className={`${bigBtn} bg-slate-100 text-slate-700 hover:bg-slate-200`} onClick={onCancel}>Hủy</button>
            <button type="button" disabled={!!err} className={`${bigBtn} bg-blue-600 text-white hover:bg-blue-700`} onClick={take}>Chụp ảnh</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── App ─── */
export default function KioskApp() {
  const [hasToken, setHasToken] = useState(!!getDeviceToken());
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/kiosk-sw.js", { scope: "/kiosk" }).catch(() => {});
  }, []);
  if (!hasToken) return <SetupScreen onReady={() => setHasToken(true)} />;
  return <KioskMain onRevoked={() => { setDeviceToken(null); setHasToken(false); }} />;
}

function KioskMain({ onRevoked }) {
  const [roster, setRoster] = useState(cacheGet("roster"));
  const [online, setOnline] = useState(navigator.onLine);
  const [offset, setOffset] = useState(cacheGet("offset") || 0);
  const [now, setNow] = useState(Date.now());
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const busyRef = useRef(false); // #11 chống chạm đúp "Xác nhận" (đếm sai PIN 2 lần)
  const [step, setStep] = useState({ name: "idle" });
  const [filter, setFilter] = useState("");
  const idleTimer = useRef(null);

  const handleErr = useCallback((e) => {
    if (e.offline) setOnline(false);
    if (e.status === 401 && /Tablet/.test(e.message)) onRevoked();
  }, [onRevoked]);

  const goIdle = useCallback(() => { setStep({ name: "idle" }); setFilter(""); }, []);

  // Đồng hồ + giờ server
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const syncTime = useCallback(async () => {
    try { const r = await kioskApi.time(); const o = Date.parse(r.now) - Date.now(); setOffset(o); cacheSet("offset", o); setOnline(true); }
    catch (e) { handleErr(e); }
  }, [handleErr]);
  const loadRoster = useCallback(async () => {
    try { const r = await kioskApi.roster(); setRoster(r); cacheSet("roster", r); setOnline(true); } catch (e) { handleErr(e); }
  }, [handleErr]);

  // Đồng bộ hàng đợi offline
  const sync = useCallback(async () => {
    try {
      const r = await flushQueue((it) => kioskApi.punch(
        { offline: "1", employee_id: it.employee_id, client_captured_at: it.client_captured_at, idempotency_key: it.idempotency_key },
        it.photo ? { blob: it.photo, width: it.width, height: it.height } : null));
      setPendingCount(r.left); setFailedCount(r.failed);
    } catch { setPendingCount(await queue.count().catch(() => 0)); }
  }, []);

  useEffect(() => {
    syncTime(); loadRoster(); sync();
    const a = setInterval(syncTime, TIME_SYNC_MS), b = setInterval(loadRoster, ROSTER_MS), c = setInterval(sync, SYNC_MS);
    const up = () => { setOnline(true); syncTime(); sync(); };
    const down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { clearInterval(a); clearInterval(b); clearInterval(c); window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, [syncTime, loadRoster, sync]);

  // Không thao tác 30 giây → về màn chờ
  useEffect(() => {
    const reset = () => {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(goIdle, IDLE_RESET_MS);
    };
    window.addEventListener("pointerdown", reset); reset();
    return () => { window.removeEventListener("pointerdown", reset); clearTimeout(idleTimer.current); };
  }, [goIdle]);

  // Tự về màn chờ sau khi hiện kết quả
  useEffect(() => {
    if (step.name !== "result") return undefined;
    const t = setTimeout(goIdle, (roster?.result_seconds || 5) * 1000);
    return () => clearTimeout(t);
  }, [step, roster, goIdle]);

  const employees = useMemo(() => {
    const list = roster?.employees || [];
    const q = filter.trim().toLowerCase();
    return q ? list.filter((e) => e.name.toLowerCase().includes(q) || e.employee_code.toLowerCase().includes(q)) : list;
  }, [roster, filter]);

  /** Lưu bản chấm vào hàng đợi offline. key: dùng lại mã của lần gửi online bị đứt (#2) → server không ghi 2 lần. */
  const enqueue = async (emp, photo, key = newKey()) => {
    try {
      await queue.add({
        idempotency_key: key, employee_id: emp.id, client_captured_at: new Date().toISOString(),
        photo: photo?.blob || null, width: photo?.width || null, height: photo?.height || null,
      });
      setPendingCount(await queue.count());
      setStep({ name: "result", offline: true, who: emp.name, at: new Date(Date.now() + offset).toISOString() });
    } catch {
      setStep({ name: "error", message: "Không lưu được lần chấm trên tablet — báo trưởng tổ" });
    } finally {
      if (photo?.url) URL.revokeObjectURL(photo.url); // #12
    }
  };

  /** Gửi lần chấm (online); mất mạng giữa chừng → chuyển sang hàng đợi */
  const submitPunch = async (s, photo) => {
    setStep({ ...s, name: "sending" });
    try {
      const r = await kioskApi.punch({ session: s.session, idempotency_key: s.key }, photo);
      setOnline(true);
      setStep({ name: "result", who: s.employee.name, ...r });
      if (photo?.url) URL.revokeObjectURL(photo.url);
    } catch (e) {
      handleErr(e);
      if (e.offline) return enqueue(s.employee, photo, s.key); // enqueue tự revoke URL
      if (photo?.url) URL.revokeObjectURL(photo.url);
      setStep({ name: "error", message: e.message });
    }
  };

  const pick = (emp) => {
    if (!online) {
      // Q2: offline không kiểm được PIN → chụp ảnh rồi lưu chờ gửi
      if (emp.consent_refused) return enqueue(emp, null);
      return setStep({ name: "camera", offline: true, employee: emp });
    }
    setStep({ name: "pin", employee: emp, pin: "" });
  };

  const identify = async (s) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStep({ ...s, name: "checking" });
    try {
      const r = await kioskApi.identify(s.employee.id ? { employee_id: s.employee.id, pin: s.pin } : { employee_code: s.code, pin: s.pin });
      const next = { session: r.session, employee: r.employee, key: newKey(), photoRequired: r.photo_required, expected: r.expected_direction };
      if (r.needs_consent) setStep({ ...next, name: "consent" });
      else if (r.photo_required) setStep({ ...next, name: "camera" });
      else submitPunch(next, null);
    } catch (e) {
      handleErr(e);
      if (e.offline && s.employee.id) {
        if (s.employee.consent_refused) return enqueue(s.employee, null);
        return setStep({ name: "camera", offline: true, employee: s.employee });
      }
      setStep({ ...s, name: s.code !== undefined && !s.employee.id ? "other" : "pin", pin: "", error: e.message });
    } finally { busyRef.current = false; }
  };
  // #11 cập nhật theo giá trị mới nhất (bấm nhanh 2 phím không mất số)
  const typeDigit = (d) => setStep((p) => (p.pin.length < 8 ? { ...p, pin: p.pin + d, error: "" } : p));
  const deleteDigit = () => setStep((p) => ({ ...p, pin: p.pin.slice(0, -1) }));

  const answerConsent = async (s, accept) => {
    try {
      await kioskApi.consent(s.session, accept);
      if (accept) setStep({ ...s, name: "camera" }); else submitPunch(s, null);
    } catch (e) { handleErr(e); setStep({ name: "error", message: e.message }); }
  };

  const clock = now + offset;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col select-none">
      <header className="flex items-center justify-between gap-4 px-6 py-4 bg-white border-b border-slate-200">
        <div className="min-w-0">
          <div className="text-xl font-bold text-slate-800 truncate">{roster?.unit_name || "Chấm công"}</div>
          <div className="text-slate-500 capitalize">{fmtDay(clock)}</div>
        </div>
        <div className="text-4xl font-bold tabular-nums text-slate-900" aria-live="off">{fmtClock(clock)}</div>
        <div className="flex flex-col items-end gap-1 text-sm">
          <span className={`px-3 py-1 rounded-full font-medium ${online ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {online ? "Đang kết nối" : "Mất mạng — vẫn chấm được"}
          </span>
          {pendingCount > 0 && <span className="text-amber-700">{pendingCount} lần chấm chờ gửi</span>}
          {failedCount > 0 && <span className="text-rose-700">{failedCount} lần chấm bị từ chối — báo trưởng tổ</span>}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center p-6 gap-6">
        {step.name === "idle" && (
          <>
            <div className="w-full max-w-5xl flex gap-3">
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Tìm tên hoặc mã…" aria-label="Tìm tên hoặc mã nhân viên"
                autoComplete="off" className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-xl focus:ring-4 focus:ring-blue-300 outline-none" />
              <button type="button" disabled={!online} className={`${bigBtn} px-5 bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 text-lg`}
                onClick={() => setStep({ name: "other", code: "", pin: "", employee: {} })}>Người xưởng khác</button>
            </div>
            {!roster ? <p className="text-xl text-slate-500">Đang tải danh sách…</p> : employees.length === 0 ? (
              <p className="text-xl text-slate-500">Không có nhân viên phù hợp</p>
            ) : (
              <div className="w-full max-w-5xl grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {employees.map((e) => (
                  <button key={e.id} type="button" onClick={() => pick(e)} className={`${bigBtn} min-h-24 px-3 bg-white border-2 border-slate-200 text-slate-800 hover:border-blue-400 hover:bg-blue-50 flex flex-col items-center justify-center`}>
                    <span className="leading-tight">{e.name}</span>
                    <span className="text-sm font-normal text-slate-500 font-mono">{e.employee_code}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {(step.name === "pin" || step.name === "checking") && (
          <div className="flex flex-col items-center gap-5">
            <p className="text-2xl font-semibold text-slate-800">{step.employee.name} — nhập PIN</p>
            <div className="flex gap-3" aria-label={`Đã nhập ${step.pin.length} số`}>
              {Array.from({ length: Math.max(6, step.pin.length) }).map((_, i) => (
                <span key={i} className={`w-5 h-5 rounded-full ${i < step.pin.length ? "bg-slate-800" : "bg-slate-200"}`} />
              ))}
            </div>
            {step.error && <p role="alert" className="text-rose-600 text-lg text-center max-w-md">{step.error}</p>}
            <Keypad okDisabled={step.name === "checking" || step.pin.length < 4} okLabel={step.name === "checking" ? "Đang kiểm…" : "Xác nhận"}
              onDigit={typeDigit}
              onDelete={deleteDigit}
              onOk={() => identify(step)} />
            <button type="button" className={`${bigBtn} px-8 bg-slate-100 text-slate-700 hover:bg-slate-200`} onClick={goIdle}>Quay lại</button>
          </div>
        )}

        {step.name === "other" && (
          <div className="flex flex-col items-center gap-5 w-full max-w-md">
            <p className="text-2xl font-semibold text-slate-800">Người xưởng khác</p>
            <input value={step.code} onChange={(e) => setStep({ ...step, code: e.target.value.toUpperCase(), error: "" })} placeholder="Mã nhân viên…"
              aria-label="Mã nhân viên" autoComplete="off" spellCheck={false}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-2xl font-mono text-center focus:ring-4 focus:ring-blue-300 outline-none" />
            <div className="flex gap-3" aria-label={`Đã nhập ${step.pin.length} số PIN`}>
              {Array.from({ length: Math.max(6, step.pin.length) }).map((_, i) => (
                <span key={i} className={`w-5 h-5 rounded-full ${i < step.pin.length ? "bg-slate-800" : "bg-slate-200"}`} />
              ))}
            </div>
            {step.error && <p role="alert" className="text-rose-600 text-lg text-center">{step.error}</p>}
            <Keypad okDisabled={!step.code.trim() || step.pin.length < 4}
              onDigit={typeDigit}
              onDelete={deleteDigit}
              onOk={() => identify({ ...step, employee: { name: step.code } })} />
            <button type="button" className={`${bigBtn} px-8 bg-slate-100 text-slate-700 hover:bg-slate-200`} onClick={goIdle}>Quay lại</button>
          </div>
        )}

        {step.name === "consent" && (
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 p-8 space-y-5">
            <h2 className="text-2xl font-bold text-slate-800">{step.employee.name} — đồng ý chụp ảnh khi chấm công</h2>
            <ul className="space-y-3 text-lg text-slate-700 list-disc pl-6">{CONSENT_TEXT.map((t) => <li key={t}>{t}</li>)}</ul>
            <p className="text-sm text-slate-500">Theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân · phiên bản {roster?.consent_version}</p>
            <div className="grid grid-cols-2 gap-4">
              <button type="button" className={`${bigBtn} bg-slate-100 text-slate-700 hover:bg-slate-200`} onClick={() => answerConsent(step, false)}>Không đồng ý</button>
              <button type="button" className={`${bigBtn} bg-blue-600 text-white hover:bg-blue-700`} onClick={() => answerConsent(step, true)}>Đồng ý</button>
            </div>
          </div>
        )}

        {step.name === "camera" && (
          <CameraScreen who={step.employee.name} onCancel={goIdle}
            onCaptured={(photo) => (step.offline ? enqueue(step.employee, photo) : submitPunch(step, photo))} />
        )}

        {step.name === "sending" && <p className="text-2xl text-slate-600 mt-20">Đang chấm công…</p>}

        {step.name === "result" && (
          <div role="status" className="flex flex-col items-center gap-4 mt-12 text-center">
            <div className={`w-28 h-28 rounded-full flex items-center justify-center text-6xl ${step.duplicate ? "bg-amber-100 text-amber-700" : step.offline ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`} aria-hidden="true">
              {step.duplicate ? "!" : "✓"}
            </div>
            <p className="text-3xl font-bold text-slate-800">{step.who || step.employee_name}</p>
            {step.offline ? (
              <p className="text-2xl text-amber-700">Đã lưu lúc {fmtHm(step.at)} — sẽ tự gửi khi có mạng</p>
            ) : step.duplicate ? (
              <p className="text-2xl text-amber-700">{step.message}</p>
            ) : (
              <p className="text-3xl text-emerald-700 font-semibold">Đã chấm {dirLabel(step.direction)} lúc {fmtHm(step.punched_at)}</p>
            )}
            {step.needs_review && !step.offline && <p className="text-lg text-slate-500">Lần chấm này cần trưởng tổ xác nhận</p>}
            <button type="button" className={`${bigBtn} px-10 mt-4 bg-slate-100 text-slate-700 hover:bg-slate-200`} onClick={goIdle}>Xong</button>
          </div>
        )}

        {step.name === "error" && (
          <div role="alert" className="flex flex-col items-center gap-5 mt-12 text-center">
            <p className="text-2xl text-rose-600 max-w-xl">{step.message}</p>
            <button type="button" className={`${bigBtn} px-10 bg-blue-600 text-white hover:bg-blue-700`} onClick={goIdle}>Thử lại</button>
          </div>
        )}
      </main>
    </div>
  );
}
