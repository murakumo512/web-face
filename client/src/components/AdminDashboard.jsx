import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Edit3,
  ImagePlus,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import { api } from '../services/api.js';
import { formatWilayahLabel, getWorkspaceMeta } from './BrandLogo.jsx';
import { useSiteConfig } from '../context/SiteConfigContext.jsx';
import { captureFaceCropBase64, detectAllFacesWithDescriptors } from '../services/faceService.js';
import LogEntryModal from './LogEntryModal.jsx';

export default function AdminDashboard({ workspace = 'piloting', readOnly = false, modelsReady, onGoToRegister, onDataChanged }) {
  const { config } = useSiteConfig();
  const wsMeta = getWorkspaceMeta(workspace);
  const roleOptions =
    Array.isArray(config.workspaces?.[workspace]?.roleOptions) &&
    config.workspaces[workspace].roleOptions.length > 0
      ? config.workspaces[workspace].roleOptions
      : wsMeta.roleOptions;
  const [subTab, setSubTab] = useState('users'); // 'users' | 'logs'
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'true' | 'false'

  // Edit Modal state
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    identifier: '',
    department: '',
    wilayah: '',
    role: '',
    isActive: true,
  });
  const [extraDescriptor, setExtraDescriptor] = useState(null);
  const [extraPhoto, setExtraPhoto] = useState('');
  const [extraFaceMsg, setExtraFaceMsg] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [logModalState, setLogModalState] = useState({
    open: false,
    mode: 'edit',
    initialLog: null,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const userParams = { search };
      if (activeFilter !== 'all') userParams.activeOnly = activeFilter;

      const [usersRes, logsRes] = await Promise.all([
        api.getUsers(userParams, workspace),
        api.getLogs({ limit: 50 }, workspace),
      ]);
      setUsers(usersRes.users || []);
      setLogs(logsRes.logs || []);
    } catch (err) {
      setErrorMsg(err.message || 'Gagal memuat data admin');
    } finally {
      setLoading(false);
    }
  }, [activeFilter, search, workspace]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openEditModal = (user) => {
    setEditingUser(user);
    setEditForm({
      name: user.name || '',
      identifier: user.identifier || '',
      department: user.department || wsMeta.defaultDepartment,
      wilayah: user.wilayah || '',
      role: user.role || wsMeta.defaultRole,
      isActive: Boolean(user.isActive),
    });
    setExtraDescriptor(null);
    setExtraPhoto('');
    setExtraFaceMsg('');
  };

  const handleAddSamplePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !modelsReady) return;
    setExtraFaceMsg('Mendeteksi wajah dari foto...');

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        try {
          const dets = await detectAllFacesWithDescriptors(img, { minConfidence: 0.5 });
          if (dets.length !== 1) {
            setExtraFaceMsg(
              dets.length === 0
                ? 'Tidak ada wajah terdeteksi pada foto.'
                : 'Harus ada tepat 1 wajah pada foto.'
            );
            return;
          }
          setExtraDescriptor(Array.from(dets[0].descriptor));
          setExtraPhoto(captureFaceCropBase64(img, dets[0].detection.box, 200));
          setExtraFaceMsg('Sampel wajah baru siap ditambahkan saat Simpan.');
        } catch (err) {
          setExtraFaceMsg(`Error: ${err.message}`);
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);
    try {
      const payload = { ...editForm };
      if (extraDescriptor) {
        payload.newDescriptor = extraDescriptor;
        if (extraPhoto) payload.photoBase64 = extraPhoto;
      }
      await api.updateUser(editingUser._id, payload);
      setEditingUser(null);
      await loadData();
      onDataChanged?.();
    } catch (err) {
      alert(err.message || 'Gagal memperbarui pengguna');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleActive = async (user) => {
    try {
      await api.updateUser(user._id, { isActive: !user.isActive });
      await loadData();
      onDataChanged?.();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Hapus pengguna "${user.name}" beserta data wajahnya dari MongoDB?`)) {
      return;
    }
    try {
      await api.deleteUser(user._id);
      await loadData();
      onDataChanged?.();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteLog = async (log) => {
    if (!window.confirm(`Hapus log masuk "${log.personName}"?`)) return;
    try {
      await api.deleteLog(log._id);
      await loadData();
      onDataChanged?.();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="join w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setSubTab('users')}
            className={`btn btn-sm join-item flex-1 sm:flex-none font-medium ${
              subTab === 'users'
                ? 'btn-primary'
                : 'btn-ghost border border-base-300'
            }`}
          >
            {wsMeta.memberNoun} ({users.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('logs')}
            className={`btn btn-sm join-item flex-1 sm:flex-none font-medium ${
              subTab === 'logs'
                ? 'btn-primary'
                : 'btn-ghost border border-base-300'
            }`}
          >
            Kelola Log ({logs.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="btn btn-sm btn-ghost border border-base-300 gap-1.5 flex-1 sm:flex-none"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {!readOnly && subTab === 'logs' && (
            <button
              type="button"
              onClick={() => setLogModalState({ open: true, mode: 'create', initialLog: null })}
              className="btn btn-sm btn-ghost border border-base-300 gap-1.5 flex-1 sm:flex-none"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tambah Log Manual</span>
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => onGoToRegister?.()}
              className="btn btn-sm btn-primary gap-1.5 shadow-sm flex-1 sm:flex-none"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Tambah {wsMeta.memberNoun}</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="alert alert-error py-2.5 text-xs">
          <span>{errorMsg}</span>
        </div>
      )}

      {subTab === 'users' ? (
        <div className="space-y-4">
          {/* Search & Filter */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Cari nama, nomor induk, atau bagian di ${wsMeta.shortLabel}...`}
                className="input input-bordered input-sm w-full pl-9"
              />
            </div>

            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="select select-bordered select-sm font-medium"
            >
              <option value="all">Semua Status</option>
              <option value="true">Aktif Saja</option>
              <option value="false">Nonaktif Saja</option>
            </select>
          </div>

          {/* Users Container */}
          <div className="overflow-hidden rounded-box border border-base-300 bg-base-100">
            {/* Mobile Cards (Zero horizontal scroll) */}
            <div className="divide-y divide-base-300 md:hidden">
              {users.length === 0 ? (
                <div className="px-4 py-10 text-center text-xs text-base-content/50">
                  Belum ada data pengguna terdaftar di MongoDB.
                </div>
              ) : (
                users.map((u) => (
                  <div key={u._id} className="space-y-2.5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {u.photoBase64 ? (
                          <img
                            src={u.photoBase64}
                            alt={u.name}
                            className="h-11 w-11 shrink-0 rounded-box object-cover ring-1 ring-base-300"
                          />
                        ) : (
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-box bg-base-200 text-base-content/50">
                            <UserCheck className="h-5 w-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-base-content">
                            {u.name}
                          </div>
                          <div className="text-xs text-base-content/60">
                            {u.identifier || '-'} • {u.department} ({u.role}){u.wilayah ? ` • ${formatWilayahLabel(u.wilayah)}` : ''}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => !readOnly && handleToggleActive(u)}
                        className={`badge badge-sm shrink-0 whitespace-nowrap font-medium ${
                          u.isActive
                            ? 'badge-success badge-outline'
                            : 'badge-ghost'
                        } ${readOnly ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
                      >
                        {u.isActive ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <span className="badge badge-outline badge-sm whitespace-nowrap font-medium">
                        {u.descriptorCount || 1} descriptor
                      </span>
                      {!readOnly && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(u)}
                            className="btn btn-xs btn-ghost border border-base-300 gap-1"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            className="btn btn-xs btn-ghost border border-base-300 text-error gap-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Hapus
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="table table-sm w-full">
                <thead className="bg-base-200/70 text-xs uppercase text-base-content/60">
                  <tr>
                    <th>Wajah &amp; Nama</th>
                    <th>ID / NIM / NIP</th>
                    <th>Divisi / Peran</th>
                    <th>Sampel Wajah</th>
                    <th>Status</th>
                    <th className="text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-xs text-base-content/50">
                        Belum ada data pengguna terdaftar di MongoDB.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u._id} className="hover">
                        <td>
                          <div className="flex items-center gap-3">
                            {u.photoBase64 ? (
                              <img
                                src={u.photoBase64}
                                alt={u.name}
                                className="h-10 w-10 rounded-box object-cover ring-1 ring-base-300"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-box bg-base-200 text-base-content/50">
                                <UserCheck className="h-5 w-5" />
                              </div>
                            )}
                            <div>
                              <div className="font-semibold text-base-content">
                                {u.name}
                              </div>
                              <div className="text-[11px] text-base-content/50">
                                Daftar:{' '}
                                {new Date(u.createdAt).toLocaleDateString('id-ID', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="text-xs text-base-content/75">
                          {u.identifier || '-'}
                        </td>
                        <td className="text-xs">
                          <div className="text-base-content">{u.department}</div>
                          <div className="text-base-content/60">
                            {u.role}{u.wilayah ? ` • ${formatWilayahLabel(u.wilayah)}` : ''}
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-outline badge-sm whitespace-nowrap font-medium">
                            {u.descriptorCount || 1} descriptor
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => !readOnly && handleToggleActive(u)}
                            className={`badge badge-sm whitespace-nowrap font-medium ${
                              u.isActive
                                ? 'badge-success badge-outline'
                                : 'badge-ghost'
                            } ${readOnly ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
                          >
                            {u.isActive ? 'Aktif' : 'Nonaktif'}
                          </button>
                        </td>
                        <td className="text-right">
                          {readOnly ? (
                            <span className="text-[11px] opacity-50">Read-Only</span>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditModal(u)}
                                className="btn btn-xs btn-ghost btn-square"
                                title="Edit Data & Tambah Sampel Wajah"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                className="btn btn-xs btn-ghost btn-square text-error"
                                title="Hapus dari MongoDB"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Logs Management Tab */
        <div className="overflow-hidden rounded-box border border-base-300 bg-base-100">
          {/* Mobile Log Cards (Zero horizontal scroll) */}
          <div className="divide-y divide-base-300 md:hidden">
            {logs.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-base-content/50">
                Belum ada log masuk tercatat.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log._id} className="flex items-start gap-3 p-4">
                  {log.snapshotBase64 ? (
                    <img
                      src={log.snapshotBase64}
                      alt={log.personName}
                      className="h-10 w-10 shrink-0 rounded-box object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-box bg-base-200 text-base-content/50">
                      {log.status === 'REGISTERED' ? (
                        <UserCheck className="h-4 w-4" />
                      ) : (
                        <UserX className="h-4 w-4" />
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-semibold text-base-content">
                        {log.personName}
                      </div>
                      {!readOnly && (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setLogModalState({ open: true, mode: 'edit', initialLog: log })}
                            className="btn btn-xs btn-ghost btn-square"
                            title="Edit Log"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLog(log)}
                            className="btn btn-xs btn-ghost btn-square text-error"
                            title="Hapus Log"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="text-[11px] text-base-content/60">
                      {new Date(log.enteredAt).toLocaleString('id-ID')} • {log.department}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`badge badge-sm whitespace-nowrap font-medium ${
                          log.status === 'REGISTERED'
                            ? 'badge-success badge-outline'
                            : 'badge-warning badge-outline'
                        }`}
                      >
                        {log.status === 'REGISTERED' ? 'Terdaftar' : 'Bablas'}
                      </span>
                      {log.status === 'REGISTERED' && (
                        <span className="text-[11px] font-medium text-base-content/70">
                          Kemiripan: {log.confidence}%
                        </span>
                      )}
                    </div>
                    {log.notes && (
                      <p className="mt-1 text-[11px] text-base-content/60">
                        {log.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Log Table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="table table-sm w-full">
              <thead className="bg-base-200/70 text-xs uppercase text-base-content/60">
                <tr>
                  <th>Waktu</th>
                  <th>Foto &amp; Nama</th>
                  <th>Status</th>
                  <th>Kemiripan</th>
                  <th>Catatan</th>
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-xs text-base-content/50">
                      Belum ada log masuk tercatat.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log._id} className="hover">
                      <td className="whitespace-nowrap text-xs text-base-content/75">
                        {new Date(log.enteredAt).toLocaleString('id-ID')}
                      </td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          {log.snapshotBase64 ? (
                            <img
                              src={log.snapshotBase64}
                              alt={log.personName}
                              className="h-9 w-9 rounded-box object-cover"
                            />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-box bg-base-200 text-base-content/50">
                              {log.status === 'REGISTERED' ? (
                                <UserCheck className="h-4 w-4" />
                              ) : (
                                <UserX className="h-4 w-4" />
                              )}
                            </div>
                          )}
                          <div>
                            <div className="text-xs font-semibold text-base-content">
                              {log.personName}
                            </div>
                            <div className="text-[11px] text-base-content/60">{log.department}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`badge badge-sm whitespace-nowrap font-medium ${
                            log.status === 'REGISTERED'
                              ? 'badge-success badge-outline'
                              : 'badge-warning badge-outline'
                          }`}
                        >
                          {log.status === 'REGISTERED' ? 'Terdaftar' : 'Tidak Terdaftar (Bablas)'}
                        </span>
                      </td>
                      <td className="text-xs text-base-content/75">
                        {log.status === 'REGISTERED' ? `${log.confidence}%` : '-'}
                      </td>
                      <td className="max-w-xs truncate text-xs text-base-content/60">
                        {log.notes}
                      </td>
                      <td className="text-right">
                        {readOnly ? (
                          <span className="text-[11px] opacity-50">Read-Only</span>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setLogModalState({ open: true, mode: 'edit', initialLog: log })}
                              className="btn btn-xs btn-ghost btn-square"
                              title="Edit Log"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLog(log)}
                              className="btn btn-xs btn-ghost btn-square text-error"
                              title="Hapus Log"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="modal modal-open z-50">
          <div className="modal-box max-w-md border border-base-300 bg-base-100 p-5">
            <div className="flex items-center justify-between border-b border-base-300 pb-3">
              <h3 className="text-sm font-semibold text-base-content">
                Edit Data Pengguna
              </h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="btn btn-ghost btn-xs btn-square"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-base-content/80">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="input input-bordered input-sm w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-base-content/80">
                    ID / NIM / NIP
                  </label>
                  <input
                    type="text"
                    value={editForm.identifier}
                    onChange={(e) => setEditForm((f) => ({ ...f, identifier: e.target.value }))}
                    className="input input-bordered input-sm w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-base-content/80">
                    Divisi / Kelas
                  </label>
                  <input
                    type="text"
                    value={editForm.department}
                    onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
                    className="input input-bordered input-sm w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-base-content/80">
                    Wilayah
                  </label>
                  <input
                    type="text"
                    value={editForm.wilayah}
                    onChange={(e) => setEditForm((f) => ({ ...f, wilayah: e.target.value }))}
                    placeholder="Mis: Wilayah 1"
                    className="input input-bordered input-sm w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-base-content/80">
                    Peran
                  </label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                    className="select select-bordered select-sm w-full"
                  >
                    {Array.from(new Set([...roleOptions, editForm.role].filter(Boolean))).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-base-content">
                    <input
                      type="checkbox"
                      checked={editForm.isActive}
                      onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                      className="checkbox checkbox-sm checkbox-primary"
                    />
                    Status Aktif
                  </label>
                </div>
              </div>

              <div className="rounded-box border border-base-300 bg-base-200/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-base-content">
                      Tambah Sampel Wajah (Opsional)
                    </div>
                    <div className="text-[11px] text-base-content/60">
                      Tambahkan foto sudut lain agar akurasi makin tinggi.
                    </div>
                  </div>
                  <label className="btn btn-xs btn-ghost border border-base-300 shrink-0 gap-1.5">
                    <ImagePlus className="h-3.5 w-3.5" />
                    Pilih Foto
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAddSamplePhoto}
                      className="hidden"
                    />
                  </label>
                </div>
                {extraFaceMsg && (
                  <p className="mt-2 text-[11px] font-medium text-success">
                    {extraFaceMsg}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="btn btn-sm btn-ghost border border-base-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className={`btn btn-sm gap-1.5 ${wsMeta.accentSolidClass}`}
                >
                  <Check className="h-4 w-4" />
                  {savingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <LogEntryModal
        open={logModalState.open}
        mode={logModalState.mode}
        workspace={workspace}
        initialLog={logModalState.initialLog}
        users={users}
        onClose={() => setLogModalState((s) => ({ ...s, open: false }))}
        onSaved={() => {
          loadData();
          onDataChanged?.();
        }}
      />
    </div>
  );
}
