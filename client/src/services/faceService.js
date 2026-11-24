import * as faceapi from '@vladmandic/face-api';

let modelsLoadPromise = null;
let activeBackend = 'unknown';

export function getActiveBackend() {
  return activeBackend;
}

export async function loadFaceModels() {
  if (!modelsLoadPromise) {
    modelsLoadPromise = (async () => {
      try {
        if (faceapi.tf?.setBackend) {
          await faceapi.tf.setBackend('webgl').catch(() => faceapi.tf.setBackend('cpu'));
          await faceapi.tf.ready();
          activeBackend = faceapi.tf.getBackend?.() || 'webgl';
        }
      } catch {
        activeBackend = 'default';
      }

      const modelUrl = '/models';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
        faceapi.nets.ssdMobilenetv1.loadFromUri(modelUrl),
        faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl),
        faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl),
      ]);

      // Warmup TinyFaceDetector with a tiny blank canvas so first real frame doesn't freeze UI
      try {
        const warmup = document.createElement('canvas');
        warmup.width = 128;
        warmup.height = 128;
        await faceapi.detectAllFaces(
          warmup,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 128, scoreThreshold: 0.5 })
        );
      } catch {
        // ignore warmup failure
      }

      return true;
    })().catch((err) => {
      modelsLoadPromise = null;
      throw err;
    });
  }
  return modelsLoadPromise;
}

export function distanceToConfidence(distance) {
  if (!Number.isFinite(distance)) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - Math.min(distance, 1.0)) * 100)));
}

let reusableSnapCanvas = null;

export function isMobileBrowser() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent || '');
}

/**
 * Snapshot a <video> frame to a reusable offscreen <canvas> (clamping max dimension for speed).
 * Handles both landscape (desktop) and portrait (mobile) streams accurately.
 */
export function snapshotVideoToCanvas(videoEl, maxSide = 480) {
  const vw = videoEl.videoWidth || videoEl.width || 0;
  const vh = videoEl.videoHeight || videoEl.height || 0;
  if (!vw || !vh) return null;

  const largest = Math.max(vw, vh);
  const scale = largest > maxSide ? maxSide / largest : 1;
  if (!reusableSnapCanvas) {
    reusableSnapCanvas = document.createElement('canvas');
  }
  const canvas = reusableSnapCanvas;
  const targetW = Math.max(1, Math.round(vw * scale));
  const targetH = Math.max(1, Math.round(vh * scale));
  if (canvas.width !== targetW) canvas.width = targetW;
  if (canvas.height !== targetH) canvas.height = targetH;

  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  ctx.drawImage(videoEl, 0, 0, targetW, targetH);

  return {
    canvas,
    invScale: 1 / scale,
    srcWidth: vw,
    srcHeight: vh,
  };
}

function scaleBox(box, factor) {
  if (factor === 1) return box;
  return {
    x: box.x * factor,
    y: box.y * factor,
    width: box.width * factor,
    height: box.height * factor,
  };
}

/**
 * Ultra-fast box-only face detection (~10-30ms) for smooth UI without lag.
 */
export async function detectFaceBoxesFast(
  mediaEl,
  { inputSize = 224, scoreThreshold = 0.24, maxSide = 420 } = {}
) {
  const isVideo = mediaEl instanceof HTMLVideoElement;
  let targetEl = mediaEl;
  let invScale = 1;

  if (isVideo) {
    const snap = snapshotVideoToCanvas(mediaEl, maxSide);
    if (!snap) return [];
    targetEl = snap.canvas;
    invScale = snap.invScale;
  }

  const options = new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold });
  const dets = await faceapi.detectAllFaces(targetEl, options);

  return dets.map((d) => ({
    box: scaleBox(d.box, invScale),
    score: d.score,
  }));
}

/**
 * Full detection + 68 landmarks + 128-d face descriptors.
 * Uses snapshot for video; skips heavy SSD fallback during live fastMode ticks so mobile UI stays smooth.
 */
