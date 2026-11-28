import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Database,
  Eye,
  FileSpreadsheet,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Maximize2,
  Settings2,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import EntryPortal from './components/EntryPortal.jsx';
import FullScreenLive from './components/FullScreenLive.jsx';
import LiveMonitor from './components/LiveMonitor.jsx';
import FaceRegistration from './components/FaceRegistration.jsx';
import AdminDashboard from './components/AdminDashboard.jsx';
import ReportsSummary from './components/ReportsSummary.jsx';
import CPanelSettings from './components/CPanelSettings.jsx';
import AdminLogin from './components/AdminLogin.jsx';
import ChangePasswordModal from './components/ChangePasswordModal.jsx';
import DynamicSections from './components/DynamicSections.jsx';
import ThemePicker from './components/ThemePicker.jsx';
import { MardoniusRielMark, getWorkspaceMeta } from './components/BrandLogo.jsx';
import { useSiteConfig } from './context/SiteConfigContext.jsx';
import { useHybridAi } from './hooks/useHybridAi.js';
import AiEnginePill from './components/AiEnginePill.jsx';
import { api } from './services/api.js';
import { loadFaceModels } from './services/faceService.js';

const ADMIN_TABS = [
  { id: 'admin', fallback: 'Data Anggota', shortLabel: 'Data', icon: LayoutDashboard, writeRequired: false },
  { id: 'register', fallback: 'Registrasi', shortLabel: 'Daftar', icon: UserPlus, writeRequired: true },
  { id: 'reports', fallback: 'Laporan', shortLabel: 'Laporan', icon: FileSpreadsheet, writeRequired: false },
  { id: 'live', fallback: 'Kamera Live', shortLabel: 'Live', icon: Camera, writeRequired: false },
  { id: 'cpanel', fallback: 'Pengaturan', shortLabel: 'Atur', icon: Settings2, writeRequired: true },
];

function resolveRoute(pathname) {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  if (clean === '/') {
    return { view: 'portal', workspace: 'piloting', defaultTab: 'admin' };
  }
  if (clean === '/cpanel') {
    return { view: 'admin', workspace: 'piloting', defaultTab: 'cpanel' };
  }
  if (clean === '/register') {
    return { view: 'register', workspace: 'piloting', defaultTab: 'admin' };
  }
  if (clean.startsWith('/testing')) {
    if (clean === '/testing/admin') return { view: 'admin', workspace: 'testing', defaultTab: 'admin' };
    if (clean === '/testing/cpanel') return { view: 'admin', workspace: 'testing', defaultTab: 'cpanel' };
    if (clean === '/testing/register') return { view: 'register', workspace: 'testing', defaultTab: 'admin' };
    return { view: 'live', workspace: 'testing', defaultTab: 'admin', skipSchedule: true };
  }
  if (clean.startsWith('/gereja')) {
    if (clean === '/gereja/admin') return { view: 'admin', workspace: 'gereja', defaultTab: 'admin' };
    if (clean === '/gereja/cpanel') return { view: 'admin', workspace: 'gereja', defaultTab: 'cpanel' };
    if (clean === '/gereja/register') return { view: 'register', workspace: 'gereja', defaultTab: 'admin' };
    return { view: 'live', workspace: 'gereja', defaultTab: 'admin' };
  }
  if (clean.startsWith('/piloting')) {
    if (clean === '/piloting/admin') return { view: 'admin', workspace: 'piloting', defaultTab: 'admin' };
    if (clean === '/piloting/cpanel') return { view: 'admin', workspace: 'piloting', defaultTab: 'cpanel' };
    if (clean === '/piloting/register') return { view: 'register', workspace: 'piloting', defaultTab: 'admin' };
    return { view: 'live', workspace: 'piloting', defaultTab: 'admin' };
  }
  if (clean.startsWith('/admin')) {
    return { view: 'admin', workspace: 'piloting', defaultTab: 'admin' };
  }
  return { view: 'live', workspace: 'piloting', defaultTab: 'admin' };
}

