import express from 'express';
import { User } from '../models/User.js';
import { findBestFaceMatch } from '../utils/faceMath.js';
import { extractWithAiService, findBestSfaceMatch, pickPrimaryFace } from '../services/aiClient.js';
import { normalizeWorkspace, workspaceQueryFilter } from '../utils/workspace.js';
import { rejectReadOnlyViewer } from '../utils/authToken.js';

const router = express.Router();

function getThreshold() {
  const val = Number(process.env.FACE_MATCH_THRESHOLD);
  return Number.isFinite(val) && val > 0 ? val : 0.52;
}

function getSfaceThreshold() {
  const val = Number(process.env.SFACE_THRESHOLD);
  return Number.isFinite(val) && val > 0 ? val : 0.38;
}

function isValidDescriptorList(arr) {
  return (
    Array.isArray(arr) &&
    arr.length > 0 &&
    arr.every((d) => Array.isArray(d) && d.length === 128 && d.every((n) => Number.isFinite(n)))
  );
}

function serializeUserSummary(userDoc) {
  const obj = userDoc.toObject ? userDoc.toObject() : userDoc;
  const browserCount = Array.isArray(obj.faceDescriptors) ? obj.faceDescriptors.length : 0;
  const sfaceCount = Array.isArray(obj.sfaceDescriptors) ? obj.sfaceDescriptors.length : 0;
  const { faceDescriptors, sfaceDescriptors, ...rest } = obj;
  return {
    ...rest,
    descriptorCount: Math.max(browserCount, sfaceCount),
    browserDescriptorCount: browserCount,
    sfaceDescriptorCount: sfaceCount,
  };
}

