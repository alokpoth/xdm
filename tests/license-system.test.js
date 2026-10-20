process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Load license server modules
const cryptoHelper = require('../license-server/src/crypto');
const db = require('../license-server/src/database');
const { app } = require('../license-server/server');
const LicenseManager = require('../server/engine/LicenseManager');

const TEST_PORT = 19688;
const SERVER_URL = `http://127.0.0.1:${TEST_PORT}`;

let serverInstance = null;
let adminToken = '';
let primaryLicenseKey = '';
let primaryLicenseId = '';

test.before(async () => {
  // Clear any existing bans for clean test isolation
  try {
    await db.ready();
    await db.exec('DELETE FROM device_security');
  } catch (e) {}
  // Start server on test port
  await new Promise((resolve, reject) => {
    serverInstance = app.listen(TEST_PORT, () => {
      console.log(`[Test Server] Running on ${SERVER_URL}`);
      resolve();
    });
    serverInstance.on('error', reject);
  });

  // Admin login to get bearer token for subsequent admin tests
  const loginRes = await fetch(`${SERVER_URL}/api/v1/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'zihan2026' })
  });
  const loginData = await loginRes.json();
  assert.equal(loginRes.status, 200);
  assert.equal(loginData.success, true);
  assert.ok(loginData.token);
  adminToken = loginData.token;
});

test.after(async () => {
  if (serverInstance) {
    await new Promise((resolve) => serverInstance.close(resolve));
    console.log('[Test Server] Stopped.');
  }
});

// Helper: create a license via Admin API
async function createTestLicense(opts = {}) {
  const res = await fetch(`${SERVER_URL}/api/v1/admin/licenses`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      edition: opts.edition || 'pro',
      maxDevices: opts.maxDevices || 1,
      customerName: opts.customerName || 'Test Customer',
      customerEmail: opts.customerEmail || 'test@example.com',
      notes: opts.notes || 'Automated test license',
      expiresAt: opts.expiresAt || null
    })
  });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  return data.licenses[0];
}

// -----------------------------------------------------------------------------
// 1. CRYPTOGRAPHIC INTEGRITY TESTS
// -----------------------------------------------------------------------------
test('Crypto: Asymmetric Ed25519 payload signing and public verification', () => {
  const payload = {
    licenseId: 'lic_test_123',
    licenseKey: 'XDM-PRO-TEST-1234',
    edition: 'pro',
    deviceId: 'XDM-DEV-A1B2-C3D4-E5F6',
    issuedAt: Date.now(),
    graceUntil: Date.now() + 7 * 86400000
  };

  const token = cryptoHelper.signLicensePayload(payload);
  assert.ok(token.includes('.'), 'Token must contain payload and signature segments separated by dot');

  const pubKey = cryptoHelper.getPublicKey();
  const verifyResult = cryptoHelper.verifyLicenseToken(token, pubKey);
  assert.equal(verifyResult.valid, true);
  assert.equal(verifyResult.payload.licenseKey, 'XDM-PRO-TEST-1234');
});

test('Crypto: Tampered token payload must fail signature verification', () => {
  const payload = { test: 'legit' };
  const token = cryptoHelper.signLicensePayload(payload);
  const [, sigPart] = token.split('.');

  // Tamper with payload segment
  const tamperedPayload = Buffer.from(JSON.stringify({ test: 'hacked', edition: 'admin' })).toString('base64url');
  const tamperedToken = `${tamperedPayload}.${sigPart}`;

  const pubKey = cryptoHelper.getPublicKey();
  const verifyResult = cryptoHelper.verifyLicenseToken(tamperedToken, pubKey);
  assert.equal(verifyResult.valid, false, 'Tampered token must be rejected');
});

test('Crypto: Password hashing with scrypt and timing-safe verification', () => {
  const pass = 'superSecretPassword123!';
  const hash = cryptoHelper.hashPassword(pass);
  assert.ok(hash.includes(':'), 'Hash must contain salt and key');
  assert.equal(cryptoHelper.verifyPassword(pass, hash), true);
  assert.equal(cryptoHelper.verifyPassword('wrongPassword', hash), false);
});

// -----------------------------------------------------------------------------
// 2. ADMIN AUTHENTICATION & ACCESS CONTROL TESTS
// -----------------------------------------------------------------------------
test('Admin Auth: Rejects unauthenticated requests with 401', async () => {
  const res = await fetch(`${SERVER_URL}/api/v1/admin/overview`);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.success, false);
});

test('Admin Auth: Rejects bad credentials with 401', async () => {
  const res = await fetch(`${SERVER_URL}/api/v1/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'wrongPassword999' })
  });
  assert.equal(res.status, 401);
});

