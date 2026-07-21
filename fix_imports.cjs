const fs = require('fs');
const path = require('path');

const filesToProcess = [
  "src/modules/Bom.jsx",
  "src/modules/Deliveries.jsx",
  "src/modules/Inventory.jsx",
  "src/modules/Orders.jsx",
  "src/modules/Permissions.jsx",
  "src/modules/Process.jsx",
  "src/modules/Users.jsx"
];

for (const f of filesToProcess) {
  const fp = path.join(__dirname, f);
  if (!fs.existsSync(fp)) continue;
  let txt = fs.readFileSync(fp, 'utf8');
  let original = txt;

  if (txt.includes('RotateCcw') && !txt.match(/import\s+\{.*RotateCcw.*\}\s+from\s+["']lucide-react["']/)) {
    txt = txt.replace(/import\s+\{([^}]+)\}\s+from\s+["']lucide-react["']/, (match, p1) => {
      if (p1.includes('RotateCcw')) return match;
      return `import { RotateCcw, ${p1.trim()} } from "lucide-react"`;
    });
  }

  if (txt !== original) {
    fs.writeFileSync(fp, txt);
    console.log("Fixed import in: " + f);
  }
}
