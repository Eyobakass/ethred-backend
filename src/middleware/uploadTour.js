// ─────────────────────────────────────────────────────────────────────────────
// Tour Scene Upload Middleware
// SRS Reference: SRS-ETHRED-2026-VT-1.0 §8.1, §12.2
// Handles: panorama validation + downsampling for ?tour_scene=true uploads
// ─────────────────────────────────────────────────────────────────────────────
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { ApiError } = require('./errorHandler');

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const MAX_PANORAMA_SIZE_MB = parseInt(process.env.MAX_PANORAMA_SIZE_MB) || 50;
const MAX_PANORAMA_BYTES = MAX_PANORAMA_SIZE_MB * 1024 * 1024;

// Max output resolution for panoramas (SRS REQ-TOUR-ING-05)
const MAX_PANO_WIDTH = 8192;
const MAX_PANO_HEIGHT = 4096;

// Tolerance band around 2:1 ratio (SRS REQ-TOUR-ING-02)
const RATIO_LOW = 1.9;
const RATIO_HIGH = 2.1;

// Ensure tours upload directory exists
const toursDir = path.join(process.cwd(), UPLOAD_DIR, 'tours');
if (!fs.existsSync(toursDir)) fs.mkdirSync(toursDir, { recursive: true });

// ── Multer instance for panoramas ─────────────────────────────────────────────
const panoramaFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png'];
  if (!allowed.includes(file.mimetype)) {
    return cb(new ApiError(
      'Only JPEG or PNG files are accepted for 360° tour scenes.',
      415,
      'UNSUPPORTED_MEDIA_TYPE'
    ), false);
  }
  cb(null, true);
};

const uploadPanorama = multer({
  storage: multer.memoryStorage(),
  fileFilter: panoramaFilter,
  limits: { fileSize: MAX_PANORAMA_BYTES, files: 1 },
});

// ── Sharp processing middleware ────────────────────────────────────────────────

/**
 * Validate 2:1 aspect ratio, optionally downsample, attempt XMP GPano detection,
 * save to uploads/tours/{uuid}.jpg, and attach result to req.tourScene.
 *
 * SRS REQ-TOUR-ING-02 | REQ-TOUR-ING-03 | REQ-TOUR-ING-04 | REQ-TOUR-ING-05
 */
const processPanorama = async (req, res, next) => {
  if (!req.file) {
    return next(new ApiError('No panorama file provided.', 400, 'NO_FILE'));
  }

  try {
    const image = sharp(req.file.buffer);
    const metadata = await image.metadata();
    const { width, height } = metadata;

    // ── 1. Aspect ratio validation (2:1 ± 5%) ─────────────────────────────────
    if (!width || !height) {
      throw new ApiError('Could not determine image dimensions.', 422, 'INVALID_IMAGE');
    }
    const ratio = width / height;
    if (ratio < RATIO_LOW || ratio > RATIO_HIGH) {
      throw new ApiError(
        `Image must have a 2:1 aspect ratio (got ${ratio.toFixed(2)}:1 — ${width}×${height}). ` +
        'Please upload a standard equirectangular panorama.',
        422,
        'INVALID_PANORAMA_RATIO'
      );
    }

    // ── 2. Attempt XMP GPano detection (SRS REQ-TOUR-ING-03) ──────────────────
    let gpanoConfirmed = false;
    try {
      const xmpRaw = metadata.xmp?.toString('utf8') ?? '';
      gpanoConfirmed =
        xmpRaw.includes('UsePanoramaViewer') ||
        xmpRaw.includes('FullPanoWidthPixels') ||
        xmpRaw.includes('GPano');
    } catch (_) { /* XMP extraction is best-effort */ }

    // ── 3. Downsample if needed (SRS REQ-TOUR-ING-05) ─────────────────────────
    let pipeline = image;
    const needsDownsample = width > MAX_PANO_WIDTH || height > MAX_PANO_HEIGHT;

    if (needsDownsample) {
      pipeline = pipeline.resize(MAX_PANO_WIDTH, MAX_PANO_HEIGHT, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // ── 4. Save as JPEG ────────────────────────────────────────────────────────
    const uuid = crypto.randomUUID();
    const outputFilename = `${uuid}.jpg`;
    const outputPath = path.join(toursDir, outputFilename);

    await pipeline.jpeg({ quality: 92, progressive: true }).toFile(outputPath);

    // ── 5. Attach result to request ────────────────────────────────────────────
    req.tourScene = {
      file_url: `/uploads/tours/${outputFilename}`,
      gpano_confirmed: gpanoConfirmed,
      original_width: width,
      original_height: height,
    };

    next();
  } catch (err) {
    if (err.statusCode) return next(err); // Already an ApiError
    next(new ApiError(`Failed to process panorama: ${err.message}`, 422, 'PROCESSING_FAILED'));
  }
};

module.exports = { uploadPanorama, processPanorama };
