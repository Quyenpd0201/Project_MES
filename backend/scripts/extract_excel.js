const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

console.log('Reading file...');
const wb = XLSX.readFile(path.resolve('e:/Project_MES/Đơn hàng(done).xlsx'));
console.log('Sheets:', wb.SheetNames);
const ws = wb.Sheets[wb.SheetNames[0]];

console.log('Converting to JSON...');
const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

console.log('Writing to json file...');
fs.writeFileSync('e:/Project_MES/backend/scripts/excel_head.json', JSON.stringify({
  headers: rawData[0],
  rows: rawData.slice(1, 10),
  totalRows: rawData.length
}, null, 2));

console.log('Done!');
