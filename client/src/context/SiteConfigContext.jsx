import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getStoredAdminToken, setStoredAdminToken } from '../services/api.js';

export const DAISY_THEMES = [
  { id: 'light', label: 'light', isDark: false },
  { id: 'dark', label: 'dark', isDark: true },
  { id: 'cupcake', label: 'cupcake', isDark: false },
  { id: 'bumblebee', label: 'bumblebee', isDark: false },
  { id: 'emerald', label: 'emerald', isDark: false },
  { id: 'corporate', label: 'corporate', isDark: false },
  { id: 'synthwave', label: 'synthwave', isDark: true },
  { id: 'retro', label: 'retro', isDark: false },
  { id: 'cyberpunk', label: 'cyberpunk', isDark: false },
  { id: 'valentine', label: 'valentine', isDark: false },
  { id: 'halloween', label: 'halloween', isDark: true },
  { id: 'garden', label: 'garden', isDark: false },
  { id: 'forest', label: 'forest', isDark: true },
  { id: 'aqua', label: 'aqua', isDark: true },
  { id: 'lofi', label: 'lofi', isDark: false },
  { id: 'pastel', label: 'pastel', isDark: false },
  { id: 'fantasy', label: 'fantasy', isDark: false },
  { id: 'wireframe', label: 'wireframe', isDark: false },
  { id: 'black', label: 'black', isDark: true },
  { id: 'luxury', label: 'luxury', isDark: true },
  { id: 'dracula', label: 'dracula', isDark: true },
  { id: 'cmyk', label: 'cmyk', isDark: false },
  { id: 'autumn', label: 'autumn', isDark: false },
  { id: 'business', label: 'business', isDark: true },
  { id: 'acid', label: 'acid', isDark: false },
  { id: 'lemonade', label: 'lemonade', isDark: false },
  { id: 'night', label: 'night', isDark: true },
  { id: 'coffee', label: 'coffee', isDark: true },
  { id: 'winter', label: 'winter', isDark: false },
  { id: 'dim', label: 'dim', isDark: true },
  { id: 'nord', label: 'nord', isDark: false },
  { id: 'sunset', label: 'sunset', isDark: true },
];

export const DEFAULT_CLIENT_CONFIG = {
  activeTheme: 'light',
  authEnabled: true,
  adminUsername: 'admin',
  brandName: 'Mardonius Riel',
  portalEyebrow: 'Pilih Lingkungan Kerja',
  portalTitle: 'Portal Presensi & Counting Wajah',
  portalHeading: 'Silakan pilih tujuan penggunaan hari ini.',
  portalDescription:
    'Data wajah jemaat, pendeta, dan laporan ibadah tersimpan di ruang khusus gereja agar tetap bersih dari pengujian teknis maupun simulasi harian.',
  portalFooter: 'Dirancang khusus oleh Mardonius Riel — Sistem Presensi & People Counting Biometrik.',
  portalQuickHint: 'Akses langsung: /gereja/live • /gereja/admin • /piloting/live • /piloting/admin • /cpanel',
  tabs: {
    admin: 'Dashboard CRUD',
    register: 'Registrasi Wajah',
    reports: 'Laporan & PDF',
    live: 'Live & Test Foto',
    cpanel: 'cPanel & CMS',
  },
  workspaces: {
    gereja: {
      shortLabel: 'Ruang Gereja',
      eyebrow: 'PELAYANAN & IBADAH',
      title: 'Presensi & Counting Jemaat',
      subtitle: 'Pencatatan kehadiran jemaat, pendeta, majelis & pelayan ibadah secara terpisah.',
      adminTitle: 'Ruang Gereja — Panel Admin',
      adminSubtitle: 'Kelola Data Jemaat & Pendeta, Log Ibadah, serta Export CSV / PDF',
      primaryButton: 'Kamera Jemaat',
      secondaryButton: 'Admin Gereja',
      cameraReadyTitle: 'Presensi & Counting Jemaat — Siap',
      cameraReadySubtitle: 'Arahkan wajah jemaat atau pendeta ke kamera untuk presensi dan counting ibadah.',
      roleOptions: [
        'Jemaat',
        'Pendeta',
        'Majelis',
        'Pelayan Ibadah',
        'Pemusik / Multimedia',
        'Simpatisan / Tamu',
      ],
      highlights: [
        'Khusus presensi & counting wajah jemaat, pendeta, majelis, serta pelayan',
        'Database terpisah sepenuhnya dari data uji coba piloting',
        'Ekspor laporan kehadiran harian & periode ke PDF / CSV siap arsip gereja',
      ],
    },
    piloting: {
      shortLabel: 'Mode Piloting',
      eyebrow: 'SANDBOX & KALIBRASI',
      title: 'Piloting & Pengujian',
      subtitle: 'Area uji coba kamera, deteksi multi-wajah, dan simulasi presensi.',
      adminTitle: 'Piloting & Testing — Panel Admin',
      adminSubtitle: 'Kelola Data Uji Coba, Log Simulasi, dan Export CSV / PDF',
      primaryButton: 'Kamera Piloting',
      secondaryButton: 'Admin Piloting',
      cameraReadyTitle: 'Piloting & Pengujian — Siap',
      cameraReadySubtitle: 'Aktifkan kamera untuk kalibrasi pengenalan wajah dan simulasi counting.',
      roleOptions: ['Anggota', 'Karyawan', 'Mahasiswa / Siswa', 'Admin', 'Tamu VIP'],
      highlights: [
        'Ruang terpisah untuk uji coba kamera, deteksi multi-wajah, dan demo umum',
        'Tidak mencemari daftar anggota atau rekap laporan kehadiran gereja',
        'Tetap lengkap dengan pencatatan anti-duplikat 1x/hari & laporan periode',
      ],
    },
  },
  customSections: [],
};

