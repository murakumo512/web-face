import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import {
  captureVideoJpegBase64,
  detectAllFacesWithDescriptors,
  detectFaceBoxesFast,
  isMobileBrowser,
  matchDescriptor,
  scaleBoxToSource,
} from '../services/faceService.js';

const STORAGE_KEY = 'mardonius_ai_mode';
const VALID_MODES = ['auto', 'server', 'browser'];

export function readStoredAiMode() {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return VALID_MODES.includes(val) ? val : 'auto';
  } catch {
    return 'auto';
  }
}

export function useHybridAi(modelsReady = false) {
  const [aiMode, setAiMode] = useState(readStoredAiMode);
  const modeEpochRef = useRef(0);
  const [serverHealth, setServerHealth] = useState({
    checked: false,
    available: false,
    engine: '',
    serverNode: '',
    containerId: '',
    cpuCount: 0,
    error: '',
  });
  const [telemetry, setTelemetry] = useState({
    processedBy: null, // 'server' | 'browser' | null
    serverNode: '',
    containerId: '',
    engine: '',
    inferenceMs: null,
    roundTripMs: null,
    candidateCount: 0,
    updatedAt: 0,
  });

  const refreshHealth = useCallback(async () => {
    try {
      const res = await api.getAiHealth();
      setServerHealth({
        checked: true,
        available: Boolean(res?.available),
        engine: res?.engine || '',
        serverNode: res?.serverNode || 'ubuntu-swarm1',
        containerId: res?.containerId || '',
        cpuCount: res?.cpuCount || 0,
        error: res?.error || '',
      });
    } catch (err) {
      setServerHealth((prev) => ({
        ...prev,
        checked: true,
        available: false,
        error: err?.message || 'Server AI offline',
      }));
    }
  }, []);

  useEffect(() => {
    refreshHealth();
    const id = setInterval(refreshHealth, 12000);
    return () => clearInterval(id);
  }, [refreshHealth]);

  const setAndSaveAiMode = useCallback((nextMode) => {
    const clean = VALID_MODES.includes(nextMode) ? nextMode : 'auto';
    modeEpochRef.current += 1;
    setAiMode(clean);
    setTelemetry({
      processedBy: clean === 'browser' ? 'browser' : clean === 'server' ? 'server' : null,
      serverNode: '',
      containerId: '',
      engine: clean === 'browser' ? 'face-api.js (Client)' : '',
      inferenceMs: null,
      roundTripMs: null,
      candidateCount: 0,
      updatedAt: Date.now(),
    });
    try {
      localStorage.setItem(STORAGE_KEY, clean);
    } catch {
      // ignore storage errors
    }
  }, []);

  const cycleAiMode = useCallback(() => {
    const idx = VALID_MODES.indexOf(aiMode);
    const next = VALID_MODES[(idx + 1) % VALID_MODES.length];
    setAndSaveAiMode(next);
  }, [aiMode, setAndSaveAiMode]);

  const useServerAi =
    aiMode === 'server' || (aiMode === 'auto' && Boolean(serverHealth.available));

  // Server AI doesn't need browser TensorFlow models loaded to start immediately on mobile!
  const engineReady =
    aiMode === 'server'
      ? serverHealth.available
      : aiMode === 'browser'
        ? modelsReady
        : serverHealth.available || modelsReady;

  const getAiEpoch = useCallback(() => modeEpochRef.current, []);

  const recordTelemetry = useCallback((info, expectedEpoch) => {
    if (!info) return;
    if (expectedEpoch !== undefined && expectedEpoch !== modeEpochRef.current) {
      return;
    }
    setTelemetry({
      ...info,
      updatedAt: Date.now(),
    });
  }, []);

  return {
    aiMode,
    setAiMode: setAndSaveAiMode,
    cycleAiMode,
    getAiEpoch,
    serverHealth,
    refreshHealth,
    useServerAi,
    engineReady,
    telemetry,
    recordTelemetry,
  };
}

