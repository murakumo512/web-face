import express from 'express';
import PDFDocument from 'pdfkit';
import { AttendanceLog } from '../models/AttendanceLog.js';
import { User } from '../models/User.js';
import { escapeCsvCell, formatDateTimeID, getChurchSessionLabel, toLocalDateKey } from '../utils/dateUtils.js';
import { normalizeWorkspace, workspaceQueryFilter } from '../utils/workspace.js';

const router = express.Router();

function getWorkspacePdfLabel(workspace) {
  return workspace === 'gereja'
    ? 'GEREJA — KEHADIRAN JEMAAT & PELAYAN'
    : 'PILOTING — PRESENSI & COUNTING';
}

async function buildDailySummary(dateKey, workspace = 'piloting') {
  const wsFilter = workspaceQueryFilter(workspace);
  const [logs, activeUsers] = await Promise.all([
    AttendanceLog.find({ dateKey, ...wsFilter }).sort({ enteredAt: 1 }).lean(),
    User.find({ isActive: true, ...wsFilter })
      .select('_id name identifier department role wilayah')
      .sort({ name: 1 })
      .lean(),
  ]);

  let registeredCount = 0;
  let unregisteredCount = 0;
  let morningCount = 0;
  let eveningCount = 0;
  const uniqueUserIds = new Set();
  const userMap = new Map();

  const hourly = Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, '0')}:00`,
    registered: 0,
    unregistered: 0,
    total: 0,
  }));

  for (const log of logs) {
    const dt = new Date(log.enteredAt);
    const hourIdx = dt.getHours();
    const bucket = hourly[hourIdx];
    const logSession = log.sessionLabel || getChurchSessionLabel(dt);
    if (logSession === 'Gereja Pagi') morningCount += 1;
    else eveningCount += 1;

    if (log.status === 'REGISTERED') {
      registeredCount += 1;
      if (bucket) {
        bucket.registered += 1;
        bucket.total += 1;
      }

      const key = log.userId ? String(log.userId) : log.personName;
      uniqueUserIds.add(key);

      if (!userMap.has(key)) {
        userMap.set(key, {
          userId: log.userId,
          personName: log.personName,
          identifier: log.identifier || '-',
          department: log.department || '-',
          wilayah: log.wilayah || '',
          sessionLabel: logSession,
          entryCount: 0,
          firstEntry: log.enteredAt,
          lastEntry: log.enteredAt,
          confidenceSum: 0,
        });
      }
      const entry = userMap.get(key);
      entry.entryCount += 1;
      entry.lastEntry = log.enteredAt;
      entry.confidenceSum += Number(log.confidence) || 0;
    } else {
      unregisteredCount += 1;
      if (bucket) {
        bucket.unregistered += 1;
        bucket.total += 1;
      }
    }
  }

  const userBreakdown = Array.from(userMap.values())
    .map((u) => ({
      userId: u.userId,
      personName: u.personName,
      identifier: u.identifier,
      department: u.department,
      entryCount: u.entryCount,
      firstEntry: u.firstEntry,
      lastEntry: u.lastEntry,
      avgConfidence: u.entryCount > 0 ? Math.round(u.confidenceSum / u.entryCount) : 0,
    }))
    .sort((a, b) => new Date(b.lastEntry) - new Date(a.lastEntry));

  const memberAttendance = activeUsers.map((u) => {
    const entry = userMap.get(String(u._id));
    return {
      userId: u._id,
      personName: u.name,
      identifier: u.identifier || '-',
      department: u.department || 'Umum',
      role: u.role || 'Anggota',
      wilayah: u.wilayah || '',
      date: dateKey,
      present: Boolean(entry),
      attendanceStatus: entry ? 'Hadir' : 'Tidak Hadir',
      sessionLabel: entry ? entry.sessionLabel : '',
      firstEntry: entry ? entry.firstEntry : null,
      confidence: entry && entry.entryCount > 0 ? Math.round(entry.confidenceSum / entry.entryCount) : null,
    };
  });

  const presentMembersCount = memberAttendance.filter((m) => m.present).length;
  const absentMembersCount = memberAttendance.length - presentMembersCount;

  return {
    workspace,
    date: dateKey,
    totalCount: registeredCount + unregisteredCount,
    registeredCount,
    uniqueRegisteredCount: uniqueUserIds.size,
    unregisteredCount,
    morningCount,
    eveningCount,
    totalRegisteredUsersInDb: activeUsers.length,
    presentMembersCount,
    absentMembersCount,
    memberAttendance,
    hourlyBreakdown: hourly,
    userBreakdown,
    logs,
  };
}

// GET /api/summary/daily?date=YYYY-MM-DD&workspace=piloting|gereja
router.get('/daily', async (req, res) => {
  try {
    const workspace = normalizeWorkspace(req.query.workspace);
    const dateKey = req.query.date || toLocalDateKey(new Date());
    const summary = await buildDailySummary(dateKey, workspace);
    const { logs, ...summaryWithoutRawLogs } = summary;
    res.json({
      ...summaryWithoutRawLogs,
      recentLogsCount: logs.length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menyusun ringkasan harian', detail: err.message });
  }
});

// GET /api/summary/export-csv?date=YYYY-MM-DD&mode=logs|summary&workspace=piloting|gereja
router.get('/export-csv', async (req, res) => {
  try {
    const workspace = normalizeWorkspace(req.query.workspace);
    const dateKey = req.query.date || toLocalDateKey(new Date());
    const mode = req.query.mode === 'summary' ? 'summary' : 'logs';
    const summary = await buildDailySummary(dateKey, workspace);

    const lines = [];

    if (mode === 'summary') {
      lines.push(['LAPORAN SUMMARY PRESENSI & COUNTING HARIAN', dateKey].map(escapeCsvCell).join(','));
      lines.push('');
      lines.push(['Metrik', 'Jumlah'].map(escapeCsvCell).join(','));
      lines.push(['Tanggal', dateKey].map(escapeCsvCell).join(','));
      lines.push(['Total Orang Masuk (Terdaftar + Tidak Terdaftar)', summary.totalCount].map(escapeCsvCell).join(','));
      lines.push(['Total Masuk Terdaftar', summary.registeredCount].map(escapeCsvCell).join(','));
      lines.push(['Jumlah Orang Terdaftar Unik Hadir', summary.uniqueRegisteredCount].map(escapeCsvCell).join(','));
      lines.push(['Total Masuk Tidak Terdaftar (Bablas)', summary.unregisteredCount].map(escapeCsvCell).join(','));
      lines.push(['Total Gereja Pagi (< 14:00)', summary.morningCount].map(escapeCsvCell).join(','));
      lines.push(['Total Gereja Sore (>= 14:00)', summary.eveningCount].map(escapeCsvCell).join(','));
      lines.push('');
      lines.push(['REKAP KEHADIRAN DAFTAR ANGGOTA', dateKey].map(escapeCsvCell).join(','));
      lines.push(
        ['No', 'Nama', 'ID / NIM / NIP', 'Divisi / Bagian', 'Wilayah', 'Tanggal Absen', 'Kehadiran', 'Sesi Waktu', 'Jam Masuk', 'Kemiripan (%)']
          .map(escapeCsvCell)
          .join(',')
      );
      summary.memberAttendance.forEach((m, idx) => {
        lines.push(
          [
            idx + 1,
            m.personName,
            m.identifier,
            m.department,
            m.wilayah || '-',
            m.date,
            m.attendanceStatus,
            m.sessionLabel || '-',
            m.firstEntry ? formatDateTimeID(m.firstEntry).slice(11) : '-',
            m.confidence !== null ? m.confidence : '-',
          ]
            .map(escapeCsvCell)
            .join(',')
        );
      });
      if (summary.unregisteredCount > 0) {
        lines.push(
          [
            summary.memberAttendance.length + 1,
            'Tidak Terdaftar (Bablas)',
            '-',
            'Tamu / Belum Regis',
            '-',
            dateKey,
            `Bablas (${summary.unregisteredCount}x)`,
            '-',
            '-',
            '-',
          ]
            .map(escapeCsvCell)
            .join(',')
        );
      }
    } else {
      lines.push(
        ['No', 'Tanggal & Waktu', 'Nama', 'ID / NIM / NIP', 'Divisi / Bagian', 'Status', 'Tipe Event', 'Kemiripan (%)', 'Catatan']
          .map(escapeCsvCell)
          .join(',')
      );
      summary.logs.forEach((log, idx) => {
        lines.push(
          [
            idx + 1,
            formatDateTimeID(log.enteredAt),
            log.personName,
            log.identifier || '-',
            log.department || '-',
            log.status === 'REGISTERED' ? 'Terdaftar' : 'Tidak Terdaftar (Bablas)',
            log.eventType === 'ENTRY' ? 'Presensi Masuk' : 'Lewat Tanpa Regis',
            log.status === 'REGISTERED' ? log.confidence : '-',
            log.notes || '',
          ]
            .map(escapeCsvCell)
            .join(',')
        );
      });
    }

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const filename = `presensi-wajah-${dateKey}-${mode}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengekspor CSV', detail: err.message });
  }
});

