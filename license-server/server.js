const express = require('express');
const cors = require('cors');
const path = require('path');
const cryptoCore = require('crypto');
const crypto = require('./src/crypto');
const db = require('./src/database');

const app = express();
const PORT = process.env.LICENSE_SERVER_PORT || 19685;

const allowedLicenseOrigins = [
  /^https:\/\/xdm\.zihan\.xyz$/,
  /^https:\/\/.*\.zihan\.xyz$/,
  /^https:\/\/.*\.vercel\.app$/,
  /^https:\/\/xdm\.zihan\.uk$/,
  /^https:\/\/.*\.zihan\.uk$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^http:\/\/localhost(:\d+)?$/
];

// Middleware: CORS for licensing server & Vercel
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedLicenseOrigins.some(pattern => pattern.test(origin));
    if (isAllowed) return callback(null, true);
    return callback(null, true); // Allow client requests gracefully while logging
  },
  credentials: true
}));
app.use(express.json({ limit: '100kb' }));

// Client IP extraction helper
function getClientIp(req) {
  if (process.env.VERCEL || process.env.TRUST_PROXY === 'true') {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return xff.split(',')[0].trim();
    if (req.headers['x-real-ip']) return req.headers['x-real-ip'];
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

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

// Sliding-Window Rate Limiter
const rateLimitBuckets = new Map();
function rateLimit(limit = 60, windowMs = 60 * 1000) {
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

// Stateless HMAC-Signed Admin Tokens (multi-instance serverless safe)
const ADMIN_SECRET = process.env.ADMIN_JWT_SECRET || process.env.ADMIN_PASSWORD || 'xdm-admin-secret-2026-auth-seal';

function createAdminSession(admin) {
  const payload = {
    adminId: admin.id,
    username: admin.username,
    role: admin.role,
    exp: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = cryptoCore.createHmac('sha256', ADMIN_SECRET).update(payloadB64).digest('base64url');
  const token = `xdm_adm_${payloadB64}.${signature}`;
  return { token, expiresAt: payload.exp };
}

function verifyAdminSession(token) {
  try {
    if (!token || !token.startsWith('xdm_adm_') || !token.includes('.')) return null;
    const raw = token.replace('xdm_adm_', '');
    const [payloadB64, signature] = raw.split('.');
    const expectedSig = cryptoCore.createHmac('sha256', ADMIN_SECRET).update(payloadB64).digest('base64url');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !cryptoCore.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Admin authentication token required' });
  }

  const token = authHeader.substring(7).trim();
  const session = verifyAdminSession(token);

  if (!session) {
    return res.status(401).json({ success: false, error: 'Session expired or invalid. Please log in again.' });
  }

  req.admin = session;
  next();
}

// Ensure database is ready before processing API requests
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api')) {
    try {
      await db.ready();
    } catch (e) {
      console.warn('[Database Middleware]', e.message);
    }
  }
  next();
});

// ==========================================
// 1. PUBLIC CLIENT LICENSING ENDPOINTS
// ==========================================

// Health Check
const handleHealth = (req, res) => {
  res.json({
    status: 'ok',
    service: 'XDM Turbo Central Licensing System',
    version: '2.0.0',
    time: Date.now(),
    database: db.isTurso ? 'turso_cloud' : 'sqlite_file',
    publicKey: crypto.getPublicKey()
  });
};
app.get('/api/v1/health', handleHealth);
app.get('/api/health', handleHealth);

// Activate License on Device
const handleActivate = async (req, res) => {
  try {
    const { licenseKey, deviceId, deviceName, clientVersion, osPlatform, userEmail } = req.body;
    const ip = getClientIp(req);

    if (!licenseKey || typeof licenseKey !== 'string') {
      return res.status(400).json({ success: false, error: 'License key is required' });
    }
    if (!deviceId || typeof deviceId !== 'string') {
      return res.status(400).json({ success: false, error: 'Device identifier is required' });
    }

    // 1. Check if Device is currently Banned (Anti-Brute Force Protection)
    const banInfo = await db.isDeviceBanned(deviceId);
    if (banInfo) {
      await db.logEvent('activation_blocked_banned_device', null, deviceId, ip, { reason: banInfo.ban_reason });
      return res.status(403).json({
        success: false,
        isBanned: true,
        error: `⛔ DEVICE BANNED: This device (${deviceId}) is locked because invalid keys were attempted 10 or more times. Only the administrator can unban this device.`
      });
    }

    const license = await db.getLicenseByKey(licenseKey);
    if (!license) {
      await db.logEvent('activation_failed', null, deviceId, ip, { reason: 'key_not_found', key: licenseKey });
      const banCheck = await db.recordFailedAttempt(deviceId, ip, licenseKey, 10);
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
    await db.clearFailedAttempts(deviceId);

    // Check License Status
    if (license.status === 'revoked') {
      await db.logEvent('activation_failed', license.id, deviceId, ip, { reason: 'license_revoked' });
      return res.status(403).json({ success: false, error: 'This license has been permanently revoked by the publisher.' });
    }
    if (license.status === 'suspended') {
      await db.logEvent('activation_failed', license.id, deviceId, ip, { reason: 'license_suspended' });
      return res.status(403).json({ success: false, error: 'This license is temporarily suspended. Please contact support.' });
    }
    if (license.expires_at && Date.now() > license.expires_at) {
      await db.logEvent('activation_failed', license.id, deviceId, ip, { reason: 'license_expired' });
      return res.status(403).json({ success: false, error: 'This license expired on ' + new Date(license.expires_at).toLocaleDateString() });
    }

    // Link User if email is supplied with consent
    let userId = license.user_id;
    if (userEmail && !userId) {
      const user = await db.getOrCreateUser(userEmail, true);
      if (user) userId = user.id;
    }

    // Register / Update Device Record (Atomic Transaction)
    let device;
    try {
      device = await db.registerOrUpdateDevice(deviceId, license.id, {
        userId,
        deviceName: deviceName || 'Windows PC',
        osPlatform: osPlatform || 'Windows',
        clientVersion: clientVersion || '1.0.9',
        ipAddress: ip
      });
    } catch (seatErr) {
      if (seatErr.code === 'SEAT_LIMIT_EXCEEDED') {
        await db.logEvent('activation_failed', license.id, deviceId, ip, {
          reason: 'device_limit_exceeded',
          activeDevices: seatErr.activeCount,
          maxDevices: seatErr.maxDevices
        });
        return res.status(403).json({
          success: false,
          error: seatErr.message
        });
      }
      throw seatErr;
    }

    // 7-day offline grace period (renewed on every online heartbeat)
    const graceDays = 7;
    const graceUntil = Date.now() + (graceDays * 24 * 60 * 60 * 1000);

    // Cryptographic Ed25519 Payload (Commercial Model: PRO Edition receives 64 streams)
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
        maxStreams: (license.edition === 'admin' || license.edition === 'pro') ? 64 : 4,
        maxConcurrentTasks: (license.edition === 'admin' || license.edition === 'pro') ? 10 : 1,
        videoGrabber4k: true,
        workStealing: true,
        audioMerge: true
      }
    };

    const token = crypto.signLicensePayload(tokenPayload);

    await db.logEvent('activation_success', license.id, deviceId, ip, {
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
        customerEmail: license.customer_email || '',
        maxDevices: license.max_devices,
        expiresAt: license.expires_at
      }
    });
  } catch (err) {
    console.error('[Activation Error]', err);
    res.status(500).json({ success: false, error: 'Internal activation failure: ' + err.message });
  }
};
app.post('/api/v1/licenses/activate', rateLimit(60, 60000), handleActivate);
app.post('/api/license/activate', rateLimit(60, 60000), handleActivate);