test('Admin Auth: Authorized admin can fetch overview metrics', async () => {
  const res = await fetch(`${SERVER_URL}/api/v1/admin/overview`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.metrics);
  assert.ok(typeof data.metrics.totalLicenses === 'number');
});

// -----------------------------------------------------------------------------
// 3. LICENSE GENERATION & QUERY TESTS
// -----------------------------------------------------------------------------
test('Admin License Management: Admin can generate a new 1-device PRO license', async () => {
  const lic = await createTestLicense({
    edition: 'pro',
    maxDevices: 1,
    customerName: 'Automated Test User',
    customerEmail: 'testuser@example.com'
  });

  assert.ok(lic.key.startsWith('XDM-PRO-'));
  assert.equal(lic.max_devices, 1);

  primaryLicenseKey = lic.key;
  primaryLicenseId = lic.id;
});

// -----------------------------------------------------------------------------
// 4. CLIENT ACTIVATION, DEVICE LIMITS & ENGINE INTEGRATION
// -----------------------------------------------------------------------------
test('Client Activation: Activation fails for invalid non-existent key', async () => {
  const testStorageDir = path.join(os.tmpdir(), `xdm_test_${Date.now()}_invalid`);
  const client = new LicenseManager({
    storageDir: testStorageDir,
    serverUrl: SERVER_URL
  });

  const result = await client.activate('XDM-FAKE-0000-0000-0000');
  assert.equal(result.success, false);
  assert.match(result.error, /Invalid license key/i);
  assert.equal(client.isPro(), false);
  client.destroy();
});

test('Client Activation: Device 1 activates successfully with valid key', async () => {
  const testStorageDir = path.join(os.tmpdir(), `xdm_test_${Date.now()}_dev1`);
  const client1 = new LicenseManager({
    storageDir: testStorageDir,
    serverUrl: SERVER_URL
  });
  client1.deviceId = 'XDM-DEV-SLOT1-TEST-0001';

  const result = await client1.activate(primaryLicenseKey, 'Device 1 User', 'dev1@example.com');
  assert.equal(result.success, true);
  assert.equal(client1.isPro(), true);
  assert.equal(client1.getStatus().status, 'pro');
  assert.ok(client1.getStatus().graceUntil > Date.now());

  // Verify token file was written to disk and has valid cryptographic signature
  assert.ok(fs.existsSync(client1.licenseFile));
  const saved = JSON.parse(fs.readFileSync(client1.licenseFile, 'utf-8'));
  const sigCheck = client1.verifyTokenSignature(saved.token);
  assert.equal(sigCheck.valid, true);

  client1.destroy();
});

test('Client Activation: Device 2 is BLOCKED when max_devices = 1', async () => {
  const testStorageDir2 = path.join(os.tmpdir(), `xdm_test_${Date.now()}_dev2`);
  const client2 = new LicenseManager({
    storageDir: testStorageDir2,
    serverUrl: SERVER_URL
  });
  client2.deviceId = 'XDM-DEV-SLOT2-TEST-0002';
  client2.deviceName = 'Secondary Laptop';

  const result = await client2.activate(primaryLicenseKey, 'Device 2 User', 'dev2@example.com');
  assert.equal(result.success, false);
  assert.match(result.error, /Activation limit reached/i);
  assert.equal(client2.isPro(), false);

  client2.destroy();
});

