// backend/lib/units.js — chuẩn hoá đơn vị tính về CHỮ HOA
function upUnit(u) {
  if (u == null) return null;
  const s = String(u).trim();
  return s ? s.toUpperCase() : null;
}
module.exports = { upUnit };