function drawPdfTable(doc, { headers, colWidths, rows, startX = 40, rowHeight = 20 }) {
  const pageBottom = doc.page.height - 45;
  let y = doc.y;

  const drawHeader = () => {
    doc.save();
    doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill('#0f172a');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
    let x = startX;
    headers.forEach((h, idx) => {
      doc.text(h, x + 5, y + 6, { width: colWidths[idx] - 10, ellipsis: true, lineBreak: false });
      x += colWidths[idx];
    });
    doc.restore();
    y += rowHeight;
  };

  drawHeader();

  rows.forEach((row, rIdx) => {
    if (y + rowHeight > pageBottom) {
      doc.addPage();
      y = 40;
      drawHeader();
    }
    const totalW = colWidths.reduce((a, b) => a + b, 0);
    doc.save();
    doc.rect(startX, y, totalW, rowHeight).fill(rIdx % 2 === 0 ? '#f8fafc' : '#ffffff');
    doc.strokeColor('#e2e8f0').lineWidth(0.5).rect(startX, y, totalW, rowHeight).stroke();
    doc.fillColor('#0f172a').font('Helvetica').fontSize(8);
    let x = startX;
    row.forEach((cell, idx) => {
      doc.text(String(cell ?? ''), x + 5, y + 6, {
        width: colWidths[idx] - 10,
        ellipsis: true,
        lineBreak: false,
      });
      x += colWidths[idx];
    });
    doc.restore();
    y += rowHeight;
  });

  doc.y = y + 12;
}

