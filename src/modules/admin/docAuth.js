const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { prisma } = require('../../config/db');
const { verifyToken, signToken, setCookieToken, COOKIE_NAME } = require('../../utils/jwt');

const renderAdminLoginForm = (req, res, targetDoc, errorMessage = '') => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Main Admin Verification Required</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #151c2c;
      --border: #232d42;
      --text: #e2e8f0;
      --muted: #94a3b8;
      --accent: #f59e0b;
      --red: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 40px;
      width: 100%;
      max-width: 440px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
      text-align: center;
    }
    .lock-icon {
      width: 60px;
      height: 60px;
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 1.8rem;
    }
    h1 {
      font-size: 1.35rem;
      color: #fff;
      margin-bottom: 8px;
    }
    p.subtitle {
      font-size: 0.85rem;
      color: var(--muted);
      margin-bottom: 24px;
      line-height: 1.5;
    }
    .alert {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: var(--red);
      padding: 12px;
      border-radius: 8px;
      font-size: 0.85rem;
      margin-bottom: 20px;
      text-align: left;
    }
    .form-group {
      text-align: left;
      margin-bottom: 18px;
    }
    label {
      display: block;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    input {
      width: 100%;
      background: #0f1422;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 14px;
      color: #fff;
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus {
      border-color: var(--accent);
    }
    .btn {
      width: 100%;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #000;
      border: none;
      padding: 14px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.95rem;
      cursor: pointer;
      margin-top: 10px;
      transition: opacity 0.2s;
    }
    .btn:hover {
      opacity: 0.9;
    }
    .footer-note {
      font-size: 0.75rem;
      color: var(--muted);
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="lock-icon">🔒</div>
    <h1>Main Admin Verification</h1>
    <p class="subtitle">Access to Ethred Technical Documentation is restricted exclusively to <strong>Main System Administrators</strong>.</p>
    
    ${errorMessage ? `<div class="alert">⚠️ ${errorMessage}</div>` : ''}

    <form action="/doc-auth" method="POST">
      <input type="hidden" name="targetDoc" value="${targetDoc}">
      
      <div class="form-group">
        <label for="email">Admin Email</label>
        <input type="email" id="email" name="email" required placeholder="admin@ethred.com">
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required placeholder="••••••••">
      </div>

      <button type="submit" class="btn">Verify & Access Document</button>
    </form>

    <div class="footer-note">
      Agents, Brokers, Sellers & Buyers are not authorized.
    </div>
  </div>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
};

const handleProtectedDoc = (docFilename) => {
  return async (req, res) => {
    const token = req.cookies[COOKIE_NAME] || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

    if (token) {
      try {
        const decoded = verifyToken(token);
        // Verify user exists and role is ADMIN
        const user = await prisma.user.findUnique({
          where: { id: decoded.sub },
          select: { role: true },
        });

        if (user && user.role === 'ADMIN') {
          const filePath = path.join(process.cwd(), 'src', 'views', 'docs', docFilename);
          if (fs.existsSync(filePath)) {
            return res.sendFile(filePath);
          }
        } else {
          return renderAdminLoginForm(req, res, docFilename, 'Access Denied: Your account role is not Main System Admin (role: ADMIN). Agents and Brokers are unauthorized.');
        }
      } catch (err) {
        // Token invalid or expired
      }
    }

    return renderAdminLoginForm(req, res, docFilename);
  };
};

const handleDocAuthSubmit = async (req, res) => {
  const { email, password, targetDoc } = req.body;
  const docName = targetDoc || 'ETHRED_MANUAL.html';

  if (!email || !password) {
    return renderAdminLoginForm(req, res, docName, 'Please provide both admin email and password.');
  }

  try {
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return renderAdminLoginForm(req, res, docName, 'Invalid email or password.');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return renderAdminLoginForm(req, res, docName, 'Invalid email or password.');
    }

    // Check if Main Admin
    if (user.role !== 'ADMIN') {
      return renderAdminLoginForm(req, res, docName, `Access Denied: Role "${user.role}" is not authorized. Only Main System Admins (ADMIN) can view documentation.`);
    }

    // Issue JWT cookie and redirect to the requested document
    const token = signToken(user.id, user.role);
    setCookieToken(res, token);
    
    return res.redirect(`/${docName}`);
  } catch (err) {
    return renderAdminLoginForm(req, res, docName, 'An unexpected authentication error occurred.');
  }
};

module.exports = { handleProtectedDoc, handleDocAuthSubmit };
