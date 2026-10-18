/**
 * ?? XDM TURBO OFFICIAL LICENSE KEY GENERATOR
 * Author: Zihan Fakir (https://xdm.zihan.uk)
 * 
 * Usage:
 *   node scripts/keygen.js                         -> Generates 1 Universal PRO Lifetime key (1-device bound on activation)
 *   node scripts/keygen.js --count 5               -> Generates 5 PRO keys
 *   node scripts/keygen.js --device XDM-DEV-XXXX-XXXX-XXXX -> Generates a key pre-locked to a specific customer PC
 *   node scripts/keygen.js --verify <KEY>          -> Checks if a key is authentic
 */

const crypto = require('crypto');

const MASTER_SECRET = 'ZH_XDM_TURBO_2026_MASTER_SECRET_KEY_BY_ZIHAN_FAKIR_DEV_LOCK_32STREAM';

function generateRandomHex(len) {
  return crypto.randomBytes(len).toString('hex').toUpperCase();
}

function generateProKey(deviceLockId = null) {
  let type = 'PRO';
  let p1, p2;

  if (deviceLockId) {
    type = 'LOCK';
    // Clean device ID
    const cleanDev = deviceLockId.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    p1 = cleanDev.substring(6, 10) || generateRandomHex(2); // 4 hex
    p2 = generateRandomHex(2); // 4 hex
  } else {
    p1 = generateRandomHex(2); // 4 hex
    p2 = generateRandomHex(2); // 4 hex
  }

  const payload = `${p1}-${p2}`;
  const sig = crypto.createHmac('sha256', MASTER_SECRET)
    .update(`${type}::${payload}`)
    .digest('hex')
    .substring(0, 8)
    .toUpperCase();

  const p3 = sig.substring(0, 4);
  const p4 = sig.substring(4, 8);

  return `XDM-${type}-${p1}-${p2}-${p3}-${p4}`;
}

function verifyKey(key) {
  if (!key) return { valid: false, message: 'No key provided' };
  const parts = key.trim().toUpperCase().split('-');
  if (parts.length !== 6 || parts[0] !== 'XDM') {
    return { valid: false, message: 'Invalid structure' };
  }
  const type = parts[1];
  const payload = `${parts[2]}-${parts[3]}`;
  const expectedSig = crypto.createHmac('sha256', MASTER_SECRET)
    .update(`${type}::${payload}`)
    .digest('hex')
    .substring(0, 8)
    .toUpperCase();

  const actualSig = `${parts[4]}${parts[5]}`;
  return {
    valid: actualSig === expectedSig,
    type,
    payload
  };
}

// Parse CLI flags
const args = process.argv.slice(2);
let count = 1;
let deviceId = null;
let verifyTarget = null;
let customer = 'Direct Buyer';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--count' && args[i + 1]) count = parseInt(args[i + 1], 10) || 1;
  if (args[i] === '--device' && args[i + 1]) deviceId = args[i + 1].trim();
  if (args[i] === '--verify' && args[i + 1]) verifyTarget = args[i + 1].trim();
  if (args[i] === '--name' && args[i + 1]) customer = args[i + 1].trim();
}

console.log('================================================================');
console.log('  ⚡ XDM TURBO OFFICIAL LICENSE SYSTEM (by Zihan Fakir)');
console.log('  🌐 https://xdm.zihan.uk  •  Publisher: Zihan Fakir');
console.log('================================================================');

if (verifyTarget) {
  const res = verifyKey(verifyTarget);
  console.log(`\nVerifying Key: ${verifyTarget}`);
  console.log(`-> Result: ${res.valid ? '✅ VALID & GENUINE' : '❌ INVALID / COUNTERFEIT'}`);
  if (res.valid) {
    console.log(`-> Type: ${res.type === 'LOCK' ? 'Hardware Locked Key' : 'Universal 1-Device Key'}`);
  }
} else {
  console.log(`Customer: ${customer}`);
  console.log(`Target Hardware: ${deviceId ? deviceId + ' (Device Locked)' : 'Any 1 PC (Locks on activation)'}`);
  console.log(`License Type: PRO LIFETIME (32 Streams, 4K 60fps, Unlimited Speed)\n`);
  console.log(`Generated Key(s):`);

  for (let i = 1; i <= count; i++) {
    const key = generateProKey(deviceId);
    console.log(`  [${i}] ${key}`);
  }

  console.log('\nInstructions for Buyer:');
  console.log('1. Open XDM Turbo.');
  console.log('2. Click on "Activate PRO" or the "PRO" badge.');
  console.log('3. Enter the key and click "Activate PRO License".');
  console.log('4. The software will bind to their device and unlock all PRO features!');
}
console.log('================================================================\n');
