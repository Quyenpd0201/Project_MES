// [HR-G2] Kiosk chấm công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// Gọi API kiosk bằng token thiết bị (không dùng token đăng nhập của người dùng).
const API_BASE = import.meta.env?.VITE_API_BASE || "http://localhost:4000";
const TOKEN_KEY = "mes_kiosk_token";
const PENDING_KEY = "mes_kiosk_pending"; // { device_id, claim_secret, code } khi đang chờ duyệt

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* bỏ qua */ } },
};

export const getDeviceToken = () => ls.get(TOKEN_KEY);
export const setDeviceToken = (t) => ls.set(TOKEN_KEY, t);
export const getPending = () => { try { return JSON.parse(ls.get(PENDING_KEY) || "null"); } catch { return null; } };
export const setPending = (p) => ls.set(PENDING_KEY, p ? JSON.stringify(p) : null);
export const cacheGet = (k) => { try { return JSON.parse(ls.get(`mes_kiosk_${k}`) || "null"); } catch { return null; } };
export const cacheSet = (k, v) => ls.set(`mes_kiosk_${k}`, JSON.stringify(v));

/** Lỗi mạng (không tới được server) → err.offline = true. Lỗi HTTP → err.status. */
// Quá thời gian chờ coi như mất mạng → kiosk chuyển sang chấm offline thay vì treo màn hình
const TIMEOUT_MS = 8000;
const UPLOAD_TIMEOUT_MS = 20000;

async function call(path, { method = "GET", json, form, headers = {} } = {}) {
  let res;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), form ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS);
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method, signal: ctrl.signal,
      headers: { ...(json ? { "Content-Type": "application/json" } : {}), ...(getDeviceToken() ? { "X-Kiosk-Token": getDeviceToken() } : {}), ...headers },
      body: json ? JSON.stringify(json) : form,
    });
  } catch {
    const e = new Error("Mất kết nối máy chủ"); e.offline = true; throw e;
  } finally { clearTimeout(timer); }
  let body = null;
  try { body = await res.json(); } catch { /* không có body */ }
  if (!res.ok && res.status !== 202) {
    const e = new Error(body?.message || `Lỗi ${res.status}`); e.status = res.status; throw e;
  }
  return { status: res.status, body };
}

export const kioskApi = {
  register: (name) => call("/kiosk/register", { method: "POST", json: { name } }).then((r) => r.body),
  claim: (p) => call("/kiosk/register/claim", { method: "POST", json: { device_id: p.device_id, claim_secret: p.claim_secret } }),
  time: () => call("/kiosk/time", { headers: { "X-Client-Time": new Date().toISOString() } }).then((r) => r.body),
  roster: () => call("/kiosk/roster").then((r) => r.body),
  identify: (data) => call("/kiosk/identify", { method: "POST", json: data }).then((r) => r.body),
  consent: (session, accept) => call("/kiosk/consent", { method: "POST", json: { session, accept } }).then((r) => r.body),
  punch: (fields, photo) => {
    const f = new FormData();
    Object.entries(fields).forEach(([k, v]) => { if (v != null) f.append(k, v); });
    if (photo) f.append("photo", photo.blob, photo.blob.type === "image/jpeg" ? "p.jpg" : "p.webp");
    if (photo) { f.append("photo_width", photo.width); f.append("photo_height", photo.height); }
    return call("/kiosk/punch", { method: "POST", form: f }).then((r) => r.body);
  },
};
