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
    <div className="space-y-5">
      {/* Top Filter & Export Bar */}
      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-3 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex flex-1 items-center gap-2 rounded-box border border-base-300 bg-base-100 px-3 py-1.5 text-xs sm:flex-none">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="font-medium text-base-content/75">Tgl:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setManualDate(e.target.value);
                  }}
                  className="w-full bg-transparent text-xs font-medium text-base-content focus:outline-none sm:text-sm"
                />
              </label>

              <button
                type="button"
                onClick={() => {
                  const today = getTodayDateKey();
                  setSelectedDate(today);
                  setManualDate(today);
                }}
                className="btn btn-sm btn-ghost border border-base-300 font-normal"
              >
                Hari Ini
              </button>

              <button
                type="button"
                onClick={() => {
                  loadReports();
                  loadPeriodReport();
                }}
                className="btn btn-sm btn-ghost border border-base-300 font-normal gap-1.5"
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
                  className="btn btn-sm btn-primary font-normal gap-1.5 w-full sm:w-auto"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span>Input Manual</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5">
              <a
                href={api.getExportCsvUrl(selectedDate, 'summary', workspace)}
                download
                className="btn btn-sm btn-ghost border border-base-300 gap-1 font-normal"
              >
                <Download className="h-3.5 w-3.5" />
                Rekap (.csv)
              </a>
              <a
                href={api.getExportCsvUrl(selectedDate, 'logs', workspace)}
                download
                className="btn btn-sm btn-ghost border border-base-300 gap-1 font-normal"
              >
                <Download className="h-3.5 w-3.5" />
                Log (.csv)
              </a>
              <a
                href={api.getExportPdfUrl(selectedDate, 'summary', workspace)}
                download
                className="btn btn-sm btn-ghost border border-base-300 gap-1 font-normal"
              >
                <FileText className="h-3.5 w-3.5" />
                Rekap (.pdf)
              </a>
              <a
                href={api.getExportPdfUrl(selectedDate, 'logs', workspace)}
                download
                className="btn btn-sm btn-ghost border border-base-300 gap-1 font-normal"
              >
                <FileText className="h-3.5 w-3.5" />
                Log (.pdf)
              </a>
              <a
                href={api.getExportPdfUrl(selectedDate, 'all', workspace)}
                download
                className="col-span-2 sm:col-span-1 btn btn-sm btn-primary gap-1 font-medium"
              >
                <FileText className="h-3.5 w-3.5" />
                Lengkap (.pdf)
              </a>
            </div>
          </div>

          {showManualForm && (
            <form
              onSubmit={handleManualAttendanceSubmit}
              className="grid gap-3 rounded-box border border-base-300 bg-base-200/50 p-3.5 sm:grid-cols-4"
            >
              <label className="form-control">
                <span className="label-text mb-1 text-xs font-medium">Pilih Anggota</span>
                <select
                  value={manualUserId}
                  onChange={(e) => setManualUserId(e.target.value)}
                  required
                  className="select select-bordered select-sm w-full"
                >
                  {(summary.memberAttendance || []).map((m) => (
                    <option key={m.userId} value={String(m.userId)}>
                      {m.personName} ({m.identifier})
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="form-control">
                  <span className="label-text mb-1 text-xs font-medium">Tanggal</span>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    required
                    className="input input-bordered input-sm w-full"
                  />
                </label>
                <label className="form-control">
                  <span className="label-text mb-1 text-xs font-medium">
                    Jam ({getSessionLabelFromTime(manualTime)})
                  </span>
                  <input
                    type="time"
                    value={manualTime}
                    onChange={(e) => setManualTime(e.target.value)}
                    required
                    className="input input-bordered input-sm w-full"
                  />
                </label>
              </div>
              <label className="form-control">
                <span className="label-text mb-1 text-xs font-medium">Catatan</span>
                <input
                  type="text"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="Catatan..."
                  className="input input-bordered input-sm w-full"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={manualSaving || !manualUserId}
                  className="btn btn-sm btn-primary w-full gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {manualSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
              {manualMsg && (
                <div
                  className={`alert sm:col-span-4 py-2 text-xs ${
                    manualMsg.type === 'success'
                      ? 'alert-success'
                      : manualMsg.type === 'warning'
                        ? 'alert-warning'
                        : 'alert-error'
                  }`}
                >
                  <span>{manualMsg.text}</span>
                </div>
              )}
            </form>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body p-3.5 sm:p-4 gap-1">
            <div className="flex items-center justify-between text-base-content/60">
              <span className="text-xs font-medium">Total Masuk</span>
              <Users className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-semibold text-base-content sm:text-3xl">
              {summary.totalCount}
            </p>
            <p className="text-[11px] text-base-content/60">
              Pagi: {summary.morningCount || 0} • Sore: {summary.eveningCount || 0}
            </p>
          </div>
        </div>

        <div className="card border border-base-300 bg-base-100">
          <div className="card-body p-3.5 sm:p-4 gap-1">
            <div className="flex items-center justify-between text-base-content/60">
              <span className="text-xs font-medium">Terdaftar</span>
              <UserCheck className="h-4 w-4 text-success" />
            </div>
            <p className="text-2xl font-semibold text-success sm:text-3xl">
              {summary.registeredCount}
            </p>
            <p className="text-[11px] text-base-content/60">
              {summary.uniqueRegisteredCount} orang hadir
            </p>
          </div>
        </div>

        <div className="card border border-base-300 bg-base-100">
          <div className="card-body p-3.5 sm:p-4 gap-1">
            <div className="flex items-center justify-between text-base-content/60">
              <span className="text-xs font-medium">Tamu</span>
              <UserX className="h-4 w-4 text-warning" />
            </div>
            <p className="text-2xl font-semibold text-warning sm:text-3xl">
              {summary.unregisteredCount}
            </p>
            <p className="text-[11px] text-base-content/60">
              Belum terdaftar
            </p>
          </div>
        </div>

        <div className="card border border-base-300 bg-base-100">
          <div className="card-body p-3.5 sm:p-4 gap-1">
            <div className="flex items-center justify-between text-base-content/60">
              <span className="text-xs font-medium">Rasio Hadir</span>
              <BarChart3 className="h-4 w-4 text-info" />
            </div>
            <p className="text-2xl font-semibold text-info sm:text-3xl">
              {registeredPct}%
            </p>
            <p className="text-[11px] text-base-content/60">
              Dari trafik hari ini
            </p>
          </div>
        </div>
      </div>

      {/* Hourly Breakdown Chart */}
      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-base-content">
                Kunjungan Per Jam ({summary.date})
              </h3>
              <p className="text-xs text-base-content/60">
                Perbandingan anggota terdaftar dan tamu
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5 text-base-content/80">
                <span className="h-2.5 w-2.5 rounded-sm bg-success" /> Terdaftar
              </span>
              <span className="inline-flex items-center gap-1.5 text-base-content/80">
                <span className="h-2.5 w-2.5 rounded-sm bg-warning" /> Tamu
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
                  title={`${bucket.hour} — Terdaftar: ${bucket.registered}, Tamu: ${bucket.unregistered}`}
                >
                  <div className="flex h-24 w-full flex-col justify-end gap-0.5 rounded bg-base-200 p-0.5 sm:h-28">
                    {bucket.unregistered > 0 && (
                      <div
                        style={{ height: `${Math.max(8, unregH)}%` }}
                        className="w-full rounded-sm bg-warning transition-all"
                      />
                    )}
                    {bucket.registered > 0 && (
                      <div
                        style={{ height: `${Math.max(8, regH)}%` }}
                        className="w-full rounded-sm bg-success transition-all"
                      />
                    )}
                  </div>
                  <span className="text-[9px] text-base-content/60 sm:text-[10px]">
                    {bucket.hour.slice(0, 2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 1. Rekap Absensi Daftar Anggota per Tanggal */}
      <div className="overflow-hidden rounded-box border border-base-300 bg-base-100">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 px-4 py-3.5 sm:px-5">
          <div>
            <h3 className="text-sm font-semibold text-base-content">
              Rekap Kehadiran ({summary.date})
            </h3>
            <p className="text-xs text-base-content/60">
              {wsMeta.membersNoun} aktif dan status kehadiran
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="badge badge-success badge-outline badge-sm">
              Hadir: {summary.presentMembersCount ?? 0}
            </span>
            <span className="badge badge-error badge-outline badge-sm">
              Tidak Hadir: {summary.absentMembersCount ?? 0}
            </span>
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="divide-y divide-base-300 md:hidden">
          {!summary.memberAttendance || summary.memberAttendance.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-base-content/60">
              Belum ada data anggota.
            </div>
          ) : (
            summary.memberAttendance.map((m, i) => {
              const matchingLog = logs.find(
                (l) => l.status === 'REGISTERED' && l.userId && String(l.userId) === String(m.userId)
              );
              return (
              <div key={m.userId || i} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-base-content">
                    {i + 1}. {m.personName}
                  </div>
                  <div className="mt-0.5 text-xs text-base-content/60">
                    {m.identifier} • {m.department}{m.wilayah ? ` • ${formatWilayahLabel(m.wilayah)}` : ''}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-base-content/60">
                    <span>Tgl: {m.date}</span>
                    {m.sessionLabel && (
                      <span className="badge badge-xs badge-outline">
                        {m.sessionLabel}{m.sessionTime ? ` · ${m.sessionTime}` : ''}
                      </span>
                    )}
                    {m.firstEntry && (
                      <span>
                        • Masuk: <strong className="text-base-content">{new Date(m.firstEntry).toLocaleTimeString('id-ID')}</strong>
                      </span>
                    )}
                    {m.confidence !== null && (
                      <span className="text-base-content/75">• {m.confidence}%</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span
                    className={`badge badge-sm ${
                      m.present ? 'badge-success badge-outline' : 'badge-error badge-outline'
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
                          className="btn btn-xs btn-ghost border border-base-300 font-normal"
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
                            className="btn btn-xs btn-ghost border border-base-300 btn-square"
                            title="Edit Kehadiran"
                          >
                            <Edit3 className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLogFromReport(matchingLog)}
                            className="btn btn-xs btn-ghost border border-base-300 text-error btn-square"
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
          <table className="table table-sm w-full">
            <thead className="bg-base-200 text-xs text-base-content/70">
              <tr>
                <th>No</th>
                <th>Nama Anggota</th>
                <th>Nomor Induk / Bagian</th>
                <th>Tgl Absen</th>
                <th>Kehadiran</th>
                <th>Jam Masuk</th>
                <th>Kemiripan</th>
                {!readOnly && <th className="text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {!summary.memberAttendance || summary.memberAttendance.length === 0 ? (
                <tr>
                  <td colSpan={readOnly ? 7 : 8} className="px-4 py-8 text-center text-xs text-base-content/60">
                    Belum ada data anggota.
                  </td>
                </tr>
              ) : (
                summary.memberAttendance.map((m, i) => {
                  const matchingLog = logs.find(
                    (l) => l.status === 'REGISTERED' && l.userId && String(l.userId) === String(m.userId)
                  );
                  return (
                  <tr key={m.userId || i} className="hover">
                    <td className="text-xs text-base-content/60">{i + 1}</td>
                    <td className="font-semibold text-base-content">
                      {m.personName}
                    </td>
                    <td className="text-xs text-base-content/75">
                      {m.identifier} • {m.department}{m.wilayah ? ` • ${formatWilayahLabel(m.wilayah)}` : ''}
                    </td>
                    <td className="whitespace-nowrap text-xs text-base-content/75">
                      {m.date}
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm ${
                          m.present ? 'badge-success badge-outline' : 'badge-error badge-outline'
                        }`}
                      >
                        {m.attendanceStatus}
                      </span>
                    </td>
                    <td className="text-xs text-base-content/75">
                      {m.firstEntry ? new Date(m.firstEntry).toLocaleTimeString('id-ID') : '-'}
                    </td>
                    <td className="text-xs text-base-content/75">
                      {m.confidence !== null ? `${m.confidence}%` : '-'}
                    </td>
                    {!readOnly && (
                      <td className="text-right">
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
                            className="btn btn-xs btn-ghost border border-base-300 font-normal gap-1"
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
                              className="btn btn-xs btn-ghost border border-base-300 btn-square"
                              title="Edit Log Kehadiran"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLogFromReport(matchingLog)}
                              className="btn btn-xs btn-ghost border border-base-300 text-error btn-square"
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

      {/* 2. Rekap Absen Periode Tertentu */}
      <div className="overflow-hidden rounded-box border border-base-300 bg-base-100">
        <div className="flex flex-col gap-3 border-b border-base-300 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-2.5">
            <CalendarRange className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-base-content">
                Rekap Periode ({periodReport.totalDays} hari)
              </h3>
              <p className="text-xs text-base-content/60">
                {periodReport.startDate} s/d {periodReport.endDate}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="input input-bordered input-xs w-full"
                title="Tanggal Mulai"
              />
              <span className="text-center text-xs text-base-content/50">s/d</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="input input-bordered input-xs w-full"
                title="Tanggal Akhir"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-btn border border-base-300 bg-base-100 px-2.5 py-1 text-xs text-base-content">
                <input
                  type="checkbox"
                  checked={weekdaysOnly}
                  onChange={(e) => setWeekdaysOnly(e.target.checked)}
                  className="checkbox checkbox-xs checkbox-primary"
                />
                Senin–Jumat
              </label>
              <a
                href={api.getExportPeriodCsvUrl(periodStart, periodEnd, weekdaysOnly, workspace)}
                download
                className="btn btn-xs btn-ghost border border-base-300 font-normal gap-1"
              >
                <Download className="h-3.5 w-3.5" />
                Periode (.csv)
              </a>
              <a
                href={api.getExportPeriodPdfUrl(periodStart, periodEnd, weekdaysOnly, workspace)}
                download
                className="btn btn-xs btn-primary font-medium gap-1"
              >
                <FileText className="h-3.5 w-3.5" />
                Periode (.pdf)
              </a>
            </div>
          </div>
        </div>

        {/* Mobile Cards for Period Summary */}
        <div className="divide-y divide-base-300 md:hidden">
          {periodLoading ? (
            <div className="px-4 py-6 text-center text-xs text-base-content/60">
              Memuat rekap periode...
            </div>
          ) : !periodReport.members || periodReport.members.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-base-content/60">
              Belum ada data anggota.
            </div>
          ) : (
            periodReport.members.map((m, idx) => (
              <div key={m.userId || idx} className="space-y-2 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-base-content">
                      {idx + 1}. {m.personName}
                    </div>
                    <div className="text-xs text-base-content/60">
                      {m.identifier} • {m.department}
                    </div>
                  </div>
                  <span className="badge badge-ghost badge-sm shrink-0">
                    {m.attendanceRate}% hadir
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="badge badge-ghost badge-sm">
                    {m.totalDays} hari
                  </span>
                  <span className="badge badge-success badge-outline badge-sm">
                    Hadir: {m.presentDays}
                  </span>
                  <span
                    className={`badge badge-sm ${
                      m.absentDays > 0 ? 'badge-error badge-outline' : 'badge-ghost'
                    }`}
                  >
                    Tidak Hadir: {m.absentDays}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="table table-sm w-full">
            <thead className="bg-base-200 text-xs text-base-content/70">
              <tr>
                <th>No</th>
                <th>Nama</th>
                <th>Nomor Induk / Bagian</th>
                <th>Total Hari</th>
                <th>Hadir</th>
                <th>Tidak Hadir</th>
                <th>Persentase</th>
              </tr>
            </thead>
            <tbody>
              {periodLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-xs text-base-content/60">
                    Memuat rekap periode...
                  </td>
                </tr>
              ) : !periodReport.members || periodReport.members.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-xs text-base-content/60">
                    Belum ada data anggota.
                  </td>
                </tr>
              ) : (
                periodReport.members.map((m, idx) => (
                  <tr key={m.userId || idx} className="hover">
                    <td className="text-xs text-base-content/60">{idx + 1}</td>
                    <td className="font-semibold text-base-content">
                      {m.personName}
                    </td>
                    <td className="text-xs text-base-content/75">
                      {m.identifier} • {m.department}{m.wilayah ? ` • ${formatWilayahLabel(m.wilayah)}` : ''}
                    </td>
                    <td className="whitespace-nowrap text-xs text-base-content/75">
                      {m.totalDays} hari
                    </td>
                    <td>
                      <span className="badge badge-success badge-outline badge-sm">
                        {m.presentDays} hari
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm ${
                          m.absentDays > 0 ? 'badge-error badge-outline' : 'badge-ghost'
                        }`}
                      >
                        {m.absentDays} hari
                      </span>
                    </td>
                    <td className="text-xs font-medium text-base-content">
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
          <h3 className="text-sm font-semibold text-base-content">
            Log Masuk ({logs.length} entri)
          </h3>

          <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-base-content/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama atau catatan..."
                className="input input-bordered input-sm w-full pl-8"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="select select-bordered select-sm font-normal"
            >
              <option value="ALL">Semua Status</option>
              <option value="REGISTERED">Terdaftar Saja</option>
              <option value="UNREGISTERED">Tamu Saja</option>
            </select>

            {!readOnly && (
              <button
                type="button"
                onClick={() =>
                  setLogModal({ open: true, mode: 'create', initialLog: null, prefillUserId: '' })
                }
                className="btn btn-sm btn-primary gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tambah Log</span>
              </button>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-box border border-base-300 bg-base-100">
          {/* Mobile Log Cards */}
          <div className="divide-y divide-base-300 md:hidden">
            {logs.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-base-content/60">
                Tidak ada log ditemukan.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log._id} className="flex items-start gap-3 px-4 py-3">
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
                      <span className="truncate text-sm font-semibold text-base-content">
                        {log.personName}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[11px] text-base-content/60">
                          {new Date(log.enteredAt).toLocaleTimeString('id-ID')}
                        </span>
                        {!readOnly && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setLogModal({ open: true, mode: 'edit', initialLog: log, prefillUserId: '' })
                              }
                              className="btn btn-xs btn-ghost border border-base-300 btn-square"
                              title="Edit Log"
                            >
                              <Edit3 className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLogFromReport(log)}
                              className="btn btn-xs btn-ghost border border-base-300 text-error btn-square"
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
                        className={`badge badge-xs ${
                          log.status === 'REGISTERED' ? 'badge-success badge-outline' : 'badge-warning badge-outline'
                        }`}
                      >
                        {log.status === 'REGISTERED' ? 'Terdaftar' : 'Tamu'}
                      </span>
                      {log.sessionLabel && (
                        <span className="badge badge-xs badge-outline">
                          {log.sessionLabel}{log.sessionTime ? ` · ${log.sessionTime}` : ''}
                        </span>
                      )}
                      {log.status === 'REGISTERED' && (
                        <span className="text-[11px] text-base-content/75">
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
              <thead className="bg-base-200 text-xs text-base-content/70">
                <tr>
                  <th>Jam Masuk</th>
                  <th>Foto &amp; Nama</th>
                  <th>Nomor Induk / Bagian</th>
                  <th>Status</th>
                  <th>Kemiripan</th>
                  <th>Catatan</th>
                  {!readOnly && <th className="text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={readOnly ? 6 : 7} className="px-4 py-8 text-center text-xs text-base-content/60">
                      Tidak ada log ditemukan.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log._id} className="hover">
                      <td className="whitespace-nowrap text-xs text-base-content/75">
                        {new Date(log.enteredAt).toLocaleTimeString('id-ID')}
                      </td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          {log.snapshotBase64 ? (
                            <img
                              src={log.snapshotBase64}
                              alt={log.personName}
                              className="h-8 w-8 rounded-box object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-box bg-base-200 text-base-content/50">
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
                      <td className="text-xs text-base-content/60">
                        {log.identifier} • {log.department}{log.wilayah ? ` • ${formatWilayahLabel(log.wilayah)}` : ''}
                      </td>
                      <td>
                        <span
                          className={`badge badge-sm ${
                            log.status === 'REGISTERED' ? 'badge-success badge-outline' : 'badge-warning badge-outline'
                          }`}
                        >
                          {log.status === 'REGISTERED' ? 'Terdaftar' : 'Tamu'}
                        </span>
                      </td>
                      <td className="text-xs text-base-content/75">
                        {log.status === 'REGISTERED' ? `${log.confidence}%` : '-'}
                      </td>
                      <td className="text-xs text-base-content/60">
                        {log.notes}
                      </td>
                      {!readOnly && (
                        <td className="text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setLogModal({ open: true, mode: 'edit', initialLog: log, prefillUserId: '' })
                              }
                              className="btn btn-xs btn-ghost border border-base-300 btn-square"
                              title="Edit Log"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLogFromReport(log)}
                              className="btn btn-xs btn-ghost border border-base-300 text-error btn-square"
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