// GET /api/summary/export-pdf?date=YYYY-MM-DD&mode=logs|summary|all&workspace=piloting|gereja
router.get('/export-pdf', async (req, res) => {
  try {
    const workspace = normalizeWorkspace(req.query.workspace);
    const wsLabel = getWorkspacePdfLabel(workspace);
    const dateKey = req.query.date || toLocalDateKey(new Date());
    const mode = ['logs', 'summary', 'all'].includes(req.query.mode) ? req.query.mode : 'all';
    const summary = await buildDailySummary(dateKey, workspace);

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 40,
      info: {
        Title: `Laporan ${wsLabel} - ${dateKey}`,
        Author: 'Mardonius Riel',
      },
    });

    const filename = `presensi-${workspace}-${dateKey}-${mode}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    // Header Banner
    const pageW = doc.page.width - 80;
    doc.save();
    doc.roundedRect(40, 35, pageW, 54, 6).fill('#1c1917');
    doc.fillColor('#faf7f2').font('Helvetica-Bold').fontSize(14).text(`MARDONIUS RIEL  |  ${wsLabel}`, 56, 47);
    doc.fillColor('#d6d3d1').font('Helvetica').fontSize(9.5).text(
      `Tanggal Laporan: ${dateKey}   |   Dicetak: ${formatDateTimeID(new Date())}`,
      56,
      68
    );
    doc.restore();

    // 4 KPI Summary Cards
    const cardGap = 12;
    const cardW = (pageW - cardGap * 3) / 4;
    const cards = [
      { label: 'TOTAL ORANG MASUK', value: String(summary.totalCount), color: '#0284c7' },
      { label: 'TERDAFTAR (MASUK)', value: String(summary.registeredCount), color: '#059669' },
      { label: 'ORANG UNIK HADIR', value: String(summary.uniqueRegisteredCount), color: '#4f46e5' },
      { label: 'TIDAK TERDAFTAR (BABLAS)', value: String(summary.unregisteredCount), color: '#d97706' },
    ];

    cards.forEach((c, i) => {
      const cx = 40 + i * (cardW + cardGap);
      const cy = 104;
      doc.save();
      doc.roundedRect(cx, cy, cardW, 50, 5).fill('#f8fafc').strokeColor('#cbd5e1').lineWidth(0.8).stroke();
      doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7.5).text(c.label, cx + 10, cy + 10, { width: cardW - 20 });
      doc.fillColor(c.color).font('Helvetica-Bold').fontSize(18).text(c.value, cx + 10, cy + 23, { width: cardW - 20 });
      doc.restore();
    });

    doc.y = 172;

    if (mode === 'summary' || mode === 'all') {
      doc
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(
          `Rekap Kehadiran Daftar Anggota (${summary.presentMembersCount} Hadir / ${summary.absentMembersCount} Tidak Hadir)`,
          40,
          doc.y
        );
      doc.moveDown(0.4);

      const memberRows = summary.memberAttendance.map((m, idx) => [
        idx + 1,
        m.personName,
        m.identifier,
        m.wilayah ? `${m.department} (${m.wilayah})` : m.department,
        m.date,
        m.sessionLabel ? `${m.attendanceStatus} (${m.sessionLabel.replace('Gereja ', '')})` : m.attendanceStatus,
        m.firstEntry ? formatDateTimeID(m.firstEntry).slice(11) : '-',
        m.confidence !== null ? `${m.confidence}%` : '-',
      ]);

      if (summary.unregisteredCount > 0) {
        memberRows.push([
          memberRows.length + 1,
          'Tidak Terdaftar (Bablas)',
          '-',
          'Tamu / Belum Regis',
          dateKey,
          `Bablas (${summary.unregisteredCount}x)`,
          '-',
          '-',
        ]);
      }

      if (memberRows.length === 0) {
        doc.fillColor('#64748b').font('Helvetica').fontSize(9).text('Belum ada anggota terdaftar di database.', 40, doc.y);
        doc.moveDown(1);
      } else {
        drawPdfTable(doc, {
          headers: ['No', 'Nama Anggota', 'ID / Induk', 'Bagian / Wilayah', 'Tgl Absen', 'Kehadiran & Sesi', 'Jam Masuk', 'Sync DB'],
          colWidths: [32, 155, 85, 130, 80, 120, 75, 85],
          rows: memberRows,
        });
      }
    }

    if (mode === 'logs' || mode === 'all') {
      if (mode === 'all' && doc.y > doc.page.height - 130) {
        doc.addPage();
        doc.y = 40;
      }
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(`Detail Log Masuk (${summary.logs.length} entri)`, 40, doc.y);
      doc.moveDown(0.4);

      if (summary.logs.length === 0) {
        doc.fillColor('#64748b').font('Helvetica').fontSize(9).text('Belum ada log masuk pada tanggal ini.', 40, doc.y);
      } else {
        const logRows = summary.logs.map((log, idx) => [
          idx + 1,
          formatDateTimeID(log.enteredAt),
          log.personName,
          log.identifier || '-',
          log.department || '-',
          log.status === 'REGISTERED' ? 'Terdaftar' : 'Bablas',
          log.status === 'REGISTERED' ? `${log.confidence}%` : '-',
          log.notes || '',
        ]);

        drawPdfTable(doc, {
          headers: ['No', 'Tanggal & Jam', 'Nama', 'ID', 'Divisi', 'Status', 'Sync DB', 'Catatan'],
          colWidths: [30, 112, 130, 75, 90, 70, 55, 200],
          rows: logRows,
        });
      }
    }

    doc.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Gagal mengekspor PDF', detail: err.message });
    }
  }
});

function enumerateDateKeys(startDateStr, endDateStr, weekdaysOnly = false) {
  const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
  const today = toLocalDateKey(new Date());
  const startStr = isoPattern.test(startDateStr || '') ? startDateStr : today;
  const endStr = isoPattern.test(endDateStr || '') ? endDateStr : startStr;

  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  let cursor = new Date(sy, sm - 1, sd);
  const endDt = new Date(ey, em - 1, ed);

  if (cursor > endDt) {
    return { startDate: endStr, endDate: startStr, dateKeys: [] };
  }

  const dateKeys = [];
  let safety = 0;
  while (cursor <= endDt && safety < 366) {
    const day = cursor.getDay();
    if (!weekdaysOnly || (day !== 0 && day !== 6)) {
      dateKeys.push(toLocalDateKey(cursor));
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    safety += 1;
  }

  return { startDate: startStr, endDate: endStr, dateKeys };
}

async function buildPeriodSummary(startDateInput, endDateInput, weekdaysOnly = false, workspace = 'piloting') {
  const wsFilter = workspaceQueryFilter(workspace);
  const { startDate, endDate, dateKeys } = enumerateDateKeys(startDateInput, endDateInput, weekdaysOnly);
  const totalDays = dateKeys.length;

  const [activeUsers, logs] = await Promise.all([
    User.find({ isActive: true, ...wsFilter })
      .select('_id name identifier department role')
      .sort({ name: 1 })
      .lean(),
    totalDays > 0
      ? AttendanceLog.find({
          dateKey: { $in: dateKeys },
          status: 'REGISTERED',
          ...wsFilter,
        })
          .select('userId dateKey enteredAt')
          .lean()
      : Promise.resolve([]),
  ]);

  const userDateSet = new Map();
  for (const log of logs) {
    if (!log.userId) continue;
    const uid = String(log.userId);
    if (!userDateSet.has(uid)) userDateSet.set(uid, new Set());
    userDateSet.get(uid).add(log.dateKey);
  }

  const members = activeUsers.map((u) => {
    const presentSet = userDateSet.get(String(u._id)) || new Set();
    const presentDays = presentSet.size;
    const absentDays = Math.max(0, totalDays - presentDays);
    const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

    return {
      userId: u._id,
      personName: u.name,
      identifier: u.identifier || '-',
      department: u.department || 'Umum',
      role: u.role || 'Anggota',
      totalDays,
      presentDays,
      absentDays,
      attendanceRate,
      presentDates: Array.from(presentSet).sort(),
    };
  });

  return {
    startDate,
    endDate,
    weekdaysOnly,
    totalDays,
    totalMembers: members.length,
    members,
  };
}

// GET /api/summary/period?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&weekdaysOnly=false&workspace=piloting|gereja
router.get('/period', async (req, res) => {
  try {
    const workspace = normalizeWorkspace(req.query.workspace);
    const weekdaysOnly = req.query.weekdaysOnly === 'true';
    const report = await buildPeriodSummary(req.query.startDate, req.query.endDate, weekdaysOnly, workspace);
    res.json({ ...report, workspace });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menyusun rekap absen periode', detail: err.message });
  }
});

// GET /api/summary/export-period-csv?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&weekdaysOnly=false&workspace=piloting|gereja
router.get('/export-period-csv', async (req, res) => {
  try {
    const workspace = normalizeWorkspace(req.query.workspace);
    const weekdaysOnly = req.query.weekdaysOnly === 'true';
    const report = await buildPeriodSummary(req.query.startDate, req.query.endDate, weekdaysOnly, workspace);

    const lines = [];
    lines.push(['REKAP ABSENSI PERIODE TERTENTU', `${report.startDate} s/d ${report.endDate}`].map(escapeCsvCell).join(','));
    lines.push(['Total Hari Efektif Periode', report.totalDays].map(escapeCsvCell).join(','));
    lines.push('');
    lines.push(
      ['No', 'Nama', 'ID / NIM / NIP', 'Divisi', 'Total Hari', 'Jml Hadir', 'Jml Tidak Hadir', 'Kehadiran (%)']
        .map(escapeCsvCell)
        .join(',')
    );
    report.members.forEach((m, idx) => {
      lines.push(
        [
          idx + 1,
          m.personName,
          m.identifier,
          m.department,
          m.totalDays,
          m.presentDays,
          m.absentDays,
          `${m.attendanceRate}%`,
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    });

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const filename = `rekap-periode-${report.startDate}-sd-${report.endDate}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengekspor CSV rekap periode', detail: err.message });
  }
});

