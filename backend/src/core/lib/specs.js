// backend/lib/specs.js — bộ thông số kỹ thuật chuẩn (đồng bộ với src/specs.js ở FE)
// Thứ tự cố định để spec_key luôn nhất quán khi gom nhóm tồn kho.
const SPEC_NAMES = ['Số lớp', 'Chiều dài', 'Chiều ngang (Rộng)', 'Độ dày', 'Màu sắc'];

// Chỉ giữ các thông số có giá trị, chuẩn hoá chuỗi
function cleanSpecs(specs) {
  const o = {};
  if (specs && typeof specs === 'object') {
    for (const n of SPEC_NAMES) {
      const v = specs[n] || specs[n.replace(' (Rộng)', '')]; // Hỗ trợ đọc DB cũ (nếu có key 'Chiều ngang')
      if (v != null && String(v).trim() !== '') o[n] = String(v).trim();
    }
  }
  return o;
}

// Khoá gom nhóm "thông số giống nhau" — chuỗi cố định theo SPEC_NAMES
function buildSpecKey(specs) {
  const s = cleanSpecs(specs);
  return SPEC_NAMES.map((n) => s[n] || '').join('|');
}

// Suy ra 3 thuộc tính cũ (attr_size/thickness/color) để các màn cũ vẫn hiển thị được
function legacyAttrs(specs) {
  const s = cleanSpecs(specs);
  const dai = s['Chiều dài'] || '';
  const ngang = s['Chiều ngang (Rộng)'] || s['Chiều ngang'] || '';
  const size = dai || ngang ? `${ngang}${ngang && dai ? ' × ' : ''}${dai}` : '';
  return { size, thickness: s['Độ dày'] || '', color: s['Màu sắc'] || '' };
}

// Lấy specs từ body: ưu tiên body.specs (object), nếu không có thì dựng từ attr_* cũ
function specsFromBody(b) {
  if (b && b.specs && typeof b.specs === 'object') return cleanSpecs(b.specs);
  const o = {};
  if (b) {
    if (b.attr_color) o['Màu sắc'] = String(b.attr_color).trim();
    if (b.attr_thickness) o['Độ dày'] = String(b.attr_thickness).trim();
    if (b.attr_size) o['Chiều dài'] = String(b.attr_size).trim();
  }
  return cleanSpecs(o);
}

module.exports = { SPEC_NAMES, cleanSpecs, buildSpecKey, legacyAttrs, specsFromBody };
