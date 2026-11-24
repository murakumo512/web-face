const DEFAULT_AI_URL = 'http://presensi_ai:8000';
const DEFAULT_SFACE_THRESHOLD = Number(process.env.SFACE_THRESHOLD) || 0.38;

export function getAiServiceUrl() {
  const raw = process.env.AI_SERVICE_URL;
  if (raw === 'disabled' || raw === 'none') return '';
  return (raw || DEFAULT_AI_URL).replace(/\/+$/, '');
}

async function fetchAiJson(path, options = {}, timeoutMs = 4000) {
  const baseUrl = getAiServiceUrl();
  if (!baseUrl) {
    throw new Error('AI_SERVICE_URL dinonaktifkan');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.message || `AI service HTTP ${response.status}`);
  }
  return data;
}

export async function checkAiHealth() {
  try {
    const data = await fetchAiJson('/health', { method: 'GET' }, 2000);
    return {
      available: Boolean(data?.ok),
      engine: data?.engine || 'OpenCV YuNet + SFace (ONNX Server)',
      serverNode: data?.serverNode || 'ubuntu-swarm1',
      containerId: data?.containerId || '',
      cpuCount: data?.cpuCount || 0,
      error: data?.error || '',
    };
  } catch (err) {
    return {
      available: false,
      engine: null,
      serverNode: null,
      containerId: '',
      cpuCount: 0,
      error: err?.message || 'AI server tidak terjangkau',
    };
  }
}

export async function extractWithAiService(imageBase64, timeoutMs = 8000) {
  return fetchAiJson(
    '/extract',
    {
      method: 'POST',
      body: JSON.stringify({ imageBase64 }),
    },
    timeoutMs
  );
}

export async function analyzeWithAiService(imageBase64, candidates, threshold = DEFAULT_SFACE_THRESHOLD) {
  return fetchAiJson(
    '/analyze',
    {
      method: 'POST',
      body: JSON.stringify({ imageBase64, candidates, threshold }),
    },
    8000
  );
}

/**
 * Pick the dominant face (largest bounding box area) from /extract results.
 */
export function pickPrimaryFace(faces = []) {
  if (!Array.isArray(faces) || faces.length === 0) return null;
  return [...faces].sort(
    (a, b) => (b.box?.width || 0) * (b.box?.height || 0) - (a.box?.width || 0) * (a.box?.height || 0)
  )[0];
}

export function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length || vecA.length === 0) {
    return -1;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i += 1) {
    const a = vecA[i];
    const b = vecB[i];
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA <= 0 || normB <= 0) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function sfaceSimilarityToConfidence(sim) {
  if (!Number.isFinite(sim) || sim < -1) return 0;
  const pct = ((sim - 0.05) / 0.7) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function findBestSfaceMatch(probeEmbedding, users, threshold = DEFAULT_SFACE_THRESHOLD) {
  let bestMatch = null;
  let bestSim = -1;

  for (const user of users) {
    const descriptors = user.sfaceDescriptors || [];
    for (const storedDesc of descriptors) {
      const sim = cosineSimilarity(probeEmbedding, storedDesc);
      if (sim > bestSim) {
        bestSim = sim;
        bestMatch = user;
      }
    }
  }

  if (bestMatch && bestSim >= threshold) {
    return {
      matched: true,
      user: bestMatch,
      similarity: Number(bestSim.toFixed(4)),
      confidence: sfaceSimilarityToConfidence(bestSim),
    };
  }

  return {
    matched: false,
    user: null,
    similarity: bestSim > -1 ? Number(bestSim.toFixed(4)) : null,
    confidence: bestSim > -1 ? sfaceSimilarityToConfidence(bestSim) : 0,
  };
}