test('Admin Seat Limit: Increasing max_devices permits Device 2 activation', async () => {
  // Admin increases device limit to 2
  const limitRes = await fetch(`${SERVER_URL}/api/v1/admin/licenses/${primaryLicenseId}/limit`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ maxDevices: 2 })
  });
  assert.equal(limitRes.status, 200);

  // Now Device 2 activates successfully
  const testStorageDir2 = path.join(os.tmpdir(), `xdm_test_${Date.now()}_dev2_retry`);
  const client2 = new LicenseManager({
    storageDir: testStorageDir2,
    serverUrl: SERVER_URL
  });
  client2.deviceId = 'XDM-DEV-SLOT2-TEST-0002';
  client2.deviceName = 'Secondary Laptop';

  const result = await client2.activate(primaryLicenseKey, 'Device 2 User');
  assert.equal(result.success, true);
  assert.equal(client2.isPro(), true);

  client2.destroy();
});

// -----------------------------------------------------------------------------
// 5. HEARTBEAT, REMOTE REVOCATION & SUSPENSION
// -----------------------------------------------------------------------------
test('Heartbeat & Suspension: Admin suspends license, client reverts to free on heartbeat', async () => {
  const suspendLic = await createTestLicense({ edition: 'pro', maxDevices: 1, customerName: 'Suspension Tester' });

  const testStorageDir = path.join(os.tmpdir(), `xdm_test_${Date.now()}_suspend`);
  const client = new LicenseManager({
    storageDir: testStorageDir,
    serverUrl: SERVER_URL
  });
  client.deviceId = 'XDM-DEV-SUSP-TEST-0001';

  // Activate
  const actRes = await client.activate(suspendLic.key, 'Suspension Tester');
  assert.equal(actRes.success, true);
  assert.equal(client.isPro(), true);

  // Admin suspends license
  const suspendRes = await fetch(`${SERVER_URL}/api/v1/admin/licenses/${suspendLic.id}/suspend`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason: 'Payment dispute investigation' })
  });
  assert.equal(suspendRes.status, 200);

  // Client performs heartbeat
  await client.sendHeartbeat();

  // Status must be reverted to free
  assert.equal(client.isPro(), false);
  assert.equal(client.getStatus().status, 'free');
  assert.equal(fs.existsSync(client.licenseFile), false, 'License token file should be unlinked upon revocation/suspension');

  client.destroy();
});

test('Admin Resume: Reactivating suspended license allows device to activate again', async () => {
  const resumeLic = await createTestLicense({ edition: 'pro', maxDevices: 1, customerName: 'Resume Tester' });

  // Suspend first
  await fetch(`${SERVER_URL}/api/v1/admin/licenses/${resumeLic.id}/suspend`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });

  // Resume
  const resumeRes = await fetch(`${SERVER_URL}/api/v1/admin/licenses/${resumeLic.id}/resume`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.equal(resumeRes.status, 200);

  const testStorageDir = path.join(os.tmpdir(), `xdm_test_${Date.now()}_resume`);
  const client = new LicenseManager({
    storageDir: testStorageDir,
    serverUrl: SERVER_URL
  });
  client.deviceId = 'XDM-DEV-RESUME-TEST-01';

  const actRes = await client.activate(resumeLic.key, 'Resumed User');
  assert.equal(actRes.success, true);
  assert.equal(client.isPro(), true);

  client.destroy();
});

test('Remote Revocation: Permanent revocation causes heartbeat failure and free downgrade', async () => {
  const revokeLic = await createTestLicense({ edition: 'pro', maxDevices: 1, customerName: 'Revoke Tester' });

  const testStorageDir = path.join(os.tmpdir(), `xdm_test_${Date.now()}_revoke`);
  const client = new LicenseManager({
    storageDir: testStorageDir,
    serverUrl: SERVER_URL
  });
  client.deviceId = 'XDM-DEV-REVOK-TEST-001';

  await client.activate(revokeLic.key, 'Revoke Tester');
  assert.equal(client.isPro(), true);

  // Admin permanently revokes
  const revokeRes = await fetch(`${SERVER_URL}/api/v1/admin/licenses/${revokeLic.id}/revoke`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason: 'Piracy or TOS breach' })
  });
  assert.equal(revokeRes.status, 200);

  // Heartbeat triggers revocation
  await client.sendHeartbeat();
  assert.equal(client.isPro(), false);
  assert.equal(client.getStatus().status, 'free');

  client.destroy();
});

