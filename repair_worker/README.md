# Ethred — 360° Repair Worker

## What this is

An async Python sidecar service that silently improves uploaded 360° panorama quality in the background.
It runs on the same Oracle ARM VM as the Express.js API and communicates **exclusively via HTTP** — it never touches the database directly.

## How it works

```
Every 5 minutes (systemd timer):
  1. GET /api/v1/media?needs_repair=true&limit=10
  2. For each scene:
     a. Download JPEG from file_url
     b. Detect + repair equirectangular seam (seam_repair.py)
     c. Apply CLAHE LAB equalization (lab_equalizer.py)
     d. Compute SSIM(original, repaired)
     e. SSIM >= 0.85 → save repaired, PATCH /media/:id {file_url: new, needs_repair: false}
     f. SSIM < 0.85  → PATCH /media/:id {needs_repair: false} (keep original)
  3. Append JSON line to /var/log/ethred/repair_worker.jsonl
```

**The repair worker never blocks tour publishing.** Tours go live the instant a scene is uploaded.

## Setup

### 1. Create a Python virtualenv

```bash
cd /opt/ethred/backend/repair_worker
python3 -m venv venv
venv/bin/pip install -r requirements.txt
```

### 2. Create the secrets file

```bash
sudo nano /opt/ethred/.env.repair
```

Contents:
```env
# Must match INTERNAL_SERVICE_KEY in the Node.js .env
SERVICE_KEY=your_secret_here

API_BASE=http://localhost:5000/api/v1
APP_BASE_URL=http://localhost:5000
API_ROOT_DIR=/opt/ethred/backend
UPLOAD_DIR=uploads
POLL_INTERVAL=300
SSIM_THRESHOLD=0.85
BATCH_LIMIT=10
LOG_FILE=/var/log/ethred/repair_worker.jsonl
```

```bash
sudo chmod 600 /opt/ethred/.env.repair
sudo chown ethred:ethred /opt/ethred/.env.repair
```

### 3. Install systemd service

```bash
sudo cp ethred-repair-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ethred-repair-worker
```

### 4. Check status

```bash
sudo systemctl status ethred-repair-worker
journalctl -u ethred-repair-worker -f     # follow live logs
tail -f /var/log/ethred/repair_worker.jsonl  # structured JSONL log
```

## Log format

Each line in `repair_worker.jsonl` is a JSON object:

```json
{"timestamp":"2026-08-01T02:15:00Z","scene_id":"...","action":"REPAIRED","ssim":0.91,"duration_ms":4200,"error":null}
{"timestamp":"2026-08-01T02:15:05Z","scene_id":"...","action":"KEPT_ORIGINAL","ssim":0.62,"duration_ms":3800,"error":null}
{"timestamp":"2026-08-01T02:15:10Z","scene_id":"...","action":"ERROR","ssim":null,"duration_ms":120,"error":"Connection refused"}
```

Possible `action` values:
- `REPAIRED` — repair improved quality, new image uploaded
- `KEPT_ORIGINAL` — SSIM below threshold, original preserved
- `ERROR` — exception occurred; flag still cleared to prevent infinite loop

## Files

| File | Purpose |
|------|---------|
| `worker.py` | Main polling loop |
| `seam_repair.py` | OpenCV equirectangular seam detection and Gaussian blend |
| `lab_equalizer.py` | CLAHE LAB channel equalization |
| `requirements.txt` | Python dependencies |
| `ethred-repair-worker.service` | systemd unit |