export async function detectAllFacesWithDescriptors(
  mediaEl,
  { fastMode = false, minConfidence = 0.28, skipFallback = false, maxSide = 480 } = {}
) {
  const isVideo = mediaEl instanceof HTMLVideoElement;
  let targetEl = mediaEl;
  let invScale = 1;

  if (isVideo) {
    const snap = snapshotVideoToCanvas(mediaEl, maxSide);
    if (!snap) return [];
    targetEl = snap.canvas;
    invScale = snap.invScale;
  }

  const primaryOpts = fastMode
    ? new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: Math.min(minConfidence, 0.24) })
    : new faceapi.SsdMobilenetv1Options({ minConfidence });

  let detections = await faceapi
    .detectAllFaces(targetEl, primaryOpts)
    .withFaceLandmarks()
    .withFaceDescriptors();

  // Fallback detector only when explicitly allowed (static photos / registration)
  if (detections.length === 0 && !skipFallback) {
    const fallbackOpts = fastMode
      ? new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 })
      : new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.22 });
    detections = await faceapi
      .detectAllFaces(targetEl, fallbackOpts)
      .withFaceLandmarks()
      .withFaceDescriptors();
  }

  if (invScale === 1) return detections;

  return detections.map((det) => ({
    ...det,
    detection: {
      ...det.detection,
      box: scaleBox(det.detection.box, invScale),
    },
  }));
}

export function buildFaceMatcher(users, threshold = 0.52) {
  const validUsers = (users || []).filter(
    (u) => Array.isArray(u.faceDescriptors) && u.faceDescriptors.length > 0
  );

  const userMap = new Map();
  if (validUsers.length === 0) {
    return { matcher: null, userMap, threshold };
  }

  const labeledDescriptors = validUsers.map((u) => {
    userMap.set(String(u._id), u);
    const descriptors = u.faceDescriptors.map((d) => new Float32Array(d));
    return new faceapi.LabeledFaceDescriptors(String(u._id), descriptors);
  });

  const matcher = new faceapi.FaceMatcher(labeledDescriptors, threshold);
  return { matcher, userMap, threshold };
}

export function matchDescriptor(descriptor, matcher, userMap) {
  if (!matcher) {
    return {
      matched: false,
      user: null,
      closestUser: null,
      distance: null,
      confidence: 0,
    };
  }

  // Compute raw closest distance even if above threshold so UI can show exact DB sync %
  let bestLabel = null;
  let bestDist = Infinity;
  for (const labeled of matcher.labeledDescriptors) {
    for (const stored of labeled.descriptors) {
      const dist = faceapi.euclideanDistance(descriptor, stored);
      if (dist < bestDist) {
        bestDist = dist;
        bestLabel = labeled.label;
      }
    }
  }

  const closestUser = bestLabel ? userMap.get(bestLabel) || null : null;
  const confidence = Number.isFinite(bestDist) ? distanceToConfidence(bestDist) : 0;
  const distance = Number.isFinite(bestDist) ? Number(bestDist.toFixed(4)) : null;
  const matched = Boolean(closestUser && bestDist <= matcher.distanceThreshold);

  return {
    matched,
    user: matched ? closestUser : null,
    closestUser,
    distance,
    confidence,
  };
}