test('Device Unbind: Admin can deactivate a device to free up a slot', async () => {
  const unbindLic = await createTestLicense({ edition: 'pro', maxDevices: 1, customerName: 'Unbind Tester' });

  const devId1 = 'XDM-DEV-UNBIND-SLOT-01';
  const devId2 = 'XDM-DEV-UNBIND-SLOT-02';

  const client1 = new LicenseManager({
    storageDir: path.join(os.tmpdir(), `xdm_test_${Date.now()}_ub1`),
    serverUrl: SERVER_URL
  });
  client1.deviceId = devId1;

  const client2 = new LicenseManager({
    storageDir: path.join(os.tmpdir(), `xdm_test_${Date.now()}_ub2`),
    serverUrl: SERVER_URL
  });
  client2.deviceId = devId2;

  // Activate client1
  const act1 = await client1.activate(unbindLic.key);
  assert.equal(act1.success, true);

  // Client2 is blocked (1/1 slots occupied)
  const act2 = await client2.activate(unbindLic.key);
  assert.equal(act2.success, false);

  // Admin remotely unbinds client1
  const unbindRes = await fetch(`${SERVER_URL}/api/v1/admin/licenses/${unbindLic.id}/devices/${devId1}/deactivate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.equal(unbindRes.status, 200);

  // Now client2 can activate!
  const act2Retry = await client2.activate(unbindLic.key);
  assert.equal(act2Retry.success, true);
  assert.equal(client2.isPro(), true);

  client1.destroy();
  client2.destroy();
});

// -----------------------------------------------------------------------------
// 6. OFFLINE GRACE PERIOD & NETWORK RESILIENCE
// -----------------------------------------------------------------------------
test('Offline Resilience: Client preserves PRO mode during network outage', async () => {
  const offlineLic = await createTestLicense({ edition: 'pro', maxDevices: 1 });

  const testStorageDir = path.join(os.tmpdir(), `xdm_test_${Date.now()}_offline`);
  const client = new LicenseManager({
    storageDir: testStorageDir,
    serverUrl: SERVER_URL,
    publicKey: cryptoHelper.getPublicKey()
  });

  // Activate online first
  await client.activate(offlineLic.key, 'Offline Traveler');
  assert.equal(client.isPro(), true);

  // Simulate total internet outage by pointing serverUrl to non-existent unreachable port
  client.setServerUrl('http://127.0.0.1:9999');

  // Heartbeat attempts to connect, fails gracefully, and keeps PRO enabled
  await client.sendHeartbeat();
  assert.equal(client.isPro(), true, 'Must preserve PRO status during offline grace period');
  assert.ok(client.getStatus().offlineGraceRemainingHours > 0);

  // Restart client completely offline (simulates app boot without internet)
  const offlineBootClient = new LicenseManager({
    storageDir: testStorageDir,
    serverUrl: 'http://127.0.0.1:9999',
    publicKey: cryptoHelper.getPublicKey()
  });
  // Should load stored token, verify signature with local public key, and grant PRO!
  assert.equal(offlineBootClient.isPro(), true);
  assert.equal(offlineBootClient.getStatus().status, 'pro');
  assert.ok(offlineBootClient.getStatus().offlineGraceRemainingHours > 100);

  client.destroy();
  offlineBootClient.destroy();
});

test('Offline Security: Expired grace period forces grace_expired state', () => {
  const testStorageDir = path.join(os.tmpdir(), `xdm_test_${Date.now()}_grace_exp`);
  fs.mkdirSync(testStorageDir, { recursive: true });

  // Fabricate a token whose graceUntil expired 1 hour ago
  const payload = {
    licenseId: 'lic_expired_grace',
    licenseKey: 'XDM-PRO-GRACE-EXP1',
    edition: 'pro',
    deviceId: 'XDM-DEV-GRACE-TEST',
    issuedAt: Date.now() - 8 * 86400000,
    expiresAt: null,
    graceUntil: Date.now() - (60 * 60 * 1000) // 1 hr in past
  };

  const token = cryptoHelper.signLicensePayload(payload);
  fs.writeFileSync(path.join(testStorageDir, 'license_v2.json'), JSON.stringify({
    token,
    customerName: 'Expired Grace User',
    lastOnlineCheck: Date.now() - 8 * 86400000
  }));

  const client = new LicenseManager({
    storageDir: testStorageDir,
    serverUrl: SERVER_URL,
    deviceId: 'XDM-DEV-GRACE-TEST',
    publicKey: cryptoHelper.getPublicKey()
  });
  client.loadAndVerifyLocalToken();

  assert.equal(client.isPro(), false);
  assert.equal(client.getStatus().status, 'grace_expired');

  client.destroy();
});

test('Device Identity Security: Token bound to different device ID is rejected', () => {
  const testStorageDir = path.join(os.tmpdir(), `xdm_test_${Date.now()}_dev_mismatch`);
  fs.mkdirSync(testStorageDir, { recursive: true });

  const payload = {
    licenseId: 'lic_mismatch',
    licenseKey: 'XDM-PRO-MISMATCH-1',
    edition: 'pro',
    deviceId: 'XDM-DEV-ORIGINAL-PC1',
    issuedAt: Date.now(),
    graceUntil: Date.now() + 7 * 86400000
  };

  const token = cryptoHelper.signLicensePayload(payload);
  fs.writeFileSync(path.join(testStorageDir, 'license_v2.json'), JSON.stringify({ token }));

  const client = new LicenseManager({
    storageDir: testStorageDir,
    serverUrl: SERVER_URL,
    deviceId: 'XDM-DEV-COPIED-TO-PC2', // Different device!
    publicKey: cryptoHelper.getPublicKey()
  });
  client.loadAndVerifyLocalToken();

  assert.equal(client.isPro(), false);
  assert.equal(client.isBanned(), true);
  assert.equal(client.getStatus().status, 'banned');

  client.destroy();
});

// -----------------------------------------------------------------------------
// 7. AUDIT LOGS & TELEMETRY PRIVACY
// -----------------------------------------------------------------------------
test('Audit & Privacy: Security events logged without passwords or personal files', async () => {
  const res = await fetch(`${SERVER_URL}/api/v1/admin/audit-logs?limit=20`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(Array.isArray(data.logs));
  assert.ok(data.logs.length > 0);

  // Inspect logged details: must not leak sensitive data
  for (const entry of data.logs) {
    const detailStr = JSON.stringify(entry.details);
    assert.equal(detailStr.includes('password'), false, 'Audit log must never store plain passwords');
  }
});

// -----------------------------------------------------------------------------
// 8. BRUTE-FORCE PROTECTION & AUTOMATIC DEVICE BANNING (10 FAILED ATTEMPTS)
// -----------------------------------------------------------------------------
test('Brute Force: Device is automatically banned after 10 invalid key attempts and cannot activate until admin unbans', async () => {
  const bannedDeviceId = `XDM-DEV-BRUTE-TEST-${Date.now()}`;
  const legitimateLicense = await createTestLicense({ edition: 'pro', maxDevices: 1, customerName: 'Recovery User' });

  // 1. Simulate 9 failed attempts (Warning returned, not banned yet)
  for (let i = 1; i <= 9; i++) {
    const res = await fetch(`${SERVER_URL}/api/v1/licenses/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: `XDM-FAKE-KEY-${i}`,
        deviceId: bannedDeviceId,
        deviceName: 'Brute Force Attacker PC'
      })
    });
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.remainingAttempts, 10 - i);
  }

  // 2. 10th failed attempt triggers automatic device ban (HTTP 403)
  const tenRes = await fetch(`${SERVER_URL}/api/v1/licenses/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      licenseKey: 'XDM-FAKE-KEY-10',
      deviceId: bannedDeviceId,
      deviceName: 'Brute Force Attacker PC'
    })
  });
  assert.equal(tenRes.status, 403);
  const tenData = await tenRes.json();
  assert.equal(tenData.isBanned, true);
  assert.match(tenData.error, /DEVICE BANNED/i);

  // 3. 11th attempt with a 100% VALID LICENSE is STILL REJECTED because device is banned!
  const validAttemptOnBannedDevice = await fetch(`${SERVER_URL}/api/v1/licenses/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      licenseKey: legitimateLicense.key,
      deviceId: bannedDeviceId,
      deviceName: 'Brute Force Attacker PC'
    })
  });
  assert.equal(validAttemptOnBannedDevice.status, 403);
  const blockedData = await validAttemptOnBannedDevice.json();
  assert.equal(blockedData.isBanned, true);
  assert.match(blockedData.error, /Only the administrator can unban this device/i);

  // 4. Admin inspects overview metrics and sees banned count >= 1
  const overviewRes = await fetch(`${SERVER_URL}/api/v1/admin/overview`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const overviewData = await overviewRes.json();
  assert.ok(overviewData.metrics.bannedDevices >= 1);

  // 5. Admin unbans the device via admin API
  const unbanRes = await fetch(`${SERVER_URL}/api/v1/admin/devices/${bannedDeviceId}/unban`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.equal(unbanRes.status, 200);

  // 6. Now device can successfully activate using the legitimate key!
  const testStorageDir = path.join(os.tmpdir(), `xdm_test_${Date.now()}_unbanned`);
  const client = new LicenseManager({
    storageDir: testStorageDir,
    serverUrl: SERVER_URL
  });
  client.deviceId = bannedDeviceId;

  const actRes = await client.activate(legitimateLicense.key, 'Rehabilitated User');
  assert.equal(actRes.success, true);
  assert.equal(client.isPro(), true);

  client.destroy();
});


