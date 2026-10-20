const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('./src/crypto');
const db = require('./src/database');

const app = express();
const PORT = process.env.LICENSE_SERVER_PORT || 19685;

const allowedLicenseOrigins = [
  /^https:\/\/xdm\.zihan\.uk$/,
  /^https:\/\/.*\.zihan\.uk$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^http:\/\/localhost(:\d+)?$/
];

// Middleware: Strict CORS for licensing server
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedLicenseOrigins.some(pattern => pattern.test(origin));
    if (isAllowed) return callback(null, true);
    return callback(new Error('Cross-Origin Access Denied to License Server.'));
  },
  credentials: true
}));
app.use(express.json({ limit: '100kb' }));

// Request Logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api')) {
      console.log(`[API] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Secure Client IP extraction (prevents arbitrary X-Forwarded-For header spoofing)
function getClientIp(req) {
  if (process.env.TRUST_PROXY === 'true' && req.headers['x-forwarded-for']) {
    return req.headers['x-forwarded-for'].split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

// Simple In-Memory Sliding-Window Rate Limiter
const rateLimitBuckets = new Map();
function rateLimit(limit = 30, windowMs = 60 * 1000) {
  return (req, res, next) => {
    const ip = getClientIp(req);
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    let record = rateLimitBuckets.get(key);

    if (!record || now - record.start > windowMs) {
      record = { count: 1, start: now };
      rateLimitBuckets.set(key, record);
      return next();
    }

    record.count++;
    if (record.count > limit) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please wait a minute before trying again.'
      });
    }
    next();
  };
}

// Clean up stale rate-limiting buckets every 10 mins
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitBuckets.entries()) {
    if (now - record.start > 60000) rateLimitBuckets.delete(key);
  }
}, 10 * 60 * 1000);
if (cleanupInterval && cleanupInterval.unref) {
  cleanupInterval.unref();
}

// In-Memory Admin Sessions
const adminSessions = new Map(); // token -> { adminId, username, role, expiresAt }

function createAdminSession(admin) {
  const token = 'xdm_adm_' + crypto.generateId('token');
  const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
  adminSessions.set(token, { adminId: admin.id, username: admin.username, role: admin.role, expiresAt });
  return { token, expiresAt };
}

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Admin authentication token required' });
  }

  const token = authHeader.substring(7).trim();
  const session = adminSessions.get(token);

  if (!session || Date.now() > session.expiresAt) {
    if (session) adminSessions.delete(token);
    return res.status(401).json({ success: false, error: 'Session expired or invalid. Please log in again.' });
  }

  req.admin = session;
  next();
}

// ==========================================
// 1. PUBLIC CLIENT LICENSING ENDPOINTS
// ==========================================

// Health Check
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'XDM Turbo Central Licensing System',
    version: '2.0.0',
    time: Date.now(),
    publicKey: crypto.getPublicKey()
  });
});

// Activate License on Device
app.post('/api/v1/licenses/activate', rateLimit(60, 60000), (req, res) => {
  try {
    const { licenseKey, deviceId, deviceName, clientVersion, osPlatform, userEmail } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    if (!licenseKey || typeof licenseKey !== 'string') {
      return res.status(400).json({ success: false, error: 'License key is required' });
    }
    if (!deviceId || typeof deviceId !== 'string') {
      return res.status(400).json({ success: false, error: 'Device identifier is required' });
    }

    // 1. Check if Device is currently Banned (Anti-Brute Force Protection)
    const banInfo = db.isDeviceBanned(deviceId);
    if (banInfo) {
      db.logEvent('activation_blocked_banned_device', null, deviceId, ip, { reason: banInfo.ban_reason });
      return res.status(403).json({
        success: false,
        isBanned: true,
        error: `⛔ DEVICE BANNED: This device (${deviceId}) is locked because invalid keys were attempted 10 or more times. Only the administrator can unban this device.`
      });
    }

    const license = db.getLicenseByKey(licenseKey);
    if (!license) {
      db.logEvent('activation_failed', null, deviceId, ip, { reason: 'key_not_found', key: licenseKey });
      const banCheck = db.recordFailedAttempt(deviceId, ip, licenseKey, 10);
      if (banCheck.banned) {
        return res.status(403).json({
          success: false,
          isBanned: true,
          error: `⛔ DEVICE BANNED: You have entered invalid license keys 10 times. This device (${deviceId}) is now permanently locked. Only the administrator can unban this device.`
        });
      }
      return res.status(404).json({
        success: false,
        remainingAttempts: banCheck.remainingAttempts,
        error: `Invalid license key or key does not exist. (Warning: ${banCheck.remainingAttempts} attempt(s) remaining before this device is permanently locked)`
      });
    }

    // Clear failed attempts counter upon authentic key match
    db.clearFailedAttempts(deviceId);

    // Check License Status
    if (license.status === 'revoked') {
      db.logEvent('activation_failed', license.id, deviceId, ip, { reason: 'license_revoked' });
      return res.status(403).json({ success: false, error: 'This license has been permanently revoked by the publisher.' });
    }
    if (license.status === 'suspended') {
      db.logEvent('activation_failed', license.id, deviceId, ip, { reason: 'license_suspended' });
      return res.status(403).json({ success: false, error: 'This license is temporarily suspended. Please contact support.' });
    }
    if (license.expires_at && Date.now() > license.expires_at) {
      db.logEvent('activation_failed', license.id, deviceId, ip, { reason: 'license_expired' });
      return res.status(403).json({ success: false, error: 'This license expired on ' + new Date(license.expires_at).toLocaleDateString() });
    }

    // Check Device Limit
    const existingDevice = db.getDevice(deviceId, license.id);
    const activeCount = db.getActiveDeviceCount(license.id);

    if (!existingDevice || existingDevice.is_active === 0) {
      if (activeCount >= license.max_devices) {
        db.logEvent('activation_failed', license.id, deviceId, ip, { 
          reason: 'device_limit_exceeded',
          activeDevices: activeCount,
          maxDevices: license.max_devices 
        });
        return res.status(403).json({
          success: false,
          error: `Activation limit reached (${activeCount}/${license.max_devices} devices). Please deactivate this key on your other device first or upgrade your plan.`
        });
      }
    }

    // Link User if email is supplied with consent
    let userId = license.user_id;
    if (userEmail && !userId) {
      const user = db.getOrCreateUser(userEmail, true);
      if (user) userId = user.id;
    }

    // Register / Update Device Record
    const device = db.registerOrUpdateDevice(deviceId, license.id, {
      userId,
      deviceName: deviceName || 'Windows PC',
      osPlatform: osPlatform || 'Windows',
      clientVersion: clientVersion || '1.0.9',
      ipAddress: ip
    });

    // 7-day offline grace period (renewed on every online heartbeat)
    const graceDays = 7;
    const graceUntil = Date.now() + (graceDays * 24 * 60 * 60 * 1000);

    // Cryptographic Ed25519 Payload
    const tokenPayload = {
      licenseId: license.id,
      licenseKey: license.key,
      edition: license.edition,
      userId: userId || null,
      deviceId: deviceId,
      issuedAt: Date.now(),
      expiresAt: license.expires_at,
      graceUntil: graceUntil,
      features: {
        maxStreams: license.edition === 'admin' ? 64 : 32,
        videoGrabber4k: true,
        audioMerge: true
      }
    };

    const token = crypto.signLicensePayload(tokenPayload);

    db.logEvent('activation_success', license.id, deviceId, ip, {
      deviceName: device.device_name,
      edition: license.edition
    });

    res.json({
      success: true,
      message: 'License activated successfully on this device!',
      token,
      graceUntil,
      graceDays,
      license: {
        id: license.id,
        key: license.key,
        edition: license.edition,
        customerName: license.customer_name || 'Valued Customer',
        expiresAt: license.expires_at,
        maxDevices: license.max_devices,
        status: license.status
      }
    });
  } catch (err) {
    console.error('[Activate Error]', err);
    res.status(500).json({ success: false, error: 'Internal server error during activation' });
  }
});

// Periodic Online Heartbeat / Renewal of Grace Period
app.post('/api/v1/licenses/heartbeat', rateLimit(120, 60000), (req, res) => {
  try {
    const { licenseKey, deviceId, token } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    if (!licenseKey || !deviceId) {
      return res.status(400).json({ valid: false, error: 'licenseKey and deviceId are required' });
    }

    const banInfo = db.isDeviceBanned(deviceId);
    if (banInfo) {
      return res.status(403).json({
        valid: false,
        isBanned: true,
        error: 'This device has been banned due to security violations. Contact administrator.'
      });
    }

    const license = db.getLicenseByKey(licenseKey);
    if (!license) {
      return res.status(404).json({ valid: false, error: 'License not found' });
    }

    // Check status
    if (license.status === 'revoked' || license.status === 'suspended') {
      return res.status(403).json({
        valid: false,
        status: license.status,
        error: `License has been ${license.status} by publisher.`
      });
    }

    if (license.expires_at && Date.now() > license.expires_at) {
      return res.status(403).json({
        valid: false,
        status: 'expired',
        error: 'License has expired.'
      });
    }

    const device = db.getDevice(deviceId, license.id);
    if (!device || device.is_active === 0) {
      return res.status(403).json({
        valid: false,
        error: 'Device binding has been deactivated.'
      });
    }

    // Update heartbeat timestamp
    db.updateDeviceHeartbeat(deviceId, license.id, ip);

    // Refresh 7-day offline grace period
    const graceDays = 7;
    const graceUntil = Date.now() + (graceDays * 24 * 60 * 60 * 1000);

    const tokenPayload = {
      licenseId: license.id,
      licenseKey: license.key,
      edition: license.edition,
      userId: license.user_id,
      deviceId: deviceId,
      issuedAt: Date.now(),
      expiresAt: license.expires_at,
      graceUntil: graceUntil,
      features: {
        maxStreams: license.edition === 'admin' ? 64 : 32,
        videoGrabber4k: true,
        audioMerge: true
      }
    };

    const refreshedToken = crypto.signLicensePayload(tokenPayload);

    res.json({
      valid: true,
      status: 'active',
      token: refreshedToken,
      graceUntil,
      graceDays
    });
  } catch (err) {
    console.error('[Heartbeat Error]', err);
    res.status(500).json({ valid: false, error: 'Heartbeat validation error' });
  }
});

// Deactivate Device
app.post('/api/v1/licenses/deactivate', (req, res) => {
  try {
    const { licenseKey, deviceId } = req.body;
    if (!licenseKey || !deviceId) {
      return res.status(400).json({ success: false, error: 'licenseKey and deviceId required' });
    }

    const license = db.getLicenseByKey(licenseKey);
    if (!license) return res.status(404).json({ success: false, error: 'License not found' });

    db.deactivateDevice(deviceId, license.id, 'client_requested');
    res.json({ success: true, message: 'Device unbound successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Report Tamper Attempt (Auto-bans device immediately on central server)
app.post('/api/v1/devices/report-tamper', rateLimit(20, 60000), (req, res) => {
  try {
    const { deviceId, reason, details } = req.body;
    const ip = getClientIp(req);
    if (!deviceId || typeof deviceId !== 'string') {
      return res.status(400).json({ success: false, error: 'deviceId is required' });
    }
    const banReason = reason || 'Client tamper attempt detected';
    db.banDeviceManually(deviceId, banReason, 'anti-tamper-sentinel');
    db.logEvent('client_tamper_detected', null, deviceId, ip, { reason: banReason, details: details || null });
    console.warn(`[Anti-Tamper] Device ${deviceId} permanently banned on server: ${banReason}`);
    res.json({ success: true, banned: true, message: 'Device banned' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. ADMIN AUTHENTICATION & MANAGEMENT APIs
// ==========================================

// Admin Login
app.post('/api/v1/admin/login', rateLimit(10, 60000), (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    const admin = db.getAdminByUsername(username);
    if (!admin || !crypto.verifyPassword(password, admin.password_hash)) {
      db.logEvent('admin_login_failed', null, null, req.ip, { username });
      return res.status(401).json({ success: false, error: 'Invalid admin username or password' });
    }

    const session = createAdminSession(admin);
    db.logEvent('admin_login_success', null, null, req.ip, { username: admin.username });

    res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      admin: { id: admin.id, username: admin.username, role: admin.role }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Logout
app.post('/api/v1/admin/logout', requireAdminAuth, (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.substring(7).trim();
    adminSessions.delete(token);
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

// Admin System Overview Metrics
app.get('/api/v1/admin/overview', requireAdminAuth, (req, res) => {
  const metrics = db.getOverviewMetrics();
  res.json({ success: true, metrics });
});

// Admin Query Licenses
app.get('/api/v1/admin/licenses', requireAdminAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const status = req.query.status || null;
  const edition = req.query.edition || null;
  const search = req.query.search || null;

  const licenses = db.getAllLicenses({ limit, offset, status, edition, search });
  const total = db.getLicensesCount({ status, edition, search });

  res.json({ success: true, licenses, total, limit, offset });
});

// Admin Create New License(s)
app.post('/api/v1/admin/licenses', requireAdminAuth, (req, res) => {
  try {
    const { edition, maxDevices, customerName, customerEmail, notes, expiresAt, count } = req.body;
    const totalCount = Math.min(Math.max(parseInt(count, 10) || 1, 1), 50);

    const created = [];
    for (let i = 0; i < totalCount; i++) {
      const lic = db.createLicense({
        edition: edition || 'pro',
        maxDevices: parseInt(maxDevices, 10) || 1,
        customerName: customerName || null,
        customerEmail: customerEmail || null,
        notes: notes || null,
        expiresAt: expiresAt ? parseInt(expiresAt, 10) : null
      });
      created.push(lic);
    }

    res.json({ success: true, count: created.length, licenses: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin License Detail
app.get('/api/v1/admin/licenses/:id', requireAdminAuth, (req, res) => {
  const license = db.getLicenseById(req.params.id);
  if (!license) return res.status(404).json({ success: false, error: 'License not found' });
  const devices = db.getDevicesForLicense(license.id);
  res.json({ success: true, license, devices });
});

// Admin Revoke License
app.post('/api/v1/admin/licenses/:id/revoke', requireAdminAuth, (req, res) => {
  const { reason } = req.body || {};
  const updated = db.updateLicenseStatus(req.params.id, 'revoked', reason || 'Revoked by admin');
  res.json({ success: true, license: updated });
});

// Admin Suspend License
app.post('/api/v1/admin/licenses/:id/suspend', requireAdminAuth, (req, res) => {
  const { reason } = req.body || {};
  const updated = db.updateLicenseStatus(req.params.id, 'suspended', reason || 'Suspended by admin');
  res.json({ success: true, license: updated });
});

// Admin Reactivate License
app.post('/api/v1/admin/licenses/:id/resume', requireAdminAuth, (req, res) => {
  const updated = db.updateLicenseStatus(req.params.id, 'active', 'Reactivated by admin');
  res.json({ success: true, license: updated });
});

// Admin Update Device Limit
app.post('/api/v1/admin/licenses/:id/limit', requireAdminAuth, (req, res) => {
  const { maxDevices } = req.body || {};
  const updated = db.updateLicenseMaxDevices(req.params.id, maxDevices);
  res.json({ success: true, license: updated });
});

// Admin Deactivate Specific Device
app.post('/api/v1/admin/licenses/:id/devices/:deviceId/deactivate', requireAdminAuth, (req, res) => {
  db.deactivateDevice(req.params.deviceId, req.params.id, 'admin_forced');
  res.json({ success: true, message: 'Device unbind completed' });
});

// Admin List All Devices
app.get('/api/v1/admin/devices', requireAdminAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const search = req.query.search || '';
  const devices = db.getAllDevices(limit, offset, search);
  res.json({ success: true, devices });
});

// Admin List Banned Devices
app.get('/api/v1/admin/banned-devices', requireAdminAuth, (req, res) => {
  const banned = db.getAllBannedDevices();
  res.json({ success: true, banned });
});

// Admin Unban Device
app.post('/api/v1/admin/devices/:deviceId/unban', requireAdminAuth, (req, res) => {
  db.unbanDevice(req.params.deviceId, req.admin.username);
  res.json({ success: true, message: `Device ${req.params.deviceId} has been successfully unbanned` });
});

// Admin Manually Ban Device
app.post('/api/v1/admin/devices/:deviceId/ban', requireAdminAuth, (req, res) => {
  const { reason } = req.body || {};
  db.banDeviceManually(req.params.deviceId, reason || 'Manually banned by admin', req.admin.username);
  res.json({ success: true, message: `Device ${req.params.deviceId} has been banned` });
});

// Admin List Users
app.get('/api/v1/admin/users', requireAdminAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const users = db.getAllUsers(limit, offset);
  res.json({ success: true, users });
});

// Admin Audit Logs
app.get('/api/v1/admin/audit-logs', requireAdminAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = parseInt(req.query.offset, 10) || 0;
  const logs = db.getAuditLogs(limit, offset);
  res.json({ success: true, logs });
});

// Serve Static Admin Dashboard
const publicPath = path.join(__dirname, 'public');
app.use('/admin', express.static(publicPath));
app.get(/^\/admin(\/.*)?$/, (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// 404 handler for API
app.all(/^\/api(\/.*)?$/, (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Export app and server start helper
let serverInstance = null;
function startServer(port = PORT) {
  return new Promise((resolve, reject) => {
    serverInstance = app.listen(port, () => {
      console.log(`[XDM License Server] Listening on http://127.0.0.1:${port}`);
      resolve(serverInstance);
    });
    serverInstance.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[XDM License Server] Port ${port} already running.`);
        resolve(null);
      } else {
        reject(err);
      }
    });
  });
}

function stopServer() {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
}

if (require.main === module) {
  startServer(PORT);
}

module.exports = { app, startServer, stopServer };
