const API_BASE = '/api';
const TOKEN_STORAGE_KEY = 'mardonius_admin_token';

export function getStoredAdminToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredAdminToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

async function request(path, options = {}) {
  const token = getStoredAdminToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function getTodayDateKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const api = {
  getHealth: () => request('/health'),

  // Users CRUD & Face Descriptors (workspace-scoped: 'piloting' | 'gereja')
  getUsers: (params = {}, workspace = 'piloting') => {
    const merged = { workspace, ...params };
    const qs = new URLSearchParams(merged).toString();
    return request(`/users${qs ? `?${qs}` : ''}`);
  },
  getFaceDescriptors: (workspace = 'piloting') =>
    request(`/users/descriptors?workspace=${encodeURIComponent(workspace)}`),
  verifyFace: (descriptor, workspace = 'piloting') =>
    request('/users/verify-face', {
      method: 'POST',
      body: JSON.stringify({ descriptor, workspace }),
    }),
  createUser: (payload, workspace = 'piloting') =>
    request('/users', {
      method: 'POST',
      body: JSON.stringify({ workspace, ...payload }),
    }),
  updateUser: (id, payload) =>
    request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteUser: (id) =>
    request(`/users/${id}`, {
      method: 'DELETE',
    }),

  // Attendance & Counting Logs
  getLogs: (params = {}, workspace = 'piloting') => {
    const clean = Object.fromEntries(
      Object.entries({ workspace, ...params }).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );
    const qs = new URLSearchParams(clean).toString();
    return request(`/logs${qs ? `?${qs}` : ''}`);
  },
  createLog: (payload, workspace = 'piloting') =>
    request('/logs', {
      method: 'POST',
      body: JSON.stringify({ workspace, ...payload }),
    }),
  updateLog: (id, payload) =>
    request(`/logs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteLog: (id) =>
    request(`/logs/${id}`, {
      method: 'DELETE',
    }),

  // Daily & Period Summary + CSV / PDF Export
  getDailySummary: (date = getTodayDateKey(), workspace = 'piloting') =>
    request(`/summary/daily?date=${encodeURIComponent(date)}&workspace=${encodeURIComponent(workspace)}`),

  getPeriodSummary: (startDate, endDate, weekdaysOnly = false, workspace = 'piloting') =>
    request(
      `/summary/period?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&weekdaysOnly=${weekdaysOnly ? 'true' : 'false'}&workspace=${encodeURIComponent(workspace)}`
    ),

  getExportCsvUrl: (date = getTodayDateKey(), mode = 'logs', workspace = 'piloting') =>
    `${API_BASE}/summary/export-csv?date=${encodeURIComponent(date)}&mode=${encodeURIComponent(mode)}&workspace=${encodeURIComponent(workspace)}`,

  getExportPdfUrl: (date = getTodayDateKey(), mode = 'all', workspace = 'piloting') =>
    `${API_BASE}/summary/export-pdf?date=${encodeURIComponent(date)}&mode=${encodeURIComponent(mode)}&workspace=${encodeURIComponent(workspace)}`,

  getExportPeriodCsvUrl: (startDate, endDate, weekdaysOnly = false, workspace = 'piloting') =>
    `${API_BASE}/summary/export-period-csv?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&weekdaysOnly=${weekdaysOnly ? 'true' : 'false'}&workspace=${encodeURIComponent(workspace)}`,

  getExportPeriodPdfUrl: (startDate, endDate, weekdaysOnly = false, workspace = 'piloting') =>
    `${API_BASE}/summary/export-period-pdf?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&weekdaysOnly=${weekdaysOnly ? 'true' : 'false'}&workspace=${encodeURIComponent(workspace)}`,

  // Dynamic CMS, Auth & DaisyUI Theme Configuration
  getSiteConfig: () => request('/site-config'),
  loginAdmin: (username, password) =>
    request('/site-config/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  verifyAdminSession: () => request('/site-config/verify'),
  updateSiteConfig: (config) =>
    request('/site-config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  resetSiteConfig: () =>
    request('/site-config/reset', {
      method: 'POST',
    }),
  changePassword: (payload) =>
    request('/site-config/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  manageAccount: (payload) =>
    request('/site-config/accounts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateRoleOption: (payload) =>
    request('/site-config/role-options', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Hybrid Server AI (ubuntu-swarm1 YuNet + SFace)
  getAiHealth: () => request('/ai/health'),
  aiExtract: (imageBase64, workspace = 'piloting') =>
    request('/ai/extract', {
      method: 'POST',
      body: JSON.stringify({ imageBase64, workspace }),
    }),
  aiRecognize: (imageBase64, workspace = 'piloting') =>
    request('/ai/recognize', {
      method: 'POST',
      body: JSON.stringify({ imageBase64, workspace }),
    }),
};
