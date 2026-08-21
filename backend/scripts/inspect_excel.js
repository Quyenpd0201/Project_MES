const XLSX = require('xlsx');
const path = require('path');

const wb = XLSX.readFile(path.resolve('e:/Project_MES/Đơn hàng(done).xlsx'));
const ws = wb.Sheets[wb.SheetNames[0]];
const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

console.log('Headers:', rawData[0]);
console.log('Row 1:', rawData[1]);
console.log('Row 2:', rawData[2]);
console.log('Total rows:', rawData.length);
