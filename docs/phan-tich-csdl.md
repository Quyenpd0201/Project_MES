# Bản đồ & rà soát cơ sở dữ liệu MES

> Trích xuất trực tiếp từ PostgreSQL `mes` tại thời điểm rà soát: **28 bảng · 28 khóa chính (uuid) · 44 khóa ngoại · 6 nhóm nghiệp vụ**.
> Bản đồ trực quan (có màu, đổi sáng/tối): https://claude.ai/artifact/RbLmZenX7ba8vzSwX3hYGC
> ⚠️ Đây là ảnh chụp — kiểm lại với code hiện hành trước khi refactor lớn.

## 1. Sơ đồ tổng quan — dòng dữ liệu giữa các nhóm

```mermaid
flowchart LR
  MD["Danh mục<br/>products · customers · employees<br/>machines · warehouses · roles/users"]
  ENG["Kỹ thuật<br/>boms · bom_lines<br/>tech_processes · process_steps"]
  SALES["Bán hàng<br/>sales_orders → sales_order_items"]
  PROD["Sản xuất<br/>production_orders → production_tasks<br/>+ NVL cần cung cấp"]
  INV["Kho<br/>inventory_stock · transactions<br/>outbound_slips"]
  DEL["Giao hàng<br/>delivery_notes → items (+ tiền)"]
  MD --> ENG
  MD --> SALES
  MD --> PROD
  ENG --> PROD
  SALES --> PROD
  PROD --> INV
  INV -. "trạng thái/tồn" .-> PROD
  PROD -. "tiến độ" .-> SALES
  SALES --> DEL
  INV --> DEL
```

## 2. ERD theo module (PK / FK)

### A · Bán hàng & Giao hàng
```mermaid
erDiagram
  customers ||--o{ sales_orders : "customer_id"
  sales_orders ||--o{ sales_order_items : "sales_order_id"
  products ||--o{ sales_order_items : "product_id"
  customers ||--o{ delivery_notes : "customer_id"
  sales_orders ||--o{ delivery_notes : "sales_order_id"
  delivery_notes ||--o{ delivery_note_items : "delivery_note_id"
  products ||--o{ delivery_note_items : "product_id"
  sales_orders { uuid id PK
    uuid customer_id FK
    varchar order_code
    varchar status
    varchar priority }
  sales_order_items { uuid id PK
    uuid sales_order_id FK
    uuid product_id FK
    numeric quantity
    numeric unit_price
    jsonb specs }
  delivery_notes { uuid id PK
    uuid sales_order_id FK
    uuid customer_id FK
    numeric total_amount
    numeric paid_amount }
  delivery_note_items { uuid id PK
    uuid delivery_note_id FK
    uuid product_id FK
    numeric unit_price
    numeric amount }
```

### B · Sản xuất
```mermaid
erDiagram
  sales_orders ||--o{ production_orders : "sales_order_id"
  sales_order_items ||--o{ production_orders : "sales_order_item_id"
  products ||--o{ production_orders : "product_id"
  machines ||--o{ production_orders : "machine_id"
  production_orders ||--o{ production_tasks : "production_order_id"
  production_orders ||--o{ production_order_materials : "production_order_id"
  products ||--o{ production_order_materials : "material_id"
  production_orders ||--o{ production_material_usage : "production_order_id"
  production_orders { uuid id PK
    uuid sales_order_id FK
    uuid sales_order_item_id FK
    uuid product_id FK
    uuid machine_id FK
    varchar status
    varchar assigned_worker
    varchar shift }
  production_tasks { uuid id PK
    uuid production_order_id FK
    uuid machine_id FK
    varchar stage
    numeric actual_qty
    numeric scrap_qty }
  production_order_materials { uuid id PK
    uuid production_order_id FK
    uuid material_id FK
    numeric qty }
  production_material_usage { uuid id PK
    uuid production_order_id FK
    uuid material_id FK
    numeric qty }
```

