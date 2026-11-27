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
    <div className="space-y-5">
      {toast && (
        <div
          className={`alert fixed bottom-16 md:bottom-5 right-4 z-50 w-auto max-w-sm py-2.5 text-xs shadow-md ${
            toast.type === 'success'
              ? 'alert-success'
              : toast.type === 'warning'
                ? 'alert-warning'
                : 'alert-error'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Top KPI Cards */}
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
              Anggota + Tamu
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
              <span className="text-xs font-medium">Data Wajah</span>
              <Database className="h-4 w-4 text-info" />
            </div>
            <p className="text-2xl font-semibold text-base-content sm:text-3xl">
              {registeredUsersCount}
            </p>
            <p className="text-[11px] text-base-content/60">
              Minimal cocok {minMatchPct}%
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Camera + Controls (Left 8 cols) | Live Feed & Alerts (Right 4 cols) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-8">
          <SessionScheduleBar
            sessionDate={sessionDate}
            sessionTime={sessionTime}
            onChangeDate={setSessionDate}
            onChangeTime={setSessionTime}
            disabled={cameraActive}
          />

          {/* Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-box border border-base-300 bg-base-100 p-3">
            <div className="join">
              <button
                type="button"
                onClick={() => {
                  setInputMode('webcam');
                  setUploadedImgUrl('');
                }}
                className={`btn btn-sm join-item font-normal gap-1.5 ${
                  inputMode === 'webcam' ? 'btn-primary' : 'btn-ghost border border-base-300'
                }`}
              >
                <Camera className="h-3.5 w-3.5" />
                Kamera
              </button>

              <label
                className={`btn btn-sm join-item cursor-pointer font-normal gap-1.5 ${
                  inputMode === 'photo' ? 'btn-primary' : 'btn-ghost border border-base-300'
                }`}
              >
                <ImagePlus className="h-3.5 w-3.5" />
                Foto
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
                      className="btn btn-sm btn-primary gap-1.5"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      {!hasValidSchedule
                        ? 'Isi Tanggal & Jam'
                        : engineReady
                          ? 'Buka Kamera'
                          : 'Menyiapkan...'}
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
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
                        className={`btn btn-sm font-normal gap-1 ${
                          mirrorCamera ? 'btn-primary' : 'btn-ghost border border-base-300'
                        }`}
                        title="Mirror kamera"
                      >
                        <FlipHorizontal2 className="h-3.5 w-3.5" />
                        <span>{mirrorCamera ? 'Mirror' : 'Normal'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="btn btn-sm btn-error gap-1.5"
                      >
                        <CameraOff className="h-3.5 w-3.5" />
                        Stop
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
                  className="btn btn-sm btn-primary gap-1.5"
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  {analyzingPhoto ? 'Memeriksa...' : 'Periksa Foto'}
                </button>
              )}
            </div>
          </div>

          {/* Video / Image Stage */}
          <div className="relative overflow-hidden rounded-box border border-base-300 bg-base-100">
            <div className="relative flex aspect-video w-full items-center justify-center bg-base-200">
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
                      <div className="mb-3 rounded-box border border-base-300 bg-base-100 p-3.5 text-primary">
                        <Camera className="h-8 w-8" />
                      </div>
                      <h3 className="text-sm font-semibold text-base-content sm:text-base">
                        Kamera Belum Aktif
                      </h3>
                      <p className="mt-1 max-w-md text-xs text-base-content/65">
                        Tekan Buka Kamera untuk mulai deteksi wajah, atau pilih tab Foto untuk menguji gambar.
                      </p>
                      {cameraError && (
                        <div className="alert alert-error mt-3 py-2 text-xs">
                          <span>{cameraError}</span>
                        </div>
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
                    <div className="p-8 text-center text-xs sm:text-sm text-base-content/60">
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
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-base-300 bg-base-100 px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    cameraActive ? 'bg-success' : 'bg-base-content/30'
                  }`}
                />
                <span className="text-base-content/80">
                  {activeFaces.length === 0
                    ? 'Menunggu wajah...'
                    : `${activeFaces.length} wajah: ${activeFaces
                        .map((f) =>
                          f.matched
                            ? `${f.user.name} (${f.confidence}%)`
                            : `Tamu (${f.confidence}%)`
                        )
                        .join(', ')}`}
                </span>
              </div>
              <span className="text-base-content/60">
                Batas cocok: <strong>{minMatchPct}%</strong>
              </span>
            </div>
          </div>

          {/* Recognition Progress Per Face */}
          {activeFaces.length > 0 && (
            <div className="card border border-base-300 bg-base-100">
              <div className="card-body gap-2.5 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="flex items-center gap-2 text-xs font-semibold text-base-content">
                    <Database className="h-3.5 w-3.5 text-primary" />
                    Hasil Deteksi Wajah
                  </h4>
                  <span className="text-[11px] text-base-content/60">
                    {registeredUsersCount} wajah terdaftar
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {activeFaces.map((face, i) => (
                    <div
                      key={face.trackId || i}
                      className="rounded-box border border-base-300 bg-base-200/50 p-3"
                    >
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className={face.matched ? 'text-success' : 'text-warning'}>
                          {face.matched ? face.user.name : `Orang #${face.trackId || i + 1}`}
                        </span>
                        <span className="text-base-content">{face.confidence}%</span>
                      </div>
                      <progress
                        className={`progress mt-2 w-full ${face.matched ? 'progress-success' : 'progress-warning'}`}
                        value={face.confidence}
                        max="100"
                      />
                      <div className="mt-1 text-[11px] text-base-content/65">
                        {face.matched
                          ? `Cocok (≥ ${minMatchPct}%)`
                          : face.closestUser
                            ? `Mirip ${face.closestUser.name} (${face.confidence}%)`
                            : 'Belum terdaftar'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Settings */}
          <div className="grid grid-cols-1 gap-2.5 rounded-box border border-base-300 bg-base-100 p-3.5 sm:grid-cols-3">
            <label className="flex items-center justify-between gap-3 rounded-box border border-base-300 bg-base-200/40 px-3 py-2">
              <div>
                <div className="text-xs font-medium text-base-content">Catat Tamu Otomatis</div>
                <div className="text-[11px] text-base-content/60">Hitung saat wajah tamu keluar frame</div>
              </div>
              <input
                type="checkbox"
                checked={autoBablas}
                onChange={(e) => setAutoBablas(e.target.checked)}
                className="checkbox checkbox-xs checkbox-primary"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-box border border-base-300 bg-base-200/40 px-3 py-2">
              <div>
                <div className="text-xs font-medium text-base-content">Jeda Notifikasi</div>
                <div className="text-[11px] text-base-content/60">Waktu tunggu pesan muncul</div>
              </div>
              <select
                value={cooldownSec}
                onChange={(e) => setCooldownSec(Number(e.target.value))}
                className="select select-bordered select-xs"
              >
                <option value={5}>5 dtk</option>
                <option value={15}>15 dtk</option>
                <option value={30}>30 dtk</option>
                <option value={60}>60 dtk</option>
              </select>
            </label>

            <label className="flex items-center justify-between gap-3 rounded-box border border-base-300 bg-base-200/40 px-3 py-2">
              <div>
                <div className="text-xs font-medium text-base-content">Mode Cepat</div>
                <div className="text-[11px] text-base-content/60">Deteksi ringan agar lebih lancar</div>
              </div>
              <input
                type="checkbox"
                checked={fastMode}
                onChange={(e) => setFastMode(e.target.checked)}
                className="checkbox checkbox-xs checkbox-primary"
              />
            </label>
          </div>
        </div>

        {/* Right Panel */}
        <div className="space-y-4 lg:col-span-4">
          {unknownAlert ? (
            <div className="card border border-warning bg-base-100">
              <div className="card-body gap-3 p-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="h-5 w-5 shrink-0 text-warning mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-base-content">
                      Wajah Belum Terdaftar
                    </h3>
                    <p className="mt-0.5 text-xs text-base-content/70">
                      Kemiripan {unknownAlert.confidence}%. Daftarkan sebagai anggota atau catat sebagai tamu.
                    </p>
                  </div>
                </div>

                {unknownAlert.snapshotBase64 && (
                  <div className="flex items-center gap-3 rounded-box border border-base-300 bg-base-200/50 p-2.5">
                    <img
                      src={unknownAlert.snapshotBase64}
                      alt="Wajah Tamu"
                      className="h-12 w-12 rounded-box object-cover border border-warning"
                    />
                    <div className="text-xs text-base-content/80">
                      <div className="font-medium text-base-content">
                        Deteksi #{unknownAlert.trackId}
                      </div>
                      <div className="text-warning">
                        Kemiripan: {unknownAlert.confidence}%
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
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
                    className="btn btn-sm btn-primary w-full gap-1.5"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Daftarkan Wajah
                  </button>
                  <button
                    type="button"
                    onClick={handleManualBablas}
                    className="btn btn-sm btn-ghost border border-base-300 w-full gap-1.5 font-normal"
                  >
                    <Footprints className="h-3.5 w-3.5" />
                    Catat sebagai Tamu
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="card border border-base-300 bg-base-100">
              <div className="card-body gap-2 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-base-content">
                  <ShieldAlert className="h-4 w-4 text-primary" />
                  Cara Kerja
                </div>
                <ul className="space-y-1 text-xs text-base-content/70">
                  <li>1. Wajah dikenali dicatat otomatis (1x per sesi).</li>
                  <li>2. Wajah belum dikenal bisa langsung didaftarkan.</li>
                  <li>3. Jika tidak didaftarkan, tercatat sebagai tamu.</li>
                </ul>
              </div>
            </div>
          )}

          {/* Live Recent Logs */}
          <div className="card border border-base-300 bg-base-100">
            <div className="card-body gap-3 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-base-content">
                  Log Hari Ini
                </h3>
                <button
                  type="button"
                  onClick={loadMatcherAndStats}
                  className="btn btn-xs btn-ghost btn-square"
                  title="Refresh"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>

              {recentLogs.length === 0 ? (
                <div className="py-6 text-center text-xs text-base-content/60">
                  Belum ada catatan hari ini.
                </div>
              ) : (
                <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
                  {recentLogs.map((log) => (
                    <div
                      key={log._id}
                      className="flex items-center gap-3 rounded-box border border-base-300 bg-base-200/40 p-2.5"
                    >
                      {log.snapshotBase64 ? (
                        <img
                          src={log.snapshotBase64}
                          alt={log.personName}
                          className="h-10 w-10 shrink-0 rounded-box object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-box bg-base-200 text-base-content/60">
                          {log.status === 'REGISTERED' ? (
                            <UserCheck className="h-4 w-4 text-success" />
                          ) : (
                            <UserX className="h-4 w-4 text-warning" />
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-semibold text-base-content">
                            {log.personName}
                          </p>
                          <span
                            className={`badge badge-xs shrink-0 ${
                              log.status === 'REGISTERED'
                                ? 'badge-success badge-outline'
                                : 'badge-warning badge-outline'
                            }`}
                          >
                            {log.status === 'REGISTERED'
                              ? `${log.confidence}%`
                              : 'Tamu'}
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
    </div>
  );
}
