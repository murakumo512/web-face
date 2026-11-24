import express from 'express';
import { AttendanceLog } from '../models/AttendanceLog.js';
import { User } from '../models/User.js';
import { formatDateTimeID, getChurchSessionLabel, toLocalDateKey } from '../utils/dateUtils.js';
import { normalizeWorkspace, workspaceQueryFilter } from '../utils/workspace.js';
import { rejectReadOnlyViewer } from '../utils/authToken.js';

const router = express.Router();

/**
 * Resolve dateKey, enteredAt Date, and sessionLabel ("Gereja Pagi" / "Gereja Sore")
 * from optional custom date (YYYY-MM-DD) and sessionTime (HH:mm).
 */
function resolveLogTimestamp(dateStr, sessionTimeStr, fallbackDate = new Date()) {
  const base = fallbackDate instanceof Date ? fallbackDate : new Date(fallbackDate);
  const validDate = typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim());
  const validTime =
    typeof sessionTimeStr === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(sessionTimeStr.trim());

  const dateKey = validDate ? dateStr.trim() : toLocalDateKey(base);
  let enteredAt = base;

  if (validDate || validTime) {
    const [y, m, d] = dateKey.split('-').map(Number);
    let hh = base.getHours();
    let mm = base.getMinutes();
    if (validTime) {
      const parts = sessionTimeStr.trim().split(':').map(Number);
      hh = parts[0];
      mm = parts[1];
    }
    enteredAt = new Date(y, m - 1, d, hh, mm, base.getSeconds());
  }

  return {
    dateKey,
    enteredAt,
    sessionLabel: getChurchSessionLabel(enteredAt),
  };
}

