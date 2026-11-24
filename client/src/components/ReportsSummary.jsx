import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Calendar,
  CalendarRange,
  CheckCircle2,
  Download,
  Edit3,
  FileText,
  Plus,
  PlusCircle,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import { api, getTodayDateKey } from '../services/api.js';
import { formatWilayahLabel, getWorkspaceMeta } from './BrandLogo.jsx';
import LogEntryModal from './LogEntryModal.jsx';
import { getNowTimeHHMM, getSessionLabelFromTime } from './SessionScheduleCard.jsx';

function getMonthStartKey(dateKey) {
  return `${dateKey.slice(0, 8)}01`;
}

export default function ReportsSummary({ workspace = 'piloting', readOnly = false }) {
  const wsMeta = getWorkspaceMeta(workspace);
  const todayKey = getTodayDateKey();
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'REGISTERED' | 'UNREGISTERED'
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // Period report state
  const [periodStart, setPeriodStart] = useState(() => getMonthStartKey(todayKey));
  const [periodEnd, setPeriodEnd] = useState(todayKey);
  const [weekdaysOnly, setWeekdaysOnly] = useState(false);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodReport, setPeriodReport] = useState({
    startDate: getMonthStartKey(todayKey),
    endDate: todayKey,
    totalDays: 0,
    totalMembers: 0,
    members: [],
  });

  // Manual attendance input by date
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualUserId, setManualUserId] = useState('');
  const [manualDate, setManualDate] = useState(todayKey);
  const [manualTime, setManualTime] = useState(() => getNowTimeHHMM());
  const [manualNote, setManualNote] = useState('Input absensi manual oleh admin');
  const [manualMsg, setManualMsg] = useState(null);
  const [manualSaving, setManualSaving] = useState(false);

  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [logModal, setLogModal] = useState({
    open: false,
    mode: 'edit',
    initialLog: null,
    prefillUserId: '',
  });

  const [summary, setSummary] = useState({
    date: todayKey,
    totalCount: 0,
    registeredCount: 0,
    uniqueRegisteredCount: 0,
    unregisteredCount: 0,
    presentMembersCount: 0,
    absentMembersCount: 0,
    memberAttendance: [],
    hourlyBreakdown: [],
    userBreakdown: [],
  });
  const [logs, setLogs] = useState([]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, logsRes, usersRes] = await Promise.all([
        api.getDailySummary(selectedDate, workspace),
        api.getLogs(
          {
            date: selectedDate,
            status: statusFilter === 'ALL' ? '' : statusFilter,
            search,
            limit: 300,
          },
          workspace
        ),
        api.getUsers({ activeOnly: 'true' }, workspace).catch(() => ({ users: [] })),
      ]);
      setSummary(sumRes);
      setLogs(logsRes.logs || []);
      setRegisteredUsers(usersRes.users || []);
      if (sumRes.memberAttendance?.length > 0) {
        setManualUserId((prev) => {
          const stillExists = sumRes.memberAttendance.some((m) => String(m.userId) === prev);
          return stillExists ? prev : String(sumRes.memberAttendance[0].userId);
        });
      } else {
        setManualUserId('');
      }
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  }, [search, selectedDate, statusFilter, workspace]);

  const loadPeriodReport = useCallback(async () => {
    setPeriodLoading(true);
    try {
      const res = await api.getPeriodSummary(periodStart, periodEnd, weekdaysOnly, workspace);
      setPeriodReport(res);
    } catch (err) {
      console.error('Failed to load period report:', err);
    } finally {
      setPeriodLoading(false);
    }
  }, [periodEnd, periodStart, weekdaysOnly, workspace]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    loadPeriodReport();
  }, [loadPeriodReport]);

  const handleManualAttendanceSubmit = async (e) => {
    e.preventDefault();
    if (!manualUserId) return;
    setManualSaving(true);
    setManualMsg(null);
    try {
      const res = await api.createLog(
        {
          userId: manualUserId,
          status: 'REGISTERED',
          eventType: 'ENTRY',
          confidence: 100,
          date: manualDate,
          sessionTime: manualTime,
          oncePerDay: true,
          notes: manualNote || 'Input absensi manual oleh admin',
        },
        workspace
      );

      if (res.alreadyCheckedIn) {
        const jam = res.firstEntryAt
          ? new Date(res.firstEntryAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          : '';
        setManualMsg({
          type: 'warning',
          text: `${res.log?.personName || 'Anggota'} sudah presensi pada tanggal ${manualDate}${jam ? ` jam ${jam}` : ''}. Data tidak ditimpa.`,
        });
      } else {
        setManualMsg({
          type: 'success',
          text: `Absensi ${res.log?.personName} untuk tanggal ${manualDate} berhasil disimpan.`,
        });
        if (manualDate === selectedDate) {
          await loadReports();
        }
        await loadPeriodReport();
      }
    } catch (err) {
      setManualMsg({ type: 'error', text: err.message || 'Gagal menyimpan absensi manual' });
    } finally {
      setManualSaving(false);
    }
  };

  const handleDeleteLogFromReport = async (log) => {
    if (!log?._id || !window.confirm(`Hapus log "${log.personName}"?`)) return;
    try {
      await api.deleteLog(log._id);
      await loadReports();
      await loadPeriodReport();
    } catch (err) {
      alert(err.message || 'Gagal menghapus log');
    }
  };

  const maxHourlyTotal = Math.max(
    1,
    ...(summary.hourlyBreakdown || []).map((h) => h.total || 0)
  );

  const registeredPct =
    summary.totalCount > 0
      ? Math.round((summary.registeredCount / summary.totalCount) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Top Filter & Export Bar */}
      <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-3.5 shadow-sm dark:border-stone-800 dark:bg-[#1C1917] dark:shadow-none sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex flex-1 items-center gap-2 rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs dark:border-stone-700 dark:bg-stone-950 sm:flex-none">
              <Calendar className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
              <span className="font-semibold text-base-content/75">Tgl:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setManualDate(e.target.value);
                }}
                className="w-full bg-transparent text-xs font-medium text-stone-900 focus:outline-none dark:text-white sm:text-sm"
              />
            </label>

            <button
              type="button"
              onClick={() => {
                const today = getTodayDateKey();
                setSelectedDate(today);
                setManualDate(today);
              }}
              className="btn btn-sm btn-ghost border border-base-300 font-medium"
            >
              Hari Ini
            </button>

            <button
              type="button"
              onClick={() => {
                loadReports();
                loadPeriodReport();
              }}
              className="btn btn-sm btn-ghost border border-base-300 font-medium gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  setShowManualForm((v) => !v);
                  setManualDate(selectedDate);
                  setManualMsg(null);
                }}
                className="btn btn-sm btn-outline btn-success font-medium gap-1.5 w-full sm:w-auto"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>Input Absensi Manual</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <a
              href={api.getExportCsvUrl(selectedDate, 'summary', workspace)}
              download
              className="btn btn-sm btn-outline btn-success gap-1.5 shadow-none font-medium"
            >
              <Download className="h-3.5 w-3.5" />
              Summary (.csv)
            </a>
            <a
              href={api.getExportCsvUrl(selectedDate, 'logs', workspace)}
              download
              className="btn btn-sm btn-ghost border border-base-300 gap-1.5 shadow-none font-medium"
            >
              <Download className="h-3.5 w-3.5" />
              Log (.csv)
            </a>
            <a
              href={api.getExportPdfUrl(selectedDate, 'summary', workspace)}
              download
              className="btn btn-sm btn-outline btn-error gap-1.5 shadow-none font-medium"
            >
              <FileText className="h-3.5 w-3.5" />
              Summary (.pdf)
            </a>
            <a
              href={api.getExportPdfUrl(selectedDate, 'logs', workspace)}
              download
              className="btn btn-sm btn-ghost border border-base-300 gap-1.5 shadow-none font-medium"
            >
              <FileText className="h-3.5 w-3.5" />
              Log (.pdf)
            </a>
            <a
              href={api.getExportPdfUrl(selectedDate, 'all', workspace)}
              download
              className="col-span-2 sm:col-span-1 btn btn-sm btn-primary gap-1.5 shadow-sm font-medium"
            >
              <FileText className="h-3.5 w-3.5" />
              Lengkap (.pdf)
            </a>
          </div>
        </div>

        {/* Manual Attendance Form by Date */}
        {showManualForm && (
          <form
            onSubmit={handleManualAttendanceSubmit}
            className="mt-3 grid gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3.5 dark:border-stone-800 dark:bg-stone-950/70 sm:grid-cols-4"
          >
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-stone-600 dark:text-stone-400">
                Pilih Anggota
              </label>
              <select
                value={manualUserId}
                onChange={(e) => setManualUserId(e.target.value)}
                required
                className="w-full rounded-xl border border-base-300 bg-base-100 px-3 py-2 text-xs text-stone-900 focus:border-[#7C2D12] focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-white"
              >
                {(summary.memberAttendance || []).map((m) => (
                  <option key={m.userId} value={String(m.userId)}>
                    {m.personName} ({m.identifier})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-stone-600 dark:text-stone-400">
                  Tgl Absensi
                </label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  required
                  className="w-full rounded-md border border-base-300 bg-base-100 px-2.5 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-stone-600 dark:text-stone-400">
                  Jam ({getSessionLabelFromTime(manualTime)})
                </label>
                <input
                  type="time"
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  required
                  className="w-full rounded-md border border-base-300 bg-base-100 px-2.5 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none dark:text-white"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-stone-600 dark:text-stone-400">
                Catatan
              </label>
              <input
                type="text"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder="Catatan absensi..."
                className="w-full rounded-xl border border-base-300 bg-base-100 px-3 py-2 text-xs text-stone-900 focus:border-[#7C2D12] focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-white"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={manualSaving || !manualUserId}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50 dark:bg-emerald-500 dark:text-stone-950 dark:hover:bg-emerald-400"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {manualSaving ? 'Menyimpan...' : 'Simpan Absen'}
              </button>
            </div>
            {manualMsg && (
              <div
                className={`sm:col-span-4 rounded-xl border px-3 py-2 text-xs font-medium ${
                  manualMsg.type === 'success'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : manualMsg.type === 'warning'
                      ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-300'
                      : 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-300'
                }`}
              >
                {manualMsg.text}
              </div>
            )}
          </form>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-3.5 shadow-sm dark:border-stone-800 dark:bg-[#1C1917] dark:shadow-none sm:p-4">
          <div className="flex items-center justify-between text-base-content/60">
            <span className="text-[11px] font-semibold uppercase sm:text-xs">Total Masuk</span>
            <Users className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-base-content sm:mt-2 sm:text-3xl">
            {summary.totalCount}
          </p>
          <p className="mt-1 text-[11px] text-base-content/60 sm:text-xs">
            Pagi: {summary.morningCount || 0} • Sore: {summary.eveningCount || 0}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:shadow-none sm:p-4">
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300">
            <span className="text-[11px] font-semibold uppercase sm:text-xs">Terdaftar</span>
            <UserCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-emerald-600 dark:text-emerald-400 sm:mt-2 sm:text-3xl">
            {summary.registeredCount}
          </p>
          <p className="mt-1 text-[11px] text-emerald-700/80 dark:text-emerald-300/70 sm:text-xs">
            {summary.uniqueRegisteredCount} orang unik hadir
          </p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 shadow-sm dark:border-amber-500/20 dark:bg-amber-950/20 dark:shadow-none sm:p-4">
          <div className="flex items-center justify-between text-amber-700 dark:text-amber-300">
            <span className="text-[11px] font-semibold uppercase sm:text-xs">Bablas</span>
            <UserX className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-amber-600 dark:text-amber-400 sm:mt-2 sm:text-3xl">
            {summary.unregisteredCount}
          </p>
          <p className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-300/70 sm:text-xs">
            Lewat tanpa regis
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-3.5 shadow-sm dark:border-stone-800 dark:bg-[#1C1917] dark:shadow-none sm:p-4">
          <div className="flex items-center justify-between text-base-content/60">
            <span className="text-[11px] font-semibold uppercase sm:text-xs">Rasio Hadir</span>
            <BarChart3 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-indigo-600 dark:text-indigo-300 sm:mt-2 sm:text-3xl">
            {registeredPct}%
          </p>
          <p className="mt-1 text-[11px] text-base-content/60 sm:text-xs">
            Dari trafik hari ini
          </p>
        </div>
      </div>

      {/* Hourly Breakdown Chart */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-[#1C1917] dark:shadow-none sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-base-content">
              Trafik Masuk Per Jam ({summary.date})
            </h3>
            <p className="text-xs text-base-content/60">
              Perbandingan terdaftar vs tidak terdaftar (bablas)
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-300">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Terdaftar
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> Bablas
            </span>
          </div>
        </div>

        <div className="flex h-36 items-end gap-1 overflow-x-auto pt-3 sm:h-40 sm:gap-1.5">
          {(summary.hourlyBreakdown || []).map((bucket) => {
            const regH = Math.round((bucket.registered / maxHourlyTotal) * 100);
            const unregH = Math.round((bucket.unregistered / maxHourlyTotal) * 100);
            return (
              <div
                key={bucket.hour}
                className="group flex min-w-[20px] flex-1 flex-col items-center gap-1 sm:min-w-[26px]"
                title={`${bucket.hour} — Terdaftar: ${bucket.registered}, Bablas: ${bucket.unregistered}`}
              >
                <div className="flex h-24 w-full flex-col justify-end gap-0.5 rounded-md bg-stone-100 p-0.5 dark:bg-[#141210]/70 sm:h-28">
                  {bucket.unregistered > 0 && (
                    <div
                      style={{ height: `${Math.max(8, unregH)}%` }}
                      className="w-full rounded-sm bg-amber-500 transition-all"
                    />
                  )}
                  {bucket.registered > 0 && (
                    <div
                      style={{ height: `${Math.max(8, regH)}%` }}
                      className="w-full rounded-sm bg-emerald-500 transition-all"
                    />
                  )}
                </div>
                <span className="text-[9px] text-stone-500 sm:text-[10px]">
                  {bucket.hour.slice(0, 2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 1. Rekap Absensi Daftar Anggota per Tanggal */}
      <div className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-3.5 dark:border-stone-800 sm:px-5">
          <div>
            <h3 className="text-sm font-bold text-base-content">
              Rekap Kehadiran {wsMeta.membersNoun} ({summary.date})
            </h3>
            <p className="text-xs text-base-content/60">
              Seluruh {wsMeta.memberNoun.toLowerCase()} aktif terdaftar &amp; status kehadiran tanggal {summary.date}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="whitespace-nowrap rounded-lg bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-0">
              Hadir: {summary.presentMembersCount ?? 0}
            </span>
            <span className="whitespace-nowrap rounded-lg bg-rose-50 px-2.5 py-1 font-semibold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-0">
              Tidak Hadir: {summary.absentMembersCount ?? 0}
            </span>
          </div>
        </div>

        {/* Mobile Cards (Zero horizontal scroll) */}
        <div className="divide-y divide-base-300 md:hidden">
          {!summary.memberAttendance || summary.memberAttendance.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-stone-500">
              Belum ada anggota terdaftar di database.
            </div>
          ) : (
            summary.memberAttendance.map((m, i) => {
              const matchingLog = logs.find(
                (l) => l.status === 'REGISTERED' && l.userId && String(l.userId) === String(m.userId)
              );
              return (
              <div key={m.userId || i} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-base-content">
                    {i + 1}. {m.personName}
                  </div>
                  <div className="mt-0.5 text-xs text-base-content/60">
                    {m.identifier} • {m.department}{m.wilayah ? ` • ${formatWilayahLabel(m.wilayah)}` : ''}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-base-content/60">
                    <span>Tgl: {m.date}</span>
                    {m.sessionLabel && (
                      <span className="badge badge-xs badge-outline font-semibold">
                        {m.sessionLabel}
                      </span>
                    )}
                    {m.firstEntry && (
                      <span>
                        • Jam: <strong className="text-stone-700 dark:text-stone-200">{new Date(m.firstEntry).toLocaleTimeString('id-ID')}</strong>
                      </span>
                    )}
                    {m.confidence !== null && (
                      <span className="text-sky-600 dark:text-sky-300">• Sync {m.confidence}%</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span
                    className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ${
                      m.present
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                    }`}
                  >
                    {m.attendanceStatus}
                  </span>
                  {!readOnly && (
                    <div className="flex items-center gap-1">
                      {!m.present ? (
                        <button
                          type="button"
                          onClick={() =>
                            setLogModal({
                              open: true,
                              mode: 'create',
                              initialLog: null,
                              prefillUserId: String(m.userId),
                            })
                          }
                          className="rounded border border-emerald-600 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300"
                        >
                          + Hadir
                        </button>
                      ) : matchingLog ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setLogModal({ open: true, mode: 'edit', initialLog: matchingLog, prefillUserId: '' })
                            }
                            className="rounded border border-base-300 p-1 text-sky-600 hover:bg-base-200"
                            title="Edit Kehadiran"
                          >
                            <Edit3 className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLogFromReport(matchingLog)}
                            className="rounded border border-base-300 p-1 text-rose-600 hover:bg-rose-50"
                            title="Hapus Kehadiran"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
              );
            })
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-base-200 text-xs uppercase text-base-content/60 border-base-300">
              <tr>
                <th className="px-4 py-3">No</th>
                <th className="px-4 py-3">Nama Anggota</th>
                <th className="px-4 py-3">ID / Divisi</th>
                <th className="px-4 py-3">Tgl Absen</th>
                <th className="px-4 py-3">Kehadiran</th>
                <th className="px-4 py-3">Jam Masuk</th>
                <th className="px-4 py-3">Sync DB</th>
                {!readOnly && <th className="px-4 py-3 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-base-300">
              {!summary.memberAttendance || summary.memberAttendance.length === 0 ? (
                <tr>
                  <td colSpan={readOnly ? 7 : 8} className="px-4 py-8 text-center text-xs text-stone-500">
                    Belum ada anggota terdaftar di database. Silakan registrasi wajah terlebih dahulu.
                  </td>
                </tr>
              ) : (
                summary.memberAttendance.map((m, i) => {
                  const matchingLog = logs.find(
                    (l) => l.status === 'REGISTERED' && l.userId && String(l.userId) === String(m.userId)
                  );
                  return (
                  <tr key={m.userId || i} className="hover:bg-stone-50 dark:hover:bg-stone-800/30">
                    <td className="px-4 py-3 text-xs text-stone-500">{i + 1}</td>
                    <td className="px-4 py-3 font-semibold text-base-content">
                      {m.personName}
                    </td>
                    <td className="px-4 py-3 text-xs text-base-content/75">
                      {m.identifier} • {m.department}{m.wilayah ? ` • ${formatWilayahLabel(m.wilayah)}` : ''}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-base-content/75">
                      {m.date}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex whitespace-nowrap items-center rounded px-2 py-0.5 text-xs font-semibold ${
                          m.present
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}
                      >
                        {m.attendanceStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-base-content/75">
                      {m.firstEntry ? new Date(m.firstEntry).toLocaleTimeString('id-ID') : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-sky-600 dark:text-sky-300">
                      {m.confidence !== null ? `${m.confidence}%` : '-'}
                    </td>
                    {!readOnly && (
                      <td className="px-4 py-3 text-right">
                        {!m.present ? (
                          <button
                            type="button"
                            onClick={() =>
                              setLogModal({
                                open: true,
                                mode: 'create',
                                initialLog: null,
                                prefillUserId: String(m.userId),
                              })
                            }
                            className="inline-flex items-center gap-1 rounded border border-emerald-600 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300"
                          >
                            <Plus className="h-3 w-3" />
                            Hadir
                          </button>
                        ) : matchingLog ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setLogModal({ open: true, mode: 'edit', initialLog: matchingLog, prefillUserId: '' })
                              }
                              className="rounded border border-base-300 bg-base-100 p-1 text-sky-600 hover:bg-base-200"
                              title="Edit Log Kehadiran"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLogFromReport(matchingLog)}
                              className="rounded border border-base-300 bg-base-100 p-1 text-rose-600 hover:bg-rose-50"
                              title="Hapus Log Kehadiran"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] opacity-50">-</span>
                        )}
                      </td>
                    )}
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Rekap Absen Periode Tertentu (Nama & Jml Tidak Hadir) */}
      <div className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-stone-200 px-4 py-4 dark:border-stone-800 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-2.5">
            <CalendarRange className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
            <div>
              <h3 className="text-sm font-bold text-base-content">
                Rekap Absen Periode Tertentu (Jumlah Tidak Hadir)
              </h3>
              <p className="text-xs text-base-content/60">
                Periode {periodReport.startDate} s/d {periodReport.endDate} ({periodReport.totalDays} hari)
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs text-stone-900 focus:border-[#7C2D12] focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-white"
                title="Tanggal Mulai Periode"
              />
              <span className="text-center text-xs text-stone-400">s/d</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs text-stone-900 focus:border-[#7C2D12] focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-white"
                title="Tanggal Akhir Periode"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs text-stone-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300">
                <input
                  type="checkbox"
                  checked={weekdaysOnly}
                  onChange={(e) => setWeekdaysOnly(e.target.checked)}
                  className="rounded border-stone-400 accent-sky-600"
                />
                Senin–Jumat saja
              </label>
              <a
                href={api.getExportPeriodCsvUrl(periodStart, periodEnd, weekdaysOnly, workspace)}
                download
                className="inline-flex items-center gap-1 rounded-xl bg-[#1E4D3B] px-3 py-1.5 text-xs font-bold text-[#FAF7F2] hover:bg-[#173c2e] dark:bg-emerald-700 dark:hover:bg-emerald-600"
              >
                <Download className="h-3.5 w-3.5" />
                Periode (.csv)
              </a>
              <a
                href={api.getExportPeriodPdfUrl(periodStart, periodEnd, weekdaysOnly, workspace)}
                download
                className="inline-flex items-center gap-1 rounded-xl bg-[#7C2D12] px-3 py-1.5 text-xs font-bold text-[#FAF7F2] hover:bg-[#64220c] dark:bg-amber-700 dark:hover:bg-amber-600"
              >
                <FileText className="h-3.5 w-3.5" />
                Periode (.pdf)
              </a>
            </div>
          </div>
        </div>

        {/* Mobile Cards for Period Summary (Zero horizontal scroll) */}
        <div className="divide-y divide-base-300 md:hidden">
          {periodLoading ? (
            <div className="px-4 py-6 text-center text-xs text-stone-500">
              Menyusun rekap periode...
            </div>
          ) : !periodReport.members || periodReport.members.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-stone-500">
              Belum ada anggota terdaftar untuk periode ini.
            </div>
          ) : (
            periodReport.members.map((m, idx) => (
              <div key={m.userId || idx} className="space-y-2 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-base-content">
                      {idx + 1}. {m.personName}
                    </div>
                    <div className="text-xs text-base-content/60">
                      {m.identifier} • {m.department}
                    </div>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-xs font-bold text-sky-600 dark:text-sky-300">
                    {m.attendanceRate}% hadir
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="whitespace-nowrap rounded-lg bg-stone-100 px-2 py-0.5 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                    Periode: {m.totalDays} hari
                  </span>
                  <span className="whitespace-nowrap rounded-lg bg-emerald-50 px-2.5 py-0.5 font-bold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-0">
                    Hadir: {m.presentDays} hari
                  </span>
                  <span
                    className={`whitespace-nowrap rounded-lg px-2.5 py-0.5 font-bold ${
                      m.absentDays > 0
                        ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30'
                        : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
                    }`}
                  >
                    Tidak Hadir: {m.absentDays} hari
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-base-200 text-xs uppercase text-base-content/60 border-base-300">
              <tr>
                <th className="px-4 py-3">No</th>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">ID / Divisi</th>
                <th className="px-4 py-3">Total Hari</th>
                <th className="px-4 py-3">Jml Hadir</th>
                <th className="px-4 py-3">Jml Tidak Hadir</th>
                <th className="px-4 py-3">Persentase</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-300">
              {periodLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-xs text-stone-500">
                    Menyusun rekap periode...
                  </td>
                </tr>
              ) : !periodReport.members || periodReport.members.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-xs text-stone-500">
                    Belum ada anggota terdaftar untuk periode yang dipilih.
                  </td>
                </tr>
              ) : (
                periodReport.members.map((m, idx) => (
                  <tr key={m.userId || idx} className="hover:bg-stone-50 dark:hover:bg-stone-800/30">
                    <td className="px-4 py-3 text-xs text-stone-500">{idx + 1}</td>
                    <td className="px-4 py-3 font-semibold text-base-content">
                      {m.personName}
                    </td>
                    <td className="px-4 py-3 text-xs text-base-content/75">
                      {m.identifier} • {m.department}{m.wilayah ? ` • ${formatWilayahLabel(m.wilayah)}` : ''}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-base-content/75">
                      {m.totalDays} hari
                    </td>
                    <td className="px-4 py-3">
                      <span className="whitespace-nowrap rounded-lg bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-0">
                        {m.presentDays} hari
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`whitespace-nowrap rounded-lg px-2.5 py-0.5 text-xs font-bold ${
                          m.absentDays > 0
                            ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30'
                            : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
                        }`}
                      >
                        {m.absentDays} hari
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-sky-600 dark:text-sky-300">
                      {m.attendanceRate}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Entrance Log Table */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-bold text-base-content">
            Detail Log Masuk ({logs.length} entri)
          </h3>

          <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama atau catatan..."
                className="w-full rounded-xl border border-base-300 bg-base-100 py-1.5 pl-8 pr-3 text-xs text-stone-900 placeholder-stone-400 focus:border-[#7C2D12] focus:outline-none dark:border-stone-800 dark:bg-stone-900 dark:text-white dark:placeholder-stone-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-base-300 bg-base-100 px-3 py-1.5 text-xs text-stone-800 focus:border-emerald-600 focus:outline-none dark:text-stone-200"
            >
              <option value="ALL">Semua Status</option>
              <option value="REGISTERED">Terdaftar Saja</option>
              <option value="UNREGISTERED">Tidak Terdaftar (Bablas)</option>
            </select>

            {!readOnly && (
              <button
                type="button"
                onClick={() =>
                  setLogModal({ open: true, mode: 'create', initialLog: null, prefillUserId: '' })
                }
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tambah Log Manual</span>
              </button>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
          {/* Mobile Log Cards (Zero horizontal scroll) */}
          <div className="divide-y divide-base-300 md:hidden">
            {logs.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-stone-500">
                Tidak ada log masuk untuk filter yang dipilih.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log._id} className="flex items-start gap-3 px-4 py-3">
                  {log.snapshotBase64 ? (
                    <img
                      src={log.snapshotBase64}
                      alt={log.personName}
                      className="h-10 w-10 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                      {log.status === 'REGISTERED' ? (
                        <UserCheck className="h-4 w-4" />
                      ) : (
                        <UserX className="h-4 w-4" />
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-base-content">
                        {log.personName}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[11px] font-medium text-base-content/60">
                          {new Date(log.enteredAt).toLocaleTimeString('id-ID')}
                        </span>
                        {!readOnly && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setLogModal({ open: true, mode: 'edit', initialLog: log, prefillUserId: '' })
                              }
                              className="rounded border border-base-300 p-1 text-sky-600 hover:bg-base-200"
                              title="Edit Log"
                            >
                              <Edit3 className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLogFromReport(log)}
                              className="rounded border border-base-300 p-1 text-rose-600 hover:bg-rose-50"
                              title="Hapus Log"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="mt-0.5 text-xs text-base-content/60">
                      {log.identifier} • {log.department}{log.wilayah ? ` • ${formatWilayahLabel(log.wilayah)}` : ''}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          log.status === 'REGISTERED'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-0'
                            : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-0'
                        }`}
                      >
                        {log.status === 'REGISTERED' ? 'Terdaftar' : 'Bablas'}
                      </span>
                      {log.sessionLabel && (
                        <span className="badge badge-xs badge-outline font-semibold">
                          {log.sessionLabel}
                        </span>
                      )}
                      {log.status === 'REGISTERED' && (
                        <span className="text-[11px] font-medium text-sky-600 dark:text-sky-300">
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
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-base-200 text-xs uppercase text-base-content/60 border-base-300">
                <tr>
                  <th className="px-4 py-3">Jam Masuk</th>
                  <th className="px-4 py-3">Foto &amp; Nama</th>
                  <th className="px-4 py-3">ID / Divisi</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Kemiripan</th>
                  <th className="px-4 py-3">Catatan</th>
                  {!readOnly && <th className="px-4 py-3 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-base-300">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={readOnly ? 6 : 7} className="px-4 py-8 text-center text-xs text-stone-500">
                      Tidak ada log masuk untuk filter yang dipilih.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log._id} className="hover:bg-stone-50 dark:hover:bg-stone-800/30">
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-base-content/75">
                        {new Date(log.enteredAt).toLocaleTimeString('id-ID')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {log.snapshotBase64 ? (
                            <img
                              src={log.snapshotBase64}
                              alt={log.personName}
                              className="h-8 w-8 rounded object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                              {log.status === 'REGISTERED' ? (
                                <UserCheck className="h-4 w-4" />
                              ) : (
                                <UserX className="h-4 w-4" />
                              )}
                            </div>
                          )}
                          <span className="text-xs font-semibold text-base-content">
                            {log.personName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-base-content/60">
                        {log.identifier} • {log.department}{log.wilayah ? ` • ${formatWilayahLabel(log.wilayah)}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold ${
                            log.status === 'REGISTERED'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}
                        >
                          {log.status === 'REGISTERED' ? 'Terdaftar' : 'Tidak Terdaftar (Bablas)'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-base-content/75">
                        {log.status === 'REGISTERED' ? `${log.confidence}%` : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-base-content/60">
                        {log.notes}
                      </td>
                      {!readOnly && (
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setLogModal({ open: true, mode: 'edit', initialLog: log, prefillUserId: '' })
                              }
                              className="rounded border border-base-300 bg-base-100 p-1 text-sky-600 hover:bg-base-200"
                              title="Edit Log"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLogFromReport(log)}
                              className="rounded border border-base-300 bg-base-100 p-1 text-rose-600 hover:bg-rose-50"
                              title="Hapus Log"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <LogEntryModal
        open={logModal.open}
        mode={logModal.mode}
        workspace={workspace}
        initialLog={logModal.initialLog}
        prefillUserId={logModal.prefillUserId}
        defaultDate={selectedDate}
        users={registeredUsers}
        onClose={() => setLogModal((s) => ({ ...s, open: false }))}
        onSaved={() => {
          loadReports();
          loadPeriodReport();
        }}
      />
    </div>
  );
}