### C · Kho
```mermaid
erDiagram
  warehouses ||--o{ zones : "warehouse_id"
  warehouses ||--o{ locations : "warehouse_id"
  zones ||--o{ locations : "zone_id"
  products ||--o{ inventory_stock : "product_id"
  locations ||--o{ inventory_stock : "location_id"
  production_orders ||--o{ inventory_stock : "prod_order_id"
  products ||--o{ inventory_transactions : "product_id"
  outbound_slips ||--o{ outbound_slip_lines : "slip_id"
  production_orders ||--o{ outbound_slips : "prod_order_id"
  inventory_stock { uuid id PK
    uuid product_id FK
    uuid location_id FK
    uuid prod_order_id FK
    numeric quantity
    text spec_key }
  inventory_transactions { uuid id PK
    uuid product_id FK
    uuid location_id FK
    varchar trx_type
    varchar ref_code }
  outbound_slips { uuid id PK
    uuid location_id FK
    uuid prod_order_id FK
    varchar status
    uuid created_by }
  outbound_slip_lines { uuid id PK
    uuid slip_id FK
    uuid product_id FK
    numeric quantity }
```

### D · Kỹ thuật (BOM & Quy trình)
```mermaid
erDiagram
  products ||--o{ boms : "product_id"
  tech_processes ||--o{ boms : "process_id"
  boms ||--o{ bom_lines : "bom_id"
  products ||--o{ bom_lines : "material_id"
  products ||--o{ tech_processes : "product_id"
  tech_processes ||--o{ process_steps : "process_id"
  machines ||--o{ process_steps : "machine_id"
  boms { uuid id PK
    uuid product_id FK
    uuid process_id FK
    numeric output_quantity }
  bom_lines { uuid id PK
    uuid bom_id FK
    uuid material_id FK
    numeric quantity }
  process_steps { uuid id PK
    uuid process_id FK
    uuid input_product_id FK
    uuid output_product_id FK
    uuid machine_id FK }
```

### E · Danh mục nền & Người dùng
```mermaid
erDiagram
  roles ||--o{ users : "role_id"
  roles ||--o{ roles : "parent_id"
  employees ||--o{ work_schedules : "employee_id"
  shifts ||--o{ work_schedules : "shift_id"
  products ||--o{ product_attachments : "product_id"
  roles { uuid id PK
    uuid parent_id FK
    jsonb permissions
    bool is_admin }
  users { uuid id PK
    uuid role_id FK
    varchar username
    jsonb permissions
    varchar linked_worker }
  work_schedules { uuid id PK
    uuid employee_id FK
    uuid shift_id FK
    date work_date }
```

## 3. Quan hệ trục chính

| Từ bảng | Quan hệ | Đến bảng | Khóa ngoại | Ý nghĩa |
|---|---|---|---|---|
| sales_order_items | 1→N | production_orders | sales_order_item_id | Dòng đơn sinh lệnh SX |
| production_orders | 1→N | production_tasks | production_order_id | Lệnh chia phân công (công đoạn) |
| production_orders | 1→N | production_order_materials | production_order_id | NVL cần cung cấp (kế hoạch) |
| production_orders | 1→N | outbound_slips | prod_order_id | Phiếu xuất kho NVL cho lệnh |
| production_orders | 1→N | inventory_stock | prod_order_id | Tồn theo lô = mã lệnh SX |
| sales_orders | 1→N | delivery_notes | sales_order_id | Đơn → phiếu giao (có tiền) |
| products | 1→N | ~10 bảng | product_id / material_id | Trung tâm: SP · NVL · BTP · TP |
| warehouses | 1→N | zones → locations | warehouse_id / zone_id | Cây kho: kho › khu vực › vị trí |
| roles | 1→N | roles (self) | parent_id | Kế thừa quyền theo cây vai trò |

## 4. Điểm logic lủng củng / rủi ro

