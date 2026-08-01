"""
Ethred — 360° Tour Repair Worker
SRS Reference: SRS-ETHRED-2026-VT-1.0 §13

Architecture:
  - Runs as a systemd service alongside the Express.js API server
  - Communicates ONLY via HTTP (never touches the DB directly)
  - Polls GET /api/v1/media?needs_repair=true&limit=10
  - For each scene: downloads JPEG, runs repair pipeline, computes SSIM
  - SSIM >= 0.85  → saves repaired image, calls PATCH /media/:id with new file_url
  - SSIM < 0.85   → leaves original, calls PATCH /media/:id to clear needs_repair flag
  - Always clears needs_repair=true to prevent infinite retry loops

Environment Variables (from /opt/ethred/.env.repair):
  API_BASE           - e.g. http://localhost:5000/api/v1
  SERVICE_KEY        - matches INTERNAL_SERVICE_KEY in the Node.js .env
  POLL_INTERVAL      - seconds between polls (default: 300 = 5 minutes)
  SSIM_THRESHOLD     - minimum acceptable SSIM (default: 0.85)
  LOG_FILE           - path to structured JSONL log (default: /var/log/ethred/repair_worker.jsonl)
"""

import os
import sys
import time
import json
import logging
import traceback
from pathlib import Path
from datetime import datetime, timezone

import requests

# ── Configuration ─────────────────────────────────────────────────────────────

API_BASE       = os.getenv("API_BASE", "http://localhost:5000/api/v1")
SERVICE_KEY    = os.getenv("SERVICE_KEY", "")
POLL_INTERVAL  = int(os.getenv("POLL_INTERVAL", "300"))   # 5 minutes
SSIM_THRESHOLD = float(os.getenv("SSIM_THRESHOLD", "0.85"))
LOG_FILE       = Path(os.getenv("LOG_FILE", "/var/log/ethred/repair_worker.jsonl"))
BATCH_LIMIT    = int(os.getenv("BATCH_LIMIT", "10"))

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("repair_worker")

# ── Helpers ───────────────────────────────────────────────────────────────────

def _headers() -> dict:
    """Returns the X-Internal-Service-Key auth header required by the API."""
    return {"X-Internal-Service-Key": SERVICE_KEY}


def _log_result(entry: dict) -> None:
    """Append a structured JSON line to the log file."""
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as e:
        logger.warning(f"Could not write to log file: {e}")


def _clear_repair_flag(scene_id: str, new_url: str | None = None) -> None:
    """
    Call PATCH /media/:id to clear needs_repair.
    Optionally updates file_url if a repaired image was uploaded.
    This is always called even on failure to prevent infinite retry loops.
    """
    payload = {"needs_repair": False}
    if new_url:
        payload["file_url"] = new_url
    try:
        r = requests.patch(
            f"{API_BASE}/media/{scene_id}",
            json=payload,
            headers=_headers(),
            timeout=15,
        )
        r.raise_for_status()
    except Exception as e:
        logger.error(f"Failed to clear repair flag for scene {scene_id}: {e}")

# ── Core Processing ───────────────────────────────────────────────────────────

def process_scene(scene: dict) -> dict:
    """
    Download → repair → SSIM check → upload repaired OR keep original.

    Returns a dict with: action, ssim, duration_ms
    """
    from seam_repair import detect_and_repair_seams
    from lab_equalizer import equalize_lab

    import numpy as np
    import cv2
    from skimage.metrics import structural_similarity as compare_ssim

    scene_id = scene["id"]
    file_url  = scene["file_url"]

    # ── 1. Download image ──────────────────────────────────────────────────────
    logger.info(f"  Downloading scene {scene_id} from {file_url}")
    resp = requests.get(file_url, timeout=60)
    resp.raise_for_status()

    img_bytes = np.frombuffer(resp.content, np.uint8)
    original  = cv2.imdecode(img_bytes, cv2.IMREAD_COLOR)

    if original is None:
        raise ValueError(f"cv2.imdecode returned None for scene {scene_id}")

    # ── 2. Repair pipeline ─────────────────────────────────────────────────────
    logger.info(f"  Running repair pipeline for scene {scene_id}")
    repaired = detect_and_repair_seams(original.copy())
    repaired = equalize_lab(repaired)

    # ── 3. Compute SSIM ────────────────────────────────────────────────────────
    orig_gray = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY)
    rep_gray  = cv2.cvtColor(repaired, cv2.COLOR_BGR2GRAY)
    score = compare_ssim(orig_gray, rep_gray, data_range=255)
    logger.info(f"  SSIM = {score:.4f} (threshold: {SSIM_THRESHOLD})")

    if score >= SSIM_THRESHOLD:
        # ── 4a. Upload repaired image ──────────────────────────────────────────
        _, buf = cv2.imencode(".jpg", repaired, [cv2.IMWRITE_JPEG_QUALITY, 92])
        new_url = _upload_repaired(scene_id, bytes(buf))
        _clear_repair_flag(scene_id, new_url=new_url)
        return {"action": "REPAIRED", "ssim": round(score, 4)}
    else:
        # ── 4b. Keep original, just clear the flag ─────────────────────────────
        _clear_repair_flag(scene_id, new_url=None)
        return {"action": "KEPT_ORIGINAL", "ssim": round(score, 4)}


