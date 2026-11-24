import React from 'react';
import { ArrowLeft, Calendar, Camera, Clock, LayoutDashboard } from 'lucide-react';

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
    <div className="w-full max-w-md overflow-hidden rounded-md border border-base-300 bg-base-100 shadow-sm">
      <div
        className={`flex h-24 sm:h-36 items-center justify-center border-b border-base-300 p-3 sm:p-4 ${
          workspace === 'gereja' ? 'bg-white' : 'bg-black'
        }`}
      >
        <img
          src={workspace === 'gereja' ? '/assets/church.png' : '/assets/code.png'}
          alt={workspace === 'gereja' ? 'Gereja' : 'Piloting'}
          className="max-h-18 sm:max-h-28 w-auto object-contain"
        />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm sm:text-base font-semibold text-base-content">
            {workspace === 'gereja' ? 'Jadwal Ibadah — Absensi Wajah' : 'Jadwal Scan — Piloting'}
          </h2>
          <span
            className={`shrink-0 rounded border px-2 py-0.5 text-[11px] font-medium ${
              sessionLabel === 'Gereja Pagi'
                ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                : 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
            }`}
          >
            {sessionLabel}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          <label className="block space-y-1">
            <span className="flex items-center gap-1.5 text-xs font-medium text-base-content/75">
              <Calendar className="h-3.5 w-3.5" />
              Tanggal
            </span>
            <input
              type="date"
              required
              value={sessionDate}
              onChange={(e) => onChangeDate(e.target.value)}
              className="h-10 sm:h-9 w-full rounded-md border border-base-300 bg-base-100 px-2.5 text-xs font-medium text-base-content focus:border-emerald-600 focus:outline-none"
            />
          </label>

          <label className="block space-y-1">
            <span className="flex items-center gap-1.5 text-xs font-medium text-base-content/75">
              <Clock className="h-3.5 w-3.5" />
              Jam
            </span>
            <input
              type="time"
              required
              value={sessionTime}
              onChange={(e) => onChangeTime(e.target.value)}
              className="h-10 sm:h-9 w-full rounded-md border border-base-300 bg-base-100 px-2.5 text-xs font-medium text-base-content focus:border-emerald-600 focus:outline-none"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-base-content/60">Jam cepat:</span>
          {TIME_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChangeTime(preset)}
              className={`rounded border px-2.5 py-1 sm:px-2 sm:py-0.5 text-xs sm:text-[11px] font-medium transition ${
                sessionTime === preset
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-base-300 bg-base-100 text-base-content hover:bg-base-200'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        {cameraError && (
          <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
            {cameraError}
          </p>
        )}

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={!canStart}
            className="inline-flex h-11 sm:h-9 w-full sm:flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-4 text-xs font-semibold sm:font-medium text-white hover:bg-emerald-700 disabled:opacity-50 active:scale-[0.98]"
          >
            <Camera className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span>{engineReady ? 'Mulai Scan Wajah' : 'Menyiapkan Kamera AI...'}</span>
          </button>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            {onGoToPortal && (
              <button
                type="button"
                onClick={onGoToPortal}
                className="inline-flex h-10 sm:h-9 items-center justify-center gap-1.5 rounded-md border border-base-300 bg-base-100 px-3 text-xs font-medium text-base-content hover:bg-base-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Portal</span>
              </button>
            )}

            {onGoToAdmin && (
              <button
                type="button"
                onClick={onGoToAdmin}
                className="inline-flex h-10 sm:h-9 items-center justify-center gap-1.5 rounded-md border border-base-300 bg-base-100 px-3 text-xs font-medium text-base-content hover:bg-base-200"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
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
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-base-300 bg-base-100 px-3 py-2 text-xs shadow-sm">
      <span className="font-semibold text-base-content">Jadwal Ibadah:</span>
      <label className="inline-flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 text-base-content/60" />
        <input
          type="date"
          required
          disabled={disabled}
          value={sessionDate}
          onChange={(e) => onChangeDate(e.target.value)}
          className="h-8 rounded-md border border-base-300 bg-base-100 px-2 text-xs text-base-content disabled:opacity-60"
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
          className="h-8 rounded-md border border-base-300 bg-base-100 px-2 text-xs text-base-content disabled:opacity-60"
        />
      </label>
      <span
        className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
          sessionLabel === 'Gereja Pagi'
            ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
            : 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
        }`}
      >
        {sessionLabel}
      </span>
      {disabled && (
        <span className="text-[11px] text-base-content/60">(Matikan kamera untuk mengubah jadwal)</span>
      )}
    </div>
  );
}
