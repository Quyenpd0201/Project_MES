const d = (ymd) => new Date(ymd + "T00:00:00");
const toYMD = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (ymd, n) => { const x = d(ymd); x.setDate(x.getDate() + n); return toYMD(x); };

console.log(addDays('2026-07-06', -7));
