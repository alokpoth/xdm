const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../data');
const PRIVATE_KEY_FILE = path.join(DATA_DIR, 'ed25519_private.pem');
const PUBLIC_KEY_FILE = path.join(DATA_DIR, 'ed25519_public.pem');

class LicenseCrypto {
  constructor() {
    this.ensureKeys();
  }

  ensureKeys() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (process.env.ED25519_PRIVATE_KEY && process.env.ED25519_PUBLIC_KEY) {
      this.privateKey = process.env.ED25519_PRIVATE_KEY.replace(/\\n/g, '\n');
      this.publicKey = process.env.ED25519_PUBLIC_KEY.replace(/\\n/g, '\n');
      return;
    }

    if (fs.existsSync(PRIVATE_KEY_FILE) && fs.existsSync(PUBLIC_KEY_FILE)) {
      this.privateKey = fs.readFileSync(PRIVATE_KEY_FILE, 'utf-8');
      this.publicKey = fs.readFileSync(PUBLIC_KEY_FILE, 'utf-8');
      return;
    }

    // Generate new Ed25519 keypair
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    });

    this.privateKey = privateKey;
    this.publicKey = publicKey;

    try {
      fs.writeFileSync(PRIVATE_KEY_FILE, privateKey, { mode: 0o600 });
      fs.writeFileSync(PUBLIC_KEY_FILE, publicKey, { mode: 0o644 });
    } catch (e) {
      console.warn('[LicenseCrypto] Could not write keys to disk:', e.message);
    }
  }

  getPublicKey() {
    return this.publicKey;
  }

  // Generate unique formatted product license key
  generateLicenseKey(prefix = 'PRO') {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Base32 unambiguous charset (no 0, 1, I, O)
    const randomChunk = (len) => {
      const bytes = crypto.randomBytes(len);
      let res = '';
      for (let i = 0; i < len; i++) {
        res += chars[bytes[i] % chars.length];
      }
      return res;
    };
    return `XDM-${prefix.toUpperCase()}-${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}`;
  }

  // Sign payload using Ed25519 Private Key
  signLicensePayload(payload) {
    const rawData = JSON.stringify(payload);
    const dataBuffer = Buffer.from(rawData, 'utf-8');
    const signature = crypto.sign(null, dataBuffer, this.privateKey);

    const payloadB64 = dataBuffer.toString('base64url');
    const signatureB64 = signature.toString('base64url');

    return `${payloadB64}.${signatureB64}`;
  }

  // Verify signed token using Ed25519 Public Key
  verifyLicenseToken(token, externalPublicKey = null) {
    if (!token || typeof token !== 'string' || !token.includes('.')) {
      return { valid: false, error: 'Malformed token structure' };
    }

    const [payloadB64, signatureB64] = token.split('.');
    try {
      const dataBuffer = Buffer.from(payloadB64, 'base64url');
      const signatureBuffer = Buffer.from(signatureB64, 'base64url');
      const pubKey = externalPublicKey || this.publicKey;

      const isValid = crypto.verify(null, dataBuffer, pubKey, signatureBuffer);
      if (!isValid) {
        return { valid: false, error: 'Cryptographic signature verification failed (tampered token)' };
      }

      const payload = JSON.parse(dataBuffer.toString('utf-8'));
      return { valid: true, payload };
    } catch (err) {
      return { valid: false, error: 'Failed to decode token: ' + err.message };
    }
  }

  // Password hashing using scrypt with random salt
  hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  verifyPassword(password, storedCombined) {
    if (!storedCombined || !storedCombined.includes(':')) return false;
    const [salt, expectedHash] = storedCombined.split(':');
    const calculatedHash = crypto.scryptSync(password, salt, 64).toString('hex');
    const calcBuf = Buffer.from(calculatedHash, 'hex');
    const expBuf = Buffer.from(expectedHash, 'hex');
    if (calcBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(calcBuf, expBuf);
  }

  generateId(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
  }
}

module.exports = new LicenseCrypto();
