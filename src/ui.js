// src/ui.js — helper dùng chung cho các module
export const inputCls =
  "w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition";

export const fmt = (n) => (n == null || n === "" ? "—" : Number(n).toLocaleString("vi-VN"));

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("vi-VN") : "—");

// Badge trạng thái dùng chung (map màu theo trạng thái lệnh SX / đơn hàng)
const STATUS_COLORS = {
  "Chờ duyệt": "bg-slate-100 text-slate-600",
  "Đã lên kế hoạch": "bg-blue-50 text-blue-700",
  "Đang sản xuất": "bg-amber-50 text-amber-700",
  "Hoàn thành": "bg-emerald-50 text-emerald-700",
  "Đã hủy": "bg-rose-50 text-rose-700",
  "Hoạt động": "bg-emerald-50 text-emerald-700",
  "Không hoạt động": "bg-rose-50 text-rose-700",
  "Bảo trì": "bg-amber-50 text-amber-700",
  "Ngừng": "bg-rose-50 text-rose-700",
  "Mới": "bg-blue-50 text-blue-700",
};

export function statusClass(status) {
  return STATUS_COLORS[status] || "bg-slate-100 text-slate-600";
}
