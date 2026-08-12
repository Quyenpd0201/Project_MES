import React, { createContext, useContext } from "react";

const PermCtx = createContext({ isAdmin: true, perms: {}, user: null });

export function PermProvider({ user, children }) {
  const value = { isAdmin: !!user?.is_admin, perms: user?.permissions || {}, user: user || null };
  return <PermCtx.Provider value={value}>{children}</PermCtx.Provider>;
}

export function usePerm() {
  const { isAdmin, perms, user } = useContext(PermCtx);

  // Quyền hành động trên 1 ứng dụng: view/create/edit/delete/...
  // Chỉ coi là có quyền khi giá trị là 'ALLOW' hoặc true (backward-compat)
  // Không nhận DENY, INHERIT, hoặc undefined là có quyền
  const can = (app, action) => {
    if (isAdmin) return true;
    const val = perms[app]?.[action];
    return val === 'ALLOW' || val === true;
  };

  // Quyền 1 trường: 'edit' | 'view' (chỉ đọc) | 'hidden' (ẩn)
  // INHERIT ở frontend có nghĩa là không có quyền riêng → dùng quyền action của module làm fallback
  const fperm = (app, field) => {
    if (isAdmin) return "edit";
    const fp = perms[app]?.fields?.[field];
    // Giá trị thực tế từ effective perms (sau khi merge kế thừa đã được tính phía backend)
    if (fp === "hidden") return "hidden";
    if (fp === "view") return "view";
    if (fp === "edit") return "edit";
    // INHERIT hoặc không có → dùng quyền hành động module làm fallback
    return (perms[app]?.edit === 'ALLOW' || perms[app]?.edit === true ||
            perms[app]?.create === 'ALLOW' || perms[app]?.create === true) ? "edit" : "view";
  };

  // Quyền trường KÍN (opt-in): mặc định 'hidden', chỉ admin hoặc role được cấp mới thấy.
  // Dùng cho dữ liệu nhạy cảm như tiền — ẩn với mọi role chưa được cấp.
  const fpermSecret = (app, field) => {
    if (isAdmin) return "edit";
    const fp = perms[app]?.fields?.[field];
    return fp === "edit" || fp === "view" ? fp : "hidden";
  };
  return { isAdmin, can, fperm, fpermSecret, user };
}
