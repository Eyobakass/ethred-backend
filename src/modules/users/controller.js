const UserService = require('./service');

const getProfile = async (req, res, next) => {
  try {
    const profile = await UserService.getProfile(req.user.id);
    res.json({ success: true, data: profile });
  } catch (err) { next(err); }
};

const updateProfile = async (req, res, next) => {
  try {
    const profile = await UserService.updateProfile(req.user.id, req.body);
    res.json({ success: true, data: profile });
  } catch (err) { next(err); }
};

const updateAvatar = async (req, res, next) => {
  try {
    if (!req.processedFiles?.length) throw new Error('No image uploaded.');
    const avatar_url = req.processedFiles[0].file_url;
    const profile = await UserService.updateAvatar(req.user.id, avatar_url);
    res.json({ success: true, data: profile });
  } catch (err) { next(err); }
};

const uploadIdDocument = async (req, res, next) => {
  try {
    if (!req.savedDocument) throw new Error('No document uploaded.');
    await UserService.saveIdDocument(req.user.id, req.savedDocument.file_url);
    res.json({ success: true, message: 'ID document submitted for verification.' });
  } catch (err) { next(err); }
};

const updateNotificationPrefs = async (req, res, next) => {
  try {
    const prefs = await UserService.updateNotificationPrefs(req.user.id, req.body);
    res.json({ success: true, data: prefs });
  } catch (err) { next(err); }
};

module.exports = { getProfile, updateProfile, updateAvatar, uploadIdDocument, updateNotificationPrefs };
