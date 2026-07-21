# 📋 Kế hoạch Phát triển — MES Bao Bì Ngọc An Thư

> **Ngày cập nhật:** 2026-07-20  
> **Trạng thái dự án:** 🟡 Đang phát triển  
> **Phiên bản DB hiện tại:** v34  
> **Stack:** React 18 + Vite + TailwindCSS · Node.js / Express · PostgreSQL 17

---

## 🗺️ Tổng quan dự án

Hệ thống **MES (Manufacturing Execution System)** dành cho **Nhà máy Bao bì Ngọc An Thư**, giúp số hóa toàn bộ vòng đời sản xuất: từ đơn hàng → kế hoạch → sản xuất → kho → giao hàng → dashboard.

### Cấu trúc nhà máy
| Nhà máy | Máy móc | Chức năng |
|---------|---------|-----------|
| **Nhà máy 1** (Thổi) | 2 máy thổi lớn, 2 máy thổi nhỏ, 1 máy HD | Thổi nhựa thành bán thành phẩm (cuộn ni lông) |
| **Nhà máy 2** (Cắt) | 7 máy cắt | Cắt BTP thành thành phẩm |

### Nguyên vật liệu & Nhân sự
- **NVL:** Hạt nhựa, Chất phụ gia
- **Nhân sự:** 1 Quản lý công nghệ, 3 nhân sự bộ phận thổi, 6 công nhân bộ phận cắt máy

---

## 🏗️ Kiến trúc hệ thống

```
┌─────────────────────────────┐
│   FRONTEND  (cổng 5173)     │
│   React 18 + Vite + Tailwind│
└────────────┬────────────────┘
             │ HTTPS / Bearer token
┌────────────▼────────────────┐
│   BACKEND   (cổng 4000)     │
│   Node.js / Express 4       │
│   Controllers + genericCrud │
└────────────┬────────────────┘
             │ SQL (node-pg)
┌────────────▼────────────────┐
│   DATABASE  (cổng 5432)     │
│   PostgreSQL 17 — db: mes   │
│   34 migration schema files │
└─────────────────────────────┘
```

---

## 📦 Các phân hệ (Modules)

### ✅ Đã hoàn thiện

| # | Module | Frontend | Backend Controller | Ghi chú |
|---|--------|----------|--------------------|---------|
| 1 | **Đăng nhập / Xác thực** | `Login.jsx` | `authController.js` | scrypt, token in-memory |
| 2 | **Master Data** | `MasterData.jsx` | `genericCrud.js` | Khách hàng, máy móc, kho, ca, NV |
| 3 | **Định mức BOM** | `Bom.jsx` | `bomController.js` | BOM đa cấp, pha màu |
| 4 | **Quy trình CN** | `Process.jsx` | `processController.js` | Tech process + process steps |
| 5 | **Đơn hàng** | `Orders.jsx` | `salesOrderController.js` | Đơn hàng + dòng chi tiết |
| 6 | **Kế hoạch SX** | `Planning.jsx` | `planningController.js` | Gom lô, MRP, sinh lệnh SX |
| 7 | **Lệnh SX / Gantt** | `Production.jsx`, `ProductionGantt.jsx` | `productionController.js` | Phân công, backflush kho |
| 8 | **Kho** | `Inventory.jsx` | `inventoryController.js` | Tồn kho, nhập/xuất, vị trí |
| 9 | **QR Labels** | `QrLabels.jsx` | _(products route)_ | In nhãn QR |
| 10 | **QR Scan** | `QrScan.jsx` | `productionController.js` | Quét QR cập nhật sản lượng |
| 11 | **Xếp lịch nhân sự** | `WorkSchedule.jsx` | `workScheduleController.js` | Ca làm việc theo nhân viên |
| 12 | **Giao hàng** | `Deliveries.jsx` | `deliveryController.js` | Phiếu giao hàng |
| 13 | **Phân quyền (RBAC)** | `Permissions.jsx` | `roleController.js` | 3 cấp: vai trò → app → hành động + trường |
| 14 | **Quản lý người dùng** | `Users.jsx` | `userController.js` | Thêm/sửa/xóa tài khoản |
| 15 | **Dashboard** | _(MesApp.jsx)_ | `dashboardController.js` | Tổng hợp số liệu thực |