test('Vercel API Aliases: /api/license/* and /api/admin/* endpoints work identically', async () => {
  const createRes = await fetch(`${SERVER_URL}/api/admin/licenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      edition: 'pro',
      maxDevices: 1,
      customerName: 'Alias Tester',
      customerEmail: 'alias@example.com'
    })
  });
  assert.equal(createRes.status, 200);
  const createData = await createRes.json();
  assert.equal(createData.success, true);
  const aliasLic = createData.licenses[0];

  const actRes = await fetch(`${SERVER_URL}/api/license/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      licenseKey: aliasLic.key,
      deviceId: 'XDM-DEV-ALIAS-PC1',
      deviceName: 'Alias PC'
    })
  });
  assert.equal(actRes.status, 200);
  const actData = await actRes.json();
  assert.equal(actData.success, true);
  assert.ok(actData.token);

  const hbRes = await fetch(`${SERVER_URL}/api/license/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      licenseKey: aliasLic.key,
      deviceId: 'XDM-DEV-ALIAS-PC1'
    })
  });
  assert.equal(hbRes.status, 200);
  const hbData = await hbRes.json();
  assert.equal(hbData.valid, true);

  const revRes = await fetch(`${SERVER_URL}/api/admin/licenses/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      key: aliasLic.key,
      reason: 'Alias revoke test'
    })
  });
  assert.equal(revRes.status, 200);

  const hbPostRev = await fetch(`${SERVER_URL}/api/license/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      licenseKey: aliasLic.key,
      deviceId: 'XDM-DEV-ALIAS-PC1'
    })
  });
  assert.equal(hbPostRev.status, 403);
});

test('Concurrency: Parallel activations on a 1-device key ensure strict atomic seat limit', async () => {
  const lic = await createTestLicense({ maxDevices: 1, customerName: 'Concurrency Test' });

  const attempts = [
    fetch(`${SERVER_URL}/api/v1/licenses/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: lic.key, deviceId: 'XDM-DEV-RACE-01' })
    }),
    fetch(`${SERVER_URL}/api/v1/licenses/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: lic.key, deviceId: 'XDM-DEV-RACE-02' })
    }),
    fetch(`${SERVER_URL}/api/v1/licenses/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: lic.key, deviceId: 'XDM-DEV-RACE-03' })
    })
  ];

  const results = await Promise.all(attempts);
  const statuses = results.map(r => r.status);

  const successCount = statuses.filter(s => s === 200).length;
  const blockedCount = statuses.filter(s => s === 403).length;

  assert.equal(successCount, 1, 'Exactly one concurrent request must win the single seat');
  assert.equal(blockedCount, 2, 'Other concurrent requests must be rejected with 403');
});

