const fs = require('fs');
const xlsx = require('xlsx');

const API_BASE = 'http://localhost:4000/api';
let TOKEN = '';

async function fetchAPI(path, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  
  try {
    const res = await fetch(`${API_BASE}${path}`, options);
    let data;
    try { data = await res.json(); } catch(e) { data = null; }
    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    return { status: 0, ok: false, data: err.message };
  }
}

const testSuites = [
  {
    name: 'I. Authentication',
    sheet: 'Authentication',
    cases: [
      { id: 'TC001', desc: 'Login đúng username/password', expected: 'Đăng nhập thành công', execute: async () => {
          const res = await fetchAPI('/auth/login', 'POST', { username: 'admin', password: 'admin123' });
          if (res.ok) TOKEN = res.data.token;
          return { pass: res.ok, actual: `HTTP ${res.status}` };
      }},
      { id: 'TC002', desc: 'Sai password', expected: 'Thông báo sai mật khẩu', execute: async () => {
          const res = await fetchAPI('/auth/login', 'POST', { username: 'admin', password: 'wrongpassword' });
          return { pass: res.status === 401 || res.status === 400, actual: `HTTP ${res.status}` };
      }},
      { id: 'TC003', desc: 'Username không tồn tại', expected: 'Thông báo sai thông tin', execute: async () => {
          const res = await fetchAPI('/auth/login', 'POST', { username: 'notexist123', password: '123' });
          return { pass: res.status === 401 || res.status === 404, actual: `HTTP ${res.status}` };
      }},
      { id: 'TC004', desc: 'Password rỗng', expected: 'Lỗi validate', execute: async () => {
          const res = await fetchAPI('/auth/login', 'POST', { username: 'admin', password: '' });
          return { pass: !res.ok, actual: `HTTP ${res.status}` };
      }},
      { id: 'TC005', desc: 'Username rỗng', expected: 'Lỗi validate', execute: async () => {
          const res = await fetchAPI('/auth/login', 'POST', { username: '', password: '123' });
          return { pass: !res.ok, actual: `HTTP ${res.status}` };
      }},
      { id: 'TC006', desc: "SQL Injection: ' OR 1=1 --", expected: 'Không đăng nhập', execute: async () => {
          const res = await fetchAPI('/auth/login', 'POST', { username: "' OR 1=1 --", password: "123" });
          return { pass: !res.ok, actual: `HTTP ${res.status} - ${JSON.stringify(res.data)}` };
      }},
      { id: 'TC007', desc: 'XSS: <script>alert(1)</script>', expected: 'Sanitized hoặc Reject', execute: async () => {
          const res = await fetchAPI('/auth/login', 'POST', { username: '<script>alert(1)</script>', password: '123' });
          return { pass: !res.ok, actual: `HTTP ${res.status}` };
      }},
      { id: 'TC008', desc: 'Tài khoản bị khóa', expected: 'Báo tài khoản khóa' },
      { id: 'TC009', desc: 'Đăng nhập bằng tài khoản đã hết hạn', expected: 'Báo lỗi' },
      { id: 'TC010', desc: 'Session timeout', expected: 'Báo lỗi timeout' }
    ]
  },
  {
    name: 'II. User Management',
    sheet: 'User Management',
    cases: [
      { id: 'TC011', desc: 'Thêm User: Tên hợp lệ', expected: 'Tạo thành công', execute: async () => {
          const res = await fetchAPI('/users', 'POST', { username: 'testuser_'+Date.now(), password: '123', full_name: 'Test' });
          return { pass: res.ok, actual: `HTTP ${res.status}` };
      }},
      { id: 'TC012', desc: 'Username trùng', expected: 'Báo lỗi trùng' },
      { id: 'TC013', desc: 'Email trùng', expected: 'Báo lỗi trùng' },
      { id: 'TC014', desc: 'Role chưa chọn', expected: 'Lỗi validate' },
      { id: 'TC015', desc: 'Không đủ quyền thêm User', expected: '403 Forbidden' },
      { id: 'TC016', desc: 'Reset Password', expected: 'Thành công' },
      { id: 'TC017', desc: 'Deactivate User', expected: 'Thành công' },
      { id: 'TC018', desc: 'Delete User', expected: 'Xóa thành công' },
    ]
  },
  {
    name: 'III. Role', sheet: 'Role',
    cases: [
      { id: 'TC020', desc: 'Admin truy cập tất cả module', expected: 'Được phép' },
      { id: 'TC021', desc: 'Worker không truy cập User Management', expected: 'Forbidden' },
      { id: 'TC022', desc: 'Warehouse không sửa Production', expected: 'Forbidden' },
      { id: 'TC023', desc: 'Sales không sửa tồn kho', expected: 'Forbidden' },
      { id: 'TC024', desc: 'Ẩn menu khi không có quyền', expected: 'UI không hiển thị' }
    ]
  },
  {
    name: 'IV. Factory', sheet: 'Factory',
    cases: [
      { id: 'TC030', desc: 'Thêm nhà máy', expected: 'Thành công' },
      { id: 'TC031', desc: 'Tên trùng', expected: 'Báo lỗi' },
      { id: 'TC032', desc: 'Disable nhà máy', expected: 'Thành công' },
      { id: 'TC033', desc: 'Delete khi đang có dây chuyền', expected: 'Không cho xóa' }
    ]
  },
  {
    name: 'V. Production Order', sheet: 'Production Order',
    cases: [
      { id: 'TC040', desc: 'Tạo PO thành công', expected: 'Thành công' },
      { id: 'TC041', desc: 'Không có BOM', expected: 'Báo lỗi' },
      { id: 'TC042', desc: 'Không có Routing', expected: 'Báo lỗi' },
      { id: 'TC043', desc: 'Số lượng = 0', expected: 'Lỗi validate' },
      { id: 'TC044', desc: 'Ngày kết thúc < ngày bắt đầu', expected: 'Lỗi validate' },
      { id: 'TC045', desc: 'Duplicate Order Number', expected: 'Báo lỗi trùng' },
      { id: 'TC046', desc: 'Cancel Order', expected: 'Thành công' },
      { id: 'TC047', desc: 'Close Order', expected: 'Thành công' }
    ]
  },
  {
    name: 'VI. Work Order', sheet: 'Work Order',
    cases: [
      { id: 'TC060', desc: 'Assign Worker', expected: 'Thành công' },
      { id: 'TC061', desc: 'Assign Machine', expected: 'Thành công' },
      { id: 'TC062', desc: 'Worker đã bận', expected: 'Cảnh báo' },
      { id: 'TC063', desc: 'Machine đang bảo trì', expected: 'Báo lỗi' },
      { id: 'TC064', desc: 'Machine offline', expected: 'Cảnh báo' },
      { id: 'TC065', desc: 'Work Order Completed', expected: 'Thành công' }
    ]
  },
  {
    name: 'VII. Production', sheet: 'Production',
    cases: [
      { id: 'TC080', desc: 'Start Production', expected: 'Status đổi sang In Progress' },
      { id: 'TC081', desc: 'Pause', expected: 'Thành công' },
      { id: 'TC082', desc: 'Resume', expected: 'Thành công' },
      { id: 'TC083', desc: 'Finish', expected: 'Thành công' },
      { id: 'TC084', desc: 'Finish khi chưa đủ sản lượng', expected: 'Cảnh báo/Xác nhận' },
      { id: 'TC085', desc: 'Finish lần thứ hai', expected: 'Báo lỗi' }
    ]
  },
  {
    name: 'VIII. Worker', sheet: 'Worker',
    cases: [
      { id: 'TC100', desc: 'Check In', expected: 'Ghi nhận thời gian' },
      { id: 'TC101', desc: 'Check Out', expected: 'Ghi nhận' },
      { id: 'TC102', desc: 'Scan QR', expected: 'Load đúng lệnh' },
      { id: 'TC103', desc: 'Sai QR', expected: 'Báo không tìm thấy' },
      { id: 'TC104', desc: 'Nhập sản lượng', expected: 'Cập nhật' },
      { id: 'TC105', desc: 'Nhập số lượng lỗi', expected: 'Cập nhật' },
      { id: 'TC106', desc: 'Báo hỏng máy', expected: 'Gửi cảnh báo' }
    ]
  },
  {
    name: 'IX. Machine', sheet: 'Machine',
    cases: [
      { id: 'TC120', desc: 'Machine Running', expected: 'Đèn xanh' },
      { id: 'TC121', desc: 'Machine Idle', expected: 'Đèn vàng' },
      { id: 'TC122', desc: 'Machine Error', expected: 'Đèn đỏ, phát cảnh báo' },
      { id: 'TC123', desc: 'Machine Maintenance', expected: 'Trạng thái bảo trì' },
      { id: 'TC124', desc: 'Machine Shutdown', expected: 'Ghi nhận log' },
      { id: 'TC125', desc: 'OEE tính đúng', expected: 'Công thức khớp thực tế' }
    ]
  },
  {
    name: 'X. Warehouse', sheet: 'Warehouse',
    cases: [
      { id: 'TC140', desc: 'Nhập kho', expected: 'Cộng tồn kho' },
      { id: 'TC141', desc: 'Xuất kho', expected: 'Trừ tồn kho' },
      { id: 'TC142', desc: 'Âm tồn kho', expected: 'Không cho xuất' },
      { id: 'TC143', desc: 'Chuyển kho', expected: 'Cập nhật 2 kho' },
      { id: 'TC144', desc: 'Kiểm kê', expected: 'Chênh lệch' },
      { id: 'TC145', desc: 'Lot Number', expected: 'Theo dõi theo lô' },
      { id: 'TC146', desc: 'Serial Number', expected: 'Duy nhất' }
    ]
  },
  {
    name: 'XI. QC', sheet: 'QC',
    cases: [
      { id: 'TC160', desc: 'Pass', expected: 'Chuyển kho thành phẩm' },
      { id: 'TC161', desc: 'Reject', expected: 'Lưu kho phế phẩm' },
      { id: 'TC162', desc: 'Rework', expected: 'Tạo lệnh rework' },
      { id: 'TC163', desc: 'Inspection lần 2', expected: 'Ghi log' },
      { id: 'TC164', desc: 'Thiếu hình ảnh QC', expected: 'Cảnh báo' }
    ]
  },
  {
    name: 'XII. Dashboard', sheet: 'Dashboard',
    cases: [
      { id: 'TC180', desc: 'Production Count', expected: 'Đúng số' },
      { id: 'TC181', desc: 'OEE', expected: 'Chuẩn' },
      { id: 'TC182', desc: 'Downtime', expected: 'Đúng' },
      { id: 'TC183', desc: 'Top lỗi', expected: 'Biểu đồ' },
      { id: 'TC184', desc: 'Realtime Update', expected: 'Tự động refresh' }
    ]
  },
  {
    name: 'XIII. Report', sheet: 'Report',
    cases: [
      { id: 'TC200', desc: 'Export Excel', expected: 'Tải file' },
      { id: 'TC201', desc: 'Export PDF', expected: 'Tải file' },
      { id: 'TC202', desc: 'Filter Date', expected: 'Lọc đúng' },
      { id: 'TC203', desc: 'Filter Factory', expected: 'Lọc đúng' },
      { id: 'TC204', desc: 'Filter Worker', expected: 'Lọc đúng' }
    ]
  },
  {
    name: 'XIV. Notification', sheet: 'Notification',
    cases: [
      { id: 'TC220', desc: 'Máy hỏng', expected: 'Popup/Mail' },
      { id: 'TC221', desc: 'Thiếu nguyên liệu', expected: 'Cảnh báo kho' },
      { id: 'TC222', desc: 'QC Reject', expected: 'Báo cho QLD' },
      { id: 'TC223', desc: 'Order Overdue', expected: 'Cảnh báo đỏ' }
    ]
  },
  {
    name: 'XV. Import', sheet: 'Import',
    cases: [
      { id: 'TC240', desc: 'Import Excel hợp lệ', expected: 'Thành công' },
      { id: 'TC241', desc: 'Sai template', expected: 'Báo lỗi' },
      { id: 'TC242', desc: 'File rỗng', expected: 'Báo lỗi' },
      { id: 'TC243', desc: 'Duplicate Record', expected: 'Bỏ qua/Cập nhật' }
    ]
  },
  {
    name: 'XVI. API', sheet: 'API',
    cases: [
      { id: 'TC260', desc: 'POST Success', expected: '201 Created', execute: async () => {
          const res = await fetchAPI('/master-data/customers', 'POST', { name: 'API Test ' + Date.now() });
          return { pass: res.ok, actual: `HTTP ${res.status}` };
      }},
      { id: 'TC261', desc: '401 Unauthorized', expected: '401', execute: async () => {
          const old = TOKEN; TOKEN = '';
          const res = await fetchAPI('/products', 'GET');
          TOKEN = old;
          return { pass: res.status === 401 || res.status === 403, actual: `HTTP ${res.status}` };
      }},
      { id: 'TC262', desc: '403 Forbidden', expected: '403' },
      { id: 'TC263', desc: '404 Not Found', expected: '404', execute: async () => {
          const res = await fetchAPI('/api_not_exist', 'GET');
          return { pass: res.status === 404, actual: `HTTP ${res.status}` };
      }},
      { id: 'TC264', desc: '500 Internal Error', expected: '500' },
      { id: 'TC265', desc: 'Rate Limit', expected: '429 Too Many Requests' }
    ]
  },
  {
    name: 'XVII. Security', sheet: 'Security',
    cases: [
      { id: 'TC280', desc: 'SQL Injection', expected: 'Bị chặn' },
      { id: 'TC281', desc: 'XSS', expected: 'Bị chặn' },
      { id: 'TC282', desc: 'CSRF', expected: 'Bị chặn' },
      { id: 'TC283', desc: 'Broken Access Control', expected: 'Bị chặn' },
      { id: 'TC284', desc: 'Upload file .exe', expected: 'Bị chặn' },
      { id: 'TC285', desc: 'JWT giả', expected: 'Bị chặn (401)' }
    ]
  },
  {
    name: 'XVIII. Performance', sheet: 'Performance',
    cases: [
      { id: 'TC300', desc: '100 User Login', expected: 'Đáp ứng < 2s' },
      { id: 'TC301', desc: '500 User Login', expected: 'Đáp ứng < 5s' },
      { id: 'TC302', desc: '1000 Work Order', expected: 'Không lag' },
      { id: 'TC303', desc: 'Dashboard realtime', expected: 'Mượt' },
      { id: 'TC304', desc: 'Import 100k sản phẩm', expected: 'Chạy ngầm thành công' }
    ]
  },
  {
    name: 'XIX. Stress Test', sheet: 'Stress Test',
    cases: [
      { id: 'TC320', desc: '10.000 Concurrent User', expected: 'Chưa sập' },
      { id: 'TC321', desc: '50.000 Order', expected: 'Xử lý tuần tự' },
      { id: 'TC322', desc: '100.000 Scan QR', expected: 'Ổn định' },
      { id: 'TC323', desc: '1 triệu Record', expected: 'Truy vấn không treo' }
    ]
  },
  {
    name: 'XX. End-to-End (E2E) Scenarios', sheet: 'E2E Scenarios',
    cases: [
      { id: 'E2E_01', desc: 'Luồng chuẩn: Sales -> PO -> WO -> Sản xuất -> QC -> Nhập/Xuất kho', expected: 'Dữ liệu thông suốt, số liệu tồn kho khớp, đơn hàng Close' },
      { id: 'E2E_02', desc: 'Luồng ngoại lệ: Thiếu vật tư', expected: 'Chặn phát hành lệnh SX' },
      { id: 'E2E_03', desc: 'Luồng ngoại lệ: Máy hỏng giữa ca', expected: 'WO tạm dừng, báo bảo trì' },
      { id: 'E2E_04', desc: 'Luồng ngoại lệ: QC Reject', expected: 'Sinh lệnh Rework / Phế phẩm' },
      { id: 'E2E_05', desc: 'Đóng lệnh sản xuất', expected: 'Đối chiếu sản lượng khớp hoàn toàn mới cho đóng' }
    ]
  }
];