// Periodic Online Heartbeat / Renewal of Grace Period
const handleHeartbeat = async (req, res) => {
  try {
    const { licenseKey, deviceId, token } = req.body;
    const ip = getClientIp(req);

    if (!licenseKey || !deviceId) {
      return res.status(400).json({ valid: false, error: 'licenseKey and deviceId are required' });
    }

    const banInfo = await db.isDeviceBanned(deviceId);
    if (banInfo) {
      return res.status(403).json({
        valid: false,
        isBanned: true,
        error: 'This device has been banned due to security violations. Contact administrator.'
      });
    }

    const license = await db.getLicenseByKey(licenseKey);
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

    const device = await db.getDevice(deviceId, license.id);
    if (!device || Number(device.is_active) === 0) {
      return res.status(403).json({
        valid: false,
        error: 'Device binding has been deactivated.'
      });
    }

    // Update heartbeat timestamp
    await db.updateDeviceHeartbeat(deviceId, license.id, ip);

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
        maxStreams: (license.edition === 'admin' || license.edition === 'pro') ? 64 : 4,
        maxConcurrentTasks: (license.edition === 'admin' || license.edition === 'pro') ? 10 : 1,
        videoGrabber4k: true,
        workStealing: true,
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
};
app.post('/api/v1/licenses/heartbeat', rateLimit(120, 60000), handleHeartbeat);
app.post('/api/license/heartbeat', rateLimit(120, 60000), handleHeartbeat);
app.post('/api/license/validate', rateLimit(120, 60000), handleHeartbeat);

// Deactivate Device
const handleDeactivate = async (req, res) => {
  try {
    const { licenseKey, deviceId } = req.body;
    if (!licenseKey || !deviceId) {
      return res.status(400).json({ success: false, error: 'licenseKey and deviceId required' });
    }

    const license = await db.getLicenseByKey(licenseKey);
    if (!license) return res.status(404).json({ success: false, error: 'License not found' });

    await db.deactivateDevice(deviceId, license.id, 'client_requested');
    res.json({ success: true, message: 'Device unbound successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
app.post('/api/v1/licenses/deactivate', handleDeactivate);
app.post('/api/license/deactivate', handleDeactivate);

// Report Tamper Attempt (Auto-bans device immediately on central server)
app.post('/api/v1/devices/report-tamper', rateLimit(20, 60000), async (req, res) => {
  try {
    const { deviceId, reason, details } = req.body;
    const ip = getClientIp(req);
    if (!deviceId || typeof deviceId !== 'string') {
      return res.status(400).json({ success: false, error: 'deviceId is required' });
    }
    const banReason = reason || 'Client tamper attempt detected';
    await db.banDeviceManually(deviceId, banReason, 'anti-tamper-sentinel');
    await db.logEvent('client_tamper_detected', null, deviceId, ip, { reason: banReason, details: details || null });
    console.warn(`[Anti-Tamper] Device ${deviceId} permanently banned on server: ${banReason}`);
    res.json({ success: true, banned: true, message: 'Device banned' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. ADMIN GOVERNANCE ENDPOINTS
// ==========================================

// Admin Login
const handleAdminLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    const admin = await db.getAdminByUsername(username);
    if (!admin || !crypto.verifyPassword(password, admin.password_hash)) {
      await db.logEvent('admin_login_failed', null, null, getClientIp(req), { username });
      return res.status(401).json({ success: false, error: 'Invalid admin username or password' });
    }

    const session = createAdminSession(admin);
    await db.logEvent('admin_login_success', null, null, getClientIp(req), { username: admin.username });

    res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      admin: { id: admin.id, username: admin.username, role: admin.role }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
app.post('/api/v1/admin/login', rateLimit(10, 60000), handleAdminLogin);
app.post('/api/admin/login', rateLimit(10, 60000), handleAdminLogin);

// Admin Logout
const handleAdminLogout = (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
};
app.post('/api/v1/admin/logout', requireAdminAuth, handleAdminLogout);
app.post('/api/admin/logout', requireAdminAuth, handleAdminLogout);

// Admin Change Password
const handleAdminChangePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current password and new password are required' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters long' });
    }

    const username = req.admin.username;
    const admin = await db.getAdminByUsername(username);
    if (!admin || !crypto.verifyPassword(currentPassword, admin.password_hash)) {
      await db.logEvent('admin_password_change_failed', null, null, getClientIp(req), { username, reason: 'invalid_current_password' });
      return res.status(400).json({ success: false, error: 'Incorrect current password' });
    }

    const newPasswordHash = crypto.hashPassword(newPassword);
    await db.updateAdminPassword(username, newPasswordHash);
    await db.logEvent('admin_password_changed', null, null, getClientIp(req), { username });

    const newSession = createAdminSession({ ...admin, password_hash: newPasswordHash });

    res.json({
      success: true,
      message: 'Admin password changed successfully!',
      token: newSession.token,
      expiresAt: newSession.expiresAt
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
app.post('/api/v1/admin/change-password', requireAdminAuth, handleAdminChangePassword);
app.post('/api/admin/change-password', requireAdminAuth, handleAdminChangePassword);

// Admin System Overview Metrics
const handleAdminOverview = async (req, res) => {
  const metrics = await db.getOverviewMetrics();
  res.json({ success: true, metrics });
};
app.get('/api/v1/admin/overview', requireAdminAuth, handleAdminOverview);
app.get('/api/admin/overview', requireAdminAuth, handleAdminOverview);

// Admin Query Licenses
const handleAdminGetLicenses = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const status = req.query.status || null;
  const edition = req.query.edition || null;
  const search = req.query.search || null;

  const licenses = await db.getAllLicenses({ limit, offset, status, edition, search });
  const total = await db.getLicensesCount({ status, edition, search });

  res.json({ success: true, licenses, total, limit, offset });
};
app.get('/api/v1/admin/licenses', requireAdminAuth, handleAdminGetLicenses);
app.get('/api/admin/licenses', requireAdminAuth, handleAdminGetLicenses);

// Admin Create New License(s)
const handleAdminCreateLicenses = async (req, res) => {
  try {
    const { edition, maxDevices, customerName, customerEmail, notes, expiresAt, count } = req.body;
    const totalCount = Math.min(Math.max(parseInt(count, 10) || 1, 1), 50);

    const created = [];
    for (let i = 0; i < totalCount; i++) {
      const lic = await db.createLicense({
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
};
app.post('/api/v1/admin/licenses', requireAdminAuth, handleAdminCreateLicenses);
app.post('/api/admin/licenses', requireAdminAuth, handleAdminCreateLicenses);

// Admin Revoke License (alias with body { id, reason })
app.post('/api/admin/licenses/revoke', requireAdminAuth, async (req, res) => {
  try {
    const { id, key, reason } = req.body || {};
    let targetId = id;
    if (!targetId && key) {
      const lic = await db.getLicenseByKey(key);
      if (lic) targetId = lic.id;
    }
    if (!targetId) {
      return res.status(400).json({ success: false, error: 'License id or key is required' });
    }
    const updated = await db.updateLicenseStatus(targetId, 'revoked', reason || 'Revoked by admin');
    res.json({ success: true, license: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin License Detail
app.get('/api/v1/admin/licenses/:id', requireAdminAuth, async (req, res) => {
  const license = await db.getLicenseById(req.params.id);
  if (!license) return res.status(404).json({ success: false, error: 'License not found' });
  const devices = await db.getDevicesForLicense(license.id);
  res.json({ success: true, license, devices });
});

// Admin Revoke License by ID param
app.post('/api/v1/admin/licenses/:id/revoke', requireAdminAuth, async (req, res) => {
  const { reason } = req.body || {};
  const updated = await db.updateLicenseStatus(req.params.id, 'revoked', reason || 'Revoked by admin');
  res.json({ success: true, license: updated });
});

// Admin Suspend License
app.post('/api/v1/admin/licenses/:id/suspend', requireAdminAuth, async (req, res) => {
  const { reason } = req.body || {};
  const updated = await db.updateLicenseStatus(req.params.id, 'suspended', reason || 'Suspended by admin');
  res.json({ success: true, license: updated });
});

// Admin Reactivate License
app.post('/api/v1/admin/licenses/:id/resume', requireAdminAuth, async (req, res) => {
  const updated = await db.updateLicenseStatus(req.params.id, 'active', 'Reactivated by admin');
  res.json({ success: true, license: updated });
});

// Admin Update Device Limit
app.post('/api/v1/admin/licenses/:id/limit', requireAdminAuth, async (req, res) => {
  const { maxDevices } = req.body || {};
  const updated = await db.updateLicenseMaxDevices(req.params.id, maxDevices);
  res.json({ success: true, license: updated });
});

// Admin Deactivate Specific Device
app.post('/api/v1/admin/licenses/:id/devices/:deviceId/deactivate', requireAdminAuth, async (req, res) => {
  await db.deactivateDevice(req.params.deviceId, req.params.id, 'admin_forced');
  res.json({ success: true, message: 'Device unbind completed' });
});

// Admin List All Devices
const handleAdminGetDevices = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const search = req.query.search || '';
  const devices = await db.getAllDevices(limit, offset, search);
  res.json({ success: true, devices });
};
app.get('/api/v1/admin/devices', requireAdminAuth, handleAdminGetDevices);
app.get('/api/admin/devices', requireAdminAuth, handleAdminGetDevices);

// Admin List Banned Devices
app.get('/api/v1/admin/banned-devices', requireAdminAuth, async (req, res) => {
  const banned = await db.getAllBannedDevices();
  res.json({ success: true, banned });
});

// Admin Unban Device
app.post('/api/v1/admin/devices/:deviceId/unban', requireAdminAuth, async (req, res) => {
  await db.unbanDevice(req.params.deviceId, req.admin.username);
  res.json({ success: true, message: `Device ${req.params.deviceId} has been successfully unbanned` });
});

// Admin Manually Ban Device
app.post('/api/v1/admin/devices/:deviceId/ban', requireAdminAuth, async (req, res) => {
  const { reason } = req.body || {};
  await db.banDeviceManually(req.params.deviceId, reason || 'Manually banned by admin', req.admin.username);
  res.json({ success: true, message: `Device ${req.params.deviceId} has been banned` });
});

// Admin List Users
app.get('/api/v1/admin/users', requireAdminAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const users = await db.getAllUsers(limit, offset);
  res.json({ success: true, users });
});

// Admin Audit Logs
const handleAdminGetAuditLogs = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = parseInt(req.query.offset, 10) || 0;
  const logs = await db.getAuditLogs(limit, offset);
  res.json({ success: true, logs });
};
app.get('/api/v1/admin/audit-logs', requireAdminAuth, handleAdminGetAuditLogs);
app.get('/api/admin/audit-logs', requireAdminAuth, handleAdminGetAuditLogs);

// Serve Admin UI statically when running standalone
app.get(/^\/admin(\/.*)?$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Default Root
app.get('/', (req, res) => {
  res.json({
    project: 'XDM Turbo Official Licensing Server',
    status: 'online',
    portal: 'https://xdm.zihan.xyz/admin.html'
  });
});

// 404 for unhandled API routes
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
