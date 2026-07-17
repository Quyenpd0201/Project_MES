// src/mesApi.js — client gọi backend cho các phân hệ mở rộng
const API_BASE = import.meta.env?.VITE_API_BASE || "http://localhost:4000";

let authToken = (typeof localStorage !== "undefined" && localStorage.getItem("mes_token")) || "";
export function setToken(t) {
  authToken = t || "";
  if (typeof localStorage !== "undefined") { if (t) localStorage.setItem("mes_token", t); else localStorage.removeItem("mes_token"); }
}
export function getToken() { return authToken; }

async function http(path, opts = {}) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j?.message) msg = j.message; } catch { /* ignore */ }
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return res.status === 204 ? null : res.json();
}

const body = (m, b) => ({ method: m, body: JSON.stringify(b) });

// CRUD chung cho master-data
export function resource(name) {
  return {
    list: (params = {}) => {
      const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null));
      return http(`/${name}?${q.toString()}`).then((r) => r.data ?? r);
    },
    get: (id) => http(`/${name}/${id}`),
    create: (data) => http(`/${name}`, body("POST", data)),
    update: (id, data) => http(`/${name}/${id}`, body("PUT", data)),
    remove: (id) => http(`/${name}/${id}`, { method: "DELETE" }),
    importRows: (rows) => http(`/${name}/import`, body("POST", { rows })),
  };
}

export const getLookups = () => http(`/lookups`);
export const getDashboard = () => http(`/dashboard`);
export const customerOrders = (id) => http(`/customers/${id}/orders`).then((r) => r.data);
export const nextCode = (entity) => http(`/next-code/${entity}`).then((r) => r.code);
export const productRelated = (id) => http(`/products/${id}/related`);
export const productFiles = {
  list: (id) => http(`/products/${id}/attachments`),
  add: (id, payload) => http(`/products/${id}/attachments`, body("POST", payload)),
  file: (id, attId) => http(`/products/${id}/attachments/${attId}/file`),
  remove: (id, attId) => http(`/products/${id}/attachments/${attId}`, { method: "DELETE" }),
};
export const machineOrders = (id) => http(`/machines/${id}/orders`).then((r) => r.data);

export const workSchedules = {
  list: (from, to) => http(`/work-schedules?from=${from}&to=${to}`).then((r) => r.data),
  upsert: (data) => http(`/work-schedules`, body("PUT", data)),
};

export const roles = {
  ...resource("roles"),
  savePermissions: (id, permissions) => http(`/roles/${id}/permissions`, body("PUT", { permissions })),
};

export const deliveries = {
  ...resource("deliveries"),
  fromOrder: (orderId) => http(`/deliveries/from-order/${orderId}`),
};

export const processes = resource("processes");
export const users = resource("users");
export const auth = {
  login: (data) => http(`/auth/login`, body("POST", data)),
  me: () => http(`/auth/me`),
  logout: () => http(`/auth/logout`, { method: "POST" }),
};

export const production = {
  ...resource("production-orders"),
  schedule: (id, data) => http(`/production-orders/${id}/schedule`, body("PUT", data)),
  reschedule: (id, date) => http(`/production-orders/${id}/reschedule`, body("PUT", { date })),
  getTasks: (id) => http(`/production-orders/${id}/tasks`).then((r) => r.data),
  saveTasks: (id, tasks) => http(`/production-orders/${id}/tasks`, body("PUT", { tasks })),
  gantt: (from, to) => http(`/production/gantt?from=${from}&to=${to}`).then((r) => r.data),
  machineAvailability: () => http(`/production/machine-availability`).then((r) => r.data),
  execution: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null));
    return http(`/production/execution?${q.toString()}`).then((r) => r.data);
  },
  taskByCode: (code) => http(`/production/task-by-code/${encodeURIComponent(code)}`),
  updateTask: (taskId, data) => http(`/production/tasks/${taskId}`, body("PUT", data)),
  materials: (id) => http(`/production-orders/${id}/materials`),
  saveMaterials: (id, lines) => http(`/production-orders/${id}/materials`, body("POST", { lines })),
};

export const planning = {
  fromOrders: () => http(`/planning/from-orders`),
  generate: (data) => http(`/planning/generate`, body("POST", data)),
  groups: (statuses) => http(`/planning/groups${statuses ? "?status=" + encodeURIComponent(statuses) : ""}`),
  materialRequirements: () => http(`/planning/material-requirements`),
};

export const inventory = {
  list: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null));
    return http(`/inventory?${q.toString()}`).then((r) => r.data);
  },
  tree: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null));
    return http(`/inventory/tree?${q.toString()}`).then((r) => r.data);
  },
  adjust: (data) => http(`/inventory/adjust`, body("POST", data)),
  transactions: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null));
    return http(`/inventory/transactions?${q.toString()}`).then((r) => r.data);
  },
  detail: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null));
    return http(`/inventory/detail?${q.toString()}`);
  },
  addStock: (data) => http(`/inventory/stock`, body("POST", data)),
  deleteStock: (id) => http(`/inventory/stock/${id}`, { method: "DELETE" }),
};
