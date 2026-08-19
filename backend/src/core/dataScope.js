/**
 * Helper xử lý Phạm vi dữ liệu (Data Scope / Row-Level Security).
 * Trả về chuỗi điều kiện SQL WHERE (an toàn) dựa trên cấu hình phân quyền của user.
 */

const escapeSql = (str) => typeof str === 'string' ? str.replace(/'/g, "''") : str;

/**
 * Lấy điều kiện SQL chặn phạm vi dữ liệu.
 * @param {Object} req - Request object (phải có req.user.permissions)
 * @param {string} moduleKey - Tên module trong RBAC (vd: 'production', 'inv_inbound')
 * @param {string} action - Tên hành động (vd: 'view', 'create')
 * @param {Object} config - Tên cột tương ứng trong database query của bạn
 * @returns {string} - Trả về câu lệnh SQL (vd "1=1", "1=0", "po.assigned_team = 'Nhà máy thổi'")
 */
exports.getDataScope = (req, moduleKey, action = 'view', config = {}) => {
  const { factoryCol = 'assigned_team', warehouseCol = 'w.name' } = config;
  
  if (!req.user) return '1=0';
  if (req.user.is_admin) return '1=1';
  
  const modPerms = req.user.permissions?.[moduleKey];
  if (!modPerms) return '1=0';
  
  const pval = modPerms[action];
  if (!pval) return '1=0';
  
  // Tương thích ngược: dữ liệu boolean cũ -> toàn quyền
  if (pval === 'ALLOW' || pval === true) return '1=1';
  
  // Cấu trúc mới
  if (typeof pval === 'object' && pval.status === 'ALLOW') {
    const scope = pval.scope;
    
    if (!scope || scope === 'ALL') return '1=1';
    
    if (scope === 'FACTORY') {
      const val = pval.scopeValue;
      if (!val) return '1=1'; // Nếu chưa chọn, default = ALL
      return `${factoryCol} = '${escapeSql(val)}'`;
    }
    
    if (scope === 'WAREHOUSE') {
      const val = pval.scopeValue;
      if (!val) return '1=1';
      return `${warehouseCol} = '${escapeSql(val)}'`;
    }
    
    // CUSTOM Rule Builder (hiện tại chưa có DB struct)
    if (scope === 'CUSTOM') {
       return '1=0'; // Chặn nếu chọn CUSTOM mà chưa code logic
    }
  }
  
  return '1=0'; // Fallback an toàn
};
