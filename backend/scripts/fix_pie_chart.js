const fs = require('fs');
const path = 'src/modules/reports/InventoryReport.jsx';
let code = fs.readFileSync(path, 'utf8');

const regex = /\/\* ── B\. Cơ cấu tồn theo loại sản phẩm \(donut\) ───────────────── \*\/\s*const typeMap = new Map\(\);\s*filteredStock\.forEach\(p => {\s*const t = p\.product_type \|\| "Khác";\s*typeMap\.set\(t, \(typeMap\.get\(t\) \|\| 0\) \+ \(Number\(p\.total\) \|\| 0\)\);\s*}\);\s*const donutData = \[\.\.\.typeMap\.entries\(\)\]\.map\(\(\[name, value\]\) => \(\{ name, value \}\)\);/;

const replacement = `/* ── B. Cơ cấu tồn theo loại sản phẩm (donut) ───────────────── */
  const typeMap = new Map();
  typeMap.set("Thành phẩm", 0);
  typeMap.set("Bán thành phẩm", 0);
  typeMap.set("Nguyên vật liệu", 0);
  
  filteredStock.forEach(p => {
    const t = p.product_type || "Khác";
    typeMap.set(t, (typeMap.get(t) || 0) + (Number(p.total) || 0));
  });
  const donutData = [...typeMap.entries()].map(([name, value]) => ({ name, value }));`;

if (regex.test(code)) {
  code = code.replace(regex, replacement);
  fs.writeFileSync(path, code);
  console.log('Success');
} else {
  console.log('Regex failed');
}
