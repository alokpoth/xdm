/**
 * XDM TURBO OFFICIAL CENTRALIZED LICENSE KEY CLI GENERATOR
 * Author: Zihan Fakir (https://xdm.zihan.xyz)
 * 
 * Secure, database-backed key generator for XDM Turbo Central Licensing Authority.
 * Generates unique Base32 product keys registered directly in SQLite / Turso database.
 * 
 * Usage:
 *   node scripts/keygen.js                                     -> Generates 1 PRO key (1 device limit, Lifetime)
 *   node scripts/keygen.js --admin                             -> Generates 1 MASTER ADMIN Key (64 streams)
 *   node scripts/keygen.js --duration 3day                     -> Generates 1 PRO key valid for 3 days
 *   node scripts/keygen.js --days 3                            -> Generates 1 PRO key valid for 3 days
 *   node scripts/keygen.js --count 5                           -> Generates 5 PRO keys
 *   node scripts/keygen.js --name "Rahim" --email "r@test.com" -> Issues key with customer metadata
 *   node scripts/keygen.js --devices 3                         -> Allows up to 3 devices on this key
 *   node scripts/keygen.js --verify <KEY>                      -> Inspects key status & bound devices in DB
 *   node scripts/keygen.js --update <KEY> --days 3             -> Updates existing key expiration in DB
 *   node scripts/keygen.js --stats                             -> Inspects database metrics overview
 */

const db = require('../license-server/src/database');

// Parse CLI flags
const args = process.argv.slice(2);
let count = 1;
let verifyTarget = null;
let updateTarget = null;
let showStats = args.includes('--stats');
let isAdmin = args.includes('--admin');
let customerName = null;
let customerEmail = null;
let maxDevices = 1;
let notes = null;
let days = null;
let duration = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--count' && args[i + 1]) count = parseInt(args[i + 1], 10) || 1;
  if (args[i] === '--verify' && args[i + 1]) verifyTarget = args[i + 1].trim();
  if (args[i] === '--update' && args[i + 1]) updateTarget = args[i + 1].trim();
  if (args[i] === '--name' && args[i + 1]) customerName = args[i + 1].trim();
  if (args[i] === '--email' && args[i + 1]) customerEmail = args[i + 1].trim();
  if (args[i] === '--devices' && args[i + 1]) maxDevices = parseInt(args[i + 1], 10) || 1;
  if (args[i] === '--notes' && args[i + 1]) notes = args[i + 1].trim();
  if (args[i] === '--days' && args[i + 1]) days = parseInt(args[i + 1], 10) || null;
  if ((args[i] === '--duration' || args[i] === '-d') && args[i + 1]) duration = args[i + 1].trim();
}

