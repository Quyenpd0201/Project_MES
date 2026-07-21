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
  let changed = false;

  if (txt.includes('alert(')) {
    txt = txt.replace(/\balert\(/g, 'toast.error(');
    changed = true;
  }

  if (changed && !txt.includes('toast} from')) {
    const isRoot = f === 'MesApp.jsx';
    const uiPath = isRoot ? '"./src/ui.js"' : '"../ui.js"';
    if (txt.includes('import { inputCls')) {
      txt = txt.replace(/import {([^}]+)} from "\.\.\/ui\.js"/, 'import { $1, toast } from "../ui.js"');
      txt = txt.replace(/import {([^}]+)} from "\.\/src\/ui\.js"/, 'import { $1, toast } from "./src/ui.js"');
    } else {
      txt = txt.replace(/import React(.*)from "react";/, `import React$1from "react";\nimport { toast } from ${uiPath};`);
    }
  }

  if (changed) {
    fs.writeFileSync(fp, txt);
    console.log("Updated: " + f);
  }
}
