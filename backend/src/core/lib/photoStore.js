// [HR-G2] Kiosk chấm công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// Lưu ảnh chấm công. Một giao diện cho 2 nơi lưu:
//   PHOTO_STORE=local    → thư mục PHOTO_DIR (mặc định backend/storage/hr-photos) — dev / test
//   PHOTO_STORE=supabase → Supabase Storage, bucket PRIVATE (PHOTO_BUCKET, mặc định hr-photos) — production
//                          cần SUPABASE_URL + SUPABASE_SERVICE_KEY (chỉ ở server, không đưa ra trình duyệt)
// Trình duyệt KHÔNG truy cập thẳng nơi lưu: xem ảnh qua /api/hr/photos/raw có chữ ký HMAC hết hạn (signPhoto).
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

// [HR-G4] + tiền tố 'leave/' cho đính kèm đơn nghỉ (PDF / PNG). Job dọn ảnh mồ côi chỉ quét thư mục ngày KHÔNG tiền tố.
const KEY_RE = /^(leave\/)?\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]{36}\.(webp|jpg|png|pdf)$/;
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };

function assertKey(key) {
  if (typeof key !== 'string' || !KEY_RE.test(key)) throw new Error('Đường dẫn ảnh không hợp lệ');
}

/** Nhận diện định dạng thật theo magic bytes (không tin Content-Type của client). */
function sniffMime(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

/** Key theo ngày giờ Việt Nam: YYYY/MM/DD/<uuid>.<ext> */
/** [HR-G4] Nhận diện đính kèm: ảnh (WebP / JPEG / PNG) hoặc PDF theo magic bytes */
function sniffDoc(buf) {
  const img = sniffMime(buf);
  if (img) return img;
  if (!Buffer.isBuffer(buf) || buf.length < 8) return null;
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

function makeKey(date, mime) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(date).split('-');
  return `${ymd[0]}/${ymd[1]}/${ymd[2]}/${crypto.randomUUID()}.${EXT[mime] || 'webp'}`;
}

function createLocalDriver(root) {
  const full = (key) => { assertKey(key); return path.join(root, ...key.split('/')); };
  return {
    async save(key, buf) {
      const f = full(key);
      await fs.mkdir(path.dirname(f), { recursive: true });
      await fs.writeFile(f, buf, { flag: 'wx' }); // wx: không ghi đè ảnh đã có
    },
    async read(key) { return fs.readFile(full(key)); },
    async remove(key) { await fs.rm(full(key), { force: true }); },
    /** [HR-G2] Liệt kê file trong 1 thư mục ngày 'YYYY/MM/DD' → [{ key, modifiedAt }] */
    async list(dayPrefix) {
      if (!/^\d{4}\/\d{2}\/\d{2}$/.test(dayPrefix)) throw new Error('Thư mục ảnh không hợp lệ');
      const dir = path.join(root, ...dayPrefix.split('/'));
      let names = [];
      try { names = await fs.readdir(dir); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
      const out = [];
      for (const n of names) {
        const key = `${dayPrefix}/${n}`;
        if (!KEY_RE.test(key)) continue;
        out.push({ key, modifiedAt: (await fs.stat(path.join(dir, n))).mtime });
      }
      return out;
    },
  };
}

function createSupabaseDriver({ url, key, bucket, fetchImpl = fetch }) {
  const base = `${String(url).replace(/\/+$/, '')}/storage/v1/object`;
  const auth = { Authorization: `Bearer ${key}`, apikey: key };
  const fail = async (op, res) => {
    // Không đưa nội dung phản hồi / key vào thông báo — chỉ mã lỗi
    throw new Error(`Lưu trữ ảnh lỗi khi ${op} (HTTP ${res.status})`);
  };
  return {
    async save(k, buf, mime) {
      assertKey(k);
      const res = await fetchImpl(`${base}/${bucket}/${k}`, {
        method: 'POST', headers: { ...auth, 'Content-Type': mime, 'x-upsert': 'false' }, body: buf });
      if (!res.ok) await fail('lưu', res);
    },
    async read(k) {
      assertKey(k);
      const res = await fetchImpl(`${base}/authenticated/${bucket}/${k}`, { method: 'GET', headers: auth });
      if (!res.ok) await fail('đọc', res);
      return Buffer.from(await res.arrayBuffer());
    },
    async remove(k) {
      assertKey(k);
      const res = await fetchImpl(`${base}/${bucket}`, {
        method: 'DELETE', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [k] }) });
      if (!res.ok) await fail('xóa', res);
    },
    async list(dayPrefix) {
      if (!/^\d{4}\/\d{2}\/\d{2}$/.test(dayPrefix)) throw new Error('Thư mục ảnh không hợp lệ');
      const res = await fetchImpl(`${base}/list/${bucket}`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: dayPrefix, limit: 1000, offset: 0 }) });
      if (!res.ok) await fail('liệt kê', res);
      const items = await res.json();
      return (items || []).map((it) => ({ key: `${dayPrefix}/${it.name}`, modifiedAt: new Date(it.updated_at || it.created_at) }))
        .filter((it) => KEY_RE.test(it.key));
    },
  };
}

let driver;
function getDriver() {
  if (driver) return driver;
  if (process.env.PHOTO_STORE === 'supabase') {
    const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_KEY cho lưu ảnh');
    driver = createSupabaseDriver({ url: SUPABASE_URL, key: SUPABASE_SERVICE_KEY, bucket: process.env.PHOTO_BUCKET || 'hr-photos' });
  } else {
    driver = createLocalDriver(process.env.PHOTO_DIR || path.join(__dirname, '..', '..', '..', 'storage', 'hr-photos'));
  }
  return driver;
}

// ── Chữ ký URL xem ảnh ───────────────────────────────────────────────────
function secret() {
  const s = process.env.PHOTO_URL_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error('Thiếu PHOTO_URL_SECRET / JWT_SECRET');
  return s;
}
// [Review G4 R9] chữ ký gắn loại tài nguyên → chữ ký ảnh chấm công không dùng được cho đính kèm đơn nghỉ
const mac = (id, exp, kind = 'photo') => crypto.createHmac('sha256', secret()).update(`${kind}:${id}:${exp}`).digest('base64url');

/** Ký quyền xem ảnh `id` trong ttlSeconds giây → { exp, sig } */
function signPhoto(id, ttlSeconds = 300, kind = 'photo') {
  const exp = String(Math.floor(Date.now() / 1000) + ttlSeconds);
  return { exp, sig: mac(id, exp, kind) };
}

function verifyPhoto(id, exp, sig, kind = 'photo') {
  if (!/^\d{1,12}$/.test(String(exp)) || Number(exp) < Date.now() / 1000) return false;
  const want = Buffer.from(mac(id, exp, kind));
  const got = Buffer.from(String(sig || ''));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

module.exports = {
  sniffMime, sniffDoc, makeKey, signPhoto, verifyPhoto, createLocalDriver, createSupabaseDriver,
  save: (k, b, m) => getDriver().save(k, b, m),
  read: (k) => getDriver().read(k),
  remove: (k) => getDriver().remove(k),
  list: (dayPrefix) => getDriver().list(dayPrefix),
};