export function captureFaceCropBase64(mediaEl, box, targetSize = 180) {
  try {
    const srcWidth = mediaEl.videoWidth || mediaEl.naturalWidth || mediaEl.width;
    const srcHeight = mediaEl.videoHeight || mediaEl.naturalHeight || mediaEl.height;
    if (!srcWidth || !srcHeight || !box) return '';

    const padX = box.width * 0.28;
    const padY = box.height * 0.32;
    const sx = Math.max(0, Math.floor(box.x - padX));
    const sy = Math.max(0, Math.floor(box.y - padY));
    const sw = Math.min(srcWidth - sx, Math.ceil(box.width + padX * 2));
    const sh = Math.min(srcHeight - sy, Math.ceil(box.height + padY * 2));

    if (sw <= 0 || sh <= 0) return '';

    const canvas = document.createElement('canvas');
    const ratio = Math.min(targetSize / sw, targetSize / sh, 1);
    canvas.width = Math.max(1, Math.round(sw * ratio));
    canvas.height = Math.max(1, Math.round(sh * ratio));

    const ctx = canvas.getContext('2d');
    ctx.drawImage(mediaEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return '';
  }
}

/**
 * Capture a downscaled JPEG frame from video/image for fast Hybrid Server AI upload (~20-45 KB).
 */
export function captureVideoJpegBase64(mediaEl, maxSide = 512, quality = 0.76) {
  if (!mediaEl) return '';
  const srcW = mediaEl.videoWidth || mediaEl.naturalWidth || mediaEl.clientWidth || 0;
  const srcH = mediaEl.videoHeight || mediaEl.naturalHeight || mediaEl.clientHeight || 0;
  if (!srcW || !srcH) return '';

  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const targetW = Math.max(1, Math.round(srcW * scale));
  const targetH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(mediaEl, 0, 0, targetW, targetH);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Scale bounding box returned by Server AI (resized frame coords) back into source media coords.
 */
export function scaleBoxToSource(box, srcW, srcH, frameW, frameH) {
  if (!box || !srcW || !srcH || !frameW || !frameH) return box;
  const sx = srcW / frameW;
  const sy = srcH / frameH;
  return {
    x: box.x * sx,
    y: box.y * sy,
    width: box.width * sx,
    height: box.height * sy,
  };
}

export function computeBoxIoU(a, b) {
  if (!a || !b) return 0;
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;
  if (interArea <= 0) return 0;

  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  return interArea / (areaA + areaB - interArea);
}

/**
 * Draw bounding boxes aligned accurately with object-contain or object-cover media element.
 * Supports optional horizontal mirror (`mirror: true`) while keeping label text un-mirrored.
 */
export function drawDetectionsOnCanvas(canvas, mediaEl, trackedResults, fitOrOptions = 'contain') {
  if (!canvas || !mediaEl) return;
  const fitMode =
    typeof fitOrOptions === 'string' ? fitOrOptions : fitOrOptions?.fitMode || 'contain';
  const mirror = typeof fitOrOptions === 'object' ? Boolean(fitOrOptions?.mirror) : false;

  const displayWidth = mediaEl.clientWidth || mediaEl.width;
  const displayHeight = mediaEl.clientHeight || mediaEl.height;
  const srcWidth = mediaEl.videoWidth || mediaEl.naturalWidth || displayWidth;
  const srcHeight = mediaEl.videoHeight || mediaEl.naturalHeight || displayHeight;

  if (!displayWidth || !displayHeight || !srcWidth || !srcHeight) return;

  canvas.width = displayWidth;
  canvas.height = displayHeight;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale =
    fitMode === 'cover'
      ? Math.max(displayWidth / srcWidth, displayHeight / srcHeight)
      : Math.min(displayWidth / srcWidth, displayHeight / srcHeight);
  const renderedWidth = srcWidth * scale;
  const renderedHeight = srcHeight * scale;
  const offsetX = (displayWidth - renderedWidth) / 2;
  const offsetY = (displayHeight - renderedHeight) / 2;

  for (const item of trackedResults) {
    const { box, matched, user, confidence, trackLabel, isCooldown } = item;
    const rawX = offsetX + box.x * scale;
    const w = box.width * scale;
    const h = box.height * scale;
    const x = mirror ? displayWidth - (rawX + w) : rawX;
    const y = offsetY + box.y * scale;

    // Green for detected/matched faces; amber border if explicitly flagged unregistered
    const color = matched
      ? isCooldown
        ? '#22d3ee'
        : '#10b981'
      : item.isPreviewFace
        ? '#10b981'
        : '#f59e0b';
    const bgLabel = matched
      ? isCooldown
        ? 'rgba(8, 145, 178, 0.92)'
        : 'rgba(5, 150, 105, 0.94)'
      : item.isPreviewFace
        ? 'rgba(5, 150, 105, 0.94)'
        : 'rgba(217, 119, 6, 0.95)';

    // Subtle translucent fill + crisp border
    ctx.fillStyle = matched || item.isPreviewFace ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)';
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x, y, w, h);

    // Corner accents
    const corner = Math.min(20, w * 0.25, h * 0.25);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y + corner);
    ctx.lineTo(x, y);
    ctx.lineTo(x + corner, y);
    ctx.moveTo(x + w - corner, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + corner);
    ctx.moveTo(x, y + h - corner);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + corner, y + h);
    ctx.moveTo(x + w - corner, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - corner);
    ctx.stroke();

    // Label banner
    const labelText =
      trackLabel ||
      (matched
        ? `${user.name} • Sync DB: ${confidence}%${isCooldown ? ' ✓' : ''}`
        : `Wajah Terdeteksi • Sync DB: ${confidence}% (Belum Regis)`);

    ctx.font = '600 13px Inter, system-ui, sans-serif';
    const textMetrics = ctx.measureText(labelText);
    const padX = 9;
    const labelW = textMetrics.width + padX * 2;
    const labelH = 26;
    const labelY = y - labelH - 4 >= 0 ? y - labelH - 4 : y + h + 4;

    ctx.fillStyle = bgLabel;
    ctx.fillRect(x, labelY, labelW, labelH);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(labelText, x + padX, labelY + 17);
  }
}

export function playChime(type = 'registered') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(type === 'registered' ? 880 : 420, ctx.currentTime);
    if (type === 'registered') {
      osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.08);
    }
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.24);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // ignore audio errors
  }
}