export default function App() {
  const {
    config,
    theme,
    isAuthenticated,
    currentUser,
    actualRole,
    isReadOnly,
    previewReadOnly,
    setPreviewReadOnly,
    checkingAuth,
    logoutAdmin,
  } = useSiteConfig();

  const [pathname, setPathname] = useState(() => window.location.pathname || '/');
  const [activeTab, setActiveTab] = useState(() => resolveRoute(window.location.pathname || '/').defaultTab);
  const [modelsReady, setModelsReady] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [dbStatus, setDbStatus] = useState({ connected: false, mode: 'checking' });
  const [matcherVersion, setMatcherVersion] = useState(0);
  const [prefillFace, setPrefillFace] = useState(null);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const {
    aiMode,
    setAiMode,
    serverHealth,
    useServerAi,
    telemetry,
  } = useHybridAi(modelsReady);

  const route = resolveRoute(pathname);
  const workspace = route.workspace;
  const wsMeta = getWorkspaceMeta(workspace);

  useEffect(() => {
    const onPop = () => {
      const next = window.location.pathname || '/';
      setPathname(next);
      const r = resolveRoute(next);
      if (r.view === 'admin') setActiveTab(r.defaultTab);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Ensure read-only role stays out of write-only tabs (register / cpanel)
  useEffect(() => {
    if (isReadOnly && (activeTab === 'register' || activeTab === 'cpanel')) {
      setActiveTab('admin');
    }
  }, [isReadOnly, activeTab]);

  const navigateTo = useCallback((nextPath, explicitTab) => {
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
      setPathname(nextPath);
    }
    const r = resolveRoute(nextPath);
    if (explicitTab) setActiveTab(explicitTab);
    else if (r.view === 'admin') setActiveTab(r.defaultTab);
  }, []);

  useEffect(() => {
    loadFaceModels()
      .then(() => setModelsReady(true))
      .catch((err) => {
        console.error('Model load error:', err);
        setModelsError(err.message || 'Gagal memuat model Face AI');
      });

    api
      .getHealth()
      .then((res) => setDbStatus(res.db || { connected: false, mode: 'error' }))
      .catch(() => setDbStatus({ connected: false, mode: 'offline' }));
  }, []);

  const bumpDataVersion = useCallback(() => {
    setMatcherVersion((v) => v + 1);
  }, []);

  const handleQuickRegister = useCallback(
    (facePayload) => {
      setPrefillFace(facePayload);
      const targetWs = ['gereja', 'piloting', 'testing'].includes(facePayload?.workspace)
        ? facePayload.workspace
        : workspace;
      if (facePayload?.fromAdmin) {
        navigateTo(`/${targetWs}/admin`, 'register');
      } else {
        navigateTo(`/${targetWs}/register`);
      }
    },
    [navigateTo, workspace]
  );

  // Public Root Route (/): Clean Portal
  if (route.view === 'portal') {
    return <EntryPortal navigate={(path) => navigateTo(path)} />;
  }

  // Public Standalone Face Registration Route (No Login Required!)
  if (route.view === 'register') {
    return (
      <div className="min-h-[100dvh] bg-base-200 text-base-content">
        <header className="sticky top-0 z-30 border-b border-base-300 bg-base-100">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => navigateTo('/')}
                className="icon-button btn btn-sm btn-square btn-ghost border border-base-300 shrink-0"
                title="Kembali"
                aria-label="Kembali ke beranda"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="truncate text-sm font-semibold text-base-content sm:text-base">
                Registrasi · {wsMeta.shortLabel}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => navigateTo(wsMeta.livePath)}
                className="btn btn-sm btn-primary font-medium gap-1.5"
              >
                <Camera className="h-3.5 w-3.5" />
                <span>Kamera {wsMeta.shortLabel}</span>
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
          {modelsError && (
            <div className="alert alert-error text-sm">
              <span>Gagal memuat model pengenalan wajah: {modelsError}</span>
            </div>
          )}
          <FaceRegistration
            workspace={workspace}
            publicMode
            modelsReady={modelsReady}
            prefillFace={prefillFace}
            onClearPrefill={() => setPrefillFace(null)}
            onUserRegistered={bumpDataVersion}
            onGoToLive={() => navigateTo(wsMeta.livePath)}
          />
        </main>
      </div>
    );
  }

  // Public Full-Screen Camera Route
  if (route.view === 'live') {
    return (
      <FullScreenLive
        workspace={workspace}
        skipSchedule={Boolean(route.skipSchedule)}
        modelsReady={modelsReady}
        matcherVersion={matcherVersion}
        theme={theme}
        onGoToPortal={() => navigateTo('/')}
        onGoToAdmin={() => navigateTo(wsMeta.adminPath, 'admin')}
        onQuickRegister={handleQuickRegister}
        onDataChanged={bumpDataVersion}
      />
    );
  }

  // Admin & cPanel Routes: Require Login when authEnabled is true
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center">
        <div className="spinner !h-8 !w-8" role="status" aria-label="Memuat" />
      </div>
    );
  }

  if (config.authEnabled && !isAuthenticated) {
    return (
      <AdminLogin
        targetLabel={`${wsMeta.shortLabel} • Admin & cPanel`}
        onBackToPortal={() => navigateTo('/')}
      />
    );
  }

  const workspaceList = ['gereja', 'piloting', 'testing'];
  const wsCfg = config.workspaces?.[workspace] || {};
  const visibleTabs = ADMIN_TABS.filter((tab) => !isReadOnly || !tab.writeRequired);

  return (
    <div className="min-h-[100dvh] bg-base-200 text-base-content">
      <header className="sticky top-0 z-30 border-b border-base-300 bg-base-100">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-3 py-2 sm:gap-2.5 sm:px-6 sm:py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => navigateTo('/')}
                className="icon-button btn btn-sm btn-square btn-ghost border border-base-300 shrink-0"
                title="Kembali"
                aria-label="Kembali ke beranda"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>

              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-sm font-semibold text-base-content sm:text-base">
                  {wsMeta.shortLabel} · Admin
                </h1>
                <span className="hidden badge badge-ghost badge-sm border-base-300 font-normal text-base-content/75 sm:inline-flex">
                  {isReadOnly
                    ? `Read-Only (${currentUser?.username || 'admin'})`
                    : currentUser?.username || 'admin'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 lg:hidden">
              <button
                type="button"
                onClick={() => navigateTo(wsMeta.livePath)}
                className="btn btn-sm btn-primary font-medium gap-1 px-2.5"
                title={`Buka Kamera ${wsMeta.shortLabel}`}
              >
                <Camera className="h-3.5 w-3.5" />
                <span className="text-xs">Kamera</span>
              </button>
              <ThemePicker compact />
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 lg:flex-wrap lg:overflow-visible lg:pb-0">
            <button
              type="button"
              onClick={() => navigateTo(wsMeta.livePath)}
              className="hidden lg:inline-flex btn btn-sm btn-primary font-medium gap-1.5 shrink-0"
            >
              <Camera className="h-3.5 w-3.5" />
              <span>Kamera {wsMeta.shortLabel}</span>
            </button>

            <div className="join shrink-0">
              {workspaceList.map((wsKey) => {
                const itemMeta = getWorkspaceMeta(wsKey);
                const active = workspace === wsKey;
                return (
                  <button
                    key={wsKey}
                    type="button"
                    onClick={() => navigateTo(itemMeta.adminPath, activeTab)}
                    className={`btn btn-sm join-item font-medium whitespace-nowrap ${
                      active
                        ? 'btn-neutral'
                        : 'btn-ghost border border-base-300 font-normal'
                    }`}
                  >
                    {itemMeta.shortLabel}
                  </button>
                );
              })}
            </div>

            {actualRole === 'admin' && (
              <button
                type="button"
                aria-pressed={previewReadOnly}
                onClick={() => setPreviewReadOnly((v) => !v)}
                className={`icon-button btn btn-sm font-medium gap-1.5 shrink-0 whitespace-nowrap ${
                  previewReadOnly
                    ? 'btn-warning'
                    : 'btn-ghost border border-base-300'
                }`}
                title="Mode Read-Only"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>{previewReadOnly ? 'Keluar Read-Only' : 'Mode Baca'}</span>
              </button>
            )}

            <div className="shrink-0">
              <AiEnginePill
                aiMode={aiMode}
                onSelectMode={setAiMode}
                serverHealth={serverHealth}
                useServerAi={useServerAi}
                telemetry={telemetry}
                compact
              />
            </div>

            <span
              className={`inline-flex btn btn-sm btn-ghost pointer-events-none border font-normal text-xs gap-1.5 shrink-0 whitespace-nowrap ${
                dbStatus.connected
                  ? 'border-base-300 text-success'
                  : 'border-base-300 text-warning'
              }`}
            >
              <Database className="h-3.5 w-3.5" />
              <span>{dbStatus.connected ? 'Terhubung' : 'Offline'}</span>
            </span>

            <div className="hidden lg:block shrink-0">
              <ThemePicker compact />
            </div>

            <button
              type="button"
              onClick={() => setPwdModalOpen(true)}
              className="btn btn-sm btn-ghost border border-base-300 font-normal gap-1.5 shrink-0 whitespace-nowrap"
              title="Ganti password"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>Password</span>
            </button>

            {config.authEnabled && (
              <button
                type="button"
                onClick={logoutAdmin}
                className="btn btn-sm btn-ghost border border-base-300 text-error hover:bg-error/10 font-normal gap-1.5 shrink-0 whitespace-nowrap"
                title="Keluar"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Keluar</span>
              </button>
            )}
          </div>
        </div>

        <div className="hidden md:block mx-auto max-w-7xl border-t border-base-200 px-4 sm:px-6">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Navigasi Admin">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition ${
                    active
                      ? 'border-primary text-primary font-semibold'
                      : 'border-transparent text-base-content/65 hover:border-base-300 hover:text-base-content'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{config.tabs?.[tab.id] || tab.fallback}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-3 py-4 pb-20 sm:space-y-6 sm:px-6 sm:py-6 md:pb-6">
        {isReadOnly && (
          <div className="alert border border-warning/40 bg-warning/10 text-xs sm:text-sm">
            <Eye className="h-4 w-4 shrink-0 text-warning" />
            <span>
              <strong>Mode Read-Only Aktif:</strong> Anda dapat melihat daftar {wsMeta.memberNoun.toLowerCase()}, memantau kamera live, serta mengunduh laporan CSV &amp; PDF tanpa izin mengubah atau menghapus data.
            </span>
          </div>
        )}

        {modelsError && (
          <div className="alert alert-error text-sm">
            <span>Gagal memuat model pengenalan wajah: {modelsError}</span>
          </div>
        )}

        {/* Dynamic Sections targeting this workspace */}
        {activeTab !== 'cpanel' && (
          <DynamicSections target={workspace} onNavigate={(url) => navigateTo(url)} />
        )}

        {activeTab === 'admin' && (
          <AdminDashboard
            workspace={workspace}
            readOnly={isReadOnly}
            modelsReady={modelsReady}
            onGoToRegister={() => setActiveTab('register')}
            onDataChanged={bumpDataVersion}
          />
        )}

        {activeTab === 'register' && !isReadOnly && (
          <FaceRegistration
            workspace={workspace}
            modelsReady={modelsReady}
            prefillFace={prefillFace}
            onClearPrefill={() => setPrefillFace(null)}
            onUserRegistered={bumpDataVersion}
            onGoToLive={() => navigateTo(wsMeta.livePath)}
          />
        )}

        {activeTab === 'reports' && <ReportsSummary workspace={workspace} readOnly={isReadOnly} />}

        {activeTab === 'live' && (
          <LiveMonitor
            workspace={workspace}
            modelsReady={modelsReady}
            matcherVersion={matcherVersion}
            onQuickRegister={isReadOnly ? undefined : handleQuickRegister}
            onDataChanged={bumpDataVersion}
          />
        )}

        {activeTab === 'cpanel' && !isReadOnly && (
          <CPanelSettings onNavigate={(url) => navigateTo(url)} />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-base-300 bg-base-100 md:hidden"
        aria-label="Navigasi Bawah Admin"
      >
        <div
          className="grid h-14 items-stretch"
          style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}
        >
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`relative flex flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition ${
                  active
                    ? 'text-primary font-semibold'
                    : 'text-base-content/60 hover:text-base-content'
                }`}
              >
                {active && (
                  <span className="absolute inset-x-3 top-0 h-0.5 rounded-b bg-primary" />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate max-w-full">{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <ChangePasswordModal open={pwdModalOpen} onClose={() => setPwdModalOpen(false)} />
    </div>
  );
}