test('Anti-Backdoor: Client strictly rejects activation when server denies fake key', async () => {
  const testStorageDir = path.join(os.tmpdir(), `xdm_test_${Date.now()}_nobackdoor`);
  const client = new LicenseManager({
    storageDir: testStorageDir,
    serverUrl: SERVER_URL
  });

  const res = await client.activate('XDM-FAKE-NONEXISTENT-KEY', 'Pirate User');
  assert.equal(res.success, false);
  assert.equal(client.isPro(), false);
  assert.equal(client.getStatus().status, 'free');

  client.destroy();
});

test('Stateless HMAC Admin Auth: Rejects forged or expired admin tokens', async () => {
  const forgedToken = 'xdm_adm_eyJhZG1pbklkIjoiYWRtaW5fcm9vdCIsInVzZXJuYW1lIjoiYWRtaW4iLCJyb2xlIjoic3VwZXJhZG1pbiIsImV4cCI6OTk5OTk5OTk5OTk5OX0.FORGED_INVALID_SIGNATURE';
  const resForged = await fetch(`${SERVER_URL}/api/v1/admin/overview`, {
    headers: { 'Authorization': `Bearer ${forgedToken}` }
  });
  assert.equal(resForged.status, 401);

  const resMalformed = await fetch(`${SERVER_URL}/api/v1/admin/overview`, {
    headers: { 'Authorization': 'Bearer random_garbage' }
  });
  assert.equal(resMalformed.status, 401);
});


