const { prisma } = require('../../config/db');
const { getRedisClient } = require('../../config/redis');

const getHealthStatus = async () => {
  const startTime = Date.now();
  
  // DB Check
  let dbStatus = 'healthy';
  let dbLatency = 0;
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - dbStart;
  } catch (err) {
    dbStatus = 'degraded';
  }

  // Redis Check
  let redisStatus = 'healthy';
  let redisLatency = 0;
  try {
    const redisStart = Date.now();
    const redis = getRedisClient();
    await redis.ping();
    redisLatency = Date.now() - redisStart;
  } catch (err) {
    redisStatus = 'degraded';
  }

  const uptimeSeconds = Math.floor(process.uptime());
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;
  const uptimeString = `${hours}h ${minutes}m ${seconds}s`;

  const mem = process.memoryUsage();

  return {
    status: dbStatus === 'healthy' && redisStatus === 'healthy' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: require('../../../package.json').version || '1.0.0',
    uptime: uptimeString,
    uptimeSeconds,
    responseTimeMs: Date.now() - startTime,
    services: {
      database: {
        type: 'PostgreSQL + PostGIS',
        status: dbStatus,
        latencyMs: dbLatency,
      },
      redis: {
        type: 'Redis Cache & PubSub',
        status: redisStatus,
        latencyMs: redisLatency,
      },
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        heapUsedMB: (mem.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMB: (mem.heapTotal / 1024 / 1024).toFixed(2),
        rssMB: (mem.rss / 1024 / 1024).toFixed(2),
      },
    },
  };
};

const renderHealthUI = (data) => {
  const isHealthy = data.status === 'ok';
  const statusColor = isHealthy ? '#10b981' : '#f59e0b';
  const statusBadge = isHealthy ? 'OPERATIONAL' : 'DEGRADED';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ethred API — System Health & Status</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #151c2c;
      --border: #232d42;
      --text: #e2e8f0;
      --muted: #94a3b8;
      --accent: #f59e0b;
      --green: #10b981;
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
      padding: 24px;
    }
    .container {
      width: 100%;
      max-width: 750px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-icon {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      color: #000;
      font-size: 1.2rem;
    }
    .title-group h1 { font-size: 1.4rem; color: #fff; }
    .title-group p { font-size: 0.85rem; color: var(--muted); }
    
    .overall-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: var(--green);
      padding: 8px 16px;
      border-radius: 30px;
      font-weight: 700;
      font-size: 0.85rem;
      letter-spacing: 0.5px;
    }
    .pulse-dot {
      width: 10px;
      height: 10px;
      background: var(--green);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--green);
      animation: pulse 1.8s infinite;
    }
    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.2); }
      100% { opacity: 1; transform: scale(1); }
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .card-title {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .card-value {
      font-size: 1.25rem;
      font-weight: 700;
      color: #fff;
    }
    .card-sub {
      font-size: 0.78rem;
      color: var(--muted);
      margin-top: 4px;
    }
    
    .status-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 8px;
    }
    .status-tag {
      font-size: 0.75rem;
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.15);
      color: var(--green);
    }

    .footer-actions {
      display: flex;
      gap: 12px;
      margin-top: 20px;
    }
    .btn {
      flex: 1;
      text-align: center;
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 12px;
      border-radius: 8px;
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 600;
      transition: all 0.2s;
    }
    .btn:hover {
      border-color: var(--accent);
      color: var(--accent);
    }
    .btn-primary {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #000;
      border: none;
    }
    .btn-primary:hover {
      opacity: 0.9;
      color: #000;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">
        <div class="logo-icon">E</div>
        <div class="title-group">
          <h1>Ethred Ecosystem API</h1>
          <p>Real-time Infrastructure Status Monitor</p>
        </div>
      </div>
      <div class="overall-badge" style="color: ${statusColor}; border-color: ${statusColor}44; background: ${statusColor}11;">
        <div class="pulse-dot" style="background: ${statusColor}; box-shadow: 0 0 10px ${statusColor};"></div>
        ${statusBadge}
      </div>
    </div>

    <div class="grid">
      <!-- Database -->
      <div class="card">
        <div class="card-title">Database System</div>
        <div class="card-value">${data.services.database.type}</div>
        <div class="status-row">
          <span class="status-tag">🟢 ${data.services.database.status.toUpperCase()}</span>
          <span style="font-size: 0.8rem; color: var(--muted);">${data.services.database.latencyMs} ms</span>
        </div>
      </div>

      <!-- Redis -->
      <div class="card">
        <div class="card-title">Cache & Memory Store</div>
        <div class="card-value">${data.services.redis.type}</div>
        <div class="status-row">
          <span class="status-tag">🟢 ${data.services.redis.status.toUpperCase()}</span>
          <span style="font-size: 0.8rem; color: var(--muted);">${data.services.redis.latencyMs} ms</span>
        </div>
      </div>

      <!-- Server Uptime -->
      <div class="card">
        <div class="card-title">Server Uptime</div>
        <div class="card-value">${data.uptime}</div>
        <div class="card-sub">Env: <strong>${data.environment}</strong> (v${data.version})</div>
      </div>

      <!-- System Resources -->
      <div class="card">
        <div class="card-title">Memory & Runtime</div>
        <div class="card-value">${data.system.memory.heapUsedMB} MB / ${data.system.memory.heapTotalMB} MB</div>
        <div class="card-sub">Node ${data.system.nodeVersion} (${data.system.platform})</div>
      </div>
    </div>

    <div class="footer-actions">
      <a class="btn btn-primary" href="/health">🔄 Refresh Status</a>
      <a class="btn" href="/health?format=json" target="_blank">⚡ Raw JSON</a>
      <a class="btn" href="/" target="_blank">🏠 Home</a>
    </div>
  </div>
</body>
</html>`;
};

const handleHealthCheck = async (req, res) => {
  const healthData = await getHealthStatus();

  // If query specifies format=json OR request explicitly accepts JSON (and not browser HTML)
  const prefersJson = req.query.format === 'json' || (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html'));

  if (prefersJson) {
    return res.status(healthData.status === 'ok' ? 200 : 503).json(healthData);
  }

  // Otherwise render rich HTML UI
  res.setHeader('Content-Type', 'text/html');
  return res.status(healthData.status === 'ok' ? 200 : 503).send(renderHealthUI(healthData));
};

module.exports = { handleHealthCheck };
