import React, { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, Clock, X } from 'lucide-react';
import { api, getTodayDateKey } from '../services/api.js';
import { formatWilayahLabel, getWorkspaceMeta } from './BrandLogo.jsx';
import { getNowTimeHHMM, getSessionLabelFromTime } from './SessionScheduleCard.jsx';

function toHHMM(dateInput) {
  if (!dateInput) return getNowTimeHHMM();
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return getNowTimeHHMM();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Shared PrimeVue-styled modal for dynamically adding or editing an attendance/counting log
 * from existing database members or manual guest input.
 */
export default function LogEntryModal({
  open,
  mode = 'edit', // 'edit' | 'create'
  workspace = 'piloting',
  initialLog = null,
  prefillUserId = '',
  defaultDate = '',
  defaultTime = '',
  users = [],
  onClose,
  onSaved,
}) {
  const wsMeta = getWorkspaceMeta(workspace);
  const [entryType, setEntryType] = useState('REGISTERED'); // 'REGISTERED' | 'UNREGISTERED'
  const [selectedUserId, setSelectedUserId] = useState('');
  const [personName, setPersonName] = useState('');
  const [department, setDepartment] = useState('');
  const [wilayah, setWilayah] = useState('');
  const [date, setDate] = useState(() => defaultDate || getTodayDateKey());
  const [sessionTime, setSessionTime] = useState(() => defaultTime || getNowTimeHHMM());
  const [notes, setNotes] = useState('');
  const [allowDuplicateSession, setAllowDuplicateSession] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setErrorMsg('');
    if (mode === 'edit' && initialLog) {
      const isReg = initialLog.status === 'REGISTERED';
      setEntryType(isReg ? 'REGISTERED' : 'UNREGISTERED');
      setSelectedUserId(initialLog.userId ? String(initialLog.userId) : '');
      setPersonName(initialLog.personName || '');
      setDepartment(initialLog.department || wsMeta.defaultDepartment);
      setWilayah(initialLog.wilayah || '');
      setDate(initialLog.dateKey || defaultDate || getTodayDateKey());
      setSessionTime(toHHMM(initialLog.enteredAt));
      setNotes(initialLog.notes || '');
      setAllowDuplicateSession(false);
      return;
    }

    const firstId = prefillUserId || (users[0]?._id ? String(users[0]._id) : '');
    const matched = users.find((u) => String(u._id) === firstId);
    setEntryType(matched ? 'REGISTERED' : 'UNREGISTERED');
    setSelectedUserId(firstId);
    setPersonName(matched ? matched.name : '');
    setDepartment(matched ? matched.department : wsMeta.defaultDepartment);
    setWilayah(matched ? matched.wilayah || '' : '');
    setDate(defaultDate || getTodayDateKey());
    setSessionTime(defaultTime || getNowTimeHHMM());
    setNotes('Input manual admin');
    setAllowDuplicateSession(false);
  }, [open, mode, initialLog, prefillUserId, defaultDate, defaultTime, users, wsMeta.defaultDepartment]);

  if (!open) return null;

  const sessionLabel = getSessionLabelFromTime(sessionTime);

  const handleSelectExistingUser = (uid) => {
    setSelectedUserId(uid);
    const found = users.find((u) => String(u._id) === uid);
    if (found) {
      setPersonName(found.name || '');
      setDepartment(found.department || wsMeta.defaultDepartment);
      setWilayah(found.wilayah || '');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');
    try {
      if (mode === 'edit' && initialLog?._id) {
        await api.updateLog(initialLog._id, {
          ...(entryType === 'REGISTERED' && selectedUserId ? { userId: selectedUserId } : {}),
          status: entryType,
          personName: personName.trim(),
          department: department.trim() || wsMeta.defaultDepartment,
          wilayah: wilayah.trim(),
          date,
          sessionTime,
          notes: notes.trim(),
        });
      } else {
        if (entryType === 'REGISTERED' && !selectedUserId) {
          setErrorMsg('Pilih data anggota/jemaat terlebih dahulu.');
          setSaving(false);
          return;
        }
        const res = await api.createLog(
          {
            ...(entryType === 'REGISTERED' ? { userId: selectedUserId } : { personName: personName.trim() || wsMeta.unregisteredLabel }),
            status: entryType,
            eventType: entryType === 'REGISTERED' ? 'ENTRY' : 'PASS_THROUGH',
            wilayah: wilayah.trim(),
            confidence: entryType === 'REGISTERED' ? 100 : 0,
            date,
            sessionTime,
            oncePerDay: !allowDuplicateSession,
            notes: notes.trim() || 'Input manual oleh admin',
          },
          workspace
        );

        if (res?.alreadyCheckedIn) {
          setErrorMsg(
            `${res.log?.personName || 'Anggota'} sudah tercatat pada ${date} (${sessionLabel}). Centang opsi "Izinkan catat ganda di sesi yang sama" bila ingin tetap menambah.`
          );
          setSaving(false);
          return;
        }
      }

      onSaved?.();
      onClose?.();
    } catch (err) {
      setErrorMsg(err.message || 'Gagal menyimpan perubahan log');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal modal-open z-50">
      <div className="modal-box max-w-md border border-base-300 bg-base-100 p-5">
        <div className="flex items-center justify-between border-b border-base-300 pb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-base-content">
              {mode === 'edit' ? 'Edit Log' : 'Tambah Log'}
            </h3>
            <span className="badge badge-outline badge-sm font-medium">
              {sessionLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-xs btn-square"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <span className="mb-1 block text-xs font-medium text-base-content/75">Jenis</span>
            <div className="join grid w-full grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setEntryType('REGISTERED');
                  if (!selectedUserId && users[0]?._id) {
                    handleSelectExistingUser(String(users[0]._id));
                  }
                }}
                className={`btn btn-sm join-item font-normal ${
                  entryType === 'REGISTERED' ? 'btn-primary' : 'btn-ghost border border-base-300'
                }`}
              >
                Anggota Terdaftar
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryType('UNREGISTERED');
                  setSelectedUserId('');
                  if (!personName) setPersonName(wsMeta.unregisteredLabel);
                }}
                className={`btn btn-sm join-item font-normal ${
                  entryType === 'UNREGISTERED' ? 'btn-warning' : 'btn-ghost border border-base-300'
                }`}
              >
                Tamu / Manual
              </button>
            </div>
          </div>

          {entryType === 'REGISTERED' && (
            <label className="form-control">
              <span className="label-text mb-1 text-xs font-medium">
                Pilih {wsMeta.memberNoun}
              </span>
              <select
                value={selectedUserId}
                onChange={(e) => handleSelectExistingUser(e.target.value)}
                required
                className="select select-bordered select-sm w-full"
              >
                <option value="">-- Pilih --</option>
                {users.map((u) => (
                  <option key={u._id} value={String(u._id)}>
                    {u.name} {u.identifier ? `(${u.identifier})` : ''}{u.wilayah ? ` • ${formatWilayahLabel(u.wilayah)}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="form-control">
            <span className="label-text mb-1 text-xs font-medium">Nama</span>
            <input
              type="text"
              required
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              placeholder={entryType === 'REGISTERED' ? 'Nama lengkap' : 'Nama tamu / keterangan'}
              className="input input-bordered input-sm w-full"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="form-control">
              <span className="label-text mb-1 flex items-center gap-1 text-xs font-medium">
                <Calendar className="h-3.5 w-3.5" />
                Tanggal
              </span>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input input-bordered input-sm w-full"
              />
            </label>

            <label className="form-control">
              <span className="label-text mb-1 flex items-center gap-1 text-xs font-medium">
                <Clock className="h-3.5 w-3.5" />
                Jam
              </span>
              <input
                type="time"
                required
                value={sessionTime}
                onChange={(e) => setSessionTime(e.target.value)}
                className="input input-bordered input-sm w-full"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="form-control">
              <span className="label-text mb-1 text-xs font-medium">Bagian / Komisi</span>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="input input-bordered input-sm w-full"
              />
            </label>

            <label className="form-control">
              <span className="label-text mb-1 text-xs font-medium">Wilayah</span>
              <input
                type="text"
                value={wilayah}
                onChange={(e) => setWilayah(e.target.value)}
                placeholder="Mis. Wilayah 3"
                className="input input-bordered input-sm w-full"
              />
            </label>
          </div>

          <label className="form-control">
            <span className="label-text mb-1 text-xs font-medium">Catatan</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan..."
              className="input input-bordered input-sm w-full"
            />
          </label>

          {mode === 'create' && entryType === 'REGISTERED' && (
            <label className="flex items-center gap-2 text-xs text-base-content/80">
              <input
                type="checkbox"
                checked={allowDuplicateSession}
                onChange={(e) => setAllowDuplicateSession(e.target.checked)}
                className="checkbox checkbox-xs"
              />
              <span>Izinkan catat ganda di sesi yang sama</span>
            </label>
          )}

          {errorMsg && (
            <div className="alert alert-error py-2 text-xs">
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="modal-action border-t border-base-300 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-sm btn-ghost border border-base-300 font-normal"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-sm btn-primary font-medium gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{saving ? 'Menyimpan...' : 'Simpan'}</span>
            </button>
          </div>
        </form>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
