const express = require('express');
const router = express.Router();
const controller = require('./controller');
const authenticate = require('../../middleware/authenticate');
const { uploadImages, uploadDocument, processImages, saveDocument } = require('../../middleware/upload');

router.use(authenticate);

router.get('/me', controller.getProfile);
router.put('/me', controller.updateProfile);

// Avatar upload
router.post('/me/avatar',
  uploadImages.single('avatar'),
  processImages,
  controller.updateAvatar
);

// National ID / Passport upload (SRS REQ-USER-02)
router.post('/me/id-document',
  (req, _res, next) => { req.docSubDir = 'id-documents'; next(); },
  uploadDocument.single('document'),
  saveDocument,
  controller.uploadIdDocument
);

// Notification preferences (SRS REQ-USER-03)
router.put('/me/notifications', controller.updateNotificationPrefs);

module.exports = router;
