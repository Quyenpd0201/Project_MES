// backend/lib/units.js — chuẩn hoá đơn vị tính về đúng danh mục (title case).
// Danh mục dùng chung cho dropdown; đơn vị ngoài danh mục giữ nguyên (chỉ trim).
const UNITS = ["Kg", "Cái", "Chiếc", "Dem", "Gram", "Cuộn", "Thùng"];
const CANON = new Map(UNITS.map((u) => [u.toUpperCase(), u]));

function upUnit(u) {
  if (u == null) return null;
  const s = String(u).trim();
  if (!s) return null;
  return CANON.get(s.toUpperCase()) || s; // khớp danh mục → dạng chuẩn; ngoài danh mục → giữ nguyên
}
module.exports = { upUnit, UNITS };