export function isDarkDaisyTheme(themeId) {
  const found = DAISY_THEMES.find((t) => t.id === themeId);
  return found ? found.isDark : false;
}

const SiteConfigContext = createContext(null);

export function SiteConfigProvider({ children }) {
  const [config, setConfig] = useState(() => {
    try {
      const cached = localStorage.getItem('mardonius_site_config_v6');
      return cached ? { ...DEFAULT_CLIENT_CONFIG, ...JSON.parse(cached) } : DEFAULT_CLIENT_CONFIG;
    } catch {
      return DEFAULT_CLIENT_CONFIG;
    }
  });

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [previewReadOnly, setPreviewReadOnly] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');

  const activeTheme = config.activeTheme || 'light';
  const isDark = isDarkDaisyTheme(activeTheme);
  const actualRole = currentUser?.role || 'admin';
  const effectiveRole = previewReadOnly ? 'viewer' : actualRole;
  const isReadOnly = effectiveRole === 'viewer';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', activeTheme);
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem('mardonius_site_config_v6', JSON.stringify(config));
    } catch {
      // ignore storage errors
    }
  }, [activeTheme, isDark, config]);

  const refreshConfigAndAuth = useCallback(async () => {
    setCheckingAuth(true);
    try {
      const cfgRes = await api.getSiteConfig();
      const loadedCfg = cfgRes?.config || DEFAULT_CLIENT_CONFIG;
      setConfig(loadedCfg);

      if (!loadedCfg.authEnabled) {
        setIsAuthenticated(true);
        setCurrentUser({
          username: loadedCfg.adminUsername || 'admin',
          displayName: 'Administrator',
          role: 'admin',
        });
      } else if (getStoredAdminToken()) {
        try {
          const verifyRes = await api.verifyAdminSession();
          setIsAuthenticated(Boolean(verifyRes?.authenticated));
          setCurrentUser(verifyRes?.user || null);
        } catch {
          setStoredAdminToken('');
          setIsAuthenticated(false);
          setCurrentUser(null);
        }
      } else {
        setIsAuthenticated(false);
        setCurrentUser(null);
      }
    } catch {
      // keep fallback state
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    refreshConfigAndAuth();
  }, [refreshConfigAndAuth]);

  const loginAdmin = useCallback(async (username, password) => {
    const res = await api.loginAdmin(username, password);
    if (res?.token) {
      setStoredAdminToken(res.token);
      setIsAuthenticated(true);
      setCurrentUser(res.user || { username, role: 'admin' });
      setPreviewReadOnly(false);
    }
    return res;
  }, []);

  const logoutAdmin = useCallback(() => {
    setStoredAdminToken('');
    setPreviewReadOnly(false);
    if (config.authEnabled) {
      setIsAuthenticated(false);
      setCurrentUser(null);
    }
  }, [config.authEnabled]);

  const changeOwnPassword = useCallback(async (currentPassword, newPassword) => {
    const res = await api.changePassword({ currentPassword, newPassword });
    if (res?.config) setConfig(res.config);
    setSaveNotice('Password berhasil diubah');
    setTimeout(() => setSaveNotice(''), 2500);
    return res;
  }, []);

  const manageAccount = useCallback(async (payload) => {
    setSavingConfig(true);
    try {
      const res = await api.manageAccount(payload);
      if (res?.config) setConfig(res.config);
      setSaveNotice('Akun & role diperbarui');
      setTimeout(() => setSaveNotice(''), 2500);
      return res;
    } finally {
      setSavingConfig(false);
    }
  }, []);

  const updateRoleOption = useCallback(async (workspace, action, role) => {
    setSavingConfig(true);
    try {
      const res = await api.updateRoleOption({ workspace, action, role });
      if (res?.config) setConfig(res.config);
      setSaveNotice(res?.message || 'Daftar peran diperbarui');
      setTimeout(() => setSaveNotice(''), 2500);
      return res;
    } finally {
      setSavingConfig(false);
    }
  }, []);

  const persistConfig = useCallback(async (nextConfigOrPatch, noticeText = 'Tersimpan ke MongoDB') => {
    setSavingConfig(true);
    try {
      const res = await api.updateSiteConfig(nextConfigOrPatch);
      if (res?.config) {
        setConfig(res.config);
        if (!res.config.authEnabled) {
          setIsAuthenticated(true);
        }
      }
      setSaveNotice(noticeText);
      setTimeout(() => setSaveNotice(''), 2500);
      return res;
    } finally {
      setSavingConfig(false);
    }
  }, []);

  const setActiveTheme = useCallback(
    async (themeId) => {
      setConfig((prev) => ({ ...prev, activeTheme: themeId }));
      try {
        await persistConfig({ activeTheme: themeId }, `Tema "${themeId}" aktif`);
      } catch {
        // Theme still applies locally even if not logged in
      }
    },
    [persistConfig]
  );

  const toggleLightDark = useCallback(() => {
    setActiveTheme(isDark ? 'light' : 'dark');
  }, [isDark, setActiveTheme]);

  const addSection = useCallback(
    (section) => {
      const list = Array.isArray(config.customSections) ? [...config.customSections] : [];
      const newSec = {
        ...section,
        id: section.id || `sec-${Date.now()}`,
        order: list.length + 1,
        visible: section.visible !== false,
      };
      return persistConfig({ ...config, customSections: [...list, newSec] }, 'Section baru ditambahkan');
    },
    [config, persistConfig]
  );

  const updateSection = useCallback(
    (id, patch) => {
      const list = (config.customSections || []).map((s) => (s.id === id ? { ...s, ...patch } : s));
      return persistConfig({ ...config, customSections: list }, 'Section diperbarui');
    },
    [config, persistConfig]
  );

  const deleteSection = useCallback(
    (id) => {
      const list = (config.customSections || []).filter((s) => s.id !== id);
      return persistConfig({ ...config, customSections: list }, 'Section dihapus');
    },
    [config, persistConfig]
  );

  const moveSection = useCallback(
    (id, direction) => {
      const sorted = [...(config.customSections || [])].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      );
      const idx = sorted.findIndex((s) => s.id === id);
      const targetIdx = idx + direction;
      if (idx < 0 || targetIdx < 0 || targetIdx >= sorted.length) return;
      [sorted[idx], sorted[targetIdx]] = [sorted[targetIdx], sorted[idx]];
      const reordered = sorted.map((s, i) => ({ ...s, order: i + 1 }));
      return persistConfig({ ...config, customSections: reordered }, 'Urutan section diperbarui');
    },
    [config, persistConfig]
  );

  const resetConfig = useCallback(async () => {
    setSavingConfig(true);
    try {
      const res = await api.resetSiteConfig();
      if (res?.config) {
        setConfig(res.config);
      }
      setSaveNotice('Tampilan direset ke bawaan');
      setTimeout(() => setSaveNotice(''), 2500);
    } finally {
      setSavingConfig(false);
    }
  }, []);

  return (
    <SiteConfigContext.Provider
      value={{
        config,
        activeTheme,
        theme: isDark ? 'dark' : 'light',
        isDark,
        isAuthenticated,
        currentUser,
        actualRole,
        effectiveRole,
        isReadOnly,
        previewReadOnly,
        setPreviewReadOnly,
        checkingAuth,
        savingConfig,
        saveNotice,
        loginAdmin,
        logoutAdmin,
        changeOwnPassword,
        manageAccount,
        updateRoleOption,
        refreshConfigAndAuth,
        persistConfig,
        setActiveTheme,
        toggleLightDark,
        addSection,
        updateSection,
        deleteSection,
        moveSection,
        resetConfig,
      }}
    >
      {children}
    </SiteConfigContext.Provider>
  );
}

export function useSiteConfig() {
  const ctx = useContext(SiteConfigContext);
  if (!ctx) throw new Error('useSiteConfig must be used inside SiteConfigProvider');
  return ctx;
}