def _upload_repaired(scene_id: str, image_bytes: bytes) -> str:
    """
    Upload the repaired JPEG back to the API server.

    The API server writes the file to the local uploads/tours/repaired/ directory
    and returns the new file_url.

    We POST as multipart/form-data to a dedicated internal endpoint.
    As a simpler alternative for local-disk setups, we write the file directly.
    """
    # For local-disk setups: derive the local path from environment
    upload_dir = os.getenv("UPLOAD_DIR", "uploads")
    api_root   = os.getenv("API_ROOT_DIR", "/opt/ethred/backend")

    repaired_dir = Path(api_root) / upload_dir / "tours" / "repaired"
    repaired_dir.mkdir(parents=True, exist_ok=True)

    filename = f"repaired_{scene_id}.jpg"
    output_path = repaired_dir / filename
    output_path.write_bytes(image_bytes)

    # Return the URL path the API would serve
    api_base_url = os.getenv("APP_BASE_URL", "http://localhost:5000")
    return f"{api_base_url}/uploads/tours/repaired/{filename}"


# ── Main Poll Loop ────────────────────────────────────────────────────────────

def poll_and_repair() -> None:
    """Single poll cycle: fetch batch of scenes needing repair and process each."""
    logger.info("Polling for scenes needing repair...")

    resp = requests.get(
        f"{API_BASE}/media",
        params={"needs_repair": "true", "limit": str(BATCH_LIMIT)},
        headers=_headers(),
        timeout=30,
    )
    resp.raise_for_status()
    scenes = resp.json().get("scenes", [])

    if not scenes:
        logger.info("No scenes need repair. Sleeping.")
        return

    logger.info(f"Found {len(scenes)} scene(s) to process.")

    for scene in scenes:
        scene_id = scene["id"]
        start_ts = time.monotonic()

        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "scene_id": scene_id,
            "action": None,
            "ssim": None,
            "duration_ms": None,
            "error": None,
        }

        try:
            result = process_scene(scene)
            log_entry.update(result)
            logger.info(f"  Done: scene {scene_id} — {result['action']} (SSIM={result['ssim']})")
        except Exception as e:
            log_entry["action"] = "ERROR"
            log_entry["error"] = str(e)
            logger.error(f"  Error processing scene {scene_id}: {e}")
            logger.debug(traceback.format_exc())
            # Always clear the flag to prevent infinite loops
            _clear_repair_flag(scene_id)
        finally:
            log_entry["duration_ms"] = int((time.monotonic() - start_ts) * 1000)
            _log_result(log_entry)


def main() -> None:
    if not SERVICE_KEY:
        logger.error("SERVICE_KEY is not set. Cannot authenticate with API. Exiting.")
        sys.exit(1)

    logger.info("=" * 60)
    logger.info("Ethred 360° Repair Worker starting")
    logger.info(f"  API_BASE:       {API_BASE}")
    logger.info(f"  POLL_INTERVAL:  {POLL_INTERVAL}s")
    logger.info(f"  SSIM_THRESHOLD: {SSIM_THRESHOLD}")
    logger.info(f"  BATCH_LIMIT:    {BATCH_LIMIT}")
    logger.info(f"  LOG_FILE:       {LOG_FILE}")
    logger.info("=" * 60)

    while True:
        try:
            poll_and_repair()
        except requests.exceptions.ConnectionError as e:
            logger.warning(f"Cannot reach API server: {e}. Will retry in {POLL_INTERVAL}s.")
        except requests.exceptions.HTTPError as e:
            logger.error(f"API returned an error: {e}. Will retry in {POLL_INTERVAL}s.")
        except Exception as e:
            logger.error(f"Unexpected error in poll cycle: {e}")
            logger.debug(traceback.format_exc())

        logger.info(f"Sleeping {POLL_INTERVAL}s until next poll cycle...")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
