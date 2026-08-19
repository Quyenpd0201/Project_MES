// backend/middleware/requireAuth.js — xác thực Bearer token cho mọi request
const { verifyToken } = require('../modules/auth/authController');
const { calculateEffectivePermissions } = require('../modules/auth/roleController');
const db = require('./db');

/**
 * Middleware xác thực phiên đăng nhập.
 * Gắn req.userId và req.user vào request nếu token hợp lệ.
 * Trả 401 nếu thiếu/sai/hết hạn token.
 */
module.exports = async function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Cần đăng nhập để thực hiện thao tác này' });

  const userId = verifyToken(token);
  if (!userId) return res.status(401).json({ message: 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại' });

  try {
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.full_name, u.status, u.team,
              COALESCE(u.user_permissions, '{}'::jsonb) AS user_permissions,
              r.id AS role_id, r.name AS role_name,
              COALESCE(r.is_admin, FALSE) AS is_admin,
              COALESCE(r.permissions, '{}'::jsonb) AS permissions
       FROM users u LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1 AND u.is_deleted = FALSE AND u.status = 'Hoạt động'`,
      [userId]
    );
    if (!rows[0]) return res.status(401).json({ message: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa' });

    req.userId = userId;
    req.user   = rows[0];
    
    // Tính quyền hiệu lực (gộp cả kế thừa từ role cha)
    let effective = {};
    if (req.user.role_id) {
      effective = await calculateEffectivePermissions(req.user.role_id);
    }
    
    // Gộp quyền riêng lẻ (user_permissions)
    const indPerms = req.user.user_permissions;
    for (const [modKey, actions] of Object.entries(indPerms)) {
      if (!effective[modKey]) effective[modKey] = {};
      for (const [actKey, val] of Object.entries(actions)) {
         effective[modKey][actKey] = val; // ghi đè/cộng dồn
      }
    }
    
    req.user.permissions = effective;
    next();
  } catch (err) {
    console.error('[requireAuth]', err);
    res.status(500).json({ message: 'Lỗi xác thực, vui lòng thử lại' });
  }
};

/**
 * Middleware phân quyền (RBAC).
 * Cần đặt sau requireAuth.
 * Kiểm tra xem user có phải admin, hoặc có quyền được cấu hình không.
 */
module.exports.requirePerm = (permString) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Chưa xác thực' });
    if (req.user.is_admin) return next();
    
    // permString format: "module:action" e.g., "engineering:edit" or "products:edit"
    // Backward compatibility: map old string to new apps if needed
    let moduleKey = permString;
    let action = 'view';
    
    if (permString.includes(':')) {
      const parts = permString.split(':');
      moduleKey = parts[0];
      action = parts[1];
    }
    
    // Map old backend perm strings to new frontend app keys
    const appMap = {
      'engineering': ['products', 'bom', 'process'],
      'sales':       ['orders', 'deliveries'],
      'production':  ['production', 'planning', 'workschedule', 'execution', 'orderstatus', 'prod_output'],
      'inventory':   ['inventory', 'inv_inbound', 'inv_outbound', 'inv_transfer', 'inv_adjust'],
      'trace':       ['qrscan', 'trace_lot'],
      'reports':     ['reports', 'rep_inv'],
      // Danh mục: mỗi module có key riêng; 'sys' map toàn bộ danh mục
      'sys':         ['md_machines', 'md_employees', 'md_shifts', 'md_warehouses', 'md_locations', 'md_customers', 'md_roles', 'masterdata'],
      // Alias trực tiếp (khi backend dùng key cụ thể)
      'md_machines':  ['md_machines'],
      'md_employees': ['md_employees'],
      'md_shifts':    ['md_shifts'],
      'md_warehouses':['md_warehouses'],
      'md_locations': ['md_locations'],
      'md_customers': ['md_customers'],
      'md_roles':     ['md_roles'],
    };
    
    const possibleModules = appMap[moduleKey] || [moduleKey];
    
    let hasPerm = false;
    for (const mod of possibleModules) {
       const modPerms = req.user.permissions && req.user.permissions[mod];
       if (modPerms) {
           // New format: modPerms[action] is an object { status: 'ALLOW', scope: '...' }
           // Intermediate format: modPerms[action] is 'ALLOW', 'DENY', 'INHERIT'
           // Old format: modPerms[action] is boolean true/false
           const pval = modPerms[action];
           if (pval) {
             if (typeof pval === 'object' && pval.status === 'ALLOW') {
               hasPerm = true;
               break;
             } else if (pval === 'ALLOW' || pval === true) {
               hasPerm = true;
               break;
             }
           }
       }
    }
    // Backward comp fallback: if user has literal permission
    if (!hasPerm && req.user.permissions && req.user.permissions[permString] === true) {
       hasPerm = true;
    }

    if (hasPerm) return next();
    res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này' });
  };
};
