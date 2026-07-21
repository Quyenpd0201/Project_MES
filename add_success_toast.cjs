const fs = require('fs');
const path = require('path');

const filesToProcess = [
  "src/modules/Bom.jsx",
  "src/modules/Deliveries.jsx",
  "src/modules/Execution.jsx",
  "src/modules/Inventory.jsx",
  "src/modules/MasterData.jsx",
  "src/modules/Orders.jsx",
  "src/modules/Permissions.jsx",
  "src/modules/Planning.jsx",
  "src/modules/Process.jsx",
  "src/modules/Production.jsx",
  "src/modules/ProductionGantt.jsx",
  "src/modules/QrLabels.jsx",
  "src/modules/QrScan.jsx",
  "src/modules/Users.jsx",
  "src/modules/WorkSchedule.jsx"
];

for (const f of filesToProcess) {
  const fp = path.join(__dirname, f);
  if (!fs.existsSync(fp)) continue;
  let txt = fs.readFileSync(fp, 'utf8');
  let original = txt;

  // Xóa thành công
  txt = txt.replace(/await ([a-zA-Z0-9_]+)\.remove\(([^)]+)\);(\s*)(load\(\);?|onSaved\(\);?|setView\([^)]+\);?|setEditId\([^)]+\);?)/g, 'await $1.remove($2);$3toast.success("Đã xóa thành công"); $4');

  // Lưu thành công
  txt = txt.replace(/await ([a-zA-Z0-9_]+)\.(create|update|upsert|save|importRows)\(([^)]+)\);(\s*)(load\(\);?|onSaved\(\);?|setView\([^)]+\);?|setEditId\([^)]+\);?|return)/g, 'await $1.$2($3);$4toast.success("Đã lưu thành công"); $5');

  // Nếu thay đổi, ghi đè
  if (txt !== original) {
    fs.writeFileSync(fp, txt);
    console.log("Added success toast to: " + f);
  }
}