// GET /api/summary/export-period-pdf?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&weekdaysOnly=false&workspace=piloting|gereja
router.get('/export-period-pdf', async (req, res) => {
  try {
    const workspace = normalizeWorkspace(req.query.workspace);
    const wsLabel = getWorkspacePdfLabel(workspace);
    const weekdaysOnly = req.query.weekdaysOnly === 'true';
    const report = await buildPeriodSummary(req.query.startDate, req.query.endDate, weekdaysOnly, workspace);

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 40,
      info: {
        Title: `Rekap Absensi Periode ${wsLabel} (${report.startDate} s/d ${report.endDate})`,
        Author: 'Mardonius Riel',
      },
    });

    const filename = `rekap-periode-${workspace}-${report.startDate}-sd-${report.endDate}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const pageW = doc.page.width - 80;
    doc.save();
    doc.roundedRect(40, 35, pageW, 54, 6).fill('#1c1917');
    doc.fillColor('#faf7f2').font('Helvetica-Bold').fontSize(14).text(`MARDONIUS RIEL  |  REKAP PERIODE (${wsLabel})`, 56, 47);
    doc.fillColor('#d6d3d1').font('Helvetica').fontSize(9.5).text(
      `Periode: ${report.startDate} s/d ${report.endDate} (${report.totalDays} hari${report.weekdaysOnly ? ', Senin-Jumat' : ''})   |   Dicetak: ${formatDateTimeID(new Date())}`,
      56,
      68
    );
    doc.restore();

    doc.y = 108;
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(
      `Daftar Anggota (${report.totalMembers} orang)`,
      40,
      doc.y
    );
    doc.moveDown(0.4);

    if (report.members.length === 0) {
      doc.fillColor('#64748b').font('Helvetica').fontSize(9).text('Belum ada anggota terdaftar di database.', 40, doc.y);
    } else {
      const rows = report.members.map((m, idx) => [
        idx + 1,
        m.personName,
        m.identifier,
        m.department,
        `${m.totalDays} hari`,
        `${m.presentDays}x`,
        `${m.absentDays}x`,
        `${m.attendanceRate}%`,
      ]);
      drawPdfTable(doc, {
        headers: ['No', 'Nama', 'ID / NIM / NIP', 'Divisi', 'Hari Periode', 'Jml Hadir', 'Jml Tidak Hadir', 'Persentase'],
        colWidths: [32, 185, 100, 130, 80, 75, 90, 70],
        rows,
      });
    }

    doc.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Gagal mengekspor PDF rekap periode', detail: err.message });
    }
  }
});

export default router;
