import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PageHeader, Section } from "../../components.jsx";

/* Chuẩn hóa module Chấm công (11/2026): tạo / xem / sửa mở thành TRANG RIÊNG (như Đơn hàng, Sản phẩm…),
   không còn popup. HrPage dùng đúng API của <Modal> (title, onClose, dirty, locked, footer, children)
   nên thay thế 1-1. Khi có trang đang mở, <HrScreen> ẩn màn danh sách (vẫn giữ bộ lọc / trang đang xem)
   và hiện trang ở chỗ đó. Trang lồng nhau (vd: chi tiết ngày công → yêu cầu sửa công) chỉ hiện trang trên cùng,
   bấm Quay lại về trang trước. Ảnh chấm công vẫn xem dạng phóng to (Modal) vì không phải nghiệp vụ. */

const Ctx = createContext(null);
let seq = 0;

export function HrScreen({ children }) {
  const [stack, setStack] = useState([]);
  const slotRef = useRef(null);
  const [slot, setSlot] = useState(null);
  const push = useCallback((id) => setStack((s) => [...s, id]), []);
  const pop = useCallback((id) => setStack((s) => s.filter((x) => x !== id)), []);
  useEffect(() => { setSlot(slotRef.current); }, []);
  const top = stack[stack.length - 1];
  return (
    <Ctx.Provider value={{ push, pop, top, slot }}>
      <div className={stack.length ? "hidden" : undefined}>{children}</div>
      <div ref={slotRef} />
    </Ctx.Provider>
  );
}

export function HrPage({ title, onClose, dirty, locked = false, footer, children, section = "Thông tin chung" }) {
  const ctx = useContext(Ctx);
  const [id] = useState(() => ++seq);
  useEffect(() => {
    if (!ctx) return undefined;
    ctx.push(id);
    window.scrollTo?.(0, 0);
    document.querySelector("main")?.scrollTo?.(0, 0);
    return () => ctx.pop(id);
  }, [ctx?.push, ctx?.pop, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const requestClose = useCallback(() => {
    if (locked) return;
    if (dirty && !window.confirm("Dữ liệu đang nhập chưa được lưu. Quay lại và bỏ thay đổi?")) return;
    onClose?.();
  }, [locked, dirty, onClose]);

  // Esc = Quay lại (như nút Quay lại), chỉ trang trên cùng nghe phím
  useEffect(() => {
    if (!ctx || ctx.top !== id) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); requestClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctx, id, requestClose]);

  if (!ctx || !ctx.slot || ctx.top !== id) return null;
  const actions = typeof footer === "function" ? footer(requestClose) : footer;
  return createPortal(
    <div className="space-y-5">
      <PageHeader title={title} onBack={locked ? undefined : requestClose} actions={actions} />
      {section === null
        ? (typeof children === "function" ? children(requestClose) : children) /* trang tự chia nhiều <Section> */
        : <Section title={section} collapsible={false}>
            {typeof children === "function" ? children(requestClose) : children}
          </Section>}
    </div>,
    ctx.slot,
  );
}
