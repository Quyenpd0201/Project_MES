const xlsx = require('xlsx');

function dumpStructure(filePath, sheetName) {
    try {
        const wb = xlsx.readFile(filePath);
        console.log("=== " + filePath + " | Sheet: " + sheetName + " ===");
        const sheet = wb.Sheets[sheetName];
        if (!sheet) {
            console.log("Sheet not found");
            return;
        }
        const json = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        for(let i=0; i<Math.min(json.length, 10); i++) {
            if (json[i].length > 0) {
                console.log(`Row ${i+1}:`, json[i]);
            }
        }
    } catch (err) {
        console.error("Error reading file", filePath, ":", err.message);
    }
}

dumpStructure('e:\\Project_MES\\Testcase of MES - Intechno .xlsx', 'SanPham');
dumpStructure('e:\\Project_MES\\49.Ma Văn Thọ.xls', 'Testcase Thêm_KH');
