import React, { useEffect, useState } from 'react';
import {
  Check,
  KeyRound,
  LayoutGrid,
  Palette,
  RotateCcw,
  Save,
  Shield,
  Trash2,
  Type,
  UserPlus,
  Users,
} from 'lucide-react';
import { DAISY_THEMES, useSiteConfig } from '../context/SiteConfigContext.jsx';
import DynamicSections from './DynamicSections.jsx';

export default function CPanelSettings({ onNavigate }) {
  const {
    config,
    activeTheme,
    setActiveTheme,
    persistConfig,
    manageAccount,
    resetConfig,
    savingConfig,
    saveNotice,
  } = useSiteConfig();

  const [draft, setDraft] = useState(config);
  const [newPassword, setNewPassword] = useState('');
  const [newAcc, setNewAcc] = useState({
    username: '',
    displayName: '',
    role: 'viewer',
    password: '',
  });
  const [accountResetPwd, setAccountResetPwd] = useState({});
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const setField = (key, val) => {
    setDraft((prev) => ({ ...prev, [key]: val }));
  };

  const setTabField = (key, val) => {
    setDraft((prev) => ({
      ...prev,
      tabs: { ...(prev.tabs || {}), [key]: val },
    }));
  };

  const setWorkspaceField = (ws, key, val) => {
    setDraft((prev) => ({
      ...prev,
      workspaces: {
        ...(prev.workspaces || {}),
        [ws]: { ...(prev.workspaces?.[ws] || {}), [key]: val },
      },
    }));
  };

  const setWorkspaceHighlight = (ws, idx, val) => {
    const existing = Array.isArray(draft.workspaces?.[ws]?.highlights)
      ? [...draft.workspaces[ws].highlights]
      : ['', '', ''];
    existing[idx] = val;
    setWorkspaceField(ws, 'highlights', existing);
  };

  const handleSaveAll = async (e) => {
    e?.preventDefault();
    setFeedback('');
    try {
      const payload = { ...draft };
      if (newPassword.trim()) {
        if (newPassword.trim().length < 4) {
          setFeedback('Password baru minimal 4 karakter.');
          return;
        }
        payload.newPassword = newPassword.trim();
      }
      await persistConfig(payload, 'Semua pengaturan cPanel tersimpan ke MongoDB');
      setNewPassword('');
      setFeedback('Pengaturan berhasil disimpan ke MongoDB!');
    } catch (err) {
      setFeedback(err.message || 'Gagal menyimpan pengaturan');
    }
  };

  const handleToggleAuth = async (checked) => {
    setField('authEnabled', checked);
    try {
      await persistConfig(
        { authEnabled: checked },
        checked ? 'Login /admin & /cpanel diaktifkan' : 'Login /admin & /cpanel dimatikan'
      );
    } catch (err) {
      setFeedback(err.message || 'Gagal mengubah status login');
    }
  };

  const handleAddAccount = async (e) => {
    e.preventDefault();
    setFeedback('');
    try {
      await manageAccount({
        action: 'upsert',
        username: newAcc.username,
        displayName: newAcc.displayName,
        role: newAcc.role,
        password: newAcc.password,
      });
      setNewAcc({ username: '', displayName: '', role: 'viewer', password: '' });
      setFeedback('Akun baru berhasil ditambahkan ke MongoDB.');
    } catch (err) {
      setFeedback(err.message || 'Gagal menambahkan akun');
    }
  };

  const handleUpdateAccountRole = async (acc, nextRole) => {
    setFeedback('');
    try {
      await manageAccount({
        action: 'upsert',
        id: acc.id,
        username: acc.username,
        displayName: acc.displayName,
        role: nextRole,
        isActive: acc.isActive,
      });
    } catch (err) {
      setFeedback(err.message || 'Gagal mengubah role akun');
    }
  };

  const handleResetAccountPassword = async (acc) => {
    const pwd = (accountResetPwd[acc.id] || '').trim();
    if (pwd.length < 4) {
      setFeedback('Password baru minimal 4 karakter.');
      return;
    }
    setFeedback('');
    try {
      await manageAccount({
        action: 'upsert',
        id: acc.id,
        username: acc.username,
        displayName: acc.displayName,
        role: acc.role,
        password: pwd,
        isActive: acc.isActive,
      });
      setAccountResetPwd((p) => ({ ...p, [acc.id]: '' }));
      setFeedback(`Password akun "${acc.username}" berhasil diganti.`);
    } catch (err) {
      setFeedback(err.message || 'Gagal mengganti password akun');
    }
  };

  const handleDeleteAccount = async (acc) => {
    setFeedback('');
    try {
      await manageAccount({ action: 'delete', id: acc.id });
      setFeedback(`Akun "${acc.username}" dihapus.`);
    } catch (err) {
      setFeedback(err.message || 'Gagal menghapus akun');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="badge badge-primary badge-sm font-bold">cPanel &amp; CMS</span>
              {saveNotice && (
                <span className="badge badge-success badge-sm gap-1">
                  <Check className="h-3 w-3" />
                  {saveNotice}
                </span>
              )}
            </div>
            <h2 className="mt-1 text-lg font-bold text-base-content sm:text-xl">
              Pusat Pengaturan Website, Tema DaisyUI &amp; Section Dinamis
            </h2>
            <p className="text-xs text-base-content/70 sm:text-sm">
              Atur proteksi login `/admin` &amp; `/cpanel`, pilih tema DaisyUI, ubah semua teks, serta kelola section tambahan.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={resetConfig}
              disabled={savingConfig}
              className="btn btn-sm btn-outline border-base-300 gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Default
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={savingConfig}
              className="btn btn-sm btn-primary gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              {savingConfig ? 'Menyimpan...' : 'Simpan Semua Perubahan'}
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="alert alert-info py-3 text-sm">
          <span>{feedback}</span>
        </div>
      )}

      {/* 1. Keamanan & Toggle Enable / Disable Login */}
      <section className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-base-content">
                  Keamanan &amp; Proteksi Login (`/admin` &amp; `/cpanel`)
                </h3>
                <p className="text-xs text-base-content/70">
                  Aktifkan agar halaman Admin &amp; cPanel meminta login. Matikan jika ingin akses langsung tanpa login.
                </p>
              </div>
            </div>

            <label className="label cursor-pointer gap-3 rounded-xl border border-base-300 bg-base-200 px-4 py-2.5 shrink-0">
              <span className="label-text text-xs font-bold">
                {draft.authEnabled ? 'Login Aktif (Wajib Login)' : 'Login Dimatikan (Bebas Akses)'}
              </span>
              <input
                type="checkbox"
                checked={Boolean(draft.authEnabled)}
                onChange={(e) => handleToggleAuth(e.target.checked)}
                className="toggle toggle-primary"
              />
            </label>
          </div>

          {/* Sub-card: Kredensial Login Utama */}
          <div className="rounded-box border border-base-300 bg-base-200/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-base-content/80">
                Kredensial Login Utama
              </h4>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="form-control">
                <span className="label-text mb-1 text-xs font-semibold">Username Admin</span>
                <input
                  type="text"
                  value={draft.adminUsername || ''}
                  onChange={(e) => setField('adminUsername', e.target.value)}
                  placeholder="admin"
                  className="input input-bordered input-sm w-full bg-base-100"
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1 text-xs font-semibold">
                  Password Baru (kosongkan jika tetap)
                </span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 4 karakter"
                  className="input input-bordered input-sm w-full bg-base-100"
                />
              </label>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={savingConfig}
                className="btn btn-sm btn-primary gap-1.5 shadow-sm"
              >
                <Save className="h-3.5 w-3.5" />
                Simpan Kredensial Utama
              </button>
            </div>
          </div>

          {/* Manajemen Akun & Mode Role (Admin vs Read-Only) */}
          <div className="space-y-3 border-t border-base-300 pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-bold text-base-content">
                Manajemen Akun &amp; Role (Admin vs Mode Read-Only)
              </h4>
            </div>

            <div className="overflow-x-auto rounded-box border border-base-300">
              <table className="table table-sm w-full">
                <thead>
                  <tr className="bg-base-200 text-xs">
                    <th>Username</th>
                    <th>Nama Tampilan</th>
                    <th>Role Akses</th>
                    <th>Ganti Password</th>
                    <th className="text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {(config.accounts || []).map((acc) => (
                    <tr key={acc.id}>
                      <td className="font-bold text-xs">{acc.username}</td>
                      <td className="text-xs opacity-80">{acc.displayName}</td>
                      <td>
                        <select
                          value={acc.role}
                          onChange={(e) => handleUpdateAccountRole(acc, e.target.value)}
                          className="select select-bordered select-xs"
                        >
                          <option value="admin">Admin (Full Akses)</option>
                          <option value="viewer">Read-Only (Mode Baca)</option>
                        </select>
                      </td>
                      <td>
                        <div className="join">
                          <input
                            type="password"
                            value={accountResetPwd[acc.id] || ''}
                            onChange={(e) =>
                              setAccountResetPwd((p) => ({ ...p, [acc.id]: e.target.value }))
                            }
                            placeholder="Password baru"
                            className="input input-bordered input-xs join-item w-28 bg-base-100"
                          />
                          <button
                            type="button"
                            onClick={() => handleResetAccountPassword(acc)}
                            className="btn btn-xs btn-neutral join-item"
                          >
                            Ubah
                          </button>
                        </div>
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteAccount(acc)}
                          className="btn btn-ghost btn-xs text-error hover:bg-error/10"
                          title="Hapus akun"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form
              onSubmit={handleAddAccount}
              className="rounded-box border border-base-300 bg-base-200/40 p-4 space-y-3"
            >
              <div className="flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-base-content/80">
                  Tambah Akun Pengguna Baru
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4">
                <label className="form-control">
                  <span className="label-text mb-1 text-[11px] font-semibold">Username</span>
                  <input
                    type="text"
                    required
                    value={newAcc.username}
                    onChange={(e) => setNewAcc((a) => ({ ...a, username: e.target.value }))}
                    placeholder="mis: pendeta"
                    className="input input-bordered input-sm bg-base-100"
                  />
                </label>
                <label className="form-control">
                  <span className="label-text mb-1 text-[11px] font-semibold">Nama Tampilan</span>
                  <input
                    type="text"
                    value={newAcc.displayName}
                    onChange={(e) => setNewAcc((a) => ({ ...a, displayName: e.target.value }))}
                    placeholder="mis: Pdt. Yohanes"
                    className="input input-bordered input-sm bg-base-100"
                  />
                </label>
                <label className="form-control">
                  <span className="label-text mb-1 text-[11px] font-semibold">Role Akses</span>
                  <select
                    value={newAcc.role}
                    onChange={(e) => setNewAcc((a) => ({ ...a, role: e.target.value }))}
                    className="select select-bordered select-sm bg-base-100 font-medium"
                  >
                    <option value="viewer">Read-Only (Mode Baca)</option>
                    <option value="admin">Admin (Full Akses)</option>
                  </select>
                </label>
                <label className="form-control">
                  <span className="label-text mb-1 text-[11px] font-semibold">Password</span>
                  <input
                    type="password"
                    required
                    value={newAcc.password}
                    onChange={(e) => setNewAcc((a) => ({ ...a, password: e.target.value }))}
                    placeholder="Minimal 4 karakter"
                    className="input input-bordered input-sm bg-base-100"
                  />
                </label>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="btn btn-sm btn-primary gap-1.5 shadow-sm"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Tambah Akun
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* 2. DaisyUI Theme Controller (Dropdown default + collapsible gallery) */}
      <section className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-3 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <Palette className="h-5 w-5 text-primary shrink-0" />
              <div>
                <h3 className="text-base font-bold text-base-content">
                  Tema DaisyUI ({DAISY_THEMES.length} Pilihan)
                </h3>
                <p className="text-xs text-base-content/70">
                  Pilih tema lewat dropdown di samping atau buka pratinjau semua tema jika ingin melihat warna.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold opacity-70">Tema Aktif:</span>
              <select
                value={activeTheme}
                onChange={(e) => setActiveTheme(e.target.value)}
                className="select select-bordered select-sm min-w-[160px] capitalize font-semibold"
              >
                {DAISY_THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} {t.isDark ? '(Dark)' : '(Light)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="collapse collapse-arrow border border-base-300 bg-base-200/50">
            <input type="checkbox" />
            <div className="collapse-title text-xs font-bold">
              Lihat Preview Semua Tema ({DAISY_THEMES.length})
            </div>
            <div className="collapse-content">
              <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {DAISY_THEMES.map((t) => {
                  const selected = activeTheme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      data-theme={t.id}
                      onClick={() => setActiveTheme(t.id)}
                      className={`border-base-content/20 hover:border-base-content/40 overflow-hidden rounded-lg border text-left transition ${
                        selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-base-100' : ''
                      }`}
                    >
                      <div className="bg-base-100 text-base-content w-full cursor-pointer font-sans">
                        <div className="grid grid-cols-5 grid-rows-3">
                          <div className="bg-base-200 col-start-1 row-span-2 row-start-1" />
                          <div className="bg-base-300 col-start-1 row-start-3" />
                          <div className="bg-base-100 col-span-4 col-start-2 row-span-3 row-start-1 flex flex-col gap-1 p-2">
                            <div className="flex items-center justify-between text-xs font-bold capitalize">
                              <span className="truncate">{t.label}</span>
                              {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <div className="bg-primary flex aspect-square w-4 items-center justify-center rounded lg:w-5">
                                <span className="text-primary-content text-[10px] font-bold">A</span>
                              </div>
                              <div className="bg-secondary flex aspect-square w-4 items-center justify-center rounded lg:w-5">
                                <span className="text-secondary-content text-[10px] font-bold">A</span>
                              </div>
                              <div className="bg-accent flex aspect-square w-4 items-center justify-center rounded lg:w-5">
                                <span className="text-accent-content text-[10px] font-bold">A</span>
                              </div>
                              <div className="bg-neutral flex aspect-square w-4 items-center justify-center rounded lg:w-5">
                                <span className="text-neutral-content text-[10px] font-bold">A</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Dynamic Sections Builder (+ Add Section) */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <LayoutGrid className="h-5 w-5 text-primary" />
          <h3 className="text-base font-bold text-base-content">
            Section Builder (Portal, Ruang Gereja &amp; Piloting)
          </h3>
        </div>
        <DynamicSections showAllTargets canManage onNavigate={onNavigate} />
      </section>

      {/* 4. Editor Semua Tulisan Website */}
      <form onSubmit={handleSaveAll} className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Type className="h-5 w-5 text-primary" />
            <h3 className="text-base font-bold text-base-content">
              Editor Semua Tulisan Website (Dynamic Texts)
            </h3>
          </div>
          <button type="submit" disabled={savingConfig} className="btn btn-sm btn-primary gap-1.5">
            <Save className="h-3.5 w-3.5" />
            Simpan Teks
          </button>
        </div>

        {/* Group A: Portal Utama */}
        <div className="collapse collapse-arrow border border-base-300 bg-base-100">
          <input type="checkbox" defaultChecked />
          <div className="collapse-title text-sm font-bold">
            1. Teks Halaman Portal Utama (/)
          </div>
          <div className="collapse-content space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="form-control">
                <span className="label-text mb-1 text-xs font-semibold">Nama Brand</span>
                <input
                  type="text"
                  value={draft.brandName || ''}
                  onChange={(e) => setField('brandName', e.target.value)}
                  className="input input-bordered input-sm"
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1 text-xs font-semibold">Judul Navbar Portal</span>
                <input
                  type="text"
                  value={draft.portalTitle || ''}
                  onChange={(e) => setField('portalTitle', e.target.value)}
                  className="input input-bordered input-sm"
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1 text-xs font-semibold">Eyebrow / Badge Atas</span>
                <input
                  type="text"
                  value={draft.portalEyebrow || ''}
                  onChange={(e) => setField('portalEyebrow', e.target.value)}
                  className="input input-bordered input-sm"
                />
              </label>
            </div>
            <label className="form-control">
              <span className="label-text mb-1 text-xs font-semibold">Heading Utama Portal</span>
              <input
                type="text"
                value={draft.portalHeading || ''}
                onChange={(e) => setField('portalHeading', e.target.value)}
                className="input input-bordered input-sm"
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1 text-xs font-semibold">Deskripsi Portal</span>
              <textarea
                rows={2}
                value={draft.portalDescription || ''}
                onChange={(e) => setField('portalDescription', e.target.value)}
                className="textarea textarea-bordered textarea-sm"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="form-control">
                <span className="label-text mb-1 text-xs font-semibold">Footer Kiri</span>
                <input
                  type="text"
                  value={draft.portalFooter || ''}
                  onChange={(e) => setField('portalFooter', e.target.value)}
                  className="input input-bordered input-sm"
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1 text-xs font-semibold">Footer Kanan / Quick URL</span>
                <input
                  type="text"
                  value={draft.portalQuickHint || ''}
                  onChange={(e) => setField('portalQuickHint', e.target.value)}
                  className="input input-bordered input-sm"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Group B: Ruang Gereja & Mode Piloting */}
        {['gereja', 'piloting'].map((wsKey, idx) => {
          const ws = draft.workspaces?.[wsKey] || {};
          const highlights = Array.isArray(ws.highlights) ? ws.highlights : ['', '', ''];
          return (
            <div key={wsKey} className="collapse collapse-arrow border border-base-300 bg-base-100">
              <input type="checkbox" />
              <div className="collapse-title text-sm font-bold">
                {idx + 2}. Teks Kartu, Admin &amp; Kamera — {wsKey === 'gereja' ? 'Ruang Gereja' : 'Mode Piloting'}
              </div>
              <div className="collapse-content space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="form-control">
                    <span className="label-text mb-1 text-xs font-semibold">Label Singkat</span>
                    <input
                      type="text"
                      value={ws.shortLabel || ''}
                      onChange={(e) => setWorkspaceField(wsKey, 'shortLabel', e.target.value)}
                      className="input input-bordered input-sm"
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-xs font-semibold">Eyebrow Kartu</span>
                    <input
                      type="text"
                      value={ws.eyebrow || ''}
                      onChange={(e) => setWorkspaceField(wsKey, 'eyebrow', e.target.value)}
                      className="input input-bordered input-sm"
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-xs font-semibold">Judul Kartu</span>
                    <input
                      type="text"
                      value={ws.title || ''}
                      onChange={(e) => setWorkspaceField(wsKey, 'title', e.target.value)}
                      className="input input-bordered input-sm"
                    />
                  </label>
                </div>

                <label className="form-control">
                  <span className="label-text mb-1 text-xs font-semibold">Subjudul Kartu</span>
                  <input
                    type="text"
                    value={ws.subtitle || ''}
                    onChange={(e) => setWorkspaceField(wsKey, 'subtitle', e.target.value)}
                    className="input input-bordered input-sm"
                  />
                </label>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="form-control">
                    <span className="label-text mb-1 text-xs font-semibold">Tombol Utama Kartu</span>
                    <input
                      type="text"
                      value={ws.primaryButton || ''}
                      onChange={(e) => setWorkspaceField(wsKey, 'primaryButton', e.target.value)}
                      className="input input-bordered input-sm"
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-xs font-semibold">Tombol Admin Kartu</span>
                    <input
                      type="text"
                      value={ws.secondaryButton || ''}
                      onChange={(e) => setWorkspaceField(wsKey, 'secondaryButton', e.target.value)}
                      className="input input-bordered input-sm"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="form-control">
                    <span className="label-text mb-1 text-xs font-semibold">Judul Header Admin</span>
                    <input
                      type="text"
                      value={ws.adminTitle || ''}
                      onChange={(e) => setWorkspaceField(wsKey, 'adminTitle', e.target.value)}
                      className="input input-bordered input-sm"
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-xs font-semibold">Subjudul Header Admin</span>
                    <input
                      type="text"
                      value={ws.adminSubtitle || ''}
                      onChange={(e) => setWorkspaceField(wsKey, 'adminSubtitle', e.target.value)}
                      className="input input-bordered input-sm"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="form-control">
                    <span className="label-text mb-1 text-xs font-semibold">Judul Layar Kamera</span>
                    <input
                      type="text"
                      value={ws.cameraReadyTitle || ''}
                      onChange={(e) => setWorkspaceField(wsKey, 'cameraReadyTitle', e.target.value)}
                      className="input input-bordered input-sm"
                    />
                  </label>
                  <label className="form-control">
                    <span className="label-text mb-1 text-xs font-semibold">Deskripsi Layar Kamera</span>
                    <input
                      type="text"
                      value={ws.cameraReadySubtitle || ''}
                      onChange={(e) => setWorkspaceField(wsKey, 'cameraReadySubtitle', e.target.value)}
                      className="input input-bordered input-sm"
                    />
                  </label>
                </div>

                <div className="space-y-2 pt-1">
                  <span className="label-text text-xs font-semibold block">Poin-poin Fitur Kartu</span>
                  {[0, 1, 2].map((hIdx) => (
                    <input
                      key={hIdx}
                      type="text"
                      value={highlights[hIdx] || ''}
                      onChange={(e) => setWorkspaceHighlight(wsKey, hIdx, e.target.value)}
                      placeholder={`Poin ${hIdx + 1}`}
                      className="input input-bordered input-sm w-full"
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {/* Group C: Label 5 Tab Navigasi Admin */}
        <div className="collapse collapse-arrow border border-base-300 bg-base-100">
          <input type="checkbox" />
          <div className="collapse-title text-sm font-bold">
            4. Teks Label Tab Navigasi Admin
          </div>
          <div className="collapse-content">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
              {[
                ['admin', 'Tab 1 (Dashboard)'],
                ['register', 'Tab 2 (Registrasi)'],
                ['reports', 'Tab 3 (Laporan)'],
                ['live', 'Tab 4 (Live Monitor)'],
                ['cpanel', 'Tab 5 (cPanel)'],
              ].map(([k, lbl]) => (
                <label key={k} className="form-control">
                  <span className="label-text mb-1 text-xs font-semibold">{lbl}</span>
                  <input
                    type="text"
                    value={draft.tabs?.[k] || ''}
                    onChange={(e) => setTabField(k, e.target.value)}
                    className="input input-bordered input-sm"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
