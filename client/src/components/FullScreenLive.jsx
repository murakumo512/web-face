import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  FlipHorizontal2,
  Footprints,
  LayoutDashboard,
  ShieldAlert,
  SwitchCamera,
  UserPlus,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { api, getTodayDateKey } from '../services/api.js';
import { formatWilayahLabel, getWorkspaceMeta } from './BrandLogo.jsx';
import { useSiteConfig } from '../context/SiteConfigContext.jsx';
import AiEnginePill from './AiEnginePill.jsx';
import {
  SessionScheduleCard,
  formatDateShortID,
  getNowTimeHHMM,
  getSessionLabelFromTime,
} from './SessionScheduleCard.jsx';
import { recognizeFrameHybrid, useHybridAi } from '../hooks/useHybridAi.js';
import {
  buildFaceMatcher,
  captureFaceCropBase64,
  computeBoxIoU,
  drawDetectionsOnCanvas,
  isMobileBrowser,
  playChime,
} from '../services/faceService.js';

export default function FullScreenLive({
  workspace = 'piloting',
  skipSchedule = false,
  modelsReady,
  matcherVersion,
  onGoToPortal,
  onGoToAdmin,
  onQuickRegister,
  onDataChanged,
}) {
  const { config } = useSiteConfig();
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
  const wsMeta = getWorkspaceMeta(workspace);
  const wsCfg = config.workspaces?.[workspace] || {};
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const loopTimerRef = useRef(null);
  const loopGenRef = useRef(0);
  const processingRef = useRef(false);
  const userStoppedRef = useRef(false);

  const matcherRef = useRef(null);
  const userMapRef = useRef(new Map());
  const thresholdRef = useRef(0.52);

  const tracksRef = useRef([]);
  const nextTrackIdRef = useRef(1);
  const userCooldownRef = useRef(new Map());
  const checkedInTodayRef = useRef(new Map()); // userId -> "HH.mm"
  const lastDescriptorRunRef = useRef(0);

  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [mirrorCamera, setMirrorCamera] = useState(() => {
    try {
      return localStorage.getItem('mardonius_camera_mirror') === 'true';
    } catch {
      return false;
    }
  });
  const [autoBablas] = useState(true);
  const [cooldownSec] = useState(15);

  const [registeredUsersCount, setRegisteredUsersCount] = useState(0);
  const [summary, setSummary] = useState({
    totalCount: 0,
    registeredCount: 0,
    unregisteredCount: 0,
  });
  const [unknownAlert, setUnknownAlert] = useState(null);
  const [toast, setToast] = useState(null);
  const [sessionDate, setSessionDate] = useState(() => getTodayDateKey());
  const [sessionTime, setSessionTime] = useState(() => getNowTimeHHMM());

  const churchSessionLabel = getSessionLabelFromTime(sessionTime);
  const clockLabel = `${formatDateShortID(sessionDate)} · ${sessionTime || '--:--'}`;

  const showToast = useCallback((type, text) => {
    setToast({ type, text, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const loadMatcherAndStats = useCallback(async () => {
    try {
      const targetDate = sessionDate || getTodayDateKey();
      const targetSession = getSessionLabelFromTime(sessionTime);
      const [descData, summaryData, logsData] = await Promise.all([
        api.getFaceDescriptors(workspace),
        api.getDailySummary(targetDate, workspace),
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
        unregisteredCount: summaryData.unregisteredCount,
      });

      const checkedMap = new Map();
      (logsData.logs || []).forEach((log) => {
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
      console.error('Failed to sync DB matcher/stats:', err);
    }
  }, [sessionDate, sessionTime, workspace]);

  useEffect(() => {
    loadMatcherAndStats();
  }, [loadMatcherAndStats, matcherVersion]);

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list.filter((d) => d.kind === 'videoinput');
      setDevices(cams);
      if (!selectedDeviceId && cams.length > 0) {
        setSelectedDeviceId(cams[0].deviceId);
      }
    } catch {
      // ignore
    }
  }, [selectedDeviceId]);

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
    setUnknownAlert(null);
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const startCamera = useCallback(
    async (deviceIdOverride = '') => {
      setCameraError('');
      stopCamera();
      try {
        const chosenId = deviceIdOverride || selectedDeviceId;
        const mobile = isMobileBrowser();
        const idealW = mobile ? 640 : 1280;
        const idealH = mobile ? 480 : 720;
        const videoConstraints = chosenId
          ? { deviceId: { exact: chosenId }, width: { ideal: idealW }, height: { ideal: idealH } }
          : { facingMode: 'user', width: { ideal: idealW }, height: { ideal: idealH } };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraActive(true);
        userStoppedRef.current = false;
        refreshDevices();
      } catch (err) {
        setCameraError(
          err.name === 'NotAllowedError'
            ? 'Izin kamera ditolak browser. Klik ikon gembok di address bar untuk mengizinkan kamera.'
            : `Kamera gagal dibuka: ${err.message}`
        );
      }
    },
    [refreshDevices, selectedDeviceId, stopCamera]
  );

  // Instant camera start when opened via /testing (bypassing Tanggal/Jam Ibadah prompt)
  useEffect(() => {
    if (skipSchedule && engineReady && !cameraActive && !cameraError && !userStoppedRef.current) {
      startCamera();
    }
  }, [skipSchedule, engineReady, cameraActive, cameraError, startCamera]);

  const recordRegisteredEntry = useCallback(
    async (user, confidence, distance, snapshotBase64) => {
      const uid = String(user._id);
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
          showToast('success', `${user.name} sudah presensi (${churchSessionLabel}) jam ${jamStr} ✓`);
        } else if (!res.skipped) {
          if (soundEnabled) playChime('registered');
          showToast('success', `${user.name} presensi berhasil (${churchSessionLabel} ${jamStr}) • ${confidence}%`);
          await loadMatcherAndStats();
          onDataChanged?.();
        }
      } catch (err) {
        console.error('Error recording entry:', err);
      }
    },
    [churchSessionLabel, cooldownSec, loadMatcherAndStats, onDataChanged, sessionDate, sessionTime, showToast, soundEnabled, workspace, wsMeta.shortLabel]
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
        if (soundEnabled) playChime('unknown');
        showToast('warning', `${wsMeta.unregisteredLabel} terhitung!`);
        await loadMatcherAndStats();
        onDataChanged?.();
      } catch (err) {
        console.error('Error recording bablas:', err);
      }
    },
    [loadMatcherAndStats, onDataChanged, sessionDate, sessionTime, showToast, soundEnabled, workspace, wsMeta.unregisteredLabel]
  );

  const runLoop = useCallback(async (myGen) => {
    if (!cameraActive || !engineReady || loopGenRef.current !== myGen) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2 || processingRef.current) {
      if (loopGenRef.current === myGen) {
        loopTimerRef.current = setTimeout(() => runLoop(myGen), 120);
      }
      return;
    }

    processingRef.current = true;
    const tickEpoch = getAiEpoch();
    const tickStart = performance.now();
    const mobile = isMobileBrowser();
    const descriptorInterval = mobile ? 900 : 650;
    let nextDelay = useServerAi ? (mobile ? 210 : 150) : mobile ? 120 : 80;

    try {
      const now = Date.now();
      const prevTracks = tracksRef.current;

      const hasPendingTrack = prevTracks.some((t) => !t.hasDescriptorCheck);
      const descriptorDue =
        prevTracks.length > 0 && now - lastDescriptorRunRef.current >= descriptorInterval;
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
        fastMode: true,
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
        let bestIoU = 0.2;
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
        const confidence = det.hasDescriptorCheck ? det.confidence : bestPrev?.confidence || 0;
        const distance = det.hasDescriptorCheck ? det.distance : bestPrev?.distance || null;
        const matchedDescriptor = det.descriptor || bestPrev?.descriptor || null;
        const matchedSface = det.sfaceDescriptor || bestPrev?.sfaceDescriptor || null;

        let isCooldown = false;

        if (!hasDescriptorCheck) {
          updatedTracks.push({
            id: trackId,
            box,
            matched: false,
            user: null,
            confidence: 0,
            distance: null,
            hasDescriptorCheck: false,
            descriptor: null,
            sfaceDescriptor: null,
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
            trackLabel: `Wajah #${trackId} • Sync DB...`,
          });
          nextDelay = 30;
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
              confidence,
            };
          }

          updatedTracks.push({
            id: trackId,
            box,
            matched: false,
            user: null,
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
            confidence,
            trackLabel: `Belum Terdaftar • Sync DB: ${confidence}%`,
          });
        }
      }

      // Count unknown tracks that exited camera frame
      for (const oldTrack of prevTracks) {
        if (usedTrackIds.has(oldTrack.id)) continue;
        const ageSinceLost = now - oldTrack.lastSeenAt;
        if (ageSinceLost < 2000) {
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
            `Wajah tidak dikenal (#${oldTrack.id}) tetap lewat (bablas)`
          );
        }
      }

      tracksRef.current = updatedTracks;
      drawDetectionsOnCanvas(canvasRef.current, video, drawItems, {
        fitMode: 'cover',
        mirror: mirrorCamera,
      });

      if (latestUnknown) {
        setUnknownAlert(latestUnknown);
      } else if (updatedTracks.every((t) => t.matched || !t.hasDescriptorCheck)) {
        setUnknownAlert(null);
      }

      const elapsed = performance.now() - tickStart;
      if (nextDelay > 30) {
        const minWait = useServerAi ? (mobile ? 180 : 120) : mobile ? 110 : 75;
        nextDelay = Math.max(minWait, Math.min(320, Math.round(elapsed * 0.65)));
      }
    } catch (err) {
      console.error('FullScreenLive loop error:', err);
    } finally {
      if (loopGenRef.current === myGen) {
        processingRef.current = false;
        if (cameraActive) {
          loopTimerRef.current = setTimeout(() => runLoop(myGen), nextDelay);
        }
      }
    }
  }, [
    aiMode,
    autoBablas,
    cameraActive,
    cooldownSec,
    engineReady,
    getAiEpoch,
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
    if (cameraActive && engineReady) {
      loopTimerRef.current = setTimeout(() => runLoop(myGen), 80);
    }
    return () => {
      loopGenRef.current += 1;
      processingRef.current = false;
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    };
  }, [cameraActive, engineReady, runLoop]);

  const handleManualBablas = async () => {
    if (!unknownAlert) return;
    const snap = unknownAlert.snapshotBase64;
    const tid = unknownAlert.trackId;
    tracksRef.current = tracksRef.current.map((t) =>
      t.id === tid ? { ...t, countedAsBablas: true } : t
    );
    setUnknownAlert(null);
    await recordUnregisteredBablas(snap, `Pengunjung tidak dikenal (#${tid}) tetap bablas`);
  };

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-base-200 text-base-content select-none">
      {/* Full-Screen Live Video */}
      <video
        ref={videoRef}
        muted
        playsInline
        className={`h-full w-full object-cover ${mirrorCamera ? '-scale-x-100' : ''} ${cameraActive ? 'block' : 'hidden'}`}
      />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      {/* Schedule Input Prompt before Scanning (or simple quick-resume box in Testing mode) */}
      {!cameraActive && (
        <div className="absolute inset-0 z-10 flex items-start justify-center overflow-y-auto bg-base-200 px-4 py-6 sm:items-center">
          {skipSchedule ? (
            <div className="w-full max-w-sm rounded-md border border-base-300 bg-base-100 p-5 text-center shadow-sm">
              <h2 className="text-base font-semibold text-base-content">Kamera Testing Siap</h2>
              {cameraError && (
                <p className="mt-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                  {cameraError}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {onGoToPortal && (
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      onGoToPortal();
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-base-300 bg-base-100 px-3 text-xs font-medium text-base-content hover:bg-base-200"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Portal</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={!engineReady}
                  onClick={() => {
                    userStoppedRef.current = false;
                    startCamera();
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-4 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span>{engineReady ? 'Buka Kamera' : 'Menyiapkan...'}</span>
                </button>
              </div>
            </div>
          ) : (
            <SessionScheduleCard
              workspace={workspace}
              sessionDate={sessionDate}
              sessionTime={sessionTime}
              onChangeDate={setSessionDate}
              onChangeTime={setSessionTime}
              onStartScan={() => startCamera()}
              onGoToPortal={
                onGoToPortal
                  ? () => {
                      stopCamera();
                      onGoToPortal();
                    }
                  : undefined
              }
              onGoToAdmin={() => {
                stopCamera();
                onGoToAdmin?.();
              }}
              engineReady={engineReady}
              cameraError={cameraError}
            />
          )}
        </div>
      )}

      {/* Mobile Compact Top HUD (Shown during live scan on phones) */}
      {cameraActive && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-2.5 sm:hidden">
          <div className="pointer-events-auto flex items-center justify-between gap-2 rounded-lg border border-base-300/80 bg-base-100/90 px-2.5 py-2 text-xs text-base-content shadow-md backdrop-blur-md">
            <div className="flex min-w-0 items-center gap-2">
              {onGoToPortal && (
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    onGoToPortal();
                  }}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-base-300 bg-base-100 text-base-content active:scale-95"
                  title="Kembali ke Portal"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-semibold leading-tight">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <span className="truncate">
                    {skipSchedule ? 'Testing' : workspace === 'gereja' ? 'Gereja' : 'Piloting'}
                  </span>
                  {!skipSchedule && (
                    <span className="text-[10px] font-medium text-base-content/60 tabular-nums">
                      {clockLabel}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] tabular-nums">
                  <span className="text-base-content/75">
                    Total <strong className="text-base-content">{summary.totalCount}</strong>
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400">
                    Hadir <strong>{summary.registeredCount}</strong>
                  </span>
                  <span className="text-amber-700 dark:text-amber-400">
                    Tamu <strong>{summary.unregisteredCount}</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="shrink-0">
              <AiEnginePill
                aiMode={aiMode}
                onSelectMode={setAiMode}
                serverHealth={serverHealth}
                useServerAi={useServerAi}
                telemetry={telemetry}
                compact
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Camera Controls Bar (Thumb-friendly) */}
      {cameraActive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 sm:hidden">
          <div className="pointer-events-auto mx-auto flex max-w-md items-center justify-between gap-1.5 rounded-xl border border-base-300/80 bg-base-100/92 px-2.5 py-2 shadow-lg backdrop-blur-md">
            <div className="flex items-center gap-1.5">
              {devices.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const idx = devices.findIndex((d) => d.deviceId === selectedDeviceId);
                    const nextDevice = devices[(idx + 1) % devices.length];
                    if (nextDevice) {
                      setSelectedDeviceId(nextDevice.deviceId);
                      if (cameraActive) startCamera(nextDevice.deviceId);
                    }
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-base-300 bg-base-100 text-base-content active:scale-95"
                  title="Ganti Kamera (Depan/Belakang)"
                >
                  <SwitchCamera className="h-4 w-4" />
                </button>
              )}

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
                className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border transition active:scale-95 ${
                  mirrorCamera
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-base-300 bg-base-100 text-base-content'
                }`}
                title="Flip / Mirror Kamera"
              >
                <FlipHorizontal2 className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setSoundEnabled((s) => !s)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-base-300 bg-base-100 text-base-content active:scale-95"
                title={soundEnabled ? 'Matikan suara' : 'Aktifkan suara'}
              >
                {soundEnabled ? (
                  <Volume2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <VolumeX className="h-4 w-4 text-base-content/40" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  userStoppedRef.current = true;
                  stopCamera();
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 text-xs font-semibold text-white active:scale-95"
              >
                <CameraOff className="h-4 w-4" />
                <span>Stop</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  onGoToAdmin?.();
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-base-300 bg-base-100 px-3 text-xs font-medium text-base-content active:scale-95"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>Admin</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop / Tablet Toolbar-style Top HUD (Shown during live scan) */}
      {cameraActive && (
        <div className="pointer-events-none hidden sm:block absolute inset-x-0 top-0 z-20 px-4 pt-3">
        <div className="pointer-events-auto mx-auto flex flex-wrap items-center justify-between gap-2 rounded-md border border-base-300 bg-base-100/95 px-2.5 py-1.5 text-xs text-base-content shadow-sm backdrop-blur-sm">
          {/* Left: Status, Time Session & Counters */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <span
                className={`h-2 w-2 rounded-full ${
                  cameraActive ? 'bg-emerald-500' : 'bg-base-content/30'
                }`}
              />
              <span>{skipSchedule ? 'Testing' : workspace === 'gereja' ? 'Gereja' : 'Piloting'}</span>
            </span>

            {!skipSchedule && (
              <>
                <span className="h-3.5 w-px bg-base-300" />
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <span className="font-medium">{clockLabel}</span>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${
                      churchSessionLabel === 'Gereja Pagi'
                        ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                        : 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                    }`}
                  >
                    {churchSessionLabel}
                  </span>
                </span>
              </>
            )}

            <span className="h-3.5 w-px bg-base-300" />

            <div className="flex items-center gap-2.5 tabular-nums">
              <span className="text-base-content/75">
                DB <strong className="text-base-content">{registeredUsersCount}</strong>
              </span>
              <span className="text-base-content/75">
                Total <strong className="text-base-content">{summary.totalCount}</strong>
              </span>
              <span className="text-emerald-700 dark:text-emerald-400">
                Hadir <strong>{summary.registeredCount}</strong>
              </span>
              <span className="text-amber-700 dark:text-amber-400">
                Tamu <strong>{summary.unregisteredCount}</strong>
              </span>
            </div>
          </div>

          {/* Right: Engine Selector & Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            <AiEnginePill
              aiMode={aiMode}
              onSelectMode={setAiMode}
              serverHealth={serverHealth}
              useServerAi={useServerAi}
              telemetry={telemetry}
              compact
            />

            {onGoToPortal && (
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  onGoToPortal();
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-base-300 bg-base-100 text-base-content hover:bg-base-200"
                title="Kembali ke Portal (/)"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            )}

            {devices.length > 1 && (
              <select
                value={selectedDeviceId}
                onChange={(e) => {
                  setSelectedDeviceId(e.target.value);
                  if (cameraActive) startCamera(e.target.value);
                }}
                className="h-8 max-w-[130px] rounded-md border border-base-300 bg-base-100 px-2 text-xs text-base-content focus:outline-none sm:max-w-[180px]"
              >
                {devices.map((d, idx) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Kamera ${idx + 1}`}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setSoundEnabled((s) => !s)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-base-300 bg-base-100 text-base-content hover:bg-base-200"
              title={soundEnabled ? 'Matikan suara' : 'Aktifkan suara'}
            >
              {soundEnabled ? (
                <Volume2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <VolumeX className="h-3.5 w-3.5 text-base-content/40" />
              )}
            </button>

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
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
                mirrorCamera
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-base-300 bg-base-100 text-base-content hover:bg-base-200'
              }`}
              title={mirrorCamera ? 'Kamera Flip / Mirror: ON' : 'Kamera Normal (tidak mirror)'}
            >
              <FlipHorizontal2 className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                userStoppedRef.current = true;
                stopCamera();
              }}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-rose-600 px-2.5 text-xs font-medium text-white hover:bg-rose-700 whitespace-nowrap"
              title={skipSchedule ? 'Hentikan kamera' : 'Stop kamera / ubah tanggal & jam ibadah'}
            >
              <CameraOff className="h-3.5 w-3.5" />
              <span>{skipSchedule ? 'Stop' : 'Stop / Jadwal'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                stopCamera();
                onGoToAdmin?.();
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-base-300 bg-base-100 px-2.5 text-xs font-medium text-base-content hover:bg-base-200 whitespace-nowrap"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span>Admin {wsCfg.shortLabel || wsMeta.shortLabel}</span>
            </button>
          </div>
        </div>
      </div>
      )}

      {/* PrimeVue Toast Notification */}
      {toast && (
        <div
          className={`absolute left-1/2 top-16 z-30 flex w-[92%] max-w-md -translate-x-1/2 items-center justify-center gap-2 rounded-md border px-3.5 py-2 text-xs font-medium shadow-md sm:top-16 sm:w-auto sm:text-sm ${
            toast.type === 'success'
              ? 'border-emerald-300 bg-base-100 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300'
              : 'border-amber-300 bg-base-100 text-amber-700 dark:border-amber-700 dark:text-amber-300'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <span className="truncate">{toast.text}</span>
        </div>
      )}

      {/* PrimeVue Panel Bottom Bar when Unknown Face Detected */}
      {unknownAlert && (
        <div className="absolute bottom-20 sm:bottom-4 left-1/2 z-30 flex w-[94%] max-w-xl -translate-x-1/2 flex-wrap items-center justify-between gap-2.5 rounded-lg border border-amber-300 bg-base-100/95 px-3.5 py-2.5 shadow-lg backdrop-blur-md dark:border-amber-700 sm:px-4">
          <div className="flex items-center gap-3">
            {unknownAlert.snapshotBase64 ? (
              <img
                src={unknownAlert.snapshotBase64}
                alt="Unknown"
                className="h-11 w-11 rounded-md object-cover border border-amber-400"
              />
            ) : (
              <ShieldAlert className="h-7 w-7 text-amber-600 dark:text-amber-400" />
            )}
            <div>
              <div className="text-xs font-semibold text-base-content">
                Wajah Belum Terdaftar ({unknownAlert.confidence}%)
              </div>
              <div className="text-[11px] text-base-content/70">
                Daftarkan sebagai {wsMeta.memberNoun} atau catat sebagai tamu.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onQuickRegister?.({
                  workspace,
                  descriptor: unknownAlert.descriptor,
                  sfaceDescriptor: unknownAlert.sfaceDescriptor,
                  photoBase64: unknownAlert.snapshotBase64,
                });
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Daftar
            </button>
            <button
              type="button"
              onClick={handleManualBablas}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-base-300 bg-base-100 px-3 text-xs font-medium text-base-content hover:bg-base-200"
            >
              <Footprints className="h-3.5 w-3.5" />
              Catat Tamu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