async function runAll() {
  console.log("=== Bắt đầu chạy Test Suite Toàn Diện ===");
  const workbook = xlsx.utils.book_new();

  for (const suite of testSuites) {
    console.log(`\nProcessing Suite: ${suite.name}`);
    const results = [];
    
    for (const tc of suite.cases) {
      process.stdout.write(`  [${tc.id}] ${tc.desc}... `);
      if (tc.execute) {
        try {
          const res = await tc.execute();
          results.push({
            'Mã Testcase': tc.id,
            'Mục đích / Kịch bản': tc.desc,
            'Kết quả mong muốn': tc.expected,
            'Kết quả thực tế (API)': res.actual,
            'Trạng thái': res.pass ? 'Pass' : 'Fail'
          });
          console.log(res.pass ? "PASS" : "FAIL");
        } catch (e) {
          results.push({
            'Mã Testcase': tc.id,
            'Mục đích / Kịch bản': tc.desc,
            'Kết quả mong muốn': tc.expected,
            'Kết quả thực tế (API)': 'Lỗi khi chạy: ' + e.message,
            'Trạng thái': 'Error'
          });
          console.log("ERROR");
        }
      } else {
        results.push({
          'Mã Testcase': tc.id,
          'Mục đích / Kịch bản': tc.desc,
          'Kết quả mong muốn': tc.expected,
          'Kết quả thực tế (API)': 'Cần manual test / Tool chuyên dụng',
          'Trạng thái': 'Not Tested'
        });
        console.log("SKIPPED (Not Automated)");
      }
    }
    
    const ws = xlsx.utils.json_to_sheet(results);
    xlsx.utils.book_append_sheet(workbook, ws, suite.sheet.substring(0, 31));
  }

  const outPath = 'e:\\Project_MES\\Comprehensive_TestReport.xlsx';
  xlsx.writeFile(workbook, outPath);
  console.log(`\n=> Báo cáo chi tiết đã lưu tại: ${outPath}`);
}

runAll().catch(console.error);
