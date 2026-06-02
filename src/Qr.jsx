import React, { useState, useEffect } from "react";
import QRCode from "qrcode";

/* Ảnh QR sinh từ chuỗi text (dùng chung cho Tem QR & chi tiết lệnh SX) */
export default function Qr({ text, size = 100 }) {
  const [url, setUrl] = useState("");
  useEffect(() => { QRCode.toDataURL(text || " ", { width: size, margin: 1 }).then(setUrl).catch(() => {}); }, [text, size]);
  return url ? <img src={url} width={size} height={size} alt="QR" /> : <div style={{ width: size, height: size }} className="bg-slate-100 rounded" />;
}