### 🔴 Cao — Schema & migration chưa sạch
`backend/migrations/schema_consolidated.sql` bị **lỗi mã hóa tiếng Việt** (mojibake) và **thiếu nhiều cột**: `priority`, `material_type`, `mix_ratio`, `machine_ids`, `posted_qty`, `materials_issued`, `unit_price`, các bảng `outbound_slips*`… đều thêm bằng **ALTER trực tiếp**, không nằm trong file gốc. `migrate.js` chỉ nạp đúng file này.
→ **Hệ quả:** dựng DB mới từ đầu (khi lên server) dễ vỡ / thiếu cột.

### 🟠 Vừa — Nhân sự / tổ / ca lưu bằng TEXT, không FK
`production_orders` & `production_tasks` dùng `assigned_worker`, `assigned_team`, `shift` là chuỗi tên; `users.linked_worker`, `employees.factory` cũng vậy — dù đã có bảng `employees`, `shifts`.
→ Đổi tên nhân viên là đứt liên kết; **KPI theo người dễ sai** (đúng chỗ remote vừa phải sửa).

### 🟠 Vừa — Thuộc tính lưu 3 kiểu song song
Cùng một thông số tồn tại ở `specs` (jsonb) + `spec_key` (text) + `attr_size/attr_thickness/attr_color`, lặp trên 4 bảng (sales_order_items, production_orders, inventory_stock, inventory_transactions).
→ Phải đồng bộ cả 3 mỗi lần ghi (`buildSpecKey`/`legacyAttrs`) → dễ lệch.

### 🟠 Vừa — Nhiều luồng biến động kho
Tồn bị thay đổi bởi: backflush khi SX xong (`syncOrderInventory`), phiếu `outbound_slips`, điều chỉnh thủ công, và giao hàng. `production_material_usage` giờ **chỉ ghi nhận** (không trừ) sau khi tách logic.
→ Khó suy luận tồn đúng/sai; dễ trừ trùng nếu sửa một nhánh mà quên nhánh khác.

### 🟡 Thấp
- **status gộp nhiều vòng đời**: `sales_orders.status` trộn SX + giao + thanh toán; enum bằng text, CHECK chỉ có ở `production_orders`.
- **Thiếu index FK** (PG không tự tạo) & **FK còn thiếu**: `outbound_slips.created_by` chưa FK tới `users`; `ref_code` là text tự do.
- **Quyền lưu 2 nơi**: `roles.permissions` + `users.permissions` + `is_admin` + `parent_id` → phức tạp, merge ở backend.
- **Đặt tên chưa nhất quán**: `production_material_usage.qty` vs `quantity`; soft-delete không đồng nhất giữa bảng cha/con.

## 5. Đề xuất tối ưu (theo thứ tự ưu tiên)

**Trước khi deploy**
1. **Làm sạch migration/schema**: tái tạo `schema_consolidated.sql` bằng `pg_dump` đúng UTF-8 từ DB đang chạy (đủ mọi cột/bảng), hoặc chuyển sang migration tăng dần. **Bắt buộc test dựng DB mới từ số 0** trước khi lên server.

**Nên làm**
2. **Chuẩn hóa nhân sự/ca về FK** (`employee_id`, `shift_id`). Nếu chưa đổi schema lớn: tối thiểu bắt buộc chọn từ danh sách + validate + ánh xạ id ở tầng báo cáo để KPI chính xác.
3. **Gom một đầu mối cho biến động kho**: mọi cộng/trừ tồn qua một service chung (ghi `inventory_transactions` + cập nhật `inventory_stock`).

**Khi rảnh**
4. Thống nhất thuộc tính về `specs` + `spec_key` (coi `attr_*` là legacy chỉ đọc).
5. Thêm index cho cột FK hay join/lọc; thêm FK `outbound_slips.created_by → users`.
6. Tách `status` sản xuất vs thanh toán; thêm CHECK/enum dùng chung.
7. Đơn giản hóa phân quyền nếu không dùng override cấp user; thống nhất tên cột (`qty → quantity`).
