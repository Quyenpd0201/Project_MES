// [HR-G2] Kiosk chấm công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// Việc dọn dẹp chạy mỗi ngày:
//  - purgeExpiredPhotos: xóa ảnh quá hạn lưu (hr_photo_retention_days), giữ bản ghi + purged_at.
//  - reconcileOrphanPhotos: xóa file ảnh KHÔNG có trong DB (lưu xong nhưng ghi DB lỗi / tiến trình chết) — NĐ 13.
//  - cleanupExpiredRegistrations: xóa yêu cầu đăng ký tablet đã hết hạn quá 1 ngày.
const photoStore = require('../../core/lib/photoStore');
const { getAppSettings } = require('../../core/lib/settings');

const BATCH = 500;
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000; // file mới hơn 1 giờ có thể đang ghi dở → chưa xóa

/** @returns {Promise<{purged:number, failed:number}>} */
async function purgeExpiredPhotos(conn, { now = new Date() } = {}) {
  const { hr_photo_retention_days: days } = await getAppSettings(conn);
  const cutoff = new Date(now.getTime() - days * 86400000);
  let purged = 0; let failed = 0;
  for (;;) {
    // #16 đánh dấu purged_at TRƯỚC rồi mới xóa file: xóa lỗi thì file thành "mồ côi" và reconcile dọn sau,
    // không bao giờ có trạng thái "DB còn trỏ tới file đã mất".
    const { rows } = await conn.query(
      `UPDATE punch_photos SET purged_at = now()
        WHERE id IN (SELECT id FROM punch_photos WHERE purged_at IS NULL AND taken_at < $1 ORDER BY taken_at LIMIT $2)
        RETURNING id, storage_key`, [cutoff, BATCH]);
    if (!rows.length) break;
    for (const r of rows) {
      try { await photoStore.remove(r.storage_key); purged++; } catch (err) {
        failed++;
        console.error('[photoPurge] không xóa được file ảnh', r.id, err.message);
      }
    }
    if (rows.length < BATCH) break;
  }
  return { purged, failed };
}

const vnDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(d).replace(/-/g, '/');

/** #9 File ảnh mồ côi trong thư mục hôm nay + hôm qua (giờ VN). */
async function reconcileOrphanPhotos(conn, { now = new Date() } = {}) {
  let removed = 0;
  for (const day of [vnDay(now), vnDay(new Date(now.getTime() - 86400000))]) {
    const files = (await photoStore.list(day)).filter((f) => now - f.modifiedAt > ORPHAN_MIN_AGE_MS);
    if (!files.length) continue;
    const { rows } = await conn.query('SELECT storage_key FROM punch_photos WHERE storage_key = ANY($1)', [files.map((f) => f.key)]);
    const known = new Set(rows.map((r) => r.storage_key));
    for (const f of files) {
      if (known.has(f.key)) continue;
      try { await photoStore.remove(f.key); removed++; } catch (err) { console.error('[photoPurge] không xóa được ảnh mồ côi', f.key, err.message); }
    }
  }
  return { removed };
}

/** #14 Yêu cầu đăng ký tablet chưa được duyệt, đã hết hạn quá 1 ngày. */
async function cleanupExpiredRegistrations(conn) {
  const { rowCount } = await conn.query(
    `DELETE FROM kiosk_devices WHERE status = 'Chờ duyệt' AND register_expires_at < now() - interval '1 day'`);
  return { deleted: rowCount };
}

/** Chạy mỗi ngày trong tiến trình server (unref: không giữ tiến trình sống). */
function schedulePhotoPurge(conn) {
  const run = async () => {
    try {
      const a = await purgeExpiredPhotos(conn);
      const b = await reconcileOrphanPhotos(conn);
      const c = await cleanupExpiredRegistrations(conn);
      if (a.purged || a.failed || b.removed || c.deleted) {
        console.info(`[photoPurge] ảnh quá hạn: ${a.purged} (lỗi ${a.failed}), ảnh mồ côi: ${b.removed}, đăng ký hết hạn: ${c.deleted}`);
      }
    } catch (err) { console.error('[photoPurge]', err.message); }
  };
  setTimeout(run, 60 * 1000).unref();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}

module.exports = { purgeExpiredPhotos, reconcileOrphanPhotos, cleanupExpiredRegistrations, schedulePhotoPurge };