async function main() {
  await db.ready();

  console.log('================================================================');
  console.log('  XDM TURBO CENTRAL LICENSE AUTHORITY CLI');
  console.log('  https://xdm.zihan.xyz  |  Publisher: Zihan Fakir');
  console.log(`  Database Engine: ${db.isTurso ? 'Turso libSQL Cloud' : 'SQLite Local File'}`);
  console.log('================================================================');

  if (showStats) {
    const metrics = await db.getOverviewMetrics();
    console.log('\nSystem Metrics Overview:');
    console.log(`-> Total Registered Licenses: ${metrics.totalLicenses}`);
    console.log(`-> Active Licenses:           ${metrics.activeLicenses}`);
    console.log(`-> Suspended Licenses:        ${metrics.suspendedLicenses}`);
    console.log(`-> Revoked Licenses:          ${metrics.revokedLicenses}`);
    console.log(`-> Total Active Devices:      ${metrics.totalDevices}`);
    console.log(`-> Banned Devices:            ${metrics.bannedDevices}`);
    console.log(`-> Online Right Now (2 min):  ${metrics.onlineDevicesNow}`);
    console.log(`-> Active Last 24 Hours:      ${metrics.devicesSeen24h}`);
    console.log('================================================================\n');
    return;
  }

  if (updateTarget) {
    const cleanKey = updateTarget.trim().toUpperCase();
    const lic = await db.getLicenseByKey(cleanKey);
    if (!lic) {
      console.log(`Error: License key ${cleanKey} not found in database.`);
      return;
    }
    let newExpiresAt = null;
    const now = Date.now();
    if (days !== null) {
      newExpiresAt = now + (days * 24 * 60 * 60 * 1000);
    } else if (duration) {
      const dur = String(duration).toLowerCase().trim();
      if (dur === '3day' || dur === '3days' || dur === '3d') newExpiresAt = now + (3 * 24 * 60 * 60 * 1000);
      else if (dur === '7day' || dur === '7days' || dur === '7d') newExpiresAt = now + (7 * 24 * 60 * 60 * 1000);
      else if (dur === '14day' || dur === '14days' || dur === '14d') newExpiresAt = now + (14 * 24 * 60 * 60 * 1000);
      else if (dur === '1month' || dur === '30day' || dur === '30days') newExpiresAt = now + (30 * 24 * 60 * 60 * 1000);
      else if (dur === '3month' || dur === '90day' || dur === '90days') newExpiresAt = now + (90 * 24 * 60 * 60 * 1000);
      else if (dur === '6month' || dur === '180day' || dur === '180days') newExpiresAt = now + (180 * 24 * 60 * 60 * 1000);
      else if (dur === '1year' || dur === '365day' || dur === '365days') newExpiresAt = now + (365 * 24 * 60 * 60 * 1000);
      else if (dur === 'lifetime') newExpiresAt = null;
    }
    const updated = await db.updateLicenseExpiresAt(lic.id, newExpiresAt);
    console.log(`Successfully updated license: ${cleanKey}`);
    console.log(`New Expiration: ${updated.expires_at ? new Date(updated.expires_at).toLocaleString() : 'Lifetime (No Expiry)'}`);
    console.log('================================================================\n');
    return;
  }

  if (verifyTarget) {
    const cleanKey = verifyTarget.trim().toUpperCase();
    const lic = await db.getLicenseByKey(cleanKey);

    console.log(`\nInspecting Database Record for: ${cleanKey}`);
    if (!lic) {
      console.log('-> Result: KEY NOT FOUND IN SYSTEM (Unregistered or Invalid)');
    } else {
      console.log(`-> Status:        ${lic.status.toUpperCase()}`);
      console.log(`-> Edition:       ${lic.edition.toUpperCase()}`);
      console.log(`-> Customer:      ${lic.customer_name || 'N/A'}`);
      console.log(`-> Email:         ${lic.customer_email || 'N/A'}`);
      console.log(`-> Device Limit:  ${lic.max_devices} device(s)`);
      console.log(`-> Created At:    ${new Date(lic.created_at).toLocaleString()}`);
      console.log(`-> Expiration:    ${lic.expires_at ? new Date(lic.expires_at).toLocaleString() : 'Lifetime (No Expiry)'}`);
      
      const devices = await db.getDevicesForLicense(lic.id);
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
    const licDuration = duration || (days ? `${days}day` : null);

    console.log(`Edition:       ${edition.toUpperCase()}`);
    console.log(`Customer:      ${customerName || 'Direct Customer'}`);
    if (customerEmail) console.log(`Email:         ${customerEmail}`);
    console.log(`Device Limit:  ${maxDevices} device(s)`);
    console.log(`Duration:      ${licDuration || 'Lifetime (Permanent Access)'}`);
    console.log(`Quantity:      ${count} key(s)\n`);

    console.log('Generated Key(s) Registered in Database:');
    for (let i = 1; i <= count; i++) {
      const lic = await db.createLicense({
        edition,
        maxDevices,
        customerName,
        customerEmail,
        notes: notes || 'CLI Generated',
        duration: licDuration,
        days: days
      });
      console.log(`  [${i}] ${lic.key} (Expires: ${lic.expires_at ? new Date(lic.expires_at).toLocaleString() : 'Lifetime'})`);
    }

    console.log('\nActivation Instructions:');
    console.log('1. Open XDM Turbo Desktop.');
    console.log('2. Click on "PRO" badge or Settings > License.');
    console.log('3. Enter the key and activate.');
    console.log('4. The device registers with the central server and receives an Ed25519-signed token.');
  }
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('CLI Execution Error:', err);
  process.exit(1);
});
