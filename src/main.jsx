import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import "./index.css";
import MesApp from "../MesApp.jsx";

// [HR-G2] /kiosk = tablet chấm công: app riêng, không qua đăng nhập, tải tách gói — 2026-10-23, CHƯA PHÁT HÀNH
const KioskApp = React.lazy(() => import("./modules/hr/kiosk/KioskApp.jsx"));
if (window.location.pathname.startsWith("/kiosk")) {
  createRoot(document.getElementById("root")).render(
    <React.Suspense fallback={<div style={{ padding: 32, fontSize: 20 }}>Đang tải…</div>}><KioskApp /></React.Suspense>
  );
} else createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{
        style: {
          background: '#fff',
          color: '#334155',
          fontSize: '14px',
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
          borderRadius: '0.75rem',
        },
        success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
        error: { iconTheme: { primary: '#f43f5e', secondary: '#fff' } }
      }} />
      <MesApp />
    </BrowserRouter>
  </React.StrictMode>
);
