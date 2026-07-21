const AgencyService = require('./service');

const createAgency = async (req, res, next) => {
  try {
    const business_license_url = req.savedDocument?.file_url;
    if (!business_license_url) return res.status(400).json({ success: false, message: 'Business license document required.' });
    const agency = await AgencyService.createAgency(req.user.id, { ...req.body, business_license_url });
    res.status(201).json({ success: true, data: agency });
  } catch (err) { next(err); }
};

const getAgency = async (req, res, next) => {
  try {
    const agency = await AgencyService.getAgency(req.params.id);
    res.json({ success: true, data: agency });
  } catch (err) { next(err); }
};

const updateAgency = async (req, res, next) => {
  try {
    const agency = await AgencyService.updateAgency(req.params.id, req.user, req.body);
    res.json({ success: true, data: agency });
  } catch (err) { next(err); }
};

const inviteEmployee = async (req, res, next) => {
  try {
    await AgencyService.inviteEmployee(req.params.id, req.user, req.body);
    res.json({ success: true, message: 'Invitation sent.' });
  } catch (err) { next(err); }
};

const listEmployees = async (req, res, next) => {
  try {
    const employees = await AgencyService.listEmployees(req.params.id, req.user);
    res.json({ success: true, data: employees });
  } catch (err) { next(err); }
};

const removeEmployee = async (req, res, next) => {
  try {
    await AgencyService.removeEmployee(req.params.id, req.params.userId, req.user);
    res.json({ success: true, message: 'Employee removed.' });
  } catch (err) { next(err); }
};

const getAnalytics = async (req, res, next) => {
  try {
    const analytics = await AgencyService.getAnalytics(req.params.id, req.user);
    res.json({ success: true, data: analytics });
  } catch (err) { next(err); }
};

module.exports = { createAgency, getAgency, updateAgency, inviteEmployee, listEmployees, removeEmployee, getAnalytics };
