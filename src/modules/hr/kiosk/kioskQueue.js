// [HR-G2] Kiosk chấm công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// Hàng đợi lần chấm offline trong IndexedDB (kèm ảnh dạng Blob). Mỗi bản ghi có idempotency_key
// → gửi lại bao nhiêu lần server cũng chỉ ghi 1 lần.
// Bản bị server từ chối (lỗi dữ liệu) KHÔNG xóa mà chuyển sang kho "failed" để trưởng tổ biết (#10).
const DB_NAME = "mes-kiosk";
const STORE = "punches";
const FAILED = "failed";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "idempotency_key" });
      if (!db.objectStoreNames.contains(FAILED)) db.createObjectStore(FAILED, { keyPath: "idempotency_key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(stores, mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const out = fn(tx);
      tx.oncomplete = () => resolve(out?.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export const queue = {
  add: (item) => run(STORE, "readwrite", (tx) => tx.objectStore(STORE).put(item)),
  all: () => run(STORE, "readonly", (tx) => tx.objectStore(STORE).getAll())
    .then((r) => (r || []).sort((a, b) => a.client_captured_at.localeCompare(b.client_captured_at))),
  remove: (key) => run(STORE, "readwrite", (tx) => tx.objectStore(STORE).delete(key)),
  count: () => run(STORE, "readonly", (tx) => tx.objectStore(STORE).count()),
  /** Chuyển sang kho lỗi (giữ nguyên dữ liệu + lý do), bỏ ảnh để đỡ tốn bộ nhớ tablet. */
  fail: (item, reason) => run([STORE, FAILED], "readwrite", (tx) => {
    tx.objectStore(FAILED).put({ ...item, photo: null, reason, failed_at: new Date().toISOString() });
    return tx.objectStore(STORE).delete(item.idempotency_key);
  }),
  failedCount: () => run(FAILED, "readonly", (tx) => tx.objectStore(FAILED).count()),
};

let flushing = false;
/**
 * Gửi lần lượt các bản ghi chờ. Thành công → bỏ khỏi hàng đợi.
 * Lỗi dữ liệu (4xx, trừ 401/408/429) → chuyển sang kho lỗi.
 * Mất mạng / 5xx / 401 / 408 / 429 → dừng, giữ lại để lần sau gửi tiếp.
 */
export async function flushQueue(send) {
  if (flushing) return { sent: 0, left: await queue.count(), failed: await queue.failedCount() };
  flushing = true;
  let sent = 0;
  try {
    for (const item of await queue.all()) {
      try {
        await send(item);
        await queue.remove(item.idempotency_key); sent++;
      } catch (e) {
        if (e.offline || !e.status || e.status >= 500 || [401, 408, 429].includes(e.status)) break;
        await queue.fail(item, e.message);
      }
    }
  } finally { flushing = false; }
  return { sent, left: await queue.count(), failed: await queue.failedCount() };
}
