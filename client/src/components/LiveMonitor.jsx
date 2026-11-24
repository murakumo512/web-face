import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Database,
  FlipHorizontal2,
  Footprints,
  ImagePlus,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';
import { api, getTodayDateKey } from '../services/api.js';
import {
  buildFaceMatcher,
  captureFaceCropBase64,
  computeBoxIoU,
  drawDetectionsOnCanvas,
  isMobileBrowser,
} from '../services/faceService.js';
import { recognizeFrameHybrid, useHybridAi } from '../hooks/useHybridAi.js';
import AiEnginePill from './AiEnginePill.jsx';
import { formatWilayahLabel, getWorkspaceMeta } from './BrandLogo.jsx';
import {
  SessionScheduleBar,
  getNowTimeHHMM,
  getSessionLabelFromTime,
} from './SessionScheduleCard.jsx';

export default function LiveMonitor({
  workspace = 'piloting',
  modelsReady,
  matcherVersion,
  onQuickRegister,
  onDataChanged,
}) {
  const wsMeta = getWorkspaceMeta(workspace);
  const {
    aiMode,
    setAiMode,
    getAiEpoch,
    serverHealth,
    useServerAi,
    engineReady,
    telemetry,
    recordTelemetry,
  } = useHybridAi(modelsReady);
  const videoRef = useRef(null);
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const loopTimerRef = useRef(null);
  const loopGenRef = useRef(0);
  const processingRef = useRef(false);

  // Face matcher refs for animation/interval loop access
  const matcherRef = useRef(null);
  const userMapRef = useRef(new Map());
  const thresholdRef = useRef(0.52);

  // Tracking & cooldown refs
  const tracksRef = useRef([]);
  const nextTrackIdRef = useRef(1);
  const userCooldownRef = useRef(new Map()); // userId -> timestampMs
  const checkedInTodayRef = useRef(new Map()); // userId -> "HH.mm"
  const lastDescriptorRunRef = useRef(0);

  const [inputMode, setInputMode] = useState('webcam'); // 'webcam' | 'photo'
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [mirrorCamera, setMirrorCamera] = useState(() => {
    try {
      return localStorage.getItem('mardonius_camera_mirror') === 'true';
    } catch {
      return false;
    }
  });
  const [fastMode, setFastMode] = useState(true);
  const [cooldownSec, setCooldownSec] = useState(15);
  const [autoBablas, setAutoBablas] = useState(true);
  const [bablasExitSec] = useState(2);

  const [uploadedImgUrl, setUploadedImgUrl] = useState('');
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
  const [sessionDate, setSessionDate] = useState(() => getTodayDateKey());
  const [sessionTime, setSessionTime] = useState(() => getNowTimeHHMM());
  const hasValidSchedule = Boolean(sessionDate && sessionTime);

  const [registeredUsersCount, setRegisteredUsersCount] = useState(0);
  const [summary, setSummary] = useState({
    totalCount: 0,
    registeredCount: 0,
    uniqueRegisteredCount: 0,
    unregisteredCount: 0,
  });
  const [recentLogs, setRecentLogs] = useState([]);
  const [activeFaces, setActiveFaces] = useState([]);
  const [unknownAlert, setUnknownAlert] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((type, text) => {
    setToast({ type, text, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadMatcherAndStats = useCallback(async () => {
    try {
      const targetDate = sessionDate || getTodayDateKey();
      const targetSession = getSessionLabelFromTime(sessionTime);
      const [descData, summaryData, logsData, sessionLogsData] = await Promise.all([
        api.getFaceDescriptors(workspace),
        api.getDailySummary(targetDate, workspace),
        api.getLogs({ date: targetDate, limit: 12 }, workspace),
        api.getLogs({ date: targetDate, status: 'REGISTERED', limit: 500 }, workspace),
      ]);

      const { matcher, userMap } = buildFaceMatcher(descData.users, descData.threshold || 0.52);
      matcherRef.current = matcher;
      userMapRef.current = userMap;
      thresholdRef.current = descData.threshold || 0.52;
      setRegisteredUsersCount(descData.users.length);
      setSummary({
        totalCount: summaryData.totalCount,
        registeredCount: summaryData.registeredCount,
        uniqueRegisteredCount: summaryData.uniqueRegisteredCount,
        unregisteredCount: summaryData.unregisteredCount,
      });
      setRecentLogs(logsData.logs || []);

      const checkedMap = new Map();
      (sessionLogsData.logs || []).forEach((log) => {
        if (!log.userId) return;
        const logSession = log.sessionLabel || '';
        if (logSession && logSession !== targetSession) return;
        const uid = String(log.userId);
        if (!checkedMap.has(uid) && log.enteredAt) {
          const jam = new Date(log.enteredAt).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          });
          checkedMap.set(uid, jam);
        }
      });
      checkedInTodayRef.current = checkedMap;
    } catch (err) {
      console.error('Failed to load matcher/stats:', err);
    }
  }, [sessionDate, sessionTime, workspace]);

  useEffect(() => {
    loadMatcherAndStats();
  }, [loadMatcherAndStats, matcherVersion]);

  const stopCamera = useCallback(() => {
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    tracksRef.current = [];
    setActiveFaces([]);
    setUnknownAlert(null);
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const recordRegisteredEntry = useCallback(
    async (user, confidence, distance, snapshotBase64) => {
      const uid = String(user._id);
      const activeSession = getSessionLabelFromTime(sessionTime);
      try {
        const res = await api.createLog(
          {
            userId: user._id,
            status: 'REGISTERED',
            eventType: 'ENTRY',
            confidence,
            distance,
            snapshotBase64,
            date: sessionDate,
            sessionTime,
            oncePerDay: true,
            cooldownSeconds: Math.max(3, Math.floor(cooldownSec / 2)),
            notes: `Presensi ${wsMeta.shortLabel} (${sessionDate} ${sessionTime} • Sync DB: ${confidence}%)`,
          },
          workspace
        );

        const entryTime = res.firstEntryAt || res.log?.enteredAt;
        const jamStr = entryTime
          ? new Date(entryTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          : '';
        if (jamStr) checkedInTodayRef.current.set(uid, jamStr);

        if (res.alreadyCheckedIn) {
          showToast('success', `${user.name} sudah presensi (${activeSession}) jam ${jamStr} ✓`);
        } else if (!res.skipped) {
          showToast('success', `Presensi tercatat: ${user.name} (${activeSession} ${jamStr}) • ${confidence}%`);
          await loadMatcherAndStats();
          onDataChanged?.();
        }
      } catch (err) {
        console.error('Error recording registered entry:', err);
      }
    },
    [cooldownSec, loadMatcherAndStats, onDataChanged, sessionDate, sessionTime, showToast, workspace, wsMeta.shortLabel]
  );

  const recordUnregisteredBablas = useCallback(
    async (snapshotBase64, reasonNote = 'Wajah tidak dikenal tetap lewat (bablas)') => {
      try {
        await api.createLog(
          {
            status: 'UNREGISTERED',
            eventType: 'PASS_THROUGH',
            personName: wsMeta.unregisteredLabel,
            confidence: 0,
            snapshotBase64,
            date: sessionDate,
            sessionTime,
            notes: reasonNote,
          },
          workspace
        );
        showToast('warning', `${wsMeta.unregisteredLabel} ikut terhitung ke log & summary!`);
        await loadMatcherAndStats();
        onDataChanged?.();
      } catch (err) {
        console.error('Error recording unregistered pass-through:', err);
      }
    },
    [loadMatcherAndStats, onDataChanged, sessionDate, sessionTime, showToast, workspace, wsMeta.unregisteredLabel]
  );

  // Hybrid detection loop: Server AI (ubuntu-swarm1) or two-speed Browser AI
  const runWebcamTick = useCallback(async (myGen) => {
    if (!cameraActive || inputMode !== 'webcam' || loopGenRef.current !== myGen) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !engineReady) {
      if (loopGenRef.current === myGen) {
        loopTimerRef.current = setTimeout(() => runWebcamTick(myGen), 150);
      }
      return;
    }

    if (processingRef.current) {
      if (loopGenRef.current === myGen) {
        loopTimerRef.current = setTimeout(() => runWebcamTick(myGen), 100);
      }
      return;
    }

    processingRef.current = true;
    const tickEpoch = getAiEpoch();
    const mobile = isMobileBrowser();
    const nextDelay = useServerAi ? (mobile ? 220 : 160) : 100;
    try {
      const now = Date.now();
      const prevTracks = tracksRef.current;

      const hasPendingTrack = prevTracks.some((t) => !t.hasDescriptorCheck);
      const descriptorDue =
        prevTracks.length > 0 && now - lastDescriptorRunRef.current >= (mobile ? 900 : 650);
      const runDescriptorPass = useServerAi || hasPendingTrack || descriptorDue;
      if (!useServerAi && runDescriptorPass) {
        lastDescriptorRunRef.current = now;
      }

      const hybridRes = await recognizeFrameHybrid({
        mediaEl: video,
        useServerAi,
        allowBrowserFallback: aiMode === 'auto',
        modelsReady,
        workspace,
        matcher: matcherRef.current,
        userMap: userMapRef.current,
        runDescriptorPass,
        fastMode,
      });

      if (loopGenRef.current !== myGen || tickEpoch !== getAiEpoch()) {
        return;
      }

      if (hybridRes.telemetry) {
        recordTelemetry(hybridRes.telemetry, tickEpoch);
      }

      const usedTrackIds = new Set();
      const updatedTracks = [];
      const drawItems = [];
      let latestUnknown = null;

      for (const det of hybridRes.faces) {
        const { box } = det;
        let bestPrev = null;
        let bestIoU = 0.22;
        for (const t of prevTracks) {
          if (usedTrackIds.has(t.id)) continue;
          const iou = computeBoxIoU(box, t.box);
          if (iou > bestIoU) {
            bestIoU = iou;
            bestPrev = t;
          }
        }
        if (bestPrev) usedTrackIds.add(bestPrev.id);

        const trackId = bestPrev ? bestPrev.id : nextTrackIdRef.current++;
        const firstSeenAt = bestPrev ? bestPrev.firstSeenAt : now;
        const framesSeen = bestPrev ? bestPrev.framesSeen + 1 : 1;
        const countedAsBablas = bestPrev ? bestPrev.countedAsBablas : false;

        const hasDescriptorCheck = det.hasDescriptorCheck || Boolean(bestPrev?.hasDescriptorCheck);
        const matched = det.hasDescriptorCheck ? det.matched : Boolean(bestPrev?.matched);
        const user = det.hasDescriptorCheck ? det.user : bestPrev?.user || null;
        const closestUser = det.hasDescriptorCheck ? det.closestUser : bestPrev?.closestUser || null;
        const confidence = det.hasDescriptorCheck ? det.confidence : bestPrev?.confidence || 0;
        const distance = det.hasDescriptorCheck ? det.distance : bestPrev?.distance || null;
        const matchedDescriptor = det.descriptor || bestPrev?.descriptor || null;
        const matchedSface = det.sfaceDescriptor || bestPrev?.sfaceDescriptor || null;

        let isCooldown = false;

        if (!hasDescriptorCheck) {
          // Box detected, descriptor check pending on next immediate cycle
          updatedTracks.push({
            id: trackId,
            box,
            matched: false,
            user: null,
            closestUser: null,
            confidence: 0,
            distance: null,
            hasDescriptorCheck: false,
            descriptor: null,
            firstSeenAt,
            lastSeenAt: now,
            framesSeen,
            countedAsBablas,
            snapshotBase64: bestPrev?.snapshotBase64 || '',
          });
          drawItems.push({
            trackId,
            box,
            matched: false,
            isPreviewFace: true,
            user: null,
            closestUser: null,
            confidence: 0,
            trackLabel: `Wajah #${trackId} — Mengenali DB...`,
            isCooldown: false,
          });
          continue;
        }

        if (matched && user) {
          const uid = String(user._id);
          const alreadyJam = checkedInTodayRef.current.get(uid);
          const lastLoggedAt = userCooldownRef.current.get(uid) || 0;
          isCooldown = Boolean(alreadyJam) || now - lastLoggedAt < cooldownSec * 1000;

          if (framesSeen >= 2 && now - lastLoggedAt >= cooldownSec * 1000) {
            userCooldownRef.current.set(uid, now);
            if (alreadyJam) {
              showToast('success', `${user.name} sudah presensi hari ini jam ${alreadyJam} ✓`);
            } else {
              const snap = captureFaceCropBase64(video, box);
              recordRegisteredEntry(user, confidence, distance, snap);
            }
          }

          updatedTracks.push({
            id: trackId,
            box,
            matched: true,
            user,
            closestUser,
            confidence,
            distance,
            hasDescriptorCheck: true,
            descriptor: matchedDescriptor,
            sfaceDescriptor: matchedSface,
            firstSeenAt,
            lastSeenAt: now,
            framesSeen,
            countedAsBablas: false,
            snapshotBase64: bestPrev?.snapshotBase64 || '',
          });

          const wLabel = formatWilayahLabel(user.wilayah);
          const wilayahTag = wLabel ? ` (${wLabel})` : '';
          drawItems.push({
            trackId,
            box,
            matched: true,
            user,
            closestUser,
            confidence,
            trackLabel: alreadyJam
              ? `${user.name}${wilayahTag} • Sudah Presensi ${alreadyJam} ✓`
              : `${user.name}${wilayahTag} • Sync DB: ${confidence}%${isCooldown ? ' ✓' : ''}`,
            isCooldown,
          });
        } else {
          const snap = bestPrev?.snapshotBase64 || captureFaceCropBase64(video, box);

          if (matchedDescriptor || matchedSface) {
            latestUnknown = {
              trackId,
              descriptor: matchedDescriptor,
              sfaceDescriptor: matchedSface,
              snapshotBase64: snap,
              detectedAt: firstSeenAt,
              framesSeen,
              confidence,
              closestUser,
            };
          }

          updatedTracks.push({
            id: trackId,
            box,
            matched: false,
            user: null,
            closestUser,
            confidence,
            distance,
            hasDescriptorCheck: true,
            descriptor: matchedDescriptor,
            sfaceDescriptor: matchedSface,
            firstSeenAt,
            lastSeenAt: now,
            framesSeen,
            countedAsBablas,
            snapshotBase64: snap,
          });

          drawItems.push({
            trackId,
            box,
            matched: false,
            user: null,
            closestUser,
            confidence,
            trackLabel: `Belum Terdaftar • Sync DB: ${confidence}%`,
            isCooldown: false,
          });
        }
      }

      // Check lost tracks for unknown "bablas" exit counting
      for (const oldTrack of prevTracks) {
        if (usedTrackIds.has(oldTrack.id)) continue;
        const ageSinceLost = now - oldTrack.lastSeenAt;
        if (ageSinceLost < bablasExitSec * 1000) {
          updatedTracks.push(oldTrack);
        } else if (
          oldTrack.hasDescriptorCheck &&
          !oldTrack.matched &&
          autoBablas &&
          !oldTrack.countedAsBablas &&
          oldTrack.framesSeen >= 2
        ) {
          oldTrack.countedAsBablas = true;
          recordUnregisteredBablas(
            oldTrack.snapshotBase64,
            `Wajah tidak dikenal (#${oldTrack.id}) tetap lewat (bablas) tanpa registrasi`
          );
        }
      }

      tracksRef.current = updatedTracks;
      drawDetectionsOnCanvas(canvasRef.current, video, drawItems, {
        fitMode: 'contain',
        mirror: mirrorCamera,
      });
      setActiveFaces(drawItems);

      if (latestUnknown) {
        setUnknownAlert(latestUnknown);
      } else if (updatedTracks.every((t) => t.matched || !t.hasDescriptorCheck)) {
        setUnknownAlert(null);
      }
    } catch (err) {
      console.error('Detection loop error:', err);
    } finally {
      if (loopGenRef.current === myGen) {
        processingRef.current = false;
        if (cameraActive && inputMode === 'webcam') {
          loopTimerRef.current = setTimeout(() => runWebcamTick(myGen), nextDelay);
        }
      }
    }
  }, [
    aiMode,
    autoBablas,
    bablasExitSec,
    cameraActive,
    cooldownSec,
    engineReady,
    fastMode,
    getAiEpoch,
    inputMode,
    mirrorCamera,
    modelsReady,
    recordRegisteredEntry,
    recordTelemetry,
    recordUnregisteredBablas,
    showToast,
    useServerAi,
    workspace,
  ]);

  useEffect(() => {
    const myGen = ++loopGenRef.current;
    processingRef.current = false;
    if (cameraActive && inputMode === 'webcam' && engineReady) {
      loopTimerRef.current = setTimeout(() => runWebcamTick(myGen), 80);
    }
    return () => {
      loopGenRef.current += 1;
      processingRef.current = false;
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    };
  }, [cameraActive, inputMode, engineReady, runWebcamTick]);

  const startCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Izin kamera ditolak oleh browser. Izinkan akses kamera atau gunakan mode "Test via Foto".'
          : `Tidak bisa mengakses kamera: ${err.message}`
      );
    }
  };

  // Photo Upload Test Mode
  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCamera();
    setInputMode('photo');
    setUnknownAlert(null);
    setActiveFaces([]);
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedImgUrl(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const analyzeUploadedPhoto = async () => {
    const img = imageRef.current;
    if (!img || !engineReady) return;
    setAnalyzingPhoto(true);
    try {
      const hybridRes = await recognizeFrameHybrid({
        mediaEl: img,
        useServerAi,
        allowBrowserFallback: aiMode === 'auto',
        modelsReady,
        workspace,
        matcher: matcherRef.current,
        userMap: userMapRef.current,
        runDescriptorPass: true,
        fastMode: false,
      });

      if (hybridRes.telemetry) {
        recordTelemetry(hybridRes.telemetry);
      }

      if (hybridRes.faces.length === 0) {
        showToast('warning', 'Tidak ada wajah terdeteksi pada foto ini.');
        drawDetectionsOnCanvas(canvasRef.current, img, []);
        setActiveFaces([]);
        setUnknownAlert(null);
        return;
      }

      const drawItems = [];
      let firstUnknown = null;

      for (const [idx, det] of hybridRes.faces.entries()) {
        const { box, matched, user, closestUser, confidence, distance, descriptor, sfaceDescriptor } = det;
        const snap = captureFaceCropBase64(img, box);

        if (matched && user) {
          drawItems.push({
            trackId: idx + 1,
            box,
            matched: true,
            user,
            closestUser,
            confidence,
            trackLabel: `${user.name} • Sync DB: ${confidence}%`,
            isCooldown: false,
          });
          await recordRegisteredEntry(user, confidence, distance, snap);
        } else {
          drawItems.push({
            trackId: idx + 1,
            box,
            matched: false,
            user: null,
            closestUser,
            confidence,
            trackLabel: `Belum Terdaftar • Sync DB: ${confidence}%`,
            isCooldown: false,
          });
          if (!firstUnknown) {
            firstUnknown = {
              trackId: 'Foto',
              descriptor,
              sfaceDescriptor,
              snapshotBase64: snap,
              detectedAt: Date.now(),
              framesSeen: 1,
              confidence,
              closestUser,
            };
          }
        }
      }

      drawDetectionsOnCanvas(canvasRef.current, img, drawItems);
      setActiveFaces(drawItems);
      setUnknownAlert(firstUnknown);
    } catch (err) {
      showToast('error', `Gagal menganalisis foto: ${err.message}`);
    } finally {
      setAnalyzingPhoto(false);
    }
  };

  const handleManualBablas = async () => {
    if (!unknownAlert) return;
    const snap = unknownAlert.snapshotBase64;
    const tid = unknownAlert.trackId;
    tracksRef.current = tracksRef.current.map((t) =>
      t.id === tid ? { ...t, countedAsBablas: true } : t
    );
    setUnknownAlert(null);
    await recordUnregisteredBablas(snap, `Orang tidak dikenal (#${tid}) tetap bablas & dihitung manual`);
  };

  const minMatchPct = Math.round((1 - thresholdRef.current) * 100);

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur ${
            toast.type === 'success'
              ? 'border-emerald-300 bg-emerald-50/95 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/90 dark:text-emerald-200'
              : toast.type === 'warning'
                ? 'border-amber-300 bg-amber-50/95 text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/90 dark:text-amber-200'
                : 'border-rose-300 bg-rose-50/95 text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/90 dark:text-rose-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Top KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-3.5 shadow-sm dark:border-stone-800 dark:bg-[#1C1917] dark:shadow-none sm:p-4">
          <div className="flex items-center justify-between text-base-content/60">
            <span className="text-[11px] font-semibold uppercase tracking-wider sm:text-xs">Total Masuk</span>
            <Users className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-base-content sm:mt-2 sm:text-3xl">
            {summary.totalCount}
          </p>
          <p className="mt-1 text-[11px] text-base-content/60 sm:text-xs">
            Terdaftar + Tidak Terdaftar
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:shadow-none sm:p-4">
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300">
            <span className="text-[11px] font-semibold uppercase tracking-wider sm:text-xs">Terdaftar</span>
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
            <span className="text-[11px] font-semibold uppercase tracking-wider sm:text-xs">Bablas</span>
            <UserX className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-amber-600 dark:text-amber-400 sm:mt-2 sm:text-3xl">
            {summary.unregisteredCount}
          </p>
          <p className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-300/70 sm:text-xs">
            Lewat tanpa registrasi
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-3.5 shadow-sm dark:border-stone-800 dark:bg-[#1C1917] dark:shadow-none sm:p-4">
          <div className="flex items-center justify-between text-base-content/60">
            <span className="text-[11px] font-semibold uppercase tracking-wider sm:text-xs">Sync DB</span>
            <Database className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-base-content sm:mt-2 sm:text-3xl">
            {registeredUsersCount}
          </p>
          <p className="mt-1 text-[11px] text-base-content/60 sm:text-xs">
            User aktif (min {minMatchPct}%)
          </p>
        </div>
      </div>

      {/* Main Grid: Camera + Controls (Left 8 cols) | Live Feed & Alerts (Right 4 cols) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-8">
          <SessionScheduleBar
            sessionDate={sessionDate}
            sessionTime={sessionTime}
            onChangeDate={setSessionDate}
            onChangeTime={setSessionTime}
            disabled={cameraActive}
          />

          {/* Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-base-300 bg-base-100 p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setInputMode('webcam');
                  setUploadedImgUrl('');
                }}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
                  inputMode === 'webcam'
                    ? 'bg-sky-600 text-white shadow-sm dark:bg-sky-500 dark:shadow-sky-500/20'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'
                }`}
              >
                <Camera className="h-4 w-4" />
                Kamera Live
              </button>

              <label
                className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
                  inputMode === 'photo'
                    ? 'bg-sky-600 text-white shadow-sm dark:bg-sky-500 dark:shadow-sky-500/20'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'
                }`}
              >
                <ImagePlus className="h-4 w-4" />
                Test via Foto
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <AiEnginePill
                aiMode={aiMode}
                onSelectMode={setAiMode}
                serverHealth={serverHealth}
                useServerAi={useServerAi}
                telemetry={telemetry}
                compact
              />
              {inputMode === 'webcam' && (
                <>
                  {!cameraActive ? (
                    <button
                      type="button"
                      disabled={!engineReady || !hasValidSchedule}
                      onClick={startCamera}
                      className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      {!hasValidSchedule
                        ? 'Isi Tgl & Jam Dulu'
                        : engineReady
                          ? 'Mulai Kamera'
                          : 'Menyiapkan Model AI...'}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setMirrorCamera((prev) => {
                            const next = !prev;
                            try {
                              localStorage.setItem('mardonius_camera_mirror', String(next));
                            } catch {
                              // ignore
                            }
                            return next;
                          })
                        }
                        className={`btn btn-sm gap-1 ${
                          mirrorCamera ? 'btn-primary' : 'btn-outline border-base-300'
                        }`}
                        title="Flip horizontal kamera"
                      >
                        <FlipHorizontal2 className="h-4 w-4" />
                        <span>{mirrorCamera ? 'Flip: ON' : 'Normal'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="inline-flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 ring-1 ring-rose-300 transition hover:bg-rose-100 dark:bg-rose-500/20 dark:text-rose-300 dark:ring-rose-500/40 dark:hover:bg-rose-500/30 sm:text-sm"
                      >
                        <CameraOff className="h-4 w-4" />
                        Matikan Kamera
                      </button>
                    </div>
                  )}
                </>
              )}

              {inputMode === 'photo' && uploadedImgUrl && (
                <button
                  type="button"
                  disabled={!engineReady || !hasValidSchedule || analyzingPhoto}
                  onClick={analyzeUploadedPhoto}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <UserCheck className="h-4 w-4" />
                  {analyzingPhoto ? 'Mendeteksi...' : 'Scan & Recognisi Foto'}
                </button>
              )}
            </div>
          </div>

          {/* Video / Image Stage */}
          <div className="relative overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 shadow-sm dark:border-stone-800 dark:bg-stone-950 dark:shadow-xl">
            <div className="relative flex aspect-video w-full items-center justify-center bg-stone-100 dark:bg-stone-900/50">
              {inputMode === 'webcam' ? (
                <>
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    className={`h-full w-full object-contain ${mirrorCamera ? '-scale-x-100' : ''} ${cameraActive ? 'block' : 'hidden'}`}
                  />
                  {!cameraActive && (
                    <div className="flex flex-col items-center justify-center p-6 text-center sm:p-8">
                      <div className="mb-3 rounded-2xl bg-white p-4 text-sky-600 shadow-sm ring-1 ring-stone-200 dark:bg-stone-800/80 dark:text-sky-400 dark:ring-0">
                        <Camera className="h-9 w-9 sm:h-10 sm:w-10" />
                      </div>
                      <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 sm:text-base">
                        Kamera Presensi &amp; Counting Belum Aktif
                      </h3>
                      <p className="mt-1 max-w-md text-xs text-base-content/60 sm:text-sm">
                        Klik <span className="font-semibold text-emerald-600 dark:text-emerald-400">Mulai Kamera</span> untuk deteksi wajah real-time, atau pilih{' '}
                        <span className="font-semibold text-sky-600 dark:text-sky-400">Test via Foto</span> untuk menguji dengan gambar.
                      </p>
                      {cameraError && (
                        <p className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/50 dark:text-rose-300">
                          {cameraError}
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {uploadedImgUrl ? (
                    <img
                      ref={imageRef}
                      src={uploadedImgUrl}
                      alt="Test Foto"
                      onLoad={analyzeUploadedPhoto}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="p-8 text-center text-sm text-base-content/60">
                      Pilih file gambar untuk menguji pengenalan wajah.
                    </div>
                  )}
                </>
              )}

              <canvas
                ref={canvasRef}
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
            </div>

            {/* Live Bottom Detection Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-white px-4 py-2.5 text-xs dark:border-stone-800 dark:bg-stone-900/90">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    cameraActive ? 'animate-pulse bg-emerald-500 dark:bg-emerald-400' : 'bg-stone-400 dark:bg-stone-600'
                  }`}
                />
                <span className="text-base-content/80">
                  {activeFaces.length === 0
                    ? 'Menunggu wajah masuk area kamera...'
                    : `Terdeteksi ${activeFaces.length} wajah: ${activeFaces
                        .map((f) =>
                          f.matched
                            ? `${f.user.name} (Sync DB: ${f.confidence}%)`
                            : `Belum Terdaftar (Sync DB: ${f.confidence}%)`
                        )
                        .join(', ')}`}
                </span>
              </div>
              <span className="text-base-content/60">
                Minimal cocok DB: <strong className="text-sky-600 dark:text-sky-300">{minMatchPct}%</strong>
              </span>
            </div>
          </div>

          {/* Real-time DB Sync Progress Per Face */}
          {activeFaces.length > 0 && (
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-[#1C1917] dark:shadow-none">
              <div className="mb-2.5 flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-base-content/80">
                  <Database className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                  Live Sync Kecocokan Wajah ke MongoDB
                </h4>
                <span className="text-[11px] text-base-content/60">
                  {registeredUsersCount} wajah di DB
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {activeFaces.map((face, i) => (
                  <div
                    key={face.trackId || i}
                    className={`rounded-xl border p-3 ${
                      face.matched
                        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/25'
                        : 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-950/20'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className={face.matched ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>
                        {face.matched ? face.user.name : `Orang #${face.trackId || i + 1} (Belum Regis)`}
                      </span>
                      <span className="text-base-content">Sync: {face.confidence}%</span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                      <div
                        style={{ width: `${face.confidence}%` }}
                        className={`h-full rounded-full transition-all ${
                          face.matched ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                      />
                    </div>
                    <div className="mt-1.5 text-[11px] text-stone-600 dark:text-stone-400">
                      {face.matched
                        ? `Cocok dengan data MongoDB (≥ ${minMatchPct}%)`
                        : face.closestUser
                          ? `Terdekat di DB: ${face.closestUser.name} (${face.confidence}% < ${minMatchPct}%)`
                          : 'Belum ada wajah terdaftar di MongoDB'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recognition & Counting Settings */}
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-[#1C1917] dark:shadow-none sm:grid-cols-3">
            <label className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3.5 py-2.5 dark:bg-[#141210]/70">
              <div>
                <div className="text-xs font-semibold text-stone-800 dark:text-stone-200">Auto-Count Bablas</div>
                <div className="text-[11px] text-base-content/60">Hitung otomatis saat wajah tak dikenal keluar frame</div>
              </div>
              <input
                type="checkbox"
                checked={autoBablas}
                onChange={(e) => setAutoBablas(e.target.checked)}
                className="h-4 w-4 accent-amber-500"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3.5 py-2.5 dark:bg-[#141210]/70">
              <div>
                <div className="text-xs font-semibold text-stone-800 dark:text-stone-200">Cooldown Info</div>
                <div className="text-[11px] text-base-content/60">Jeda notifikasi pengingat di layar</div>
              </div>
              <select
                value={cooldownSec}
                onChange={(e) => setCooldownSec(Number(e.target.value))}
                className="rounded-lg border border-base-300 bg-base-100 px-2 py-1 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
              >
                <option value={5}>5 detik</option>
                <option value={15}>15 detik</option>
                <option value={30}>30 detik</option>
                <option value={60}>60 detik</option>
              </select>
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3.5 py-2.5 dark:bg-[#141210]/70">
              <div>
                <div className="text-xs font-semibold text-stone-800 dark:text-stone-200">Mode Cepat (Anti Lag)</div>
                <div className="text-[11px] text-base-content/60">TinyFaceDetector agar FPS lancar</div>
              </div>
              <input
                type="checkbox"
                checked={fastMode}
                onChange={(e) => setFastMode(e.target.checked)}
                className="h-4 w-4 accent-sky-500"
              />
            </label>
          </div>
        </div>

        {/* Right Panel: Unknown Face Warning + Recent Activity Feed */}
        <div className="space-y-4 lg:col-span-4">
          {/* Unknown Face Prompt Card */}
          {unknownAlert ? (
            <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-md dark:border-amber-500/60 dark:bg-amber-950/40 dark:shadow-amber-950/30">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-amber-100 p-2 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300">
                    Wajah Tidak Dikenal!
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-amber-900/80 dark:text-amber-100/80">
                    Wajah belum cocok di database (Sync DB: <strong>{unknownAlert.confidence}%</strong>).{' '}
                    <strong>Wajib registrasi terlebih dahulu</strong> sebelum masuk, atau hitung sebagai pengunjung tidak terdaftar jika tetap bablas.
                  </p>
                </div>
              </div>

              {unknownAlert.snapshotBase64 && (
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-white p-2.5 ring-1 ring-amber-200 dark:bg-[#141210]/70 dark:ring-0">
                  <img
                    src={unknownAlert.snapshotBase64}
                    alt="Wajah Tidak Dikenal"
                    className="h-14 w-14 rounded-lg object-cover ring-2 ring-amber-500/50"
                  />
                  <div className="text-xs text-base-content/80">
                    <div className="font-semibold text-base-content">
                      Track #{unknownAlert.trackId}
                    </div>
                    <div className="text-amber-700 dark:text-amber-300">
                      Sync DB: {unknownAlert.confidence}%
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onQuickRegister?.({
                      fromAdmin: true,
                      workspace,
                      descriptor: unknownAlert.descriptor,
                      sfaceDescriptor: unknownAlert.sfaceDescriptor,
                      photoBase64: unknownAlert.snapshotBase64,
                    })
                  }
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${wsMeta.accentSolidClass}`}
                >
                  <UserPlus className="h-4 w-4" />
                  Wajib Regis — Daftar Wajah Ini
                </button>
                <button
                  type="button"
                  onClick={handleManualBablas}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200 dark:hover:bg-amber-500/25"
                >
                  <Footprints className="h-4 w-4" />
                  Tetap Bablas (Hitung Tanpa Regis)
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-[#1C1917] dark:shadow-none">
              <div className="flex items-center gap-2.5 text-sm font-semibold text-stone-900 dark:text-stone-200">
                <ShieldAlert className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                Aturan Gerbang Wajah
              </div>
              <ul className="mt-2.5 space-y-1.5 text-xs text-stone-600 dark:text-stone-400">
                <li>1. Wajah dikenali → Kotak hijau + nama + Sync DB (%) &amp; presensi 1x/hari.</li>
                <li>2. Wajah tidak dikenal → Peringatan wajib registrasi dahulu.</li>
                <li>3. Jika tetap bablas → Otomatis terhitung sebagai <span className="font-semibold text-amber-700 dark:text-amber-300">Tidak Terdaftar</span>.</li>
              </ul>
            </div>
          )}

          {/* Live Recent Logs */}
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-[#1C1917] dark:shadow-none">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-base-content">
                Log Masuk Terbaru (Hari Ini)
              </h3>
              <button
                type="button"
                onClick={loadMatcherAndStats}
                className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-white"
                title="Refresh"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            {recentLogs.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-500">
                Belum ada orang tercatat masuk hari ini.
              </div>
            ) : (
              <div className="max-h-[380px] space-y-2.5 overflow-y-auto pr-1">
                {recentLogs.map((log) => (
                  <div
                    key={log._id}
                    className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-2.5 dark:border-stone-800/80 dark:bg-[#141210]/70"
                  >
                    {log.snapshotBase64 ? (
                      <img
                        src={log.snapshotBase64}
                        alt={log.personName}
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                          log.status === 'REGISTERED'
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                            : 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'
                        }`}
                      >
                        {log.status === 'REGISTERED' ? (
                          <UserCheck className="h-5 w-5" />
                        ) : (
                          <UserX className="h-5 w-5" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-semibold text-base-content">
                          {log.personName}
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            log.status === 'REGISTERED'
                              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-0'
                              : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-0'
                          }`}
                        >
                          {log.status === 'REGISTERED'
                            ? `Sync ${log.confidence}%`
                            : 'Bablas'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-base-content/60">
                        {new Date(log.enteredAt).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}{' '}
                        • {log.department}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
