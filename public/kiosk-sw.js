// [HR-G2] Kiosk chấm công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// Service worker CHỈ cho trang /kiosk: tablet tải lại trang khi mất mạng vẫn mở được.
// - Điều hướng /kiosk: mạng trước; chỉ lưu bản tải THÀNH CÔNG (res.ok) → mất mạng không mở ra trang lỗi.
// - File tĩnh cùng origin (/assets/*, logo): lấy bản đã lưu, đồng thời cập nhật nền.
// - Mỗi lần tải được trang mới: xóa các /assets/* không còn được trang mới dùng (bản build cũ).
// Không cache API (khác origin) — danh sách tên được lưu ở localStorage bởi trang kiosk.
const CACHE = "mes-kiosk-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("mes-kiosk-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/** Bỏ asset cũ: giữ lại những /assets/* mà HTML mới (hoặc chunk lazy đã được dùng gần đây) tham chiếu. */
async function pruneAssets(cache, html) {
  const used = new Set((html.match(/\/assets\/[A-Za-z0-9._-]+/g) || []));
  for (const req of await cache.keys()) {
    const p = new URL(req.url).pathname;
    // chunk lazy (vd KioskApp-xxx.js) không có trong HTML → chỉ xóa khi đã có bản cùng tên gốc mới hơn
    if (p.startsWith("/assets/") && !used.has(p) && !isLazyChunkStillCurrent(p, used)) await cache.delete(req);
  }
}
const baseName = (p) => p.replace(/^\/assets\//, "").replace(/-[A-Za-z0-9_]{6,}\.(js|css)$/, "");
function isLazyChunkStillCurrent(p, used) {
  // Nếu HTML mới vẫn dùng entry cùng tên gốc thì giữ; asset lazy không biết chắc → giữ đến lần tải sau
  const b = baseName(p);
  return ![...used].some((u) => baseName(u) === b && u !== p);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        e.waitUntil(caches.open(CACHE).then(async (c) => {
          const html = await copy.clone().text();
          await c.put("/kiosk", copy);
          await pruneAssets(c, html);
        }));
      }
      return res;
    }).catch(async () => (await caches.match("/kiosk")) || Response.error()));
    return;
  }
  if (url.pathname.startsWith("/assets/") || url.pathname === "/logo.png") {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