// GET /api/users - List registered users for Admin Dashboard
router.get('/', async (req, res) => {
  try {
    const { search = '', activeOnly, workspace } = req.query;
    const ws = normalizeWorkspace(workspace);
    const filter = { ...workspaceQueryFilter(ws) };

    if (activeOnly === 'true') {
      filter.isActive = true;
    } else if (activeOnly === 'false') {
      filter.isActive = false;
    }

    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$and = [
        workspaceQueryFilter(ws),
        {
          $or: [
            { name: regex },
            { identifier: regex },
            { department: regex },
            { role: regex },
          ],
        },
      ];
      delete filter.$or;
    }

    const users = await User.find(filter).sort({ createdAt: -1 });
    res.json({
      workspace: ws,
      users: users.map(serializeUserSummary),
      total: users.length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil data pengguna', detail: err.message });
  }
});

// GET /api/users/descriptors - Active users with face descriptors for FaceMatcher
router.get('/descriptors', async (req, res) => {
  try {
    const ws = normalizeWorkspace(req.query.workspace);
    const users = await User.find({ isActive: true, ...workspaceQueryFilter(ws) })
      .select('_id name identifier department role wilayah workspace faceDescriptors photoBase64')
      .lean();
    res.json({
      workspace: ws,
      threshold: getThreshold(),
      users,
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil descriptor wajah', detail: err.message });
  }
});

// POST /api/users/verify-face - Recognize face against MongoDB before registration
router.post('/verify-face', async (req, res) => {
  try {
    const { descriptor, workspace } = req.body;
    const ws = normalizeWorkspace(workspace || req.query.workspace);
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({ error: 'Descriptor wajah tidak valid (harus 128 dimensi)' });
    }

    const users = await User.find(workspaceQueryFilter(ws))
      .select('_id name identifier department role wilayah workspace faceDescriptors photoBase64')
      .lean();
    const match = findBestFaceMatch(descriptor, users, getThreshold());

    if (match.matched) {
      return res.json({
        recognized: true,
        workspace: ws,
        message: `Wajah sudah dikenali sebagai ${match.user.name}`,
        confidence: match.confidence,
        distance: match.distance,
        user: {
          _id: match.user._id,
          name: match.user.name,
          identifier: match.user.identifier,
          department: match.user.department,
          role: match.user.role,
          wilayah: match.user.wilayah || '',
          photoBase64: match.user.photoBase64,
        },
      });
    }

    return res.json({
      recognized: false,
      workspace: ws,
      message: 'Wajah baru terdeteksi dan belum terdaftar di ruang ini',
      closestDistance: match.distance,
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memverifikasi wajah', detail: err.message });
  }
});

// POST /api/users - Register a new user + face descriptor into MongoDB
router.post('/', rejectReadOnlyViewer, async (req, res) => {
  try {
    const {
      name,
      identifier = '',
      department = 'Umum',
      role = 'Anggota',
      wilayah = '',
      workspace,
      descriptor,
      faceDescriptors,
      sfaceDescriptor,
      sfaceDescriptors,
      photoBase64 = '',
      allowDuplicate = false,
    } = req.body;

    const ws = normalizeWorkspace(workspace || req.query.workspace);

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nama lengkap wajib diisi' });
    }

    const descriptorsToSave = Array.isArray(faceDescriptors)
      ? faceDescriptors
      : Array.isArray(descriptor)
        ? [descriptor]
        : [];

    let sfaceToSave = Array.isArray(sfaceDescriptors)
      ? sfaceDescriptors
      : Array.isArray(sfaceDescriptor)
        ? [sfaceDescriptor]
        : [];

    // Best-effort populate Server AI SFace descriptor from uploaded photo if not already provided
    if (sfaceToSave.length === 0 && typeof photoBase64 === 'string' && photoBase64.startsWith('data:image')) {
      try {
        const extracted = await extractWithAiService(photoBase64, 2500);
        const primary = pickPrimaryFace(extracted?.faces || []);
        if (primary?.embedding?.length === 128) {
          sfaceToSave = [primary.embedding];
        }
      } catch {
        // Optional when Server AI is offline; lazy sync will populate it later
      }
    }

    const hasBrowserDesc = isValidDescriptorList(descriptorsToSave);
    const hasSfaceDesc = isValidDescriptorList(sfaceToSave);
    if ((!hasBrowserDesc && !hasSfaceDesc) || (descriptorsToSave.length > 0 && !hasBrowserDesc) || (sfaceToSave.length > 0 && !hasSfaceDesc)) {
      return res.status(400).json({ error: 'Data wajah (descriptor 128-d) tidak valid atau belum terdeteksi' });
    }

    if (!allowDuplicate) {
      const existingUsers = await User.find(workspaceQueryFilter(ws))
        .select('_id name identifier faceDescriptors sfaceDescriptors')
        .lean();

      let match = hasBrowserDesc
        ? findBestFaceMatch(descriptorsToSave[0], existingUsers, getThreshold())
        : { matched: false };

      if (!match.matched && hasSfaceDesc) {
        match = findBestSfaceMatch(sfaceToSave[0], existingUsers, getSfaceThreshold());
      }

      if (match.matched) {
        return res.status(409).json({
          error: `Wajah sudah terdaftar atas nama "${match.user.name}" (kemiripan ${match.confidence}%). Gunakan menu Edit di Dashboard untuk memperbarui data atau menambah sampel wajah.`,
          matchedUser: {
            _id: match.user._id,
            name: match.user.name,
            identifier: match.user.identifier,
            confidence: match.confidence,
          },
        });
      }
    }

    const created = await User.create({
      name: name.trim(),
      identifier: identifier.trim(),
      department: department.trim() || (ws === 'gereja' ? 'Ibadah Umum' : 'Umum'),
      role: role.trim() || (ws === 'gereja' ? 'Jemaat' : 'Anggota'),
      wilayah: String(wilayah || '').trim(),
      workspace: ws,
      faceDescriptors: hasBrowserDesc ? descriptorsToSave : [],
      sfaceDescriptors: hasSfaceDesc ? sfaceToSave : [],
      photoBase64,
      isActive: true,
    });

    res.status(201).json({
      message: 'Wajah berhasil dikenali dan disimpan ke MongoDB',
      user: serializeUserSummary(created),
    });
  } catch (err) {
    res.status(400).json({ error: 'Gagal menyimpan data pengguna', detail: err.message });
  }
});

// PUT /api/users/:id - Update user metadata or face sample
router.put('/:id', rejectReadOnlyViewer, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    }

    const { name, identifier, department, role, wilayah, isActive, newDescriptor, newSfaceDescriptor, replaceDescriptors, photoBase64 } = req.body;

    if (typeof name === 'string') {
      if (!name.trim()) {
        return res.status(400).json({ error: 'Nama tidak boleh kosong' });
      }
      user.name = name.trim();
    }
    if (typeof identifier === 'string') user.identifier = identifier.trim();
    if (typeof department === 'string') user.department = department.trim() || 'Umum';
    if (typeof role === 'string') user.role = role.trim() || 'Anggota';
    if (typeof wilayah === 'string') user.wilayah = wilayah.trim();
    if (typeof isActive === 'boolean') user.isActive = isActive;
    if (typeof photoBase64 === 'string' && photoBase64) {
      const photoChanged = photoBase64 !== user.photoBase64;
      user.photoBase64 = photoBase64;
      if (photoChanged && (!Array.isArray(newSfaceDescriptor) || newSfaceDescriptor.length !== 128)) {
        try {
          const extracted = await extractWithAiService(photoBase64, 2500);
          const primary = pickPrimaryFace(extracted?.faces || []);
          user.sfaceDescriptors = primary?.embedding?.length === 128 ? [primary.embedding] : [];
        } catch {
          user.sfaceDescriptors = [];
        }
      }
    }

    if (Array.isArray(replaceDescriptors) && replaceDescriptors.length > 0) {
      user.faceDescriptors = replaceDescriptors;
    } else if (Array.isArray(newDescriptor) && newDescriptor.length === 128) {
      user.faceDescriptors.push(newDescriptor);
    }

    if (Array.isArray(newSfaceDescriptor) && newSfaceDescriptor.length === 128) {
      user.sfaceDescriptors.push(newSfaceDescriptor);
    }

    await user.save();
    res.json({
      message: 'Data pengguna berhasil diperbarui',
      user: serializeUserSummary(user),
    });
  } catch (err) {
    res.status(400).json({ error: 'Gagal memperbarui pengguna', detail: err.message });
  }
});

// DELETE /api/users/:id - Delete user
router.delete('/:id', rejectReadOnlyViewer, async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    }
    res.json({ message: `Pengguna "${deleted.name}" berhasil dihapus`, deletedId: deleted._id });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus pengguna', detail: err.message });
  }
});

export default router;
