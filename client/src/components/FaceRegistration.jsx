import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CameraOff,
  CheckCircle2,
  Database,
  FlipHorizontal2,
  ImagePlus,
  Loader2,
  Plus,
  ScanFace,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '../services/api.js';
import { getWorkspaceMeta } from './BrandLogo.jsx';
import { useSiteConfig } from '../context/SiteConfigContext.jsx';
import { useHybridAi } from '../hooks/useHybridAi.js';
import AiEnginePill from './AiEnginePill.jsx';
import {
  captureFaceCropBase64,
  captureVideoJpegBase64,
  detectAllFacesWithDescriptors,
  detectFaceBoxesFast,
  drawDetectionsOnCanvas,
  scaleBoxToSource,
  snapshotVideoToCanvas,
} from '../services/faceService.js';

export default function FaceRegistration({
  workspace = 'piloting',
  publicMode = false,
  modelsReady,
  prefillFace,
  onClearPrefill,
  onUserRegistered,
  onGoToLive,
}) {
  const { config, isAuthenticated, isReadOnly, updateRoleOption } = useSiteConfig();
  const {
    aiMode,
    setAiMode,
    serverHealth,
    useServerAi,
    engineReady,
    telemetry,
    recordTelemetry,
  } = useHybridAi(modelsReady);
  const canManageRoles = !publicMode || !config.authEnabled || (isAuthenticated && !isReadOnly);
  const wsMeta = getWorkspaceMeta(workspace);
  const roleOptions =
    Array.isArray(config.workspaces?.[workspace]?.roleOptions) &&
    config.workspaces[workspace].roleOptions.length > 0
      ? config.workspaces[workspace].roleOptions
      : wsMeta.roleOptions;
  const [manageRolesOpen, setManageRolesOpen] = useState(false);
  const [newRoleInput, setNewRoleInput] = useState('');
  const [roleFeedback, setRoleFeedback] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const uploadImgRef = useRef(null);
  const streamRef = useRef(null);
  const previewLoopRef = useRef(null);
  const previewBusyRef = useRef(false);
  const capturingRef = useRef(false);

  const [sourceMode, setSourceMode] = useState('webcam'); // 'webcam' | 'upload'
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [mirrorCamera, setMirrorCamera] = useState(() => {
    try {
      return localStorage.getItem('mardonius_camera_mirror') === 'true';
    } catch {
      return false;
    }
  });
  const [liveFaceCount, setLiveFaceCount] = useState(0);
  const [capturing, setCapturing] = useState(false);

  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState('');
  const [capturedPhoto, setCapturedPhoto] = useState('');
  const [capturedDescriptor, setCapturedDescriptor] = useState(null);
  const [capturedSfaceDescriptor, setCapturedSfaceDescriptor] = useState(null);

  // Step 2 verification status: null | 'checking' | 'new' | 'duplicate' | 'error'
  const [verifyStatus, setVerifyStatus] = useState(null);
  const [verifyMessage, setVerifyMessage] = useState('');
  const [matchedExistingUser, setMatchedExistingUser] = useState(null);
  const [dbSyncPercent, setDbSyncPercent] = useState(null);

  // Step 3 form state
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [department, setDepartment] = useState(wsMeta.defaultDepartment);
  const [wilayah, setWilayah] = useState('');
  const [customWilayahMode, setCustomWilayahMode] = useState(false);
  const [role, setRole] = useState(wsMeta.defaultRole);
  const [saving, setSaving] = useState(false);
  const [savedUser, setSavedUser] = useState(null);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setDepartment(wsMeta.defaultDepartment);
  }, [wsMeta.defaultDepartment]);

  useEffect(() => {
    setRole((prev) => (roleOptions.includes(prev) ? prev : roleOptions[0] || wsMeta.defaultRole));
  }, [roleOptions, wsMeta.defaultRole]);

  const handleAddRoleOption = async () => {
    const clean = newRoleInput.trim();
    if (!clean) return;
    setRoleFeedback('');
    try {
      await updateRoleOption(workspace, 'add', clean);
      setRole(clean);
      setNewRoleInput('');
    } catch (err) {
      setRoleFeedback(err.message || 'Gagal menambahkan peran');
    }
  };

  const handleDeleteRoleOption = async (opt) => {
    setRoleFeedback('');
    try {
      await updateRoleOption(workspace, 'delete', opt);
      if (role === opt) {
        const nextFirst = roleOptions.find((r) => r !== opt) || wsMeta.defaultRole;
        setRole(nextFirst);
      }
    } catch (err) {
      setRoleFeedback(err.message || 'Gagal menghapus peran');
    }
  };

  const stopCamera = useCallback(() => {
    if (previewLoopRef.current) {
      clearTimeout(previewLoopRef.current);
      previewLoopRef.current = null;
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
    previewBusyRef.current = false;
    setCameraActive(false);
    setLiveFaceCount(0);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const verifyDescriptorWithDb = useCallback(async (descriptorArr) => {
    setVerifyStatus('checking');
    setVerifyMessage('Mengecek kecocokan wajah ke database MongoDB...');
    setMatchedExistingUser(null);
    setDbSyncPercent(null);
    setSavedUser(null);
    setFormError('');

    try {
      const res = await api.verifyFace(descriptorArr, workspace);
      if (res.recognized) {
        setVerifyStatus('duplicate');
        setDbSyncPercent(res.confidence);
        setVerifyMessage(
          `Wajah sudah dikenali di ${wsMeta.shortLabel} sebagai "${res.user.name}" (Sync DB: ${res.confidence}%). Tidak perlu registrasi ulang.`
        );
        setMatchedExistingUser(res.user);
      } else {
        const closestPct =
          res.closestDistance !== null && res.closestDistance !== undefined
            ? Math.max(0, Math.min(100, Math.round((1 - Math.min(res.closestDistance, 1)) * 100)))
            : 0;
        setDbSyncPercent(closestPct);
        setVerifyStatus('new');
        setVerifyMessage(
          `Wajah terdeteksi jelas & belum terdaftar di ${wsMeta.shortLabel} (kemiripan terdekat: ${closestPct}%). Siap disimpan ke MongoDB.`
        );
      }
    } catch (err) {
      setVerifyStatus('error');
      setVerifyMessage(err.message || 'Gagal memverifikasi wajah ke server');
    }
  }, [workspace, wsMeta.shortLabel]);

  // Handle pre-filled unknown face from Live Monitor (Browser or Server AI)
  useEffect(() => {
    const hasBrowserDesc = prefillFace?.descriptor && prefillFace.descriptor.length === 128;
    const hasSfaceDesc = prefillFace?.sfaceDescriptor && prefillFace.sfaceDescriptor.length === 128;
    if (hasBrowserDesc || hasSfaceDesc) {
      stopCamera();
      setCapturedPhoto(prefillFace.photoBase64 || '');
      setCapturedDescriptor(hasBrowserDesc ? prefillFace.descriptor : null);
      setCapturedSfaceDescriptor(hasSfaceDesc ? prefillFace.sfaceDescriptor : null);
      if (hasBrowserDesc) {
        verifyDescriptorWithDb(prefillFace.descriptor);
      } else {
        setDbSyncPercent(0);
        setVerifyStatus('new');
        setVerifyMessage(
          `Wajah dari Server AI terdeteksi & siap didaftarkan ke ${wsMeta.shortLabel} MongoDB.`
        );
      }
      onClearPrefill?.();
    }
  }, [prefillFace, onClearPrefill, stopCamera, verifyDescriptorWithDb, wsMeta.shortLabel]);

  // Lightweight fast face box preview (no descriptors -> zero lag)
  const runPreviewDetection = useCallback(async () => {
    if (!cameraActive || sourceMode !== 'webcam' || !modelsReady) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2 || capturingRef.current || previewBusyRef.current) {
      previewLoopRef.current = setTimeout(runPreviewDetection, 140);
      return;
    }

    previewBusyRef.current = true;
    try {
      const faces = await detectFaceBoxesFast(video, { inputSize: 320, scoreThreshold: 0.28 });
      setLiveFaceCount(faces.length);
      drawDetectionsOnCanvas(
        canvasRef.current,
        video,
        faces.map((f) => ({
          box: f.box,
          matched: faces.length === 1,
          isPreviewFace: faces.length === 1,
          trackLabel:
            faces.length === 1
              ? `Wajah Terdeteksi (${Math.round(f.score * 100)}%) — Siap Capture`
              : 'Pastikan Hanya 1 Wajah di Kamera',
        })),
        { fitMode: 'contain', mirror: mirrorCamera }
      );
    } catch {
      // ignore transient errors
    } finally {
      previewBusyRef.current = false;
      if (cameraActive && sourceMode === 'webcam') {
        previewLoopRef.current = setTimeout(runPreviewDetection, 110);
      }
    }
  }, [cameraActive, mirrorCamera, modelsReady, sourceMode]);

  useEffect(() => {
    if (cameraActive && sourceMode === 'webcam' && modelsReady) {
      previewLoopRef.current = setTimeout(runPreviewDetection, 120);
    }
    return () => {
      if (previewLoopRef.current) clearTimeout(previewLoopRef.current);
    };
  }, [cameraActive, modelsReady, runPreviewDetection, sourceMode]);

  const startCamera = async () => {
    setCameraError('');
    setSourceMode('webcam');
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
          ? 'Izin kamera ditolak. Silakan izinkan kamera di browser atau gunakan Upload Foto.'
          : `Gagal membuka kamera: ${err.message}`
      );
    }
  };

  const extractAndVerifyFromElement = async (mediaEl) => {
    capturingRef.current = true;
    setCapturing(true);
    setVerifyStatus('checking');
    setVerifyMessage('Mengambil frame & mengekstrak fitur wajah...');
    setFormError('');
    setCapturedDescriptor(null);
    setCapturedSfaceDescriptor(null);

    try {
      const srcW = mediaEl.videoWidth || mediaEl.naturalWidth || mediaEl.clientWidth || 0;
      const srcH = mediaEl.videoHeight || mediaEl.naturalHeight || mediaEl.clientHeight || 0;
      let sfaceHandled = false;

      if (useServerAi && serverHealth.available) {
        try {
          const frameB64 = captureVideoJpegBase64(mediaEl, 720, 0.85);
          if (!frameB64) {
            setVerifyStatus('error');
            setVerifyMessage('Kamera belum siap. Tunggu 1 detik lalu coba capture lagi.');
            return;
          }
          const t0 = Date.now();
          const aiRes = await api.aiExtract(frameB64, workspace);
          recordTelemetry({
            processedBy: 'server',
            serverNode: aiRes.serverNode || 'ubuntu-swarm1',
            containerId: aiRes.containerId || '',
            engine: aiRes.engine || 'YuNet+SFace',
            inferenceMs: aiRes.inferenceMs,
            roundTripMs: Date.now() - t0,
          });

          if (aiRes.faceCount > 1) {
            setVerifyStatus('error');
            setVerifyMessage(
              `Terdeteksi ${aiRes.faceCount} wajah sekaligus. Pastikan hanya 1 orang di depan kamera saat registrasi.`
            );
            return;
          }

          const scaledBox = scaleBoxToSource(aiRes.box, srcW, srcH, aiRes.imageWidth, aiRes.imageHeight);
          const crop = captureFaceCropBase64(mediaEl, scaledBox, 220);
          setCapturedPhoto(crop);
          setCapturedSfaceDescriptor(aiRes.embedding);
          sfaceHandled = true;

          // Best-effort also grab browser descriptor if models happen to be ready on this device
          if (modelsReady) {
            try {
              const target =
                mediaEl instanceof HTMLVideoElement ? snapshotVideoToCanvas(mediaEl, 720)?.canvas : mediaEl;
              if (target) {
                const bDets = await detectAllFacesWithDescriptors(target, {
                  fastMode: false,
                  minConfidence: 0.35,
                });
                if (bDets.length === 1) {
                  setCapturedDescriptor(Array.from(bDets[0].descriptor));
                }
              }
            } catch {
              // ignore optional browser extraction failure
            }
          }

          if (aiRes.duplicate?.matched) {
            setVerifyStatus('duplicate');
            setDbSyncPercent(aiRes.duplicate.confidence);
            setMatchedExistingUser(aiRes.duplicate.user);
            setVerifyMessage(
              `Wajah sudah dikenali di ${wsMeta.shortLabel} sebagai "${aiRes.duplicate.user.name}" (Sync DB: ${aiRes.duplicate.confidence}%). Tidak perlu registrasi ulang.`
            );
          } else {
            setDbSyncPercent(100);
            setVerifyStatus('new');
            setVerifyMessage(
              `Wajah terverifikasi via Server AI (${aiRes.serverNode} • ${aiRes.inferenceMs}ms) & belum terdaftar di ${wsMeta.shortLabel}. Siap disimpan ke MongoDB.`
            );
          }
          return;
        } catch (srvErr) {
          if (aiMode === 'server' || !modelsReady) {
            throw srvErr;
          }
          // Fallback to browser extraction if Auto mode & browser models loaded
        }
      }

      if (!sfaceHandled) {
        let targetForDetection = mediaEl;
        if (mediaEl instanceof HTMLVideoElement) {
          const snap = snapshotVideoToCanvas(mediaEl, 720);
          if (!snap) {
            setVerifyStatus('error');
            setVerifyMessage('Kamera belum siap. Tunggu 1 detik lalu coba capture lagi.');
            return;
          }
          targetForDetection = snap.canvas;
        }

        const detections = await detectAllFacesWithDescriptors(targetForDetection, {
          fastMode: false,
          minConfidence: 0.35,
        });

        if (detections.length === 0) {
          setVerifyStatus('error');
          setVerifyMessage(
            'Wajah belum terbaca pada frame ini. Pastikan wajah menghadap kamera dan pencahayaan cukup, lalu klik Capture lagi.'
          );
          return;
        }
        if (detections.length > 1) {
          setVerifyStatus('error');
          setVerifyMessage(
            `Terdeteksi ${detections.length} wajah sekaligus. Pastikan hanya 1 orang di depan kamera saat registrasi.`
          );
          return;
        }

        const det = detections[0];
        const descriptorArr = Array.from(det.descriptor);
        const crop = captureFaceCropBase64(targetForDetection, det.detection.box, 220);

        setCapturedPhoto(crop);
        setCapturedDescriptor(descriptorArr);
        await verifyDescriptorWithDb(descriptorArr);
      }
    } catch (err) {
      setVerifyStatus('error');
      setVerifyMessage(`Gagal memproses wajah: ${err.message}`);
    } finally {
      capturingRef.current = false;
      setCapturing(false);
    }
  };

  const handleCaptureFromWebcam = async () => {
    if (!videoRef.current || !engineReady || capturing) return;
    await extractAndVerifyFromElement(videoRef.current);
  };

  const handleUploadFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCamera();
    setSourceMode('upload');
    setVerifyStatus(null);
    setCapturedPhoto('');
    setCapturedDescriptor(null);
    setCapturedSfaceDescriptor(null);
    setDbSyncPercent(null);

    const reader = new FileReader();
    reader.onload = () => {
      setUploadedPreviewUrl(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyzeUploaded = async () => {
    if (!uploadImgRef.current || !engineReady || capturing) return;
    await extractAndVerifyFromElement(uploadImgRef.current);
  };

  const handleSaveToMongo = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!capturedDescriptor && !capturedSfaceDescriptor) {
      setFormError('Silakan ambil dan kenali wajah terlebih dahulu.');
      return;
    }
    if (verifyStatus !== 'new') {
      setFormError('Wajah harus terverifikasi sebagai wajah baru sebelum masuk ke database.');
      return;
    }
    if (!name.trim()) {
      setFormError('Nama lengkap wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      const res = await api.createUser(
        {
          name: name.trim(),
          identifier: identifier.trim(),
          department: department.trim() || wsMeta.defaultDepartment,
          wilayah: wilayah.trim(),
          role: role.trim() || wsMeta.defaultRole,
          ...(capturedDescriptor ? { descriptor: capturedDescriptor } : {}),
          ...(capturedSfaceDescriptor ? { sfaceDescriptor: capturedSfaceDescriptor } : {}),
          photoBase64: capturedPhoto,
        },
        workspace
      );

      setSavedUser(res.user);
      setName('');
      setIdentifier('');
      setWilayah('');
      setCustomWilayahMode(false);
      setCapturedDescriptor(null);
      setCapturedSfaceDescriptor(null);
      setCapturedPhoto('');
      setUploadedPreviewUrl('');
      setVerifyStatus(null);
      setVerifyMessage('');
      setDbSyncPercent(null);
      onUserRegistered?.();
    } catch (err) {
      setFormError(err.message || 'Gagal menyimpan ke MongoDB');
    } finally {
      setSaving(false);
    }
  };

  const resetCapture = () => {
    setCapturedPhoto('');
    setCapturedDescriptor(null);
    setCapturedSfaceDescriptor(null);
    setVerifyStatus(null);
    setVerifyMessage('');
    setMatchedExistingUser(null);
    setDbSyncPercent(null);
    setSavedUser(null);
    setFormError('');
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left: Capture & Recognition Verification */}
      <div className="space-y-4 lg:col-span-7">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-[#1C1917] dark:shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-base-content">
                Langkah 1 &amp; 2: Ambil &amp; Kenali Wajah Dulu
              </h2>
              <p className="text-xs text-base-content/60">
                Pastikan kotak hijau muncul di wajah Anda, lalu klik Capture &amp; Kenali Wajah.
              </p>
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
              <button
                type="button"
                onClick={() => {
                  setSourceMode('webcam');
                  setUploadedPreviewUrl('');
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  sourceMode === 'webcam'
                    ? 'bg-sky-600 text-white dark:bg-sky-500'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'
                }`}
              >
                <Camera className="h-3.5 w-3.5" />
                Kamera
              </button>
              <label
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  sourceMode === 'upload'
                    ? 'bg-sky-600 text-white dark:bg-sky-500'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'
                }`}
              >
                <ImagePlus className="h-3.5 w-3.5" />
                Upload Foto
                <input type="file" accept="image/*" onChange={handleUploadFile} className="hidden" />
              </label>
            </div>
          </div>

          <div className="relative mt-4 flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-100 dark:border-stone-800 dark:bg-stone-950">
            {sourceMode === 'webcam' ? (
              <>
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className={`h-full w-full object-contain ${mirrorCamera ? '-scale-x-100' : ''} ${cameraActive ? 'block' : 'hidden'}`}
                />
                {!cameraActive && (
                  <div className="p-6 text-center">
                    <ScanFace className="mx-auto h-10 w-10 text-sky-600 dark:text-sky-400" />
                    <p className="mt-2 text-sm font-medium text-stone-700 dark:text-stone-200">
                      Nyalakan kamera untuk mengambil foto wajah
                    </p>
                    <button
                      type="button"
                      disabled={!modelsReady}
                      onClick={startCamera}
                      className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50 dark:bg-emerald-500 dark:text-stone-950 dark:hover:bg-emerald-400"
                    >
                      <Camera className="h-4 w-4" />
                      {modelsReady ? 'Aktifkan Kamera' : 'Memuat Model...'}
                    </button>
                    {cameraError && (
                      <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{cameraError}</p>
                    )}
                  </div>
                )}
              </>
            ) : uploadedPreviewUrl ? (
              <img
                ref={uploadImgRef}
                src={uploadedPreviewUrl}
                alt="Preview Upload"
                onLoad={handleAnalyzeUploaded}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="p-6 text-center text-xs text-base-content/60">
                Pilih foto wajah yang jelas (1 orang menghadap depan).
              </div>
            )}
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {sourceMode === 'webcam' && cameraActive ? (
              <>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-stone-100 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                  >
                    <CameraOff className="h-3.5 w-3.5" />
                    Tutup Kamera
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
                    className={`btn btn-xs gap-1 ${
                      mirrorCamera ? 'btn-primary' : 'btn-outline border-base-300'
                    }`}
                    title="Flip horizontal kamera"
                  >
                    <FlipHorizontal2 className="h-3.5 w-3.5" />
                    {mirrorCamera ? 'Flip: ON' : 'Normal'}
                  </button>
                  <span
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                      liveFaceCount === 1
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-0'
                        : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                    }`}
                  >
                    {liveFaceCount === 1
                      ? '1 Wajah Terdeteksi'
                      : liveFaceCount > 1
                        ? `${liveFaceCount} Wajah (Harus 1)`
                        : 'Mencari wajah...'}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={!engineReady || capturing}
                  onClick={handleCaptureFromWebcam}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 dark:bg-emerald-500 dark:text-stone-950 dark:hover:bg-emerald-400"
                >
                  {capturing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ScanFace className="h-4 w-4" />
                  )}
                  {capturing ? 'Memproses Capture...' : 'Capture & Kenali Wajah'}
                </button>
              </>
            ) : sourceMode === 'upload' && uploadedPreviewUrl ? (
              <button
                type="button"
                disabled={!engineReady || capturing}
                onClick={handleAnalyzeUploaded}
                className="ml-auto inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50 dark:bg-sky-500 dark:hover:bg-sky-400"
              >
                {capturing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ScanFace className="h-4 w-4" />
                )}
                {capturing ? 'Mendeteksi...' : 'Deteksi & Kenali Ulang'}
              </button>
            ) : (
              <span className="text-xs text-stone-500">
                Tips: Pastikan pencahayaan terang dan wajah menghadap kamera.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Verification Result & MongoDB Registration Form */}
      <div className="space-y-4 lg:col-span-5">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-[#1C1917] dark:shadow-none">
          <h2 className="text-base font-bold text-base-content">
            Langkah 3: Verifikasi &amp; Simpan ke MongoDB
          </h2>
          <p className="mt-0.5 text-xs text-base-content/60">
            Data hanya bisa masuk database setelah wajah terverifikasi sebagai wajah baru.
          </p>

          {/* Captured Preview & Verification Badge */}
          {capturedPhoto || verifyStatus ? (
            <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3.5 dark:border-stone-800 dark:bg-stone-950/70">
              <div className="flex items-center gap-3.5">
                {capturedPhoto ? (
                  <img
                    src={capturedPhoto}
                    alt="Crop Wajah"
                    className={`h-16 w-16 rounded-xl object-cover ring-2 ${
                      verifyStatus === 'new'
                        ? 'ring-emerald-500'
                        : verifyStatus === 'duplicate'
                          ? 'ring-amber-500'
                          : 'ring-stone-300 dark:ring-stone-700'
                    }`}
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-stone-200 text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                    {verifyStatus === 'checking' ? (
                      <Loader2 className="h-7 w-7 animate-spin text-sky-600 dark:text-sky-400" />
                    ) : (
                      <ScanFace className="h-7 w-7" />
                    )}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                    <div className="flex items-center gap-1.5">
                      {verifyStatus === 'new' && (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-emerald-700 dark:text-emerald-400">
                            Wajah Terverifikasi (Baru)
                          </span>
                        </>
                      )}
                      {verifyStatus === 'duplicate' && (
                        <>
                          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          <span className="text-amber-700 dark:text-amber-400">
                            Wajah Sudah Terdaftar!
                          </span>
                        </>
                      )}
                      {verifyStatus === 'checking' && (
                        <span className="text-sky-600 dark:text-sky-400">Memeriksa database...</span>
                      )}
                      {verifyStatus === 'error' && (
                        <>
                          <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                          <span className="text-rose-700 dark:text-rose-400">Deteksi Gagal</span>
                        </>
                      )}
                    </div>

                    {dbSyncPercent !== null && (
                      <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700 ring-1 ring-sky-200 dark:bg-stone-800 dark:text-sky-300 dark:ring-0">
                        Sync DB: {dbSyncPercent}%
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-base-content/75">
                    {verifyMessage}
                  </p>
                  {matchedExistingUser && (
                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                      Nama di DB: <strong>{matchedExistingUser.name}</strong> ({matchedExistingUser.department})
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={resetCapture}
                className="mt-2.5 text-[11px] font-medium text-stone-500 underline hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"
              >
                Ambil ulang wajah lain
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 text-center text-xs text-stone-500 dark:border-stone-700 dark:bg-[#141210]/50 dark:text-stone-400">
              Belum ada wajah yang diambil. Aktifkan kamera lalu klik <strong>Capture &amp; Kenali Wajah</strong>.
            </div>
          )}

          {/* Success banner after saving */}
          {savedUser && (
            <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-500/40 dark:bg-emerald-950/40">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                <Sparkles className="h-4 w-4" />
                Berhasil Masuk MongoDB!
              </div>
              <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-100/80">
                Wajah <strong>{savedUser.name}</strong> sudah tersimpan. Sekarang coba uji di menu Kamera Full-Screen.
              </p>
              <button
                type="button"
                onClick={() => onGoToLive?.()}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 dark:bg-emerald-500 dark:text-stone-950 dark:hover:bg-emerald-400"
              >
                Lanjut Test Recognisi →
              </button>
            </div>
          )}

          {/* Registration Form */}
          <form onSubmit={handleSaveToMongo} className="mt-4 space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-base-content/80">
                Nama Lengkap <span className="text-rose-500 dark:text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Budi Santoso"
                className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-[#7C2D12] focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:placeholder-stone-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-base-content/80">
                  {workspace === 'gereja' ? 'No. Induk Jemaat' : 'ID / NIM / NIP'}
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={wsMeta.identifierPlaceholder}
                  className="w-full rounded-xl border border-base-300 bg-base-200 px-3.5 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-[#7C2D12] focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:placeholder-stone-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-base-content/80">
                  {workspace === 'gereja' ? 'Komisi / Ibadah' : 'Divisi / Kelas'}
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder={wsMeta.departmentPlaceholder}
                  className="w-full rounded-xl border border-base-300 bg-base-200 px-3.5 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-[#7C2D12] focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:placeholder-stone-500"
                />
              </div>
            </div>

            {/* Wilayah selector (especially useful for Wilayah Jemaat 1..10) */}
            <div>
              <label className="mb-1 block text-xs font-medium text-base-content/80">
                Wilayah {workspace === 'gereja' ? 'Jemaat' : '(Opsional)'}
              </label>
              <div className="space-y-2">
                <select
                  value={customWilayahMode ? '__custom__' : wilayah}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__custom__') {
                      setCustomWilayahMode(true);
                      setWilayah('');
                    } else {
                      setCustomWilayahMode(false);
                      setWilayah(val);
                    }
                  }}
                  className="select select-bordered w-full bg-base-200 text-sm text-base-content"
                >
                  <option value="">-- Pilih Wilayah (Opsional) --</option>
                  {Array.from({ length: 10 }, (_, i) => `Wilayah ${i + 1}`).map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                  <option value="__custom__">Ketik Wilayah Lainnya...</option>
                </select>
                {customWilayahMode && (
                  <input
                    type="text"
                    value={wilayah}
                    onChange={(e) => setWilayah(e.target.value)}
                    placeholder="Contoh: Wilayah Tengah / Wilayah 12"
                    className="input input-bordered input-sm w-full bg-base-200 text-sm text-base-content"
                  />
                )}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-xs font-medium text-base-content/80">
                  Peran / Status
                </label>
                {canManageRoles && (
                  <button
                    type="button"
                    onClick={() => {
                      setManageRolesOpen((v) => !v);
                      setRoleFeedback('');
                    }}
                    className="btn btn-ghost btn-xs gap-1 text-primary"
                  >
                    <Settings2 className="h-3 w-3" />
                    <span>{manageRolesOpen ? 'Tutup Kelola' : '+ Tambah / Hapus Peran'}</span>
                  </button>
                )}
              </div>

              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="select select-bordered w-full bg-base-200 text-sm text-base-content"
              >
                {roleOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>

              {manageRolesOpen && (
                <div className="mt-2.5 space-y-2.5 rounded-xl border border-base-300 bg-base-200 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-base-content/60">
                    Kelola Daftar Peran ({wsMeta.shortLabel})
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {roleOptions.map((opt) => (
                      <span
                        key={opt}
                        className="badge badge-outline border-base-300 bg-base-100 gap-1.5 py-2.5 text-xs"
                      >
                        <span>{opt}</span>
                        {roleOptions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteRoleOption(opt)}
                            className="text-error hover:opacity-75"
                            title={`Hapus peran "${opt}"`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newRoleInput}
                      onChange={(e) => setNewRoleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddRoleOption();
                        }
                      }}
                      placeholder={
                        workspace === 'gereja'
                          ? 'Peran baru (mis: Diaken, Usher, Koster)'
                          : 'Peran baru (mis: Dosen, Magang)'
                      }
                      className="input input-bordered input-xs flex-1"
                    />
                    <button
                      type="button"
                      onClick={handleAddRoleOption}
                      className="btn btn-primary btn-xs gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      Tambah
                    </button>
                  </div>

                  {roleFeedback && (
                    <div className="text-[11px] font-medium text-error">{roleFeedback}</div>
                  )}
                </div>
              )}
            </div>

            {formError && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-300">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || verifyStatus !== 'new'}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${wsMeta.accentSolidClass}`}
            >
              <Database className="h-4 w-4" />
              {saving ? 'Menyimpan ke MongoDB...' : `Simpan ke ${wsMeta.shortLabel}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
