import React from 'react';
import { ArrowLeft, Calendar, Camera, Clock, LayoutDashboard } from 'lucide-react';
import { WorkspaceIcon } from './BrandLogo.jsx';

export function getNowTimeHHMM() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function getSessionLabelFromTime(timeStr = '') {
  const hour = Number.parseInt(String(timeStr).split(':')[0], 10);
  if (Number.isFinite(hour)) {
    return hour < 14 ? 'Gereja Pagi' : 'Gereja Sore';
  }
  return new Date().getHours() < 14 ? 'Gereja Pagi' : 'Gereja Sore';
}

export function formatDateShortID(dateKey = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) return dateKey || '-';
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const TIME_PRESETS = ['07:00', '09:00', '17:00', '18:30'];

/**
 * Full-screen pre-scan schedule gate (PrimeVue Aura Card) requiring Date + Worship Time
 * before starting camera / attendance scan.
 */
export function SessionScheduleCard({
  workspace = 'gereja',
  sessionDate,
  sessionTime,
  onChangeDate,
  onChangeTime,
  onStartScan,
  onGoToPortal,
  onGoToAdmin,
  engineReady,
  cameraError,
}) {
  const sessionLabel = getSessionLabelFromTime(sessionTime);
  const canStart = Boolean(sessionDate && sessionTime && engineReady);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canStart) onStartScan?.();
  };

  return (
    <div className="card w-full max-w-md overflow-hidden border border-base-300 bg-base-100">
      <form onSubmit={handleSubmit} className="card-body gap-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2 border-b border-base-300 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <WorkspaceIcon workspace={workspace} className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-base-content leading-tight">
                {workspace === 'gereja' ? 'Jadwal Ibadah' : 'Jadwal Scan'}
              </h2>
              <p className="text-xs sm:text-sm text-base-content/70">
                {workspace === 'gereja' ? 'Ruang Gereja' : workspace === 'testing' ? 'Testing' : 'Piloting'}
              </p>
            </div>
          </div>
          <span className="badge badge-primary badge-outline px-3 py-2.5 text-xs font-semibold shrink-0">
            {sessionLabel}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="form-control">
            <span className="label-text mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-base-content">
              <Calendar className="h-4 w-4 text-primary" />
              Tanggal
            </span>
            <input
              type="date"
              required
              value={sessionDate}
              onChange={(e) => onChangeDate(e.target.value)}
              className="input input-bordered h-11 w-full text-sm font-medium"
            />
          </label>

          <label className="form-control">
            <span className="label-text mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-base-content">
              <Clock className="h-4 w-4 text-primary" />
              Jam Ibadah
            </span>
            <input
              type="time"
              required
              value={sessionTime}
              onChange={(e) => onChangeTime(e.target.value)}
              className="input input-bordered h-11 w-full text-sm font-medium"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-base-content/75">Pilih Cepat:</span>
          {TIME_PRESETS.map((preset) => {
            const selected = sessionTime === preset;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={selected}
                onClick={() => onChangeTime(preset)}
                className={`icon-button btn btn-sm h-9 px-3.5 text-sm font-semibold ${
                  selected ? 'btn-primary' : 'btn-outline border-base-300'
                }`}
              >
                {preset}
              </button>
            );
          })}
        </div>

        {cameraError && (
          <div className="alert alert-error is-error py-2.5 text-sm font-medium text-error-content">
            <span>{cameraError}</span>
          </div>
        )}

        <div className="flex flex-col gap-2.5 pt-2 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={!canStart}
            className="btn btn-primary h-12 min-h-12 w-full sm:flex-1 gap-2 text-sm font-semibold"
          >
            {engineReady ? (
              <Camera className="h-4 w-4" />
            ) : (
              <span className="spinner !border-white/30 !border-t-white" aria-hidden="true" />
            )}
            <span>{engineReady ? 'Buka Kamera' : 'Menyiapkan Kamera...'}</span>
          </button>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            {onGoToPortal && (
              <button
                type="button"
                onClick={onGoToPortal}
                className="btn btn-outline border-base-300 h-11 gap-1.5 text-sm font-semibold"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Kembali</span>
              </button>
            )}

            {onGoToAdmin && (
              <button
                type="button"
                onClick={onGoToAdmin}
                className="btn btn-outline border-base-300 h-11 gap-1.5 text-sm font-semibold"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>Admin</span>
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

/**
 * Compact inline schedule toolbar used inside Admin LiveMonitor so operators must set
 * Date & Worship Time before camera / photo recognition runs.
 */
export function SessionScheduleBar({
  sessionDate,
  sessionTime,
  onChangeDate,
  onChangeTime,
  disabled = false,
}) {
  const sessionLabel = getSessionLabelFromTime(sessionTime);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-box border border-base-300 bg-base-100 px-3 py-2 text-xs">
      <span className="font-semibold text-base-content">Jadwal:</span>
      <label className="inline-flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 text-base-content/60" />
        <input
          type="date"
          required
          disabled={disabled}
          value={sessionDate}
          onChange={(e) => onChangeDate(e.target.value)}
          className="input input-bordered input-xs text-xs disabled:opacity-60"
        />
      </label>
      <label className="inline-flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-base-content/60" />
        <input
          type="time"
          required
          disabled={disabled}
          value={sessionTime}
          onChange={(e) => onChangeTime(e.target.value)}
          className="input input-bordered input-xs text-xs disabled:opacity-60"
        />
      </label>
      <span className="badge badge-outline badge-sm font-medium">
        {sessionLabel}
      </span>
      {disabled && (
        <span className="text-[11px] text-base-content/60">(Matikan kamera untuk mengubah jadwal)</span>
      )}
    </div>
  );
}
