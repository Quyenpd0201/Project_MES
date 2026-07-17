import React, { createContext, useContext } from "react";

const PermCtx = createContext({ isAdmin: true, perms: {}, user: null });

export function PermProvider({ user, children }) {
  const value = { isAdmin: !!user?.is_admin, perms: user?.permissions || {}, user: user || null };
  return <PermCtx.Provider value={value}>{children}</PermCtx.Provider>;
}

export function usePerm() {
  const { isAdmin, perms, user } = useContext(PermCtx);
  // Quyền hành động trên 1 ứng dụng: view/create/edit/delete
  const can = (app, action) => isAdmin || !!perms[app]?.[action];
  // Quyền 1 trường: 'edit' | 'view' (chỉ đọc) | 'hidden' (ẩn)
  const fperm = (app, field) => {
    if (isAdmin) return "edit";
    const fp = perms[app]?.fields?.[field] || "edit";
    if (fp === "hidden") return "hidden";
    if (fp === "view") return "view";
    return (perms[app]?.edit || perms[app]?.create) ? "edit" : "view";
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
