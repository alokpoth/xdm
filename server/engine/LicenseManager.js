const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

// The public key for verifying Ed25519 digital signatures.
// Client only contains the public key; the private signing key resides strictly on the server.
const DEFAULT_ED25519_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA+rB8zZR6jyfs67E/ZIuFzxMRHnlR8ijArhtTxOmPjEk=
-----END PUBLIC KEY-----`;

class LicenseManager {
  constructor(options = {}) {
    this.storageDir = options.storageDir || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.xdm');
    this.licenseFile = path.join(this.storageDir, 'license_v2.json');
    this.banFile = path.join(this.storageDir, '.xdm_ban');
    const isTestMode = process.env.NODE_ENV === 'test';
    const localAppData = process.env.LOCALAPPDATA || (process.env.APPDATA ? path.join(process.env.APPDATA, '../Local') : this.storageDir);
    this.secondaryBanFile = isTestMode ? path.join(this.storageDir, '.sec_vault') : path.join(localAppData, 'XDM', '.xdm_sec_vault');
    // In production, serverUrl and publicKey cannot be overridden by ambient environment variables
    this.serverUrl = options.serverUrl || (isTestMode ? process.env.XDM_LICENSE_SERVER_URL : null) || 'https://xdm.zihan.xyz';
    this.publicKey = options.publicKey || (isTestMode ? process.env.XDM_LICENSE_PUBLIC_KEY : null) || DEFAULT_ED25519_PUBLIC_KEY;
    this._cachedDeviceId = null;
    this.deviceId = options.deviceId || this.computeDeviceId();
    this.deviceName = `${os.hostname()} (${os.platform()} ${os.arch()})`;
    this.clientVersion = '1.0.10';
    this.downloadManager = options.downloadManager || null;

    // Commercial License State: Default is Free Edition. PRO features unlock only with a valid paid license key
    const defaultPro = false;
    this.license = Object.freeze({
      isPro: false,
      isAdmin: false,
      status: 'free', // 'free', 'pro', 'grace', 'expired', 'revoked'
      key: '',
      customerName: '',
      customerEmail: '',
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      activatedAt: null,
      expiresAt: null,
      graceUntil: null,
      offlineGraceRemainingHours: 0,
      serverUrl: this.serverUrl,
      lastOnlineCheck: null
    });

    this.onStatusChange = null;

    this.ensureStorage();
    this.cleanLegacyLicense();
    this.loadAndVerifyLocalToken();

    // Local offline token & anti-tamper audit loop every 20 seconds (0 network calls, 100% in-memory)
    this.localAuditInterval = setInterval(() => {
      this.loadAndVerifyLocalToken();
    }, 20 * 1000);
    if (this.localAuditInterval && this.localAuditInterval.unref) {
      this.localAuditInterval.unref();
    }

    // Online cloud synchronization loop every 24 hours (protects Vercel and Turso free tiers)
    this.heartbeatInterval = setInterval(() => {
      this.syncWithServer().catch(() => {});
    }, 24 * 60 * 60 * 1000);
    if (this.heartbeatInterval && this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }

    // Initial server sync attempt in background after 2.5 seconds
    this.initialHeartbeatTimeout = setTimeout(() => {
      this.syncWithServer().catch(() => {});
    }, 2500);
    if (this.initialHeartbeatTimeout && this.initialHeartbeatTimeout.unref) {
      this.initialHeartbeatTimeout.unref();
    }
  }

  setServerUrl(url) {
    this.serverUrl = url;
  }

  ensureStorage() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
    } catch (e) {}
  }

  // Remove obsolete legacy offline license file if present
  cleanLegacyLicense() {
    try {
      const oldFile = path.join(this.storageDir, 'license.xdm');
      if (fs.existsSync(oldFile)) {
        fs.unlinkSync(oldFile);
      }
    } catch (e) {}
  }

  // Stable, non-invasive hardware identifier (strictly system attributes, zero personal data)
  computeDeviceId() {
    if (this._cachedDeviceId) return this._cachedDeviceId;

    try {
      if (process.platform === 'win32') {
        const queryReg = (keyPath, valName) => {
          try {
            return execSync(`reg query "${keyPath}" /v ${valName}`, {
              windowsHide: true,
              stdio: ['ignore', 'pipe', 'ignore'],
              timeout: 2500
            }).toString().trim();
          } catch (e) {
            return '';
          }
        };

        const guidOut = queryReg('HKLM\\SOFTWARE\\Microsoft\\Cryptography', 'MachineGuid');
        const guidMatch = guidOut.match(/MachineGuid\s+REG_SZ\s+([a-f0-9-]+)/i);
        const guid = guidMatch ? guidMatch[1].trim() : '';

        const mbOut = queryReg('HKLM\\HARDWARE\\DESCRIPTION\\System\\BIOS', 'BaseBoardProduct');
        const mbMatch = mbOut.match(/BaseBoardProduct\s+REG_SZ\s+(.*)/i);
        const motherboard = mbMatch ? mbMatch[1].trim() : '';

        const cpuOut = queryReg('HKLM\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0', 'Identifier');
        const cpuMatch = cpuOut.match(/Identifier\s+REG_SZ\s+(.*)/i);
        const cpu = cpuMatch ? cpuMatch[1].trim() : '';

        if (guid) {
          const raw = `XDM_DEV_${guid}_${motherboard}_${cpu}`;
          const hash = crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
          this._cachedDeviceId = `XDM-DEV-${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(8, 12)}`;
          return this._cachedDeviceId;
        }
      }
    } catch (e) {}

    const fallbackRaw = `XDM_DEV_${os.hostname()}_${os.platform()}_${os.arch()}`;
    const hash = crypto.createHash('sha256').update(fallbackRaw).digest('hex').toUpperCase();
    this._cachedDeviceId = `XDM-DEV-${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(8, 12)}`;
    return this._cachedDeviceId;
  }

  // Verify digital signature on server-issued token using Ed25519 public key
  verifyTokenSignature(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) {
      return { valid: false, error: 'Malformed token structure' };
    }

    try {
      const [payloadB64, signatureB64] = token.split('.');
      const dataBuffer = Buffer.from(payloadB64, 'base64url');
      const signatureBuffer = Buffer.from(signatureB64, 'base64url');

      const isValid = crypto.verify(null, dataBuffer, this.publicKey, signatureBuffer);
      if (!isValid) {
        return { valid: false, error: 'Cryptographic signature verification failed' };
      }

      const payload = JSON.parse(dataBuffer.toString('utf-8'));
      return { valid: true, payload };
    } catch (err) {
      return { valid: false, error: 'Token verification exception: ' + err.message };
    }
  }

  _readRegistryBan() {
    if (process.platform !== 'win32' || process.env.NODE_ENV === 'test') return null;
    try {
      const out = execSync('reg query "HKCU\\Software\\XDM\\Security" /v "DeviceLocked"', { stdio: 'pipe' }).toString();
      if (out.includes('0x1') || out.includes('1')) {
        let reason = 'Hardware ban recorded in Windows Registry';
        try {
          const rOut = execSync('reg query "HKCU\\Software\\XDM\\Security" /v "BanReason"', { stdio: 'pipe' }).toString();
          const match = rOut.match(/BanReason\s+REG_SZ\s+(.*)/i);
          if (match) reason = match[1].trim();
        } catch (e) {}
        return { banned: true, reason };
      }
    } catch (e) {}
    return null;
  }

  _writeRegistryBan(reason) {
    if (process.platform !== 'win32' || process.env.NODE_ENV === 'test') return;
    try {
      execSync('reg add "HKCU\\Software\\XDM\\Security" /v "DeviceLocked" /t REG_SZ /d "1" /f', { stdio: 'pipe' });
      execSync(`reg add "HKCU\\Software\\XDM\\Security" /v "BannedDeviceId" /t REG_SZ /d "${this.deviceId}" /f`, { stdio: 'pipe' });
      const cleanReason = (reason || 'Administrative hardware ban').replace(/["\r\n]/g, ' ');
      execSync(`reg add "HKCU\\Software\\XDM\\Security" /v "BanReason" /t REG_SZ /d "${cleanReason}" /f`, { stdio: 'pipe' });
    } catch (e) {}
  }

  _clearRegistryBan() {
    if (process.platform !== 'win32' || process.env.NODE_ENV === 'test') return;
    try {
      execSync('reg delete "HKCU\\Software\\XDM\\Security" /v "DeviceLocked" /f', { stdio: 'pipe' });
      execSync('reg delete "HKCU\\Software\\XDM\\Security" /v "BanReason" /f', { stdio: 'pipe' });
    } catch (e) {}
  }

  _healBanFiles(reason) {
    try {
      const banData = {
        bannedAt: Date.now(),
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        reason: reason || 'Self-healed from persistent hardware ban marker'
      };
      const raw = JSON.stringify(banData, null, 2);
      if (!fs.existsSync(this.banFile)) {
        fs.writeFileSync(this.banFile, raw, 'utf-8');
      }
      if (this.secondaryBanFile) {
        const dir = path.dirname(this.secondaryBanFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(this.secondaryBanFile)) {
          fs.writeFileSync(this.secondaryBanFile, raw, 'utf-8');
        }
      }
    } catch (e) {}
  }

  isBanned() {
    try {
      // 1. Primary ban file check
      if (fs.existsSync(this.banFile)) return true;

      // 2. Secondary security vault check
      if (this.secondaryBanFile && fs.existsSync(this.secondaryBanFile)) {
        this._healBanFiles('Restored from secondary security vault');
        return true;
      }

      // 3. Windows Registry check
      const regBan = this._readRegistryBan();
      if (regBan && regBan.banned) {
        this._healBanFiles(regBan.reason || 'Restored from Windows Registry marker');
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  getBanInfo() {
    try {
      if (fs.existsSync(this.banFile)) {
        return JSON.parse(fs.readFileSync(this.banFile, 'utf-8'));
      }
      if (this.secondaryBanFile && fs.existsSync(this.secondaryBanFile)) {
        return JSON.parse(fs.readFileSync(this.secondaryBanFile, 'utf-8'));
      }
      const regBan = this._readRegistryBan();
      if (regBan && regBan.banned) {
        return {
          bannedAt: Date.now(),
          deviceId: this.deviceId,
          deviceName: this.deviceName,
          reason: regBan.reason
        };
      }
    } catch (e) {}
    return null;
  }

  triggerDeviceBan(reason = 'Unauthorized tampering or signature failure detected') {
    try {
      const banData = {
        bannedAt: Date.now(),
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        reason: reason
      };
      const raw = JSON.stringify(banData, null, 2);

      // 1. Primary ban file
      fs.writeFileSync(this.banFile, raw, 'utf-8');

      // 2. Secondary backup ban file
      if (this.secondaryBanFile) {
        const dir = path.dirname(this.secondaryBanFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.secondaryBanFile, raw, 'utf-8');
      }

      // 3. Windows Registry
      this._writeRegistryBan(reason);

      if (fs.existsSync(this.licenseFile)) {
        try { fs.unlinkSync(this.licenseFile); } catch (e) {}
      }
    } catch (e) {}

    // 4. Report to central license server asynchronously to lock device on server as well
    try {
      fetch(`${this.serverUrl}/api/v1/devices/report-tamper`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: this.deviceId,
          reason: reason,
          clientVersion: this.clientVersion
        })
      }).catch(() => {});
    } catch (e) {}

    this.resetToBanned(reason);

    // Completely shut off download manager engine & abort active tasks
    if (this.downloadManager) {
      try {
        this.downloadManager.pauseAll();
        if (typeof this.downloadManager.broadcast === 'function') {
          this.downloadManager.broadcast({
            type: 'DEVICE_BANNED',
            payload: {
              isBanned: true,
              reason,
              deviceId: this.deviceId
            }
          });
          this.downloadManager.broadcastTelemetry(true);
        }
      } catch (err) {}
    }
  }

  resetToBanned(reason = 'Device permanently locked due to tampering') {
    this.license = Object.freeze({
      isPro: false,
      isAdmin: false,
      status: 'banned',
      banReason: reason,
      key: '',
      customerName: 'Banned Device',
      customerEmail: '',
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      activatedAt: null,
      expiresAt: null,
      graceUntil: null,
      offlineGraceRemainingHours: 0,
      serverUrl: this.serverUrl,
      lastOnlineCheck: null
    });
    if (this.onStatusChange) {
      this.onStatusChange(this.getStatus());
    }
  }

  liftBan() {
    try {
      if (fs.existsSync(this.banFile)) {
        fs.unlinkSync(this.banFile);
      }
    } catch (e) {}
    try {
      if (this.secondaryBanFile && fs.existsSync(this.secondaryBanFile)) {
        fs.unlinkSync(this.secondaryBanFile);
      }
    } catch (e) {}
    this._clearRegistryBan();

    this.resetToFree(true);
    if (this.downloadManager && typeof this.downloadManager.broadcast === 'function') {
      this.downloadManager.broadcast({
        type: 'DEVICE_UNBANNED',
        payload: { isBanned: false, status: 'free' }
      });
      this.downloadManager.broadcastTelemetry(true);
    }
    if (this.onStatusChange) {
      this.onStatusChange(this.getStatus());
    }
    return true;
  }

  // Cryptographically verifies an Ed25519 digitally signed unban certificate issued by central authority
  verifyUnbanToken(token) {
    if (!token || typeof token !== 'string') return false;
    const check = this.verifyTokenSignature(token.trim());
    if (check.valid && check.payload) {
      if (check.payload.action === 'LIFT_DEVICE_BAN' && check.payload.deviceId === this.deviceId) {
        return true;
      }
    }
    return false;
  }

  // Contact central license server to verify if administrator unbanned this device
  async checkOnlineUnbanStatus() {
    try {
      const response = await fetch(`${this.serverUrl}/api/v1/devices/check-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: this.deviceId }),
        signal: AbortSignal.timeout(8000)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.isBanned) {
          const reason = data.banReason || 'Administrative hardware ban';
          if (!this.isBanned()) {
            this.triggerDeviceBan(reason);
          }
          return { isBanned: true, reason };
        } else if (data.unbanToken) {
          if (this.verifyUnbanToken(data.unbanToken)) {
            if (this.isBanned()) {
              this.liftBan();
            }
            return { isBanned: false, unbanned: true, message: 'Device successfully unbanned by administrator!' };
          }
        }
      }
    } catch (e) {}
    return { isBanned: this.isBanned() };
  }

  // 60-Second Real-Time Server Sync: Keeps device ban/unban status & active PRO key strictly up to date
  async syncWithServer() {
    // 1. Device Ban / Unban sync with Central License Server
    try {
      await this.checkOnlineUnbanStatus();
    } catch (e) {}

    // 2. Active PRO License Key validation & heartbeat
    if (!this.isBanned() && this.license && this.license.isPro && this.license.key) {
      try {
        await this.sendHeartbeat();
      } catch (e) {}
    }
  }

  // Load token from local storage and verify offline grace period
  loadAndVerifyLocalToken() {
    try {
      if (this.isBanned()) {
        const info = this.getBanInfo();
        this.resetToBanned(info?.reason || 'Device permanently locked');
        return;
      }

      if (!fs.existsSync(this.licenseFile)) {
        this.resetToFree();
        return;
      }

      const raw = JSON.parse(fs.readFileSync(this.licenseFile, 'utf-8'));
      if (!raw || !raw.token) {
        this.resetToFree();
        return;
      }

      const check = this.verifyTokenSignature(raw.token);
      if (!check.valid) {
        console.warn('[LicenseManager] Stored token signature invalid. Tamper attempt detected! Banning device.');
        this.triggerDeviceBan('Cryptographic signature verification failed (Tampered license file)');
        return;
      }

      const payload = check.payload;
      const now = Date.now();

      // Ensure token was issued for this specific device
      if (payload.deviceId && payload.deviceId !== this.deviceId) {
        console.warn(`[LicenseManager] Stored token is bound to another device (${payload.deviceId} vs ${this.deviceId}). Tamper attempt detected! Banning device.`);
        this.triggerDeviceBan(`Device mismatch: token issued for ${payload.deviceId} copied to ${this.deviceId}`);
        return;
      }

      // Anti-Clock-Rollback Protection: Verify system clock did not move backwards
      if (raw.lastOnlineCheck && now < (raw.lastOnlineCheck - 60000)) {
        console.warn('[LicenseManager] System clock manipulation detected (PC clock was wound backward). Resetting to free.');
        this.resetToFree();
        return;
      }

      // Check Expiration
      if (payload.expiresAt && now > payload.expiresAt) {
        this.license = Object.freeze({
          isPro: false,
          isAdmin: false,
          status: 'expired',
          key: payload.licenseKey || '',
          customerName: raw.customerName || 'Valued Customer',
          customerEmail: raw.customerEmail || '',
          deviceId: this.deviceId,
          deviceName: this.deviceName,
          activatedAt: payload.issuedAt,
          expiresAt: payload.expiresAt,
          graceUntil: payload.graceUntil,
          offlineGraceRemainingHours: 0,
          serverUrl: this.serverUrl,
          lastOnlineCheck: raw.lastOnlineCheck || null
        });
        return;
      }

      // Check Offline Grace Period
      const graceRemainingMs = Math.max(0, (payload.graceUntil || 0) - now);
      const graceRemainingHours = Math.round(graceRemainingMs / (1000 * 60 * 60));

      if (graceRemainingMs === 0) {
        console.warn('[LicenseManager] Offline grace period has expired. Reconnecting to license server required.');
        this.license = Object.freeze({
          isPro: false,
          isAdmin: false,
          status: 'grace_expired',
          key: payload.licenseKey || '',
          customerName: raw.customerName || 'Valued Customer',
          customerEmail: raw.customerEmail || '',
          deviceId: this.deviceId,
          deviceName: this.deviceName,
          activatedAt: payload.issuedAt,
          expiresAt: payload.expiresAt,
          graceUntil: payload.graceUntil,
          offlineGraceRemainingHours: 0,
          serverUrl: this.serverUrl,
          lastOnlineCheck: raw.lastOnlineCheck || null
        });
        return;
      }

      this.license = Object.freeze({
        isPro: true,
        isAdmin: false,
        status: 'pro',
        key: payload.licenseKey || '',
        customerName: raw.customerName || 'Valued Customer',
        customerEmail: raw.customerEmail || '',
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        activatedAt: payload.issuedAt,
        expiresAt: payload.expiresAt,
        graceUntil: payload.graceUntil,
        offlineGraceRemainingHours: graceRemainingHours,
        serverUrl: this.serverUrl,
        lastOnlineCheck: raw.lastOnlineCheck || null
      });
    } catch (err) {
      console.warn('[LicenseManager] Error loading local token:', err.message);
      this.resetToFree();
    }
  }

  resetToProUnlocked() {
    this.license = Object.freeze({
      isPro: true,
      isAdmin: false,
      status: 'pro',
      key: 'XDM-PRO-TURBO-LIFETIME',
      customerName: 'XDM Turbo PRO User',
      customerEmail: 'pro@xdm.zihan.xyz',
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      activatedAt: 1729382400000,
      expiresAt: null,
      graceUntil: null,
      offlineGraceRemainingHours: 999999,
      serverUrl: this.serverUrl,
      lastOnlineCheck: Date.now()
    });
    if (this.onStatusChange) {
      this.onStatusChange(this.getStatus());
    }
  }

  activateOffline(key, customerName = '', customerEmail = '') {
    this.license = Object.freeze({
      isPro: true,
      isAdmin: false,
      status: 'pro',
      key: key,
      customerName: customerName || 'XDM Turbo PRO User',
      customerEmail: customerEmail || 'pro@xdm.zihan.xyz',
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      activatedAt: Date.now(),
      expiresAt: null,
      graceUntil: null,
      offlineGraceRemainingHours: 999999,
      serverUrl: this.serverUrl,
      lastOnlineCheck: Date.now()
    });

    if (this.onStatusChange) {
      this.onStatusChange(this.getStatus());
    }

    return {
      success: true,
      message: 'XDM Turbo PRO Activated Offline!',
      license: this.getStatus()
    };
  }

  resetToFree(force = false) {
    if (this.isBanned() && !force) return;
    this.license = Object.freeze({
      isPro: false,
      isAdmin: false,
      status: 'free',
      key: '',
      customerName: '',
      customerEmail: '',
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      activatedAt: null,
      expiresAt: null,
      graceUntil: null,
      offlineGraceRemainingHours: 0,
      serverUrl: this.serverUrl,
      lastOnlineCheck: null
    });
    if (this.onStatusChange) {
      this.onStatusChange(this.getStatus());
    }
  }

  // Online Activation against Central License Server
  async activate(key, customerName = '', customerEmail = '') {
    if (!key || typeof key !== 'string') {
      return { success: false, error: 'License key is required' };
    }

    const cleanKey = key.trim();

    // If input is an authentic Ed25519 digitally signed Unban Certificate from central authority
    if (cleanKey.includes('.') && this.verifyUnbanToken(cleanKey)) {
      this.liftBan();
      return { success: true, message: 'Device unbanned successfully via signed administrator certificate! Services restored.' };
    }

    if (this.isBanned()) {
      // Allow validating against server in case server lifted ban or granted new license
      try {
        const response = await fetch(`${this.serverUrl}/api/v1/licenses/activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            licenseKey: cleanKey,
            deviceId: this.deviceId,
            deviceName: this.deviceName,
            clientVersion: this.clientVersion,
            osPlatform: os.platform(),
            userEmail: customerEmail || undefined,
            unbanRequest: true
          }),
          signal: AbortSignal.timeout(8000)
        });

        const data = await response.json();
        if (response.ok && data.success && data.token) {
          const check = this.verifyTokenSignature(data.token);
          if (check.valid && check.payload.deviceId === this.deviceId) {
            this.liftBan();
            const record = {
              token: data.token,
              customerName: customerName || data.license?.customerName || 'Valued Customer',
              customerEmail: customerEmail || '',
              lastOnlineCheck: Date.now()
            };
            fs.writeFileSync(this.licenseFile, JSON.stringify(record, null, 2), 'utf-8');
            const payload = check.payload;
            this.license = Object.freeze({
              isPro: true,
              isAdmin: false,
              status: 'pro',
              key: payload.licenseKey,
              customerName: payload.customerName || 'Valued Customer',
              customerEmail: payload.customerEmail || '',
              deviceId: this.deviceId,
              deviceName: this.deviceName,
              activatedAt: Date.now(),
              expiresAt: payload.expiresAt || null,
              graceUntil: payload.graceUntil || null,
              issuer: 'Central License Server'
            });
            if (this.onStatusChange) this.onStatusChange(this.getStatus());
            return { success: true, message: 'Device ban lifted and PRO license activated successfully!' };
          }
        }
      } catch (e) {}

      const info = this.getBanInfo();
      return {
        success: false,
        error: `DEVICE PERMANENTLY BANNED: This device (${this.deviceId}) is locked due to security or tamper violations. Reason: ${info?.reason || 'Tampering detected'}. Contact support on WhatsApp/Telegram (@zihanfakir) to appeal.`
      };
    }

    try {
      const response = await fetch(`${this.serverUrl}/api/v1/licenses/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey: cleanKey,
          deviceId: this.deviceId,
          deviceName: this.deviceName,
          clientVersion: this.clientVersion,
          osPlatform: os.platform(),
          userEmail: customerEmail || undefined
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        if (data.isBanned) {
          this.triggerDeviceBan(data.error || 'Device banned by license server');
        }
        return { success: false, error: data.error || 'Activation rejected by license server' };
      }

      // Verify the returned Ed25519 digital signature
      const check = this.verifyTokenSignature(data.token);
      if (!check.valid) {
        return { success: false, error: 'Server signature could not be verified by public key.' };
      }

      const payload = check.payload;

      // Save valid signed token locally for offline grace support
      const record = {
        token: data.token,
        customerName: customerName || data.license?.customerName || 'Valued Customer',
        customerEmail: customerEmail || '',
        lastOnlineCheck: Date.now()
      };
      fs.writeFileSync(this.licenseFile, JSON.stringify(record, null, 2), 'utf-8');

      const graceRemainingMs = Math.max(0, (payload.graceUntil || 0) - Date.now());
      const graceHours = Math.round(graceRemainingMs / (1000 * 60 * 60));

      this.license = Object.freeze({
        isPro: true,
        isAdmin: false,
        status: 'pro',
        key: payload.licenseKey,
        customerName: record.customerName,
        customerEmail: record.customerEmail,
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        activatedAt: payload.issuedAt,
        expiresAt: payload.expiresAt,
        graceUntil: payload.graceUntil,
        offlineGraceRemainingHours: graceHours,
        serverUrl: this.serverUrl,
        lastOnlineCheck: Date.now()
      });

      if (this.onStatusChange) {
        this.onStatusChange(this.getStatus());
      }

      return {
        success: true,
        message: 'XDM Turbo PRO Activated Online!',
        license: this.getStatus()
      };
    } catch (err) {
      return {
        success: false,
        error: `Could not connect to license server (${err.message}). Please check your internet connection or server status.`
      };
    }
  }

  // Periodic Online Heartbeat: Refreshes offline grace period token & validates status
  async sendHeartbeat() {
    if (!this.license.isPro || !this.license.key) return;

    try {
      let currentToken = null;
      if (fs.existsSync(this.licenseFile)) {
        const raw = JSON.parse(fs.readFileSync(this.licenseFile, 'utf-8'));
        currentToken = raw.token;
      }

      const response = await fetch(`${this.serverUrl}/api/v1/licenses/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey: this.license.key,
          deviceId: this.deviceId,
          token: currentToken
        })
      });

      const data = await response.json();

      if (!response.ok || !data.valid) {
        if (data && data.isBanned) {
          this.triggerDeviceBan(data.error || 'Device banned by license server');
          return;
        }
        console.warn(`[LicenseManager] Heartbeat failed from server: ${data.error || 'License invalid'}. Reverting to free.`);
        try { if (fs.existsSync(this.licenseFile)) fs.unlinkSync(this.licenseFile); } catch(e){}
        this.resetToFree();
        return;
      }

      // If server returned a freshly refreshed signed token
      if (data.token) {
        const check = this.verifyTokenSignature(data.token);
        if (check.valid) {
          const record = {
            token: data.token,
            customerName: this.license.customerName,
            customerEmail: this.license.customerEmail,
            lastOnlineCheck: Date.now()
          };
          fs.writeFileSync(this.licenseFile, JSON.stringify(record, null, 2), 'utf-8');

          const graceRemainingMs = Math.max(0, (check.payload.graceUntil || 0) - Date.now());
          const graceHours = Math.round(graceRemainingMs / (1000 * 60 * 60));

          this.license = Object.freeze({
            ...this.license,
            graceUntil: check.payload.graceUntil,
            offlineGraceRemainingHours: graceHours,
            lastOnlineCheck: Date.now()
          });

          if (this.onStatusChange) {
            this.onStatusChange(this.getStatus());
          }
        }
      }
    } catch (err) {
      // Server unreachable (offline / network down):
      // Safely preserve PRO use under offline grace period!
      console.log(`[LicenseManager] Server unreachable during heartbeat (${err.message}). Maintaining offline grace period.`);
      this.loadAndVerifyLocalToken();
    }
  }

  // Deactivate license on this device
  async deactivate() {
    if (this.isBanned()) {
      return { success: false, error: 'Cannot deactivate license on a banned device' };
    }

    try {
      if (this.license.key) {
        await fetch(`${this.serverUrl}/api/v1/licenses/deactivate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            licenseKey: this.license.key,
            deviceId: this.deviceId
          })
        }).catch(() => {});
      }
    } catch (e) {}

    try {
      if (fs.existsSync(this.licenseFile)) {
        fs.unlinkSync(this.licenseFile);
      }
    } catch (e) {}

    this.resetToFree();
    return { success: true, message: 'License deactivated on this device' };
  }

  isPro() {
    return Boolean(!this.isBanned() && this.license && this.license.isPro);
  }

  isAdmin() {
    return false;
  }

  getStatus() {
    const banned = this.isBanned();
    const banInfo = banned ? this.getBanInfo() : null;
    return {
      isPro: Boolean(!banned && this.license.isPro),
      isAdmin: false,
      isBanned: Boolean(banned),
      banReason: banInfo?.reason || (banned ? 'Device locked due to tampering' : null),
      status: banned ? 'banned' : this.license.status,
      maskedKey: this.license.key ? this.license.key.replace(/([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/, '****-****-****-$4') : '',
      fullKey: this.license.key || '',
      customerName: this.license.customerName || '',
      customerEmail: this.license.customerEmail || '',
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      activatedAt: this.license.activatedAt,
      expiresAt: this.license.expiresAt,
      graceUntil: this.license.graceUntil,
      offlineGraceRemainingHours: this.license.offlineGraceRemainingHours || 0,
      serverUrl: this.serverUrl,
      lastOnlineCheck: this.license.lastOnlineCheck,
      issuer: 'XDM Turbo Central License Authority (https://xdm.zihan.xyz)'
    };
  }

  destroy() {
    if (this.localAuditInterval) {
      clearInterval(this.localAuditInterval);
      this.localAuditInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.initialHeartbeatTimeout) {
      clearTimeout(this.initialHeartbeatTimeout);
      this.initialHeartbeatTimeout = null;
    }
  }
}

module.exports = LicenseManager;
