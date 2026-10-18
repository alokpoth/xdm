const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

const MASTER_SECRET = 'ZH_XDM_TURBO_2026_MASTER_SECRET_KEY_BY_ZIHAN_FAKIR_DEV_LOCK_32STREAM';

class LicenseManager {
  constructor(options = {}) {
    this.storageDir = options.storageDir || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.xdm');
    this.licenseFile = path.join(this.storageDir, 'license.xdm');
    this.hardwareId = this.computeHardwareId();

    // Default license state
    this.license = {
      isPro: false,
      status: 'free', // 'free', 'trial', 'pro'
      key: '',
      customerName: '',
      hardwareId: this.hardwareId,
      activatedAt: null,
      expiresAt: null, // null = lifetime
      deviceLocked: true
    };

    this.onStatusChange = null;

    this.ensureStorage();
    this.loadAndVerify();

    // 1-minute periodic check as requested by user ("1minite pore pore key check korbe")
    this.checkInterval = setInterval(() => {
      this.verifyLicense();
    }, 60 * 1000);
  }

  ensureStorage() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
    } catch (e) {}
  }

  // 100% Unique & Stable Hardware Fingerprint on Windows
  computeHardwareId() {
    try {
      if (process.platform === 'win32') {
        const stdout = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 4000
        }).toString();
        const match = stdout.match(/MachineGuid\s+REG_SZ\s+([a-f0-9-]+)/i);
        if (match && match[1]) {
          const guid = match[1].trim();
          const raw = `XDM_HWID_${guid}_${os.hostname()}`;
          const hash = crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
          return `XDM-DEV-${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(8, 12)}`;
        }
      }
    } catch (e) {}

    // Fallback for non-windows or restricted environments
    const fallbackRaw = `XDM_FALLBACK_${os.hostname()}_${os.platform()}_${os.arch()}_${process.env.USERNAME || 'USER'}`;
    const hash = crypto.createHash('sha256').update(fallbackRaw).digest('hex').toUpperCase();
    return `XDM-DEV-${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(8, 12)}`;
  }

  // Cryptographic signature of key + hardwareId
  generateDeviceStamp(key, hardwareId) {
    return crypto.createHmac('sha256', MASTER_SECRET)
      .update(`${key.trim().toUpperCase()}::${hardwareId.trim().toUpperCase()}`)
      .digest('hex');
  }

  // Validate key syntax & cryptographic checksum
  validateKeyFormat(key) {
    if (!key || typeof key !== 'string') return { valid: false, message: 'License key is required' };
    const cleanKey = key.trim().toUpperCase();
    const parts = cleanKey.split('-');

    // Supported formats:
    // 1) Universal PRO key: XDM-PRO-XXXX-XXXX-XXXX-XXXX (6 segments)
    // 2) Device-Locked key: XDM-LOCK-XXXX-XXXX-XXXX-XXXX (6 segments)
    // 3) Master Admin key: XDM-ADMIN-XXXX-XXXX-XXXX-XXXX (6 segments)
    if (parts.length !== 6 || parts[0] !== 'XDM') {
      return { valid: false, message: 'Invalid key format. Must be XDM-PRO-... or XDM-ADMIN-...' };
    }

    const type = parts[1];
    if (type !== 'PRO' && type !== 'LOCK' && type !== 'ADMIN') {
      return { valid: false, message: 'Unrecognized license type' };
    }

    const payload = `${parts[2]}-${parts[3]}`;
    const signature = `${parts[4]}${parts[5]}`;

    // Verify HMAC
    const expectedSig = crypto.createHmac('sha256', MASTER_SECRET)
      .update(`${type}::${payload}`)
      .digest('hex')
      .substring(0, 8)
      .toUpperCase();

    if (signature !== expectedSig) {
      return { valid: false, message: 'Invalid license signature or counterfeit key' };
    }

    return { valid: true, type, payload };
  }

  // Activate license on THIS device
  activate(key, customerName = 'Valued Customer') {
    const formatCheck = this.validateKeyFormat(key);
    if (!formatCheck.valid) {
      return { success: false, error: formatCheck.message };
    }

    const cleanKey = key.trim().toUpperCase();
    const currentHwId = this.computeHardwareId();
    const isAdmin = formatCheck.type === 'ADMIN';

    // Check if key is device-locked to another hardware ID
    if (formatCheck.type === 'LOCK') {
      const parts = cleanKey.split('-');
      const targetDevShort = parts[2]; // first 4 hex of device hash
      const currentShort = currentHwId.replace('XDM-DEV-', '').substring(0, 4);
      if (targetDevShort !== currentShort) {
        return {
          success: false,
          error: `This license key is locked to another device (${targetDevShort}...). It cannot be used on this PC.`
        };
      }
    }

    // Create device binding stamp
    const stamp = this.generateDeviceStamp(cleanKey, currentHwId);

    const licenseData = {
      isPro: true,
      isAdmin: isAdmin,
      status: isAdmin ? 'admin' : 'pro',
      key: cleanKey,
      customerName: isAdmin ? (customerName || 'Zihan Fakir (Owner & Developer)') : (customerName || 'Valued Customer'),
      hardwareId: currentHwId,
      stamp: stamp,
      activatedAt: Date.now(),
      expiresAt: null, // Lifetime license
      deviceLocked: !isAdmin
    };

    try {
      // Save encrypted license file
      const cipher = crypto.createCipheriv('aes-256-cbc', crypto.scryptSync(MASTER_SECRET, 'xdm_salt', 32), Buffer.alloc(16, 0));
      let encrypted = cipher.update(JSON.stringify(licenseData), 'utf-8', 'hex');
      encrypted += cipher.final('hex');

      fs.writeFileSync(this.licenseFile, JSON.stringify({ data: encrypted }), 'utf-8');
      this.license = licenseData;

      if (this.onStatusChange) {
        this.onStatusChange(this.getStatus());
      }

      return {
        success: true,
        message: 'XDM Turbo PRO Lifetime successfully activated on this device!',
        license: this.getStatus()
      };
    } catch (err) {
      return { success: false, error: 'Failed to write activation record: ' + err.message };
    }
  }

  // Load and verify license from local storage
  loadAndVerify() {
    try {
      if (!fs.existsSync(this.licenseFile)) {
        this.license.isPro = false;
        this.license.status = 'free';
        return;
      }

      const raw = JSON.parse(fs.readFileSync(this.licenseFile, 'utf-8'));
      if (!raw || !raw.data) {
        this.license.isPro = false;
        this.license.status = 'free';
        return;
      }

      // Decrypt
      const decipher = crypto.createDecipheriv('aes-256-cbc', crypto.scryptSync(MASTER_SECRET, 'xdm_salt', 32), Buffer.alloc(16, 0));
      let decrypted = decipher.update(raw.data, 'hex', 'utf-8');
      decrypted += decipher.final('utf-8');

      const data = JSON.parse(decrypted);

      // Verify device binding (Strict 1-Device Check for non-admin)
      const currentHwId = this.computeHardwareId();
      if (!data.isAdmin && data.hardwareId !== currentHwId) {
        console.warn(`[License] Hardware ID mismatch! Stored: ${data.hardwareId}, Current: ${currentHwId}. Reverting to free.`);
        this.license.isPro = false;
        this.license.isAdmin = false;
        this.license.status = 'free';
        this.license.error = 'License is bound to another device';
        return;
      }

      // Verify cryptographic stamp
      const stampTargetHwId = data.isAdmin ? data.hardwareId : currentHwId;
      const expectedStamp = this.generateDeviceStamp(data.key, stampTargetHwId);
      if (data.stamp !== expectedStamp) {
        console.warn('[License] Cryptographic device stamp tampered! Reverting to free.');
        this.license.isPro = false;
        this.license.isAdmin = false;
        this.license.status = 'free';
        this.license.error = 'License stamp invalid';
        return;
      }

      // Verify expiration (if any)
      if (data.expiresAt && Date.now() > data.expiresAt) {
        this.license.isPro = false;
        this.license.isAdmin = false;
        this.license.status = 'expired';
        return;
      }

      this.license = {
        ...data,
        isPro: true,
        isAdmin: Boolean(data.isAdmin),
        status: data.isAdmin ? 'admin' : 'pro'
      };
    } catch (err) {
      this.license.isPro = false;
      this.license.isAdmin = false;
      this.license.status = 'free';
    }
  }

  // 1-minute verification routine
  verifyLicense() {
    const prevStatus = this.license.isPro;
    this.loadAndVerify();
    if (prevStatus !== this.license.isPro) {
      console.log(`[License Check] Status changed to ${this.license.isPro ? 'PRO' : 'FREE'}`);
      if (this.onStatusChange) {
        this.onStatusChange(this.getStatus());
      }
    }
  }

  // Deactivate license on this device
  deactivate() {
    try {
      if (fs.existsSync(this.licenseFile)) {
        fs.unlinkSync(this.licenseFile);
      }
    } catch (e) {}

    this.license = {
      isPro: false,
      isAdmin: false,
      status: 'free',
      key: '',
      customerName: '',
      hardwareId: this.computeHardwareId(),
      activatedAt: null,
      expiresAt: null,
      deviceLocked: true
    };

    if (this.onStatusChange) {
      this.onStatusChange(this.getStatus());
    }

    return { success: true, message: 'License deactivated successfully' };
  }

  // Safe status object for frontend
  getStatus() {
    return {
      isPro: this.license.isPro,
      isAdmin: Boolean(this.license.isAdmin),
      status: this.license.status,
      maskedKey: this.license.key ? this.license.key.replace(/([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/, '****-****-****-$4') : '',
      fullKey: this.license.key || '',
      customerName: this.license.customerName || '',
      hardwareId: this.hardwareId,
      activatedAt: this.license.activatedAt,
      expiresAt: this.license.expiresAt,
      checkIntervalSeconds: 60,
      issuer: 'Zihan Fakir (https://xdm.zihan.uk)'
    };
  }
}

module.exports = LicenseManager;