/**
 * Shared frame recognizer for Live views. Returns unified face objects + telemetry so
 * FullScreenLive & LiveMonitor avoid duplicating Server/Browser recognition branches.
 */
export async function recognizeFrameHybrid({
  mediaEl,
  useServerAi,
  allowBrowserFallback,
  modelsReady,
  workspace,
  matcher,
  userMap,
  runDescriptorPass = true,
  fastMode = true,
}) {
  const mobile = isMobileBrowser();
  const srcW = mediaEl.videoWidth || mediaEl.naturalWidth || mediaEl.clientWidth || 0;
  const srcH = mediaEl.videoHeight || mediaEl.naturalHeight || mediaEl.clientHeight || 0;

  if (useServerAi) {
    try {
      const frameB64 = captureVideoJpegBase64(mediaEl, mobile ? 448 : 512, 0.74);
      const res = await api.aiRecognize(frameB64, workspace);
      const faces = (res.faces || []).map((f) => {
        const box = scaleBoxToSource(f.box, srcW, srcH, res.imageWidth, res.imageHeight);
        return {
          box,
          matched: Boolean(f.matched),
          user: f.matched ? { _id: f.userId, name: f.name, wilayah: f.wilayah || '' } : null,
          closestUser: f.name && !f.matched ? { name: f.name } : null,
          confidence: f.confidence || 0,
          distance: f.similarity ?? null,
          descriptor: null,
          sfaceDescriptor: Array.isArray(f.embedding) ? f.embedding : null,
          hasDescriptorCheck: true,
        };
      });

      return {
        faces,
        isFastBoxOnly: false,
        telemetry: {
          processedBy: 'server',
          serverNode: res.serverNode || 'ubuntu-swarm1',
          containerId: res.containerId || '',
          engine: res.engine || 'YuNet+SFace',
          inferenceMs: res.inferenceMs,
          roundTripMs: res.roundTripMs,
          candidateCount: res.candidateCount || 0,
        },
      };
    } catch (err) {
      if (!allowBrowserFallback || !modelsReady) {
        throw err;
      }
      // Fall through cleanly to Browser AI below if Auto mode & Browser models are ready
    }
  }

  if (!modelsReady) {
    return {
      faces: [],
      isFastBoxOnly: false,
      telemetry: null,
    };
  }

  const t0 = performance.now();
  if (runDescriptorPass) {
    const rawDets = await detectAllFacesWithDescriptors(mediaEl, {
      fastMode,
      skipFallback: fastMode,
      minConfidence: 0.22,
      maxSide: mobile ? 360 : 480,
    });
    const inferenceMs = Math.round((performance.now() - t0) * 10) / 10;
    const faces = rawDets.map((d) => {
      const m = matchDescriptor(d.descriptor, matcher, userMap);
      return {
        box: d.detection.box,
        matched: m.matched,
        user: m.user,
        closestUser: m.closestUser || null,
        confidence: m.confidence,
        distance: m.distance,
        descriptor: Array.from(d.descriptor),
        sfaceDescriptor: null,
        hasDescriptorCheck: true,
      };
    });
    return {
      faces,
      isFastBoxOnly: false,
      telemetry: {
        processedBy: 'browser',
        serverNode: 'Browser Lokal',
        containerId: '',
        engine: 'face-api.js (Client)',
        inferenceMs,
        roundTripMs: inferenceMs,
        candidateCount: userMap?.size || 0,
      },
    };
  }

  const fastBoxes = await detectFaceBoxesFast(mediaEl, {
    inputSize: mobile ? 160 : 224,
    scoreThreshold: 0.22,
    maxSide: mobile ? 300 : 420,
  });
  return {
    faces: fastBoxes.map((fb) => ({
      box: fb.box,
      matched: false,
      user: null,
      closestUser: null,
      confidence: 0,
      distance: null,
      descriptor: null,
      sfaceDescriptor: null,
      hasDescriptorCheck: false,
    })),
    isFastBoxOnly: true,
    telemetry: null,
  };
}
