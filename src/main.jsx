import React from "react";
import { createRoot } from "react-dom/client";
import MesApp from "../MesApp.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MesApp />
  </React.StrictMode>
);
