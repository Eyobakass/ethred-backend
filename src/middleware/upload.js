const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { ApiError } = require('./errorHandler');

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const MAX_IMAGE_SIZE = (parseInt(process.env.MAX_IMAGE_SIZE_MB) || 10) * 1024 * 1024;
const MAX_DOC_SIZE = (parseInt(process.env.MAX_DOC_SIZE_MB) || 20) * 1024 * 1024;

// Ensure upload subdirectories exist
['images', 'documents', 'avatars', 'id-documents'].forEach((dir) => {
  const fullPath = path.join(process.cwd(), UPLOAD_DIR, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

// Use memory storage so we can pipe through Sharp before saving
const storage = multer.memoryStorage();

const imageFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new ApiError('Only image files are allowed.', 400), false);
  }
  cb(null, true);
};

const documentFilter = (req, file, cb) => {
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.mimetype)) {
    return cb(new ApiError('Only PDF or image files are allowed.', 400), false);
  }
  cb(null, true);
};

// Image upload — max 10MB, max 10 files
const uploadImages = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: MAX_IMAGE_SIZE, files: 10 },
});

// Document upload — max 20MB, single file
const uploadDocument = multer({
  storage,
  fileFilter: documentFilter,
  limits: { fileSize: MAX_DOC_SIZE, files: 1 },
});

/**
 * Sharp middleware: transcode uploaded images to WebP at 3 responsive widths
 * SRS REQ-PROP-01: 400px, 800px, 1200px
 */
const processImages = async (req, res, next) => {
  if (!req.files || req.files.length === 0) return next();

  try {
    const processedFiles = await Promise.all(
      req.files.map(async (file) => {
        const filename = crypto.randomUUID();
        const sizes = [400, 800, 1200];
        const urls = {};

        await Promise.all(
          sizes.map(async (width) => {
            const outputName = `${filename}_${width}.webp`;
            const outputPath = path.join(process.cwd(), UPLOAD_DIR, 'images', outputName);
            await sharp(file.buffer)
              .resize(width, null, { withoutEnlargement: true })
              .webp({ quality: 82 })
              .toFile(outputPath);
            urls[`w${width}`] = `/uploads/images/${outputName}`;
          })
        );

        return {
          originalname: file.originalname,
          filename,
          urls,
          // Use 800w as the primary URL
          file_url: urls.w800,
        };
      })
    );

    req.processedFiles = processedFiles;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Save a single document (ID / business license / deed) as-is
 */
const saveDocument = async (req, res, next) => {
  if (!req.file) return next();

  try {
    const ext = path.extname(req.file.originalname) || '.pdf';
    const filename = `${crypto.randomUUID()}${ext}`;
    const subDir = req.docSubDir || 'documents';
    const outputPath = path.join(process.cwd(), UPLOAD_DIR, subDir, filename);
    fs.writeFileSync(outputPath, req.file.buffer);
    req.savedDocument = { file_url: `/uploads/${subDir}/${filename}`, filename };
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { uploadImages, uploadDocument, processImages, saveDocument };
