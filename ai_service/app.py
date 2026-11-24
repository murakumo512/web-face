import base64
import os
import socket
import threading
import time
from typing import List, Optional

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

MODEL_DIR = os.environ.get(
    "AI_MODEL_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
)
YUNET_PATH = os.path.join(MODEL_DIR, "face_detection_yunet_2023mar.onnx")
SFACE_PATH = os.path.join(MODEL_DIR, "face_recognition_sface_2021dec.onnx")
SERVER_NODE_NAME = os.environ.get("SERVER_NODE_NAME", "ubuntu-swarm1")

# OpenCV SFace official cosine similarity threshold (~0.363)
DEFAULT_COSINE_THRESHOLD = float(os.environ.get("SFACE_THRESHOLD", "0.38"))

app = FastAPI(title="Mardonius Riel Face Recognition AI Service")

_detect_lock = threading.Lock()
_recog_lock = threading.Lock()
_detector = None
_recognizer = None


def get_models():
    global _detector, _recognizer
    if _detector is None or _recognizer is None:
        if not os.path.exists(YUNET_PATH) or not os.path.exists(SFACE_PATH):
            raise RuntimeError(
                f"Model ONNX tidak ditemukan di {MODEL_DIR} ({YUNET_PATH}, {SFACE_PATH})"
            )
        _detector = cv2.FaceDetectorYN.create(
            YUNET_PATH,
            "",
            (320, 320),
            0.55,
            0.3,
            50,
        )
        _recognizer = cv2.FaceRecognizerSF.create(SFACE_PATH, "")
    return _detector, _recognizer


@app.on_event("startup")
def warm_startup():
    try:
        detector, _ = get_models()
        blank = np.zeros((320, 320, 3), dtype=np.uint8)
        with _detect_lock:
            detector.setInputSize((320, 320))
            detector.detect(blank)
    except Exception as exc:
        print(f"[AI Startup Warning] {exc}", flush=True)


def decode_base64_image(image_b64: str) -> np.ndarray:
    if not image_b64 or not isinstance(image_b64, str):
        raise HTTPException(status_code=400, detail="imageBase64 wajib diisi")
    raw = image_b64.split(",", 1)[1] if "," in image_b64 else image_b64
    try:
        img_bytes = base64.b64decode(raw)
        arr = np.frombuffer(img_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Gagal decode gambar: {exc}") from exc
    if img is None or img.size == 0:
        raise HTTPException(status_code=400, detail="Gambar kosong atau format tidak didukung")
    return img


def detect_and_embed(img: np.ndarray):
    detector, recognizer = get_models()
    h, w = img.shape[:2]

    with _detect_lock:
        detector.setInputSize((w, h))
        _, raw_faces = detector.detect(img)

    results = []
    if raw_faces is None or len(raw_faces) == 0:
        return results

    for face_row in raw_faces:
        bx, by, bw, bh = [float(v) for v in face_row[:4]]
        score = float(face_row[14]) if len(face_row) > 14 else 0.9
        if bw < 20 or bh < 20:
            continue

        with _recog_lock:
            aligned = recognizer.alignCrop(img, face_row)
            feat = recognizer.feature(aligned)

        vec = feat.flatten().astype(np.float32)
        norm = float(np.linalg.norm(vec))
        if norm > 0:
            vec = vec / norm

        results.append(
            {
                "box": {
                    "x": max(0.0, bx),
                    "y": max(0.0, by),
                    "width": max(1.0, bw),
                    "height": max(1.0, bh),
                },
                "score": round(score, 4),
                "embedding": [round(float(x), 6) for x in vec.tolist()],
            }
        )
    return results


def similarity_to_confidence(sim: float) -> int:
    # Map cosine similarity [-0.1..0.85] -> intuitive 0..100% percentage
    pct = ((sim - 0.05) / 0.70) * 100.0
    return int(max(0, min(100, round(pct))))


class ExtractRequest(BaseModel):
    imageBase64: str


class CandidateUser(BaseModel):
    userId: str
    name: str
    wilayah: Optional[str] = ""
    embeddings: List[List[float]]


class AnalyzeRequest(BaseModel):
    imageBase64: str
    candidates: List[CandidateUser] = []
    threshold: Optional[float] = None


@app.get("/health")
def health():
    try:
        get_models()
        ready = True
        err_msg = ""
    except Exception as exc:
        ready = False
        err_msg = str(exc)

    return {
        "ok": ready,
        "engine": "OpenCV YuNet + SFace (ONNX Server)",
        "serverNode": SERVER_NODE_NAME,
        "containerId": socket.gethostname(),
        "cpuCount": os.cpu_count() or 1,
        "error": err_msg,
    }


@app.post("/extract")
def extract(req: ExtractRequest):
    t0 = time.perf_counter()
    img = decode_base64_image(req.imageBase64)
    h, w = img.shape[:2]
    faces = detect_and_embed(img)
    elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
    return {
        "faces": faces,
        "imageWidth": w,
        "imageHeight": h,
        "inferenceMs": elapsed_ms,
        "engine": "YuNet+SFace",
        "serverNode": SERVER_NODE_NAME,
        "containerId": socket.gethostname(),
    }


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    t0 = time.perf_counter()
    img = decode_base64_image(req.imageBase64)
    h, w = img.shape[:2]
    detected = detect_and_embed(img)
    threshold = req.threshold if req.threshold is not None else DEFAULT_COSINE_THRESHOLD

    # Pre-normalize candidate vectors for fast cosine dot-product matching
    cand_vecs = []
    cand_meta = []
    for c in req.candidates:
        for emb in c.embeddings:
            if len(emb) == 128:
                arr = np.asarray(emb, dtype=np.float32)
                n = float(np.linalg.norm(arr))
                if n > 0:
                    cand_vecs.append(arr / n)
                    cand_meta.append(c)

    cand_matrix = np.vstack(cand_vecs) if cand_vecs else None

    out_faces = []
    for det in detected:
        q = np.asarray(det["embedding"], dtype=np.float32)
        best_sim = -1.0
        best_cand = None

        if cand_matrix is not None and len(cand_matrix) > 0:
            sims = cand_matrix @ q
            idx = int(np.argmax(sims))
            best_sim = float(sims[idx])
            best_cand = cand_meta[idx]

        matched = bool(best_cand is not None and best_sim >= threshold)
        confidence = similarity_to_confidence(best_sim) if best_cand is not None else 0

        out_faces.append(
            {
                "box": det["box"],
                "score": det["score"],
                "embedding": det["embedding"],
                "matched": matched,
                "userId": best_cand.userId if matched else None,
                "name": best_cand.name if matched else None,
                "wilayah": (best_cand.wilayah or "") if matched else "",
                "similarity": round(best_sim, 4) if best_cand is not None else None,
                "confidence": confidence,
            }
        )

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
    return {
        "faces": out_faces,
        "imageWidth": w,
        "imageHeight": h,
        "inferenceMs": elapsed_ms,
        "threshold": threshold,
        "engine": "YuNet+SFace",
        "serverNode": SERVER_NODE_NAME,
        "containerId": socket.gethostname(),
    }
