const BASE = 'https://xdm.zihan.xyz';

async function runFullAudit() {
  const results = [];
  const log = (name, pass, detail) => {
    results.push({ name, pass, detail });
    console.log((pass ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' -> ' + detail : ''));
  };

  try {
    console.log('================================================================');
    console.log('  [AUDIT] XDM TURBO: FULL SYSTEM & LIVE PRODUCTION AUDIT');
    console.log('  Target: ' + BASE);
    console.log('================================================================\n');

    // 1. Landing Page Check
    const homeRes = await fetch(BASE + '/');
    const homeHtml = await homeRes.text();
    const hasAdminInNav = /href=["']\/admin["']/.test(homeHtml);
    log('Landing Page HTTP 200', homeRes.status === 200, 'Status ' + homeRes.status);
    log('Landing Page has NO Admin Link', !hasAdminInNav, hasAdminInNav ? 'Found /admin link!' : 'No admin links exposed');

    // 2. Admin HTML Page Check
    const adminRes = await fetch(BASE + '/admin.html');
    const adminHtml = await adminRes.text();
    const hasDefaultCreds = adminHtml.includes('Default credentials') || adminHtml.includes('zihan2026');
    const hasServerUrlInput = adminHtml.includes('id="serverUrlInput"');
    log('Admin Portal HTTP 200', adminRes.status === 200, 'Status ' + adminRes.status);
    log('Admin Portal hides default credentials', !hasDefaultCreds, hasDefaultCreds ? 'Exposed credentials in HTML!' : 'Clean UI');
    log('Admin Portal has no API URL input', !hasServerUrlInput, hasServerUrlInput ? 'Found serverUrlInput!' : 'Clean UI');

    // 3. Health Endpoint & Database Engine
    const healthRes = await fetch(BASE + '/api/v1/health');
    const healthData = await healthRes.json();
    log('Central Health Endpoint', healthRes.status === 200 && healthData.status === 'ok', 'Status ' + healthRes.status);
    log('Database Engine is Turso Cloud', healthData.database === 'turso_cloud', 'Engine: ' + healthData.database);
    log('Asymmetric Ed25519 Public Key Active', !!healthData.publicKey, 'Key: ' + healthData.publicKey?.slice(0, 25) + '...');

    // 4. Admin Auth Rejection (Negative test)
    const badLoginRes = await fetch(BASE + '/api/v1/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'incorrect-password-test' })
    });
    log('Reject Invalid Admin Credentials', badLoginRes.status === 401, 'HTTP ' + badLoginRes.status);

    // 5. Admin Login (Positive test)
    const loginRes = await fetch(BASE + '/api/v1/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'zihan2026' })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    log('Admin Login Successful', loginRes.status === 200 && !!token, 'Token format: ' + token?.slice(0, 20) + '...');

    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    };

    // 6. Admin Overview Metrics
    const ovRes = await fetch(BASE + '/api/v1/admin/overview', { headers: authHeaders });
    const ovData = await ovRes.json();
    log('Admin Overview Metrics', ovRes.status === 200 && ovData.success, 
      'Licenses: ' + ovData.metrics?.totalLicenses + ' | Devices: ' + ovData.metrics?.totalDevices + ' | Users: ' + ovData.metrics?.totalUsers);

    // 7. Admin License List
    const licListRes = await fetch(BASE + '/api/v1/admin/licenses?limit=5', { headers: authHeaders });
    const licListData = await licListRes.json();
    log('Admin Fetch Licenses List', licListRes.status === 200 && Array.isArray(licListData.licenses), 'Returned ' + licListData.licenses?.length + ' licenses');

    // 8. Admin Devices List
    const devListRes = await fetch(BASE + '/api/v1/admin/devices?limit=5', { headers: authHeaders });
    const devListData = await devListRes.json();
    log('Admin Fetch Devices List', devListRes.status === 200 && Array.isArray(devListData.devices), 'Returned ' + devListData.devices?.length + ' devices');

    // 9. Admin Audit Logs
    const logRes = await fetch(BASE + '/api/v1/admin/audit-logs?limit=5', { headers: authHeaders });
    const logData = await logRes.json();
    log('Admin Fetch Audit Logs', logRes.status === 200 && Array.isArray(logData.logs), 'Returned ' + logData.logs?.length + ' audit entries');

    // 10. Generate New Live PRO License
    const createLicRes = await fetch(BASE + '/api/v1/admin/licenses', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        customerName: 'Live Audit Verification',
        customerEmail: 'audit@xdm.zihan.xyz',
        edition: 'pro',
        maxDevices: 1,
        notes: 'Automated Live E2E Verification'
      })
    });
    const createLicData = await createLicRes.json();
    const testLicense = createLicData.licenses ? createLicData.licenses[0] : createLicData.license;
    log('Admin Generate PRO License', createLicRes.status === 200 && !!testLicense?.key, 'Key: ' + testLicense?.key);

    // 11. Activate License on Device 1
    const testDeviceId1 = 'XDM-AUDIT-PC1-' + Date.now();
    const act1Res = await fetch(BASE + '/api/v1/licenses/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: testLicense.key,
        deviceId: testDeviceId1,
        deviceName: 'Audit Device 1',
        osPlatform: 'win32',
        clientVersion: '1.0.11'
      })
    });
    const act1Data = await act1Res.json();
    log('Client Device 1 Activation', act1Res.status === 200 && act1Data.success && !!act1Data.token, 'Signed Token received');

    // 12. Seat Limit Enforcement (Device 2 on 1-device license must fail)
    const testDeviceId2 = 'XDM-AUDIT-PC2-' + Date.now();
    const act2Res = await fetch(BASE + '/api/v1/licenses/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: testLicense.key,
        deviceId: testDeviceId2,
        deviceName: 'Audit Device 2',
        osPlatform: 'win32',
        clientVersion: '1.0.11'
      })
    });
    const act2Data = await act2Res.json();
    log('Seat Limit Enforcement (Device 2 Blocked)', act2Res.status === 403, 'HTTP ' + act2Res.status + ' (' + act2Data.error + ')');

    // 13. Client Heartbeat Validation
    const hbRes = await fetch(BASE + '/api/v1/licenses/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: testLicense.key,
        token: act1Data.token,
        deviceId: testDeviceId1
      })
    });
    const hbData = await hbRes.json();
    log('Client Heartbeat Check', hbRes.status === 200 && hbData.valid === true, 'License status: ' + hbData.status);

    // 14. Admin Suspend License
    const suspRes = await fetch(BASE + '/api/v1/admin/licenses/' + testLicense.id + '/suspend', {
      method: 'POST',
      headers: authHeaders
    });
    log('Admin Suspend License', suspRes.status === 200, 'Suspended successfully');

    // 15. Heartbeat Rejection on Suspended License
    const hbSuspRes = await fetch(BASE + '/api/v1/licenses/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: testLicense.key,
        token: act1Data.token,
        deviceId: testDeviceId1
      })
    });
    log('Heartbeat Blocks Suspended License', hbSuspRes.status === 403, 'HTTP ' + hbSuspRes.status);

    // 16. Admin Resume License
    const resuRes = await fetch(BASE + '/api/v1/admin/licenses/' + testLicense.id + '/resume', {
      method: 'POST',
      headers: authHeaders
    });
    log('Admin Resume License', resuRes.status === 200, 'Resumed successfully');

    // 17. Admin Revoke License
    const revRes = await fetch(BASE + '/api/v1/admin/licenses/' + testLicense.id + '/revoke', {
      method: 'POST',
      headers: authHeaders
    });
    log('Admin Revoke License', revRes.status === 200, 'Revoked successfully');

    // 18. Admin Password Change Verification
    const tempPassword = 'zihan_audit_temp_2026';
    const chgRes1 = await fetch(BASE + '/api/v1/admin/change-password', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        currentPassword: 'zihan2026',
        newPassword: tempPassword
      })
    });
    const chgData1 = await chgRes1.json();
    log('Admin Password Change API', chgRes1.status === 200 && chgData1.success, chgData1.message || chgData1.error);

    // Verify login with new temp password
    const loginTempRes = await fetch(BASE + '/api/v1/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: tempPassword })
    });
    const loginTempData = await loginTempRes.json();
    log('Login with New Password', loginTempRes.status === 200 && !!loginTempData.token, 'Authenticated with new password');

    // Restore password back to zihan2026
    const restoreAuthHeaders = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + loginTempData.token
    };
    const chgRes2 = await fetch(BASE + '/api/v1/admin/change-password', {
      method: 'POST',
      headers: restoreAuthHeaders,
      body: JSON.stringify({
        currentPassword: tempPassword,
        newPassword: 'zihan2026'
      })
    });
    log('Restore Original Admin Password', chgRes2.status === 200, 'Password securely restored to zihan2026');

    // Verify login with restored password
    const finalLoginRes = await fetch(BASE + '/api/v1/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'zihan2026' })
    });
    log('Final Login Verification with zihan2026', finalLoginRes.status === 200, 'Admin credentials fully verified');

    console.log('\n================================================================');
    const passedCount = results.filter(r => r.pass).length;
    console.log(`AUDIT COMPLETE: ${passedCount}/${results.length} CHECKS PASSED`);
    console.log('================================================================\n');

  } catch(err) {
    console.error('Audit exception:', err);
  }
}

runFullAudit();