---

## 🚧 Backlog & Việc còn lại

### 🔴 Ưu tiên Cao (P1)

- [ ] **Kiểm soát quyền phía server** — hiện phân quyền chỉ ở client; cần thêm middleware `requirePerm(app, action)` để bảo vệ API
- [ ] **JWT / Redis token store** — thay thế Map in-memory; hỗ trợ multiple instances & token expiry đúng chuẩn
- [ ] **Tối ưu thuật toán gom lô (Planning)** — gom theo cùng màu + kích thước để giảm changeover / phế phẩm thổi
- [ ] **Báo cáo tỷ lệ phế phẩm** — thống kê phế theo máy, ca, sản phẩm; xuất Excel

### 🟡 Ưu tiên Trung (P2)

- [ ] **Thông báo / Alert** — cảnh báo khi tồn kho NVL thấp hơn ngưỡng tối thiểu
- [ ] **Kế hoạch theo ngày giao (deadline-driven scheduling)** — ưu tiên đơn hàng sắp đến hạn
- [ ] **Dashboard nâng cao** — OEE (Overall Equipment Effectiveness), biểu đồ xu hướng theo tuần/tháng
- [ ] **Import Excel nâng cao** — validate dữ liệu kỹ hơn, preview trước khi import
- [ ] **Audit log** — ghi lại ai thay đổi gì, lúc nào (bảng `audit_logs`)

### 🟢 Ưu tiên Thấp / Tương lai (P3)

- [ ] **Ứng dụng mobile / PWA** — cho công nhân quét QR trên điện thoại offline
- [ ] **Tích hợp cân điện tử** — nhập tự động khối lượng NVL khi cân
- [ ] **Dự báo nhu cầu (Forecasting)** — phân tích lịch sử đơn hàng, gợi ý kế hoạch mua NVL
- [ ] **Multi-factory support** — mở rộng sang nhiều nhà máy / chi nhánh

---

## 🗄️ Database Migration Log

| Phiên bản | File | Nội dung chính |
|-----------|------|----------------|
| v1 | `schema.sql` | Khởi tạo cơ sở |
| v2 | `schema_v2.sql` | Master data mở rộng |
| v3–v9 | `schema_v3.sql` … `schema_v9.sql` | Thêm bảng nghiệp vụ |
| v10–v19 | `schema_v10.sql` … `schema_v19.sql` | Đơn hàng, BOM, Kho |
| v20–v29 | `schema_v20.sql` … `schema_v29.sql` | Sản xuất, phân công, Gantt |
| v30–v34 | `schema_v30.sql` … `schema_v34.sql` | Giao hàng, Work schedule, cải tiến |

> ⚠️ **Quy tắc:** Mọi thay đổi CSDL phải tạo file `schema_v{N+1}.sql` mới, **không sửa** file cũ.

---

## 🔄 Luồng nghiệp vụ cốt lõi

```
Tạo Đơn hàng
     ↓
Lập Kế hoạch (gom lô / MRP)
     ↓
Sinh Lệnh sản xuất
     ↓
Phân công ca máy (Gantt)
     ↓
Quét QR cập nhật sản lượng / phế
     ↓
Hoàn thành lệnh → Backflush kho (tự động)
  ├─ Nhập thành phẩm vào kho
  └─ Trừ nguyên vật liệu theo BOM
     ↓
Tạo Phiếu giao hàng
     ↓
Dashboard tổng hợp
```

---

## 🖥️ Hướng dẫn khởi động môi trường DEV

```bash
# 1. Cơ sở dữ liệu (PostgreSQL đang chạy)
# Tạo DB: createdb mes
# Cấu hình backend/.env

# 2. Chạy migration
cd backend
npm run migrate

# 3. Khởi động Backend (cổng 4000)
npm run dev

# 4. Khởi động Frontend (cổng 5173) — terminal mới
cd ..
npm run dev
```

**Tài khoản mặc định:** `admin / admin123` (tự động seed khi chưa có user)