test('Admin Password Change: Validates current password, updates hash, and requires new password on login', async () => {
  // 1. Rejects wrong current password
  const failRes = await fetch(`${SERVER_URL}/api/v1/admin/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ currentPassword: 'wrongpassword', newPassword: 'newsecurepass123' })
  });
  assert.equal(failRes.status, 400);

  // 2. Succeeds with correct current password
  const successRes = await fetch(`${SERVER_URL}/api/v1/admin/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ currentPassword: 'zihan2026', newPassword: 'newsecurepass123' })
  });
  assert.equal(successRes.status, 200);
  const successData = await successRes.json();
  assert.equal(successData.success, true);
  assert.ok(successData.token);

  // 3. Old password fails login
  const oldLoginRes = await fetch(`${SERVER_URL}/api/v1/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'zihan2026' })
  });
  assert.equal(oldLoginRes.status, 401);

  // 4. New password succeeds login
  const newLoginRes = await fetch(`${SERVER_URL}/api/v1/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'newsecurepass123' })
  });
  assert.equal(newLoginRes.status, 200);
  const newLoginData = await newLoginRes.json();
  assert.equal(newLoginData.success, true);
  assert.ok(newLoginData.token);

  // 5. Restore default password so other operations remain consistent
  const restoreRes = await fetch(`${SERVER_URL}/api/v1/admin/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${newLoginData.token}`
    },
    body: JSON.stringify({ currentPassword: 'newsecurepass123', newPassword: 'zihan2026' })
  });
  assert.equal(restoreRes.status, 200);
});
