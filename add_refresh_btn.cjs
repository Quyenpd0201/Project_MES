const fs = require('fs');
const path = require('path');

const filesToProcess = [
  "MesApp.jsx",
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
  "src/modules/QrLabels.jsx",
  "src/modules/Users.jsx"
];

for (const f of filesToProcess) {
  const fp = path.join(__dirname, f);
  if (!fs.existsSync(fp)) continue;
  let txt = fs.readFileSync(fp, 'utf8');
  let original = txt;

  // Chuẩn hóa "Tải lại" -> "Làm mới"
  txt = txt.replace(/Tải lại/g, "Làm mới");

  // Nếu file chưa có nút Làm mới thì chèn vào
  if (!txt.includes('Làm mới</button>')) {
    txt = txt.replace(/actions=\{<>/g, 'actions={<>\n        <button onClick={load} className="btn-ghost"><RotateCcw size={16} /> Làm mới</button>');
  }

  // Đảm bảo có import RotateCcw
  if (txt.includes('RotateCcw') && !txt.match(/import\s+\{.*RotateCcw.*\}\s+from\s+["']lucide-react["']/)) {
    txt = txt.replace(/import\s+\{([^}]+)\}\s+from\s+["']lucide-react["']/, (match, p1) => {
      if (p1.includes('RotateCcw')) return match;
      return `import { RotateCcw, ${p1.trim()} } from "lucide-react"`;
    });
  }

  if (txt !== original) {
    fs.writeFileSync(fp, txt);
    console.log("Added refresh button to: " + f);
  }
}
