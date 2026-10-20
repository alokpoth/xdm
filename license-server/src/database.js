const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');
const crypto = require('./crypto');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../data/licenses.db');

class LicenseDatabase {
  constructor() {
    this.client = null;
    this._initPromise = null;
    this.setupClient();
    this.setupMaintenance();
  }

  setupMaintenance() {
    // Run automated database vacuum, pruning, and optimization every 24 hours
    this._maintenanceTimer = setInterval(() => {
      this.optimizeDatabase().catch(() => {});
    }, 24 * 60 * 60 * 1000);
    if (this._maintenanceTimer && this._maintenanceTimer.unref) {
      this._maintenanceTimer.unref();
    }
  }

  setupClient() {
    if (process.env.TURSO_DATABASE_URL) {
      console.log('[Database] Connecting to hosted Turso/libSQL cloud database...');
      this.client = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN || undefined
      });
      this.isTurso = true;
    } else {
      let targetPath = DB_PATH;
      // In Vercel serverless environment, local repo directory is read-only; fallback to /tmp if not configured
      if (process.env.VERCEL && !process.env.DATABASE_PATH) {
        targetPath = path.join('/tmp', 'licenses.db');
        console.warn('[TURSO CONFIG RECOMMENDED] Running on Vercel without TURSO_DATABASE_URL! Using transient /tmp/licenses.db. Configure TURSO_DATABASE_URL for permanent persistence across function instances.');
      }

      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch (e) {}
      }

      const fileUrl = `file:${targetPath.replace(/\\/g, '/')}`;
      this.client = createClient({ url: fileUrl });
      this.isTurso = false;
    }
  }

  async ready() {
    if (!this._initPromise) {
      this._initPromise = this.init();
    }
    await this._initPromise;
    return this;
  }

  async init() {
    await this.initTables();
    await this.ensureDefaultAdmin();
    // Non-blocking initial database maintenance to prevent bloat
    this.optimizeDatabase().catch(() => {});
  }

  // Direct SQL execution helper
  async exec(sql) {
    return await this.client.execute(sql);
  }

  async initTables() {
    const statements = [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        consent_telemetry INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS licenses (
        id TEXT PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        edition TEXT NOT NULL DEFAULT 'pro',
        user_id TEXT,
        customer_name TEXT,
        customer_email TEXT,
        max_devices INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        issued_at INTEGER NOT NULL,
        expires_at INTEGER,
        notes TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(key)`,
      `CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status)`,
      `CREATE TABLE IF NOT EXISTS devices (
        id TEXT NOT NULL,
        license_id TEXT NOT NULL,
        user_id TEXT,
        device_name TEXT,
        os_platform TEXT,
        client_version TEXT,
        ip_address TEXT,
        activated_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (id, license_id),
        FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_devices_license ON devices(license_id)`,
      `CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen_at)`,
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        license_id TEXT,
        device_id TEXT,
        ip_address TEXT,
        details TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS device_security (
        device_id TEXT PRIMARY KEY,
        ip_address TEXT,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        is_banned INTEGER NOT NULL DEFAULT 0,
        banned_at INTEGER,
        ban_reason TEXT,
        last_attempt_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_device_security_banned ON device_security(is_banned)`,
      `CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'superadmin',
        created_at INTEGER NOT NULL
      )`
    ];

    for (const sql of statements) {
      await this.client.execute(sql);
    }
  }

  async ensureDefaultAdmin() {
    try {
      const check = await this.client.execute('SELECT COUNT(*) as count FROM admin_users');
      const count = check.rows[0] ? Number(check.rows[0].count) : 0;
      if (count === 0) {
        if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
          console.warn('[SECURITY WARNING] ADMIN_PASSWORD environment variable is NOT set in production! Using fallback. Please configure a custom secure ADMIN_PASSWORD immediately.');
        }
        const defaultPass = process.env.ADMIN_PASSWORD || 'zihan2026';
        const passwordHash = crypto.hashPassword(defaultPass);
        await this.client.execute({
          sql: `INSERT INTO admin_users (id, username, password_hash, role, created_at)
                VALUES (?, ?, ?, ?, ?)`,
          args: ['admin_root', 'admin', passwordHash, 'superadmin', Date.now()]
        });
        console.log('[Database] Initialized default admin account: "admin"');
      }
    } catch (e) {
      console.warn('[Database] ensureDefaultAdmin warning:', e.message);
    }
  }

  // --- Audit Logging ---
  async logEvent(eventType, licenseId, deviceId, ipAddress, details = {}) {
    try {
      const id = crypto.generateId('log');
      const now = Date.now();
      await this.client.execute({
        sql: `INSERT INTO audit_logs (id, event_type, license_id, device_id, ip_address, details, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          eventType,
          licenseId || null,
          deviceId || null,
          ipAddress || null,
          JSON.stringify(details),
          now
        ]
      });
    } catch (err) {
      console.warn('[Audit Log Warning]', err.message);
    }
  }

  async getAuditLogs(limit = 100, offset = 0) {
    const res = await this.client.execute({
      sql: `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      args: [limit, offset]
    });
    return res.rows;
  }

  async clearAuditLogs(options = {}) {
    const adminUsername = options.adminUsername || 'admin';
    let deleteSql = 'DELETE FROM audit_logs';
    const params = [];
    if (options.beforeTimestamp) {
      deleteSql += ' WHERE created_at < ?';
      params.push(Number(options.beforeTimestamp));
    }
    await this.client.execute({ sql: deleteSql, args: params });
    try {
      await this.client.execute('VACUUM');
    } catch (e) {}
    await this.logEvent('audit_logs_cleared', null, null, 'admin', {
      clearedBy: adminUsername,
      clearedAt: Date.now()
    });
    return { success: true, message: 'Audit event history cleared successfully' };
  }

  async optimizeDatabase() {
    const sixtyDaysAgo = Date.now() - (60 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);

    // 1. Prune audit logs beyond 2,500 entries or older than 60 days
    try {
      await this.client.execute({
        sql: `DELETE FROM audit_logs 
              WHERE created_at < ? 
                 OR id NOT IN (SELECT id FROM audit_logs ORDER BY created_at DESC LIMIT 2500)`,
        args: [sixtyDaysAgo]
      });
    } catch (e) {}

    // 2. Prune stale unbanned IP attempt tracking older than 14 days
    try {
      await this.client.execute({
        sql: 'DELETE FROM device_security WHERE is_banned = 0 AND last_attempt_at < ?',
        args: [fourteenDaysAgo]
      });
    } catch (e) {}

    // 3. Prune deactivated device sessions older than 90 days
    try {
      await this.client.execute({
        sql: 'DELETE FROM devices WHERE is_active = 0 AND last_seen_at < ?',
        args: [ninetyDaysAgo]
      });
    } catch (e) {}

    // 4. Run SQLite optimization and vacuum
    try {
      await this.client.execute('PRAGMA optimize');
    } catch (e) {}
    try {
      await this.client.execute('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch (e) {}
    try {
      await this.client.execute('VACUUM');
    } catch (e) {}

    return {
      success: true,
      message: 'Database optimized successfully. Stale logs pruned and disk space reclaimed.',
      optimizedAt: Date.now()
    };
  }

  // --- User Operations ---
  async getOrCreateUser(email, consentTelemetry = true) {
    if (!email) return null;
    const existingRes = await this.client.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email]
    });
    const existing = existingRes.rows[0];
    const now = Date.now();
    if (existing) {
      await this.client.execute({
        sql: 'UPDATE users SET last_seen_at = ? WHERE id = ?',
        args: [now, existing.id]
      });
      return existing;
    }
    const id = crypto.generateId('usr');
    await this.client.execute({
      sql: `INSERT INTO users (id, email, consent_telemetry, created_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [id, email, consentTelemetry ? 1 : 0, now, now]
    });
    return { id, email, consent_telemetry: consentTelemetry ? 1 : 0, created_at: now, last_seen_at: now };
  }

  async getAllUsers(limit = 50, offset = 0) {
    const res = await this.client.execute({
      sql: `SELECT u.*, 
        (SELECT COUNT(DISTINCT d.id) FROM devices d WHERE d.user_id = u.id AND d.is_active = 1) as active_devices_count,
        (SELECT COUNT(*) FROM licenses l WHERE l.user_id = u.id) as licenses_count
      FROM users u ORDER BY u.last_seen_at DESC LIMIT ? OFFSET ?`,
      args: [limit, offset]
    });
    return res.rows;
  }

  // --- License Operations ---
  async createLicense(options = {}) {
    const id = crypto.generateId('lic');
    const key = options.key || crypto.generateLicenseKey(options.edition || 'PRO');
    const edition = options.edition || 'pro';
    const maxDevices = parseInt(options.maxDevices, 10) || 1;
    const issuedAt = Date.now();
    let expiresAt = null;
    if (options.expiresAt !== undefined && options.expiresAt !== null && options.expiresAt !== '') {
      expiresAt = parseInt(options.expiresAt, 10);
    } else if (options.days !== undefined && options.days !== null) {
      const daysCount = parseInt(options.days, 10);
      if (daysCount > 0) expiresAt = issuedAt + (daysCount * 24 * 60 * 60 * 1000);
    } else if (options.duration) {
      const dur = String(options.duration).toLowerCase().trim();
      if (dur === '3day' || dur === '3days' || dur === '3d') expiresAt = issuedAt + (3 * 24 * 60 * 60 * 1000);
      else if (dur === '7day' || dur === '7days' || dur === '7d') expiresAt = issuedAt + (7 * 24 * 60 * 60 * 1000);
      else if (dur === '14day' || dur === '14days' || dur === '14d') expiresAt = issuedAt + (14 * 24 * 60 * 60 * 1000);
      else if (dur === '1month' || dur === '30day' || dur === '30days') expiresAt = issuedAt + (30 * 24 * 60 * 60 * 1000);
      else if (dur === '3month' || dur === '90day' || dur === '90days') expiresAt = issuedAt + (90 * 24 * 60 * 60 * 1000);
      else if (dur === '6month' || dur === '180day' || dur === '180days') expiresAt = issuedAt + (180 * 24 * 60 * 60 * 1000);
      else if (dur === '1year' || dur === '365day' || dur === '365days') expiresAt = issuedAt + (365 * 24 * 60 * 60 * 1000);
      else if (dur === '3year' || dur === '1095day' || dur === '1095days') expiresAt = issuedAt + (1095 * 24 * 60 * 60 * 1000);
      else if (dur === 'lifetime') expiresAt = null;
      else {
        const match = dur.match(/^(\d+)\s*(d|day|days|m|month|months|y|year|years)?$/);
        if (match) {
          const num = parseInt(match[1], 10);
          const unit = match[2] || 'd';
          if (unit.startsWith('d')) expiresAt = issuedAt + (num * 24 * 60 * 60 * 1000);
          else if (unit.startsWith('m')) expiresAt = issuedAt + (num * 30 * 24 * 60 * 60 * 1000);
          else if (unit.startsWith('y')) expiresAt = issuedAt + (num * 365 * 24 * 60 * 60 * 1000);
        }
      }
    }
    const customerName = options.customerName || null;
    const customerEmail = options.customerEmail || null;
    const notes = options.notes || null;
    let userId = options.userId || null;

    if (customerEmail && !userId) {
      const user = await this.getOrCreateUser(customerEmail, true);
      userId = user ? user.id : null;
    }

    await this.client.execute({
      sql: `INSERT INTO licenses (id, key, edition, user_id, customer_name, customer_email, max_devices, status, issued_at, expires_at, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      args: [id, key, edition, userId, customerName, customerEmail, maxDevices, issuedAt, expiresAt, notes, issuedAt]
    });

    await this.logEvent('license_created', id, null, 'server', { key, edition, maxDevices, customerName, customerEmail });
    return await this.getLicenseById(id);
  }

  async getLicenseByKey(key) {
    if (!key) return null;
    const cleanKey = key.trim().toUpperCase();
    const res = await this.client.execute({
      sql: 'SELECT * FROM licenses WHERE key = ?',
      args: [cleanKey]
    });
    return res.rows[0] || null;
  }

  async getLicenseById(id) {
    const res = await this.client.execute({
      sql: 'SELECT * FROM licenses WHERE id = ?',
      args: [id]
    });
    return res.rows[0] || null;
  }

  async getAllLicenses(options = {}) {
    let query = 'SELECT l.*, (SELECT COUNT(*) FROM devices d WHERE d.license_id = l.id AND d.is_active = 1) as active_devices FROM licenses l WHERE 1=1';
    const params = [];

    if (options.status) {
      query += ' AND l.status = ?';
      params.push(options.status);
    }
    if (options.edition) {
      query += ' AND l.edition = ?';
      params.push(options.edition);
    }
    if (options.search) {
      query += ' AND (l.key LIKE ? OR l.customer_name LIKE ? OR l.customer_email LIKE ? OR l.notes LIKE ?)';
      const s = `%${options.search}%`;
      params.push(s, s, s, s);
    }

    query += ' ORDER BY l.created_at DESC';

    if (options.limit) {
      query += ' LIMIT ? OFFSET ?';
      params.push(options.limit, options.offset || 0);
    }

    const res = await this.client.execute({ sql: query, args: params });
    return res.rows;
  }

  async getLicensesCount(options = {}) {
    let query = 'SELECT COUNT(*) as count FROM licenses l WHERE 1=1';
    const params = [];

    if (options.status) {
      query += ' AND l.status = ?';
      params.push(options.status);
    }
    if (options.edition) {
      query += ' AND l.edition = ?';
      params.push(options.edition);
    }
    if (options.search) {
      query += ' AND (l.key LIKE ? OR l.customer_name LIKE ? OR l.customer_email LIKE ? OR l.notes LIKE ?)';
      const s = `%${options.search}%`;
      params.push(s, s, s, s);
    }

    const res = await this.client.execute({ sql: query, args: params });
    return res.rows[0] ? Number(res.rows[0].count) : 0;
  }

  async updateLicenseStatus(id, newStatus, reason = '') {
    await this.client.execute({
      sql: 'UPDATE licenses SET status = ? WHERE id = ?',
      args: [newStatus, id]
    });
    await this.logEvent(`license_${newStatus}`, id, null, 'admin', { reason });
    return await this.getLicenseById(id);
  }

  async updateLicenseMaxDevices(id, maxDevices) {
    await this.client.execute({
      sql: 'UPDATE licenses SET max_devices = ? WHERE id = ?',
      args: [parseInt(maxDevices, 10), id]
    });
    await this.logEvent('license_max_devices_changed', id, null, 'admin', { maxDevices });
    return await this.getLicenseById(id);
  }

  async updateLicenseExpiresAt(id, expiresAt) {
    await this.client.execute({
      sql: 'UPDATE licenses SET expires_at = ? WHERE id = ?',
      args: [expiresAt !== null ? parseInt(expiresAt, 10) : null, id]
    });
    await this.logEvent('license_expires_at_changed', id, null, 'admin', { expiresAt });
    return await this.getLicenseById(id);
  }

  async deleteLicense(id) {
    await this.ready();
    const lic = await this.getLicenseById(id);
    if (!lic) return null;

    // 1. Remove bound devices
    await this.client.execute({
      sql: 'DELETE FROM devices WHERE license_id = ?',
      args: [id]
    });

    // 2. Remove the license
    await this.client.execute({
      sql: 'DELETE FROM licenses WHERE id = ?',
      args: [id]
    });

    await this.logEvent('license_deleted', id, null, 'admin', { key: lic.key, edition: lic.edition });
    return lic;
  }

  async purgeAllData() {
    await this.ready();
    await this.client.execute('DELETE FROM devices');
    await this.client.execute('DELETE FROM device_security');
    await this.client.execute('DELETE FROM licenses');
    await this.client.execute('DELETE FROM users');
    await this.client.execute('DELETE FROM audit_logs');
    await this.ensureDefaultAdmin();
    await this.logEvent('system_purged', null, null, 'admin', { action: 'Full reset to clean state' });
    return true;
  }

  // --- Device Operations ---
  async getDevicesForLicense(licenseId) {
    const res = await this.client.execute({
      sql: 'SELECT * FROM devices WHERE license_id = ? ORDER BY activated_at DESC',
      args: [licenseId]
    });
    return res.rows;
  }

  async getActiveDeviceCount(licenseId) {
    const res = await this.client.execute({
      sql: 'SELECT COUNT(*) as count FROM devices WHERE license_id = ? AND is_active = 1',
      args: [licenseId]
    });
    return res.rows[0] ? Number(res.rows[0].count) : 0;
  }

  async getDevice(deviceId, licenseId) {
    const res = await this.client.execute({
      sql: 'SELECT * FROM devices WHERE id = ? AND license_id = ?',
      args: [deviceId, licenseId]
    });
    return res.rows[0] || null;
  }

  // Atomic Device Registration & Seat Limit Enforcement
  async registerOrUpdateDevice(deviceId, licenseId, options = {}) {
    const now = Date.now();
    const tx = await this.client.transaction('write');

    try {
      const existingRes = await tx.execute({
        sql: 'SELECT * FROM devices WHERE id = ? AND license_id = ?',
        args: [deviceId, licenseId]
      });

      if (existingRes.rows.length > 0) {
        await tx.execute({
          sql: `UPDATE devices 
                SET is_active = 1, last_seen_at = ?, device_name = coalesce(?, device_name), 
                    os_platform = coalesce(?, os_platform), client_version = coalesce(?, client_version),
                    ip_address = coalesce(?, ip_address)
                WHERE id = ? AND license_id = ?`,
          args: [
            now,
            options.deviceName || null,
            options.osPlatform || null,
            options.clientVersion || null,
            options.ipAddress || null,
            deviceId,
            licenseId
          ]
        });
        await tx.commit();
        return await this.getDevice(deviceId, licenseId);
      }

      // Check Seat Limit inside write transaction to prevent concurrency races
      const licRes = await tx.execute({
        sql: 'SELECT max_devices FROM licenses WHERE id = ?',
        args: [licenseId]
      });
      const maxDevices = licRes.rows[0] ? Number(licRes.rows[0].max_devices) : 1;

      const activeRes = await tx.execute({
        sql: 'SELECT COUNT(*) as count FROM devices WHERE license_id = ? AND is_active = 1',
        args: [licenseId]
      });
      const activeCount = activeRes.rows[0] ? Number(activeRes.rows[0].count) : 0;

      if (activeCount >= maxDevices) {
        await tx.rollback();
        const err = new Error(`Activation limit reached (${activeCount}/${maxDevices} devices). Please deactivate this key on your other device first or upgrade your plan.`);
        err.code = 'SEAT_LIMIT_EXCEEDED';
        err.activeCount = activeCount;
        err.maxDevices = maxDevices;
        throw err;
      }

      await tx.execute({
        sql: `INSERT INTO devices (id, license_id, user_id, device_name, os_platform, client_version, ip_address, activated_at, last_seen_at, is_active)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        args: [
          deviceId,
          licenseId,
          options.userId || null,
          options.deviceName || 'Desktop PC',
          options.osPlatform || 'Windows',
          options.clientVersion || '1.0.10',
          options.ipAddress || null,
          now,
          now
        ]
      });

      await tx.commit();
      return await this.getDevice(deviceId, licenseId);
    } catch (err) {
      try { await tx.rollback(); } catch (e) {}
      throw err;
    }
  }

  async updateDeviceHeartbeat(deviceId, licenseId, ipAddress = null) {
    const now = Date.now();
    if (!this._heartbeatWriteCache) {
      this._heartbeatWriteCache = new Map();
    }
    const lastWrite = this._heartbeatWriteCache.get(deviceId) || 0;
    // Throttle DB writes: only write to DB if > 24 hours have elapsed since last write for this device.
    // This dramatically saves Turso row write quota (1 write/day per user, allowing 333,000+ 24/7 users on free tier).
    if (now - lastWrite < 24 * 60 * 60 * 1000) {
      return;
    }
    this._heartbeatWriteCache.set(deviceId, now);
    if (this._heartbeatWriteCache.size > 10000) {
      this._heartbeatWriteCache.clear();
      this._heartbeatWriteCache.set(deviceId, now);
    }
    await this.client.execute({
      sql: `UPDATE devices SET last_seen_at = ?, ip_address = coalesce(?, ip_address)
            WHERE id = ? AND license_id = ?`,
      args: [now, ipAddress || null, deviceId, licenseId]
    });
  }

  async deactivateDevice(deviceId, licenseId, reason = 'user_requested') {
    await this.client.execute({
      sql: 'UPDATE devices SET is_active = 0 WHERE id = ? AND license_id = ?',
      args: [deviceId, licenseId]
    });
    await this.logEvent('device_deactivated', licenseId, deviceId, 'client', { reason });
    return true;
  }

  async getAllDevices(limit = 100, offset = 0, search = '') {
    let query = `
      SELECT d.id, d.license_id, d.user_id, d.device_name, d.os_platform, d.client_version, d.ip_address,
             d.activated_at, d.last_seen_at, d.is_active,
             l.key as license_key, l.edition, l.customer_name,
             coalesce(s.is_banned, 0) as is_banned,
             s.ban_reason,
             coalesce(s.failed_attempts, 0) as failed_attempts,
             s.banned_at
      FROM devices d
      JOIN licenses l ON d.license_id = l.id
      LEFT JOIN device_security s ON d.id = s.device_id
      UNION ALL
      SELECT s.device_id as id, 'NONE' as license_id, NULL as user_id, 'Blocked PC / Intruder' as device_name,
             'Unknown' as os_platform, '—' as client_version, s.ip_address,
             s.banned_at as activated_at, s.last_attempt_at as last_seen_at, 0 as is_active,
             '—' as license_key, 'UNREGISTERED' as edition, 'Banned Intruder' as customer_name,
             1 as is_banned, s.ban_reason, s.failed_attempts, s.banned_at
      FROM device_security s
      WHERE s.is_banned = 1 AND s.device_id NOT IN (SELECT id FROM devices)
    `;
    const params = [];
    if (search) {
      query = `SELECT * FROM (${query}) WHERE id LIKE ? OR device_name LIKE ? OR license_key LIKE ? OR customer_name LIKE ?`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    query += ' ORDER BY last_seen_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const res = await this.client.execute({ sql: query, args: params });
    return res.rows;
  }

  // --- Device Security & Anti-Brute Force Protection ---
  async isDeviceBanned(deviceId) {
    if (!deviceId) return false;
    const res = await this.client.execute({
      sql: 'SELECT is_banned, ban_reason, banned_at, failed_attempts FROM device_security WHERE device_id = ?',
      args: [deviceId]
    });
    const row = res.rows[0];
    if (!row) return false;
    return Number(row.is_banned) === 1 ? row : false;
  }

  async recordFailedAttempt(deviceId, ip, attemptedKey, threshold = 10) {
    if (!deviceId) return { banned: false, failedAttempts: 0, remainingAttempts: threshold };
    const now = Date.now();
    const res = await this.client.execute({
      sql: 'SELECT failed_attempts, is_banned FROM device_security WHERE device_id = ?',
      args: [deviceId]
    });
    const existing = res.rows[0];

    let newCount = 1;
    let isBanned = 0;
    let banReason = null;
    let bannedAt = null;

    if (existing) {
      if (Number(existing.is_banned) === 1) {
        return { banned: true, failedAttempts: Number(existing.failed_attempts), remainingAttempts: 0 };
      }
      newCount = Number(existing.failed_attempts) + 1;
    }

    if (newCount >= threshold) {
      isBanned = 1;
      banReason = `Exceeded ${threshold} invalid key activation attempts (Anti-Brute Force Protection)`;
      bannedAt = now;
      await this.logEvent('device_auto_banned', null, deviceId, ip, {
        attemptedKey,
        failedAttempts: newCount,
        threshold
      });
    }

    await this.client.execute({
      sql: `INSERT INTO device_security (device_id, ip_address, failed_attempts, is_banned, banned_at, ban_reason, last_attempt_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(device_id) DO UPDATE SET
              failed_attempts = excluded.failed_attempts,
              ip_address = coalesce(excluded.ip_address, device_security.ip_address),
              is_banned = excluded.is_banned,
              banned_at = coalesce(excluded.banned_at, device_security.banned_at),
              ban_reason = coalesce(excluded.ban_reason, device_security.ban_reason),
              last_attempt_at = excluded.last_attempt_at`,
      args: [deviceId, ip || null, newCount, isBanned, bannedAt, banReason, now]
    });

    return {
      banned: isBanned === 1,
      failedAttempts: newCount,
      remainingAttempts: Math.max(0, threshold - newCount)
    };
  }

  async clearFailedAttempts(deviceId) {
    if (!deviceId) return;
    await this.client.execute({
      sql: 'UPDATE device_security SET failed_attempts = 0 WHERE device_id = ? AND is_banned = 0',
      args: [deviceId]
    });
  }

  async unbanDevice(deviceId, adminUsername = 'admin') {
    if (!deviceId) return false;
    await this.client.execute({
      sql: `UPDATE device_security 
            SET is_banned = 0, failed_attempts = 0, banned_at = NULL, ban_reason = NULL, last_attempt_at = ?
            WHERE device_id = ?`,
      args: [Date.now(), deviceId]
    });
    await this.logEvent('device_unbanned', null, deviceId, 'admin', { unbannedBy: adminUsername });
    return true;
  }

  async banDeviceManually(deviceId, reason = 'Manually banned by admin', adminUsername = 'admin') {
    if (!deviceId) return false;
    const now = Date.now();
    await this.client.execute({
      sql: `INSERT INTO device_security (device_id, ip_address, failed_attempts, is_banned, banned_at, ban_reason, last_attempt_at)
            VALUES (?, NULL, 10, 1, ?, ?, ?)
            ON CONFLICT(device_id) DO UPDATE SET
              is_banned = 1,
              banned_at = excluded.banned_at,
              ban_reason = excluded.ban_reason,
              last_attempt_at = excluded.last_attempt_at`,
      args: [deviceId, now, reason, now]
    });
    await this.logEvent('device_manual_banned', null, deviceId, 'admin', { bannedBy: adminUsername, reason });
    return true;
  }

  async getAllBannedDevices() {
    const res = await this.client.execute({
      sql: 'SELECT * FROM device_security WHERE is_banned = 1 ORDER BY banned_at DESC'
    });
    return res.rows;
  }

  // --- Database Storage Stats & Health Capacity ---
  async getDatabaseStorageStats() {
    let sizeBytes = 0;
    try {
      const pc = await this.client.execute('PRAGMA page_count');
      const ps = await this.client.execute('PRAGMA page_size');
      const pageCount = Number(pc.rows[0]?.page_count || 0);
      const pageSize = Number(ps.rows[0]?.page_size || 4096);
      sizeBytes = pageCount * pageSize;
    } catch (e) {}

    let diskSizeBytes = sizeBytes;
    try {
      const targetPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/licenses.db');
      if (fs.existsSync(targetPath)) {
        diskSizeBytes = fs.statSync(targetPath).size;
        const walPath = `${targetPath}-wal`;
        if (fs.existsSync(walPath)) {
          diskSizeBytes += fs.statSync(walPath).size;
        }
      }
    } catch (e) {}

    const effectiveBytes = Math.max(sizeBytes, diskSizeBytes);
    const maxQuotaBytes = 1024 * 1024 * 1024; // 1 GB standard capacity allocation
    const usagePercent = Math.min(100, Math.max(0.01, (effectiveBytes / maxQuotaBytes) * 100));

    let sizeFormatted = `${(effectiveBytes / 1024).toFixed(2)} KB`;
    if (effectiveBytes >= 1024 * 1024) {
      sizeFormatted = `${(effectiveBytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    const [cLogs, cLic, cDev, cUsr, cSec] = await Promise.all([
      this.client.execute('SELECT COUNT(*) as count FROM audit_logs').catch(() => ({ rows: [{ count: 0 }] })),
      this.client.execute('SELECT COUNT(*) as count FROM licenses').catch(() => ({ rows: [{ count: 0 }] })),
      this.client.execute('SELECT COUNT(*) as count FROM devices').catch(() => ({ rows: [{ count: 0 }] })),
      this.client.execute('SELECT COUNT(*) as count FROM users').catch(() => ({ rows: [{ count: 0 }] })),
      this.client.execute('SELECT COUNT(*) as count FROM device_security').catch(() => ({ rows: [{ count: 0 }] }))
    ]);

    const auditLogsCount = Number(cLogs.rows[0]?.count || 0);
    const licensesCount = Number(cLic.rows[0]?.count || 0);
    const devicesCount = Number(cDev.rows[0]?.count || 0);
    const usersCount = Number(cUsr.rows[0]?.count || 0);
    const deviceSecurityCount = Number(cSec.rows[0]?.count || 0);

    let status = 'Healthy (Plenty of Room)';
    let statusClass = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    if (usagePercent > 75) {
      status = 'Near Capacity (Optimize Now)';
      statusClass = 'text-rose-400 bg-rose-500/10 border-rose-500/30';
    } else if (usagePercent > 40) {
      status = 'Moderate Usage';
      statusClass = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    }

    return {
      sizeBytes: effectiveBytes,
      sizeFormatted,
      maxQuotaBytes,
      maxQuotaFormatted: '1.00 GB',
      usagePercent: Number(usagePercent.toFixed(2)),
      status,
      statusClass,
      tableCounts: {
        auditLogs: auditLogsCount,
        licenses: licensesCount,
        devices: devicesCount,
        users: usersCount,
        securityEvents: deviceSecurityCount
      }
    };
  }

  // --- Metrics Overview ---
  async getOverviewMetrics() {
    const now = Date.now();
    const twoMinutesAgo = now - (2 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    const [u, l, al, rl, sl, d, bd, on, d24, storage] = await Promise.all([
      this.client.execute('SELECT COUNT(*) as count FROM users'),
      this.client.execute('SELECT COUNT(*) as count FROM licenses'),
      this.client.execute("SELECT COUNT(*) as count FROM licenses WHERE status = 'active'"),
      this.client.execute("SELECT COUNT(*) as count FROM licenses WHERE status = 'revoked'"),
      this.client.execute("SELECT COUNT(*) as count FROM licenses WHERE status = 'suspended'"),
      this.client.execute('SELECT COUNT(*) as count FROM devices WHERE is_active = 1'),
      this.client.execute('SELECT COUNT(*) as count FROM device_security WHERE is_banned = 1'),
      this.client.execute({ sql: 'SELECT COUNT(*) as count FROM devices WHERE is_active = 1 AND last_seen_at >= ?', args: [twoMinutesAgo] }),
      this.client.execute({ sql: 'SELECT COUNT(*) as count FROM devices WHERE is_active = 1 AND last_seen_at >= ?', args: [oneDayAgo] }),
      this.getDatabaseStorageStats()
    ]);

    return {
      totalUsers: Number(u.rows[0]?.count || 0),
      totalLicenses: Number(l.rows[0]?.count || 0),
      activeLicenses: Number(al.rows[0]?.count || 0),
      revokedLicenses: Number(rl.rows[0]?.count || 0),
      suspendedLicenses: Number(sl.rows[0]?.count || 0),
      totalDevices: Number(d.rows[0]?.count || 0),
      bannedDevices: Number(bd.rows[0]?.count || 0),
      onlineDevicesNow: Number(on.rows[0]?.count || 0),
      devicesSeen24h: Number(d24.rows[0]?.count || 0),
      storage
    };
  }

  // --- Admin User Auth ---
  async getAdminByUsername(username) {
    const res = await this.client.execute({
      sql: 'SELECT * FROM admin_users WHERE username = ?',
      args: [username]
    });
    return res.rows[0] || null;
  }

  async updateAdminCredentials(currentUsername, { newUsername, newPasswordHash }) {
    await this.ready();
    const admin = await this.getAdminByUsername(currentUsername);
    if (!admin) return null;

    const targetUsername = (newUsername && typeof newUsername === 'string' && newUsername.trim()) ? newUsername.trim() : admin.username;
    const targetHash = newPasswordHash || admin.password_hash;

    await this.client.execute({
      sql: 'UPDATE admin_users SET username = ?, password_hash = ? WHERE id = ?',
      args: [targetUsername, targetHash, admin.id]
    });

    await this.logEvent('admin_credentials_updated', null, null, 'admin', {
      oldUsername: currentUsername,
      newUsername: targetUsername,
      passwordChanged: !!newPasswordHash
    });

    return await this.getAdminByUsername(targetUsername);
  }

  async updateAdminPassword(username, newPasswordHash) {
    return await this.updateAdminCredentials(username, { newPasswordHash });
  }
}

const dbInstance = new LicenseDatabase();
// Trigger eager table initialization
dbInstance.ready().catch((err) => {
  console.warn('[Database] Initialization warning:', err.message);
});

module.exports = dbInstance;
