import { Router } from 'express';
import { User } from '../models/User.js';
import {
  analyzeWithAiService,
  checkAiHealth,
  extractWithAiService,
  findBestSfaceMatch,
  pickPrimaryFace,
} from '../services/aiClient.js';
import { normalizeWorkspace, workspaceQueryFilter } from '../utils/workspace.js';

const router = Router();

// Cooldown tracker for photos that fail face extraction so live loops don't retry them every frame.
const syncCooldownMap = new Map();
const SYNC_RETRY_COOLDOWN_MS = 5 * 60 * 1000;
const SFACE_THRESHOLD = Number(process.env.SFACE_THRESHOLD) || 0.38;

async function syncMissingSfaceEmbeddings(workspace) {
  const now = Date.now();
  const pendingUsers = await User.find({
    ...workspaceQueryFilter(workspace),
    isActive: true,
    photoBase64: { $exists: true, $ne: '' },
    $or: [{ sfaceDescriptors: { $exists: false } }, { sfaceDescriptors: { $size: 0 } }],
  })
    .select('_id name photoBase64')
    .limit(5)
    .lean();

  let syncedCount = 0;
  for (const user of pendingUsers) {
    const key = String(user._id);
    const lastTry = syncCooldownMap.get(key) || 0;
    if (now - lastTry < SYNC_RETRY_COOLDOWN_MS) continue;

    syncCooldownMap.set(key, now);
    try {
      const extracted = await extractWithAiService(user.photoBase64);
      const primary = pickPrimaryFace(extracted?.faces || []);
      if (primary?.embedding?.length === 128) {
        await User.updateOne(
          { _id: user._id },
          { $set: { sfaceDescriptors: [primary.embedding] } }
        );
        syncCooldownMap.delete(key);
        syncedCount += 1;
      }
    } catch {
      // Stop syncing batch if AI service itself is unreachable
      break;
    }
  }
  return syncedCount;
}

// GET /api/ai/health — Report Swarm Server AI availability and runtime host
router.get('/health', async (_req, res) => {
  const status = await checkAiHealth();
  res.json(status);
});

// POST /api/ai/extract — Extract SFace 128-d descriptor on Swarm Server + check duplicate
router.post('/extract', async (req, res, next) => {
  try {
    const { imageBase64, workspace } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'imageBase64 wajib diisi', message: 'imageBase64 wajib diisi' });
    }

    const ws = normalizeWorkspace(workspace);
    await syncMissingSfaceEmbeddings(ws);

    const extracted = await extractWithAiService(imageBase64);
    const faces = extracted?.faces || [];
    if (faces.length === 0) {
      return res.status(422).json({
        error: 'Wajah tidak terdeteksi di server AI. Pastikan pencahayaan cukup dan wajah terlihat jelas.',
        message: 'Wajah tidak terdeteksi di server AI. Pastikan pencahayaan cukup dan wajah terlihat jelas.',
        faces: [],
        inferenceMs: extracted?.inferenceMs || 0,
        serverNode: extracted?.serverNode || 'ubuntu-swarm1',
        engine: extracted?.engine || 'YuNet+SFace',
      });
    }

    const primary = pickPrimaryFace(faces);
    const users = await User.find({
      ...workspaceQueryFilter(ws),
      isActive: true,
      sfaceDescriptors: { $exists: true, $not: { $size: 0 } },
    })
      .select('name identifier role wilayah sfaceDescriptors')
      .lean();

    const dupMatch = findBestSfaceMatch(primary.embedding, users, SFACE_THRESHOLD);

    return res.json({
      embedding: primary.embedding,
      box: primary.box,
      faceCount: faces.length,
      imageWidth: extracted.imageWidth,
      imageHeight: extracted.imageHeight,
      inferenceMs: extracted.inferenceMs,
      engine: extracted.engine || 'YuNet+SFace',
      serverNode: extracted.serverNode || 'ubuntu-swarm1',
      containerId: extracted.containerId || '',
      duplicate: dupMatch.matched
        ? {
            matched: true,
            user: {
              _id: dupMatch.user._id,
              name: dupMatch.user.name,
              identifier: dupMatch.user.identifier,
              role: dupMatch.user.role,
              wilayah: dupMatch.user.wilayah || '',
            },
            similarity: dupMatch.similarity,
            confidence: dupMatch.confidence,
          }
        : { matched: false },
    });
  } catch (err) {
    if (err.message?.includes('fetch') || err.name === 'TimeoutError' || err.name === 'AbortError' || err.message?.includes('AI_SERVICE_URL')) {
      const msg = `Server AI belum aktif (${err.message}). Gunakan Browser Lokal sementara.`;
      return res.status(503).json({
        error: msg,
        message: msg,
      });
    }
    return next(err);
  }
});

// POST /api/ai/recognize — Detect & recognize all faces in a camera frame via Swarm Server AI
router.post('/recognize', async (req, res, next) => {
  const t0 = Date.now();
  try {
    const { imageBase64, workspace } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'imageBase64 wajib diisi', message: 'imageBase64 wajib diisi' });
    }

    const ws = normalizeWorkspace(workspace);
    await syncMissingSfaceEmbeddings(ws);

    const users = await User.find({
      ...workspaceQueryFilter(ws),
      isActive: true,
      sfaceDescriptors: { $exists: true, $not: { $size: 0 } },
    })
      .select('_id name wilayah sfaceDescriptors')
      .lean();

    const candidates = users.map((u) => ({
      userId: String(u._id),
      name: u.name,
      wilayah: u.wilayah || '',
      embeddings: u.sfaceDescriptors || [],
    }));

    const result = await analyzeWithAiService(imageBase64, candidates, SFACE_THRESHOLD);
    return res.json({
      ...result,
      roundTripMs: Date.now() - t0,
      candidateCount: candidates.length,
      processedBy: 'server',
    });
  } catch (err) {
    if (err.message?.includes('fetch') || err.name === 'TimeoutError' || err.name === 'AbortError' || err.message?.includes('AI_SERVICE_URL')) {
      const msg = `Server AI tidak terjangkau (${err.message})`;
      return res.status(503).json({
        error: msg,
        message: msg,
      });
    }
    return next(err);
  }
});

export default router;
