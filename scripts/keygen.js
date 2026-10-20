/**
 * ⚡ XDM TURBO OFFICIAL CENTRALIZED LICENSE KEY CLI GENERATOR
 * Author: Zihan Fakir (https://xdm.zihan.uk)
 * 
 * Secure, database-backed key generator for XDM Turbo Central Licensing Authority.
 * Generates unique Base32 product keys registered directly in SQLite database.
 * No hardcoded master secret is used.
 * 
 * Usage:
 *   node scripts/keygen.js                                     -> Generates 1 PRO key (1 device limit, Lifetime)
 *   node scripts/keygen.js --admin                             -> Generates 1 MASTER ADMIN Key (64 streams)
 *   node scripts/keygen.js --count 5                           -> Generates 5 PRO keys
 *   node scripts/keygen.js --name "Rahim" --email "r@test.com" -> Issues key with customer metadata
 *   node scripts/keygen.js --devices 3                         -> Allows up to 3 devices on this key
 *   node scripts/keygen.js --verify <KEY>                      -> Inspects key status & bound devices in DB
 */

const db = require('../license-server/src/database');

// Parse CLI flags
const args = process.argv.slice(2);
let count = 1;
let verifyTarget = null;
let isAdmin = args.includes('--admin');
let customerName = null;
let customerEmail = null;
let maxDevices = 1;
let notes = null;
let days = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--count' && args[i + 1]) count = parseInt(args[i + 1], 10) || 1;
  if (args[i] === '--verify' && args[i + 1]) verifyTarget = args[i + 1].trim();
  if (args[i] === '--name' && args[i + 1]) customerName = args[i + 1].trim();
  if (args[i] === '--email' && args[i + 1]) customerEmail = args[i + 1].trim();
  if (args[i] === '--devices' && args[i + 1]) maxDevices = parseInt(args[i + 1], 10) || 1;
  if (args[i] === '--notes' && args[i + 1]) notes = args[i + 1].trim();
  if (args[i] === '--days' && args[i + 1]) days = parseInt(args[i + 1], 10) || null;
}

console.log('================================================================');
console.log('  ⚡ XDM TURBO CENTRAL LICENSE AUTHORITY CLI');
console.log('  🌐 https://xdm.zihan.uk  •  Publisher: Zihan Fakir');
console.log('  🔒 Cryptographic Engine: Asymmetric Ed25519 & SQLite');
console.log('================================================================');

if (verifyTarget) {
  const cleanKey = verifyTarget.trim().toUpperCase();
  const lic = db.getLicenseByKey(cleanKey);

  console.log(`\nInspecting Database Record for: ${cleanKey}`);
  if (!lic) {
    console.log('-> Result: ❌ KEY NOT FOUND IN SYSTEM (Unregistered or Invalid)');
  } else {
    console.log(`-> Status:        ${lic.status.toUpperCase()}`);
    console.log(`-> Edition:       ${lic.edition.toUpperCase()}`);
    console.log(`-> Customer:      ${lic.customer_name || 'N/A'}`);
    console.log(`-> Email:         ${lic.customer_email || 'N/A'}`);
    console.log(`-> Device Limit:  ${lic.max_devices} device(s)`);
    console.log(`-> Created At:    ${new Date(lic.created_at).toLocaleString()}`);
    console.log(`-> Expiration:    ${lic.expires_at ? new Date(lic.expires_at).toLocaleString() : 'Lifetime (No Expiry)'}`);
    
    const devices = db.getDevicesForLicense(lic.id);
    console.log(`\nBound Devices (${devices.length}/${lic.max_devices}):`);
    if (devices.length === 0) {
      console.log('  (No devices activated yet)');
    } else {
      devices.forEach((d, idx) => {
        const lastSeen = new Date(d.last_seen_at).toLocaleString();
        console.log(`  [${idx + 1}] ID: ${d.id} | Name: ${d.device_name} | Active: ${d.is_active ? 'YES' : 'NO'} | Last Seen: ${lastSeen}`);
      });
    }
  }
} else {
  const edition = isAdmin ? 'admin' : 'pro';
  const expiresAt = days ? Date.now() + (days * 24 * 60 * 60 * 1000) : null;

  console.log(`Edition:       ${edition.toUpperCase()}`);
  console.log(`Customer:      ${customerName || 'Direct Customer'}`);
  if (customerEmail) console.log(`Email:         ${customerEmail}`);
  console.log(`Device Limit:  ${maxDevices} device(s)`);
  console.log(`Expiration:    ${expiresAt ? new Date(expiresAt).toLocaleString() : 'Lifetime (Permanent Access)'}`);
  console.log(`Quantity:      ${count} key(s)\n`);

  console.log('Generated Key(s) Registered in Database:');
  for (let i = 1; i <= count; i++) {
    const lic = db.createLicense({
      edition,
      maxDevices,
      customerName,
      customerEmail,
      notes: notes || 'CLI Generated',
      expiresAt
    });
    console.log(`  [${i}] ${lic.key}`);
  }

  console.log('\nActivation Instructions:');
  console.log('1. Open XDM Turbo Desktop.');
  console.log('2. Click on "PRO" badge or Settings > License.');
  console.log('3. Enter the key and activate.');
  console.log('4. The device registers with the central server and receives an Ed25519-signed token.');
}
console.log('================================================================\n');
