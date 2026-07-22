const AuthService = require('./service');
const { signToken, setCookieToken, clearCookieToken } = require('../../utils/jwt');

const sendAuthResponse = (res, user, token, statusCode = 200, extra = {}) => {
  setCookieToken(res, token);
  
  const isMobileClient = res.req.headers['x-client-type'] === 'mobile';
  
  const responsePayload = {
    success: true,
    user,
    ...extra,
  };

  // Only include raw JWT in JSON body if explicitly requested by a mobile app
  if (isMobileClient) {
    responsePayload.jwt = token;
  }

  return res.status(statusCode).json(responsePayload);
};

const register = async (req, res, next) => {
  try {
    const user = await AuthService.registerWithEmail(req.body);
    const token = signToken(user.id, user.role);
    sendAuthResponse(res, user, token, 201, { message: 'Registration successful.' });
  } catch (err) { next(err); }
};

const login = async (req, res, next) => {
  try {
    const user = await AuthService.loginWithEmail(req.body);
    const token = signToken(user.id, user.role);
    sendAuthResponse(res, user, token, 200, { message: 'Login successful.' });
  } catch (err) { next(err); }
};

const logout = (req, res) => {
  clearCookieToken(res);
  res.json({ success: true, message: 'Logged out successfully.' });
};

const sendOTP = async (req, res, next) => {
  try {
    const result = await AuthService.sendEmailOTPCode(req.body);
    res.json({ success: true, message: 'OTP verification code sent via email.', session_token: result.sessionToken });
  } catch (err) { next(err); }
};

const verifyOTP = async (req, res, next) => {
  try {
    const { user, isNew } = await AuthService.verifyEmailOTPCode(req.body);
    const token = signToken(user.id, user.role);
    sendAuthResponse(res, user, token, 200, { isNew });
  } catch (err) { next(err); }
};

const forgotPassword = async (req, res, next) => {
  try {
    await AuthService.sendPasswordResetEmail(req.body.email);
    res.json({ success: true, message: 'If that email exists, a reset link was sent.' });
  } catch (err) { next(err); }
};

const resetPassword = async (req, res, next) => {
  try {
    await AuthService.resetPassword(req.body);
    res.json({ success: true, message: 'Password reset successfully.' });
  } catch (err) { next(err); }
};

const googleCallback = async (req, res, next) => {
  try {
    const user = req.user;
    const token = signToken(user.id, user.role);
    setCookieToken(res, token);
    res.redirect(`${process.env.FRONTEND_URL}/auth/success?role=${user.role}`);
  } catch (err) { next(err); }
};

const refreshToken = async (req, res, next) => {
  try {
    const { user, token } = await AuthService.refreshToken(req);
    setCookieToken(res, token);
    res.json({ success: true, jwt: token, user });
  } catch (err) { next(err); }
};

const getMe = (req, res) => {
  res.json({ success: true, user: req.user });
};

module.exports = { register, login, logout, sendOTP, verifyOTP, forgotPassword, resetPassword, googleCallback, refreshToken, getMe };