---

## 🚀 Roadmap triển khai Production

| Giai đoạn | Hành động | Ưu tiên |
|-----------|-----------|---------|
| **Phase 1** | Bổ sung middleware phân quyền phía server | P1 |
| **Phase 2** | Chuyển sang JWT + Redis token store | P1 |
| **Phase 3** | Build frontend tĩnh (`vite build`), phục vụ qua Nginx | P2 |
| **Phase 4** | Cấu hình HTTPS + reverse proxy | P2 |
| **Phase 5** | Thiết lập sao lưu PostgreSQL định kỳ (pg_dump) | P2 |
| **Phase 6** | Monitoring (uptime, error tracking) | P3 |

---

## 📁 Cấu trúc thư mục

```
Project_MES/
├── plan.md                     # 📋 File này
├── ARCHITECTURE.md             # Kiến trúc hệ thống chi tiết
├── README.md                   # Hướng dẫn cài đặt
├── MesApp.jsx                  # App gốc (Sidebar + routing)
├── index.html                  # Entry point + Tailwind CDN
├── src/
│   ├── main.jsx                # React entry
│   ├── mesApi.js               # Lớp gọi API (Bearer token)
│   ├── perm.jsx                # RBAC phía client
│   ├── components.jsx          # Shared UI components
│   ├── ui.js                   # Tiện ích giao diện
│   └── modules/                # 15 module nghiệp vụ
│       ├── Orders.jsx          # Đơn hàng
│       ├── Planning.jsx        # Kế hoạch sản xuất
│       ├── Production.jsx      # Lệnh sản xuất
│       ├── ProductionGantt.jsx # Biểu đồ Gantt
│       ├── Bom.jsx             # Định mức BOM
│       ├── Process.jsx         # Quy trình công nghệ
│       ├── Inventory.jsx       # Quản lý kho
│       ├── MasterData.jsx      # Dữ liệu danh mục
│       ├── Deliveries.jsx      # Giao hàng
│       ├── WorkSchedule.jsx    # Xếp lịch nhân sự
│       ├── QrLabels.jsx        # In nhãn QR
│       ├── QrScan.jsx          # Quét QR
│       ├── Users.jsx           # Quản lý người dùng
│       └── Permissions.jsx     # Phân quyền RBAC
└── backend/
    ├── server.js               # Express entry point
    ├── db.js                   # pg Pool connection
    ├── migrate.js              # Migration runner
    ├── routes/                 # API routes
    ├── controllers/            # Business logic (15 controllers)
    ├── middleware/             # Auth middleware
    ├── lib/                    # Thư viện dùng chung
    └── schema_v*.sql           # DB migrations (v1 → v34)
```

---

## 📊 Tiến độ tổng thể

| Phân hệ | Tiến độ | Ghi chú |
|---------|---------|---------|
| Đăng nhập / RBAC | ████████░░ 80% | Thiếu kiểm tra quyền phía server |
| Master Data | ██████████ 100% | Hoàn chỉnh |
| BOM & Quy trình | █████████░ 90% | Ổn định |
| Đơn hàng | ██████████ 100% | Hoàn chỉnh |
| Kế hoạch SX | ████████░░ 80% | Cần tối ưu gom lô deadline-driven |
| Lệnh SX / Gantt | █████████░ 90% | Hoàn chỉnh, cần báo cáo phế |
| Kho | █████████░ 90% | Hoàn chỉnh, thiếu alert tồn thấp |
| QR (Labels + Scan) | ██████████ 100% | Hoàn chỉnh |
| Giao hàng | ████████░░ 80% | Đang ổn định |
| Xếp lịch nhân sự | ███████░░░ 70% | Cần kiểm tra thêm |
| Dashboard | ████████░░ 80% | Cần thêm biểu đồ xu hướng |
| **Tổng thể** | **~85%** | Production-ready sau P1 tasks |

---

*Tài liệu này được cập nhật thủ công khi có thay đổi lớn. Mọi thay đổi kiến trúc cần cập nhật đồng thời `ARCHITECTURE.md` và `plan.md`.*