// GET /api/logs - Query attendance and counting logs
router.get('/', async (req, res) => {
  try {
    const {
      date,
      startDate,
      endDate,
      status,
      workspace,
      search = '',
      limit = '100',
      page = '1',
    } = req.query;

    const ws = normalizeWorkspace(workspace);
    const wsFilter = workspaceQueryFilter(ws);
    const filter = { ...wsFilter };

    if (date) {
      filter.dateKey = date;
    } else if (startDate || endDate) {
      filter.dateKey = {};
      if (startDate) filter.dateKey.$gte = startDate;
      if (endDate) filter.dateKey.$lte = endDate;
    }

    if (status === 'REGISTERED' || status === 'UNREGISTERED') {
      filter.status = status;
    }

    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$and = [
        wsFilter,
        {
          $or: [
            { personName: regex },
            { identifier: regex },
            { department: regex },
            { notes: regex },
          ],
        },
      ];
      delete filter.$or;
    }

    const parsedLimit = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const [logs, total] = await Promise.all([
      AttendanceLog.find(filter)
        .sort({ enteredAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      AttendanceLog.countDocuments(filter),
    ]);

    res.json({
      logs,
      total,
      page: parsedPage,
      limit: parsedLimit,
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil log masuk', detail: err.message });
  }
});

// POST /api/logs - Record a recognized entry (1x per day per user by default) or an unregistered pass-through ("bablas")
router.post('/', async (req, res) => {
  try {
    const {
      userId = null,
      personName,
      identifier = '-',
      department = '-',
      wilayah = '',
      status,
      eventType,
      workspace,
      confidence = 0,
      distance = null,
      snapshotBase64 = '',
      notes = '',
      cooldownSeconds = 0,
      date = '',
      sessionTime = '',
      oncePerDay = true,
    } = req.body;

    if (!status || !['REGISTERED', 'UNREGISTERED'].includes(status)) {
      return res.status(400).json({ error: 'Status log harus REGISTERED atau UNREGISTERED' });
    }

    const now = new Date();
    const { dateKey, enteredAt, sessionLabel } = resolveLogTimestamp(date, sessionTime, now);

    let resolvedName = personName;
    let resolvedIdentifier = identifier;
    let resolvedDepartment = department;
    let resolvedWilayah = String(wilayah || '').trim();
    let resolvedUserId = userId;
    let resolvedWorkspace = normalizeWorkspace(workspace);

    if (status === 'REGISTERED') {
      if (!userId) {
        return res.status(400).json({ error: 'userId wajib diisi untuk status REGISTERED' });
      }
      const user = await User.findById(userId).lean();
      if (!user) {
        return res.status(404).json({ error: 'User tidak ditemukan di database' });
      }
      resolvedUserId = user._id;
      resolvedName = user.name;
      resolvedIdentifier = user.identifier || '-';
      resolvedDepartment = user.department || (user.workspace === 'gereja' ? 'Ibadah Umum' : 'Umum');
      resolvedWilayah = user.wilayah || resolvedWilayah;
      resolvedWorkspace = normalizeWorkspace(user.workspace || workspace);

      // Prevent duplicate/overwriting attendance for the same user on the same dateKey + sessionLabel
      if (oncePerDay !== false) {
        const existingToday = await AttendanceLog.findOne({
          userId: user._id,
          status: 'REGISTERED',
          dateKey,
          sessionLabel,
        })
          .sort({ enteredAt: 1 })
          .lean();

        if (existingToday) {
          const jamStr = formatDateTimeID(existingToday.enteredAt).slice(11, 16);
          return res.status(200).json({
            skipped: true,
            alreadyCheckedIn: true,
            firstEntryAt: existingToday.enteredAt,
            reason: `${user.name} sudah presensi pada ${dateKey} jam ${jamStr}`,
            log: existingToday,
          });
        }
      } else if (cooldownSeconds > 0) {
        // Fallback short cooldown only when oncePerDay is explicitly disabled
        const cutoff = new Date(now.getTime() - cooldownSeconds * 1000);
        const recent = await AttendanceLog.findOne({
          userId: user._id,
          status: 'REGISTERED',
          enteredAt: { $gte: cutoff },
        }).lean();
        if (recent) {
          return res.status(200).json({
            skipped: true,
            alreadyCheckedIn: false,
            reason: `Cooldown aktif untuk ${user.name}`,
            log: recent,
          });
        }
      }
    } else {
      resolvedUserId = null;
      resolvedName =
        (personName && personName.trim()) ||
        (resolvedWorkspace === 'gereja' ? 'Tamu / Pengunjung Ibadah' : 'Tidak Terdaftar (Bablas)');
      resolvedIdentifier = '-';
      resolvedDepartment = resolvedWorkspace === 'gereja' ? 'Tamu Ibadah' : 'Tamu / Belum Regis';
    }

    const created = await AttendanceLog.create({
      userId: resolvedUserId,
      personName: resolvedName,
      identifier: resolvedIdentifier,
      department: resolvedDepartment,
      wilayah: resolvedWilayah,
      sessionLabel,
      workspace: resolvedWorkspace,
      status,
      eventType: eventType || (status === 'REGISTERED' ? 'ENTRY' : 'PASS_THROUGH'),
      confidence: Math.round(Number(confidence) || 0),
      distance: distance !== null && distance !== undefined ? Number(distance) : null,
      snapshotBase64,
      notes:
        notes ||
        (status === 'REGISTERED'
          ? 'Wajah dikenali & presensi tercatat otomatis'
          : resolvedWorkspace === 'gereja'
            ? 'Tamu / pengunjung belum terdaftar dihitung otomatis'
            : 'Wajah tidak dikenal tetap lewat (bablas) tanpa registrasi'),
      dateKey,
      enteredAt,
    });

    res.status(201).json({
      skipped: false,
      alreadyCheckedIn: false,
      log: created,
    });
  } catch (err) {
    res.status(400).json({ error: 'Gagal mencatat log masuk', detail: err.message });
  }
});

// PUT /api/logs/:id - Update an existing attendance/counting log dynamically
router.put('/:id', rejectReadOnlyViewer, async (req, res) => {
  try {
    const log = await AttendanceLog.findById(req.params.id);
    if (!log) {
      return res.status(404).json({ error: 'Log tidak ditemukan' });
    }

    const {
      userId,
      status,
      personName,
      identifier,
      department,
      wilayah,
      notes,
      date,
      sessionTime,
    } = req.body || {};

    if (userId) {
      const user = await User.findById(userId).lean();
      if (!user) {
        return res.status(404).json({ error: 'User tidak ditemukan di database' });
      }
      log.userId = user._id;
      log.status = 'REGISTERED';
      log.eventType = 'ENTRY';
      log.personName = typeof personName === 'string' && personName.trim() ? personName.trim() : user.name;
      log.identifier = typeof identifier === 'string' && identifier.trim() ? identifier.trim() : user.identifier || '-';
      log.department = typeof department === 'string' && department.trim() ? department.trim() : user.department || '-';
      log.wilayah = typeof wilayah === 'string' ? wilayah.trim() : user.wilayah || '';
    } else {
      if (status && ['REGISTERED', 'UNREGISTERED'].includes(status)) {
        log.status = status;
        log.eventType = status === 'REGISTERED' ? 'ENTRY' : 'PASS_THROUGH';
        if (status === 'UNREGISTERED') {
          log.userId = null;
        }
      }
      if (typeof personName === 'string' && personName.trim()) log.personName = personName.trim();
      if (typeof identifier === 'string') log.identifier = identifier.trim() || '-';
      if (typeof department === 'string') log.department = department.trim() || '-';
      if (typeof wilayah === 'string') log.wilayah = wilayah.trim();
    }

    if (typeof notes === 'string') {
      log.notes = notes.trim();
    }

    if (date || sessionTime) {
      const { dateKey, enteredAt, sessionLabel } = resolveLogTimestamp(
        date || log.dateKey,
        sessionTime,
        log.enteredAt || new Date()
      );
      log.dateKey = dateKey;
      log.enteredAt = enteredAt;
      log.sessionLabel = sessionLabel;
    }

    await log.save();
    res.json({
      message: 'Log berhasil diperbarui',
      log,
    });
  } catch (err) {
    res.status(400).json({ error: 'Gagal memperbarui log', detail: err.message });
  }
});

// DELETE /api/logs/:id - Delete a specific log entry
router.delete('/:id', rejectReadOnlyViewer, async (req, res) => {
  try {
    const deleted = await AttendanceLog.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Log tidak ditemukan' });
    }
    res.json({ message: 'Log berhasil dihapus', deletedId: deleted._id });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus log', detail: err.message });
  }
});

export default router;
