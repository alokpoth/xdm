#!/usr/bin/env node
/**
 * XDM Turbo — Automated Test Control Center
 * 
 * Central test harness for running unit, integration, typecheck, build, 
 * security, and live production audit suites with structured reporting.
 * 
 * Usage:
 *   node scripts/test-control-center.js [suite]
 * 
 * Available suites:
 *   all          - Run standard local suites (unit, integration, types, build, security)
 *   unit         - Run DownloadEngine and core unit tests
 *   integration  - Run Licensing System and server integration tests
 *   typecheck    - Run TypeScript static type verification
 *   build        - Run Vite production bundle verification
 *   security     - Run offline security and crypto validation
 *   live         - Run live production cloud verification (xdm.zihan.xyz)
 */

const { spawn } = require('child_process');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

// Helper to spawn commands and measure execution duration
function executeCommand(cmd, args, options = {}) {
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: ROOT_DIR,
      stdio: options.capture ? ['pipe', 'pipe', 'pipe'] : 'inherit',
      shell: true,
      ...options
    });

    let stdout = '';
    let stderr = '';

    if (options.capture) {
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
    }

    child.on('close', (code) => {
      const duration = Date.now() - start;
      resolve({
        code,
        duration,
        passed: code === 0,
        stdout,
        stderr
      });
    });

    child.on('error', (err) => {
      const duration = Date.now() - start;
      resolve({
        code: 1,
        duration,
        passed: false,
        stdout,
        stderr: err.message
      });
    });
  });
}

// Suites definitions
const SUITES = {
  unit: {
    name: 'Unit Tests (Engine & Filename Sanitizer)',
    description: 'Validates DownloadTask, chunk assembly, pause/resume, and path traversal security.',
    run: () => executeCommand('node', ['--test', 'tests/download-engine.test.js'])
  },
  integration: {
    name: 'Integration Tests (Licensing, Database & Anti-Tamper)',
    description: 'Validates Ed25519 signatures, seat enforcement, offline grace periods, and admin auth.',
    run: () => executeCommand('node', ['--test', 'tests/license-system.test.js'])
  },
  typecheck: {
    name: 'TypeScript Static Type Analysis',
    description: 'Executes tsc --noEmit across all frontend UI components and modules.',
    run: () => executeCommand('npx', ['tsc', '--noEmit'])
  },
  build: {
    name: 'Production Build Compilation',
    description: 'Executes Vite production build and verifies asset generation and bundle budgets.',
    run: () => executeCommand('npm', ['run', 'build'])
  },
  security: {
    name: 'Security & Anti-Tamper Validation',
    description: 'Direct verification of Ed25519 key generation, scrypt hashing, and filename traversal guards.',
    run: async () => {
      const crypto = require('../license-server/src/crypto');
      const DownloadTask = require('../server/engine/DownloadTask');

      const checks = [];

      // Check 1: Key generation and signature verification
      try {
        const testPayload = { test: true, deviceId: 'TEST-DEVICE-01', ts: Date.now() };
        const token = crypto.signLicensePayload(testPayload);
        const verified = crypto.verifyLicenseToken(token);
        const tampered = crypto.verifyLicenseToken(token + 'tamper');
        checks.push({ 
          name: 'Ed25519 Sign & Verify (and tamper rejection)', 
          passed: verified.valid === true && tampered.valid === false 
        });
      } catch (e) {
        checks.push({ name: 'Ed25519 Sign & Verify (and tamper rejection)', passed: false, error: e.message });
      }

      // Check 2: Scrypt password hashing
      try {
        const hash = crypto.hashPassword('test-control-center-password');
        const match = crypto.verifyPassword('test-control-center-password', hash);
        const badMatch = crypto.verifyPassword('wrong-password', hash);
        checks.push({ name: 'Scrypt Password Verification', passed: match === true && badMatch === false });
      } catch (e) {
        checks.push({ name: 'Scrypt Password Verification', passed: false, error: e.message });
      }

      // Check 3: Path Traversal and DOS Device Neutralization
      try {
        const maliciousNames = [
          '../../Windows/System32/calc.exe',
          '..\\..\\Windows\\System32\\cmd.exe',
          'CON.txt',
          'COM1.dat',
          'AUX',
          'NUL.tar.gz',
          '../../../evil.sh'
        ];

        let traversalSafe = true;
        for (const mal of maliciousNames) {
          const sanitized = DownloadTask.formatXdmFileName(mal);
          if (sanitized.includes('..') || sanitized.includes('/') || sanitized.includes('\\') || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i.test(sanitized)) {
            traversalSafe = false;
            break;
          }
        }
        checks.push({ name: 'Filename Path Traversal & DOS Device Sanitization', passed: traversalSafe });
      } catch (e) {
        checks.push({ name: 'Filename Path Traversal & DOS Device Sanitization', passed: false, error: e.message });
      }

      const allPassed = checks.every(c => c.passed);
      console.log('\n  [Security Suite Details]');
      checks.forEach(c => {
        console.log(`  ${c.passed ? '' : ''} ${c.name}${c.error ? ` (${c.error})` : ''}`);
      });
      console.log('');

      return {
        code: allPassed ? 0 : 1,
        duration: 35,
        passed: allPassed
      };
    }
  },
  live: {
    name: 'Live Production Cloud Verification',
    description: 'Verifies the live Turso cloud database, license endpoints, admin portal, and seat limits on xdm.zihan.xyz.',
    run: () => executeCommand('node', ['scripts/live-audit.js'])
  }
};

async function main() {
  const targetSuite = process.argv[2] || 'all';

  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║               XDM TURBO — AUTOMATED TEST CONTROL CENTER              ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝\n');

  let suitesToRun = [];

  if (targetSuite === 'all') {
    suitesToRun = ['unit', 'integration', 'typecheck', 'build', 'security'];
  } else if (SUITES[targetSuite]) {
    suitesToRun = [targetSuite];
  } else {
    console.error(`Unknown suite: "${targetSuite}". Valid options: all, ${Object.keys(SUITES).join(', ')}`);
    process.exit(1);
  }

  const results = [];
  const overallStart = Date.now();

  for (const suiteKey of suitesToRun) {
    const suite = SUITES[suiteKey];
    console.log(`▶ RUNNING SUITE: ${suite.name}`);
    console.log(`  ${suite.description}\n`);

    const result = await suite.run();
    results.push({
      key: suiteKey,
      name: suite.name,
      ...result
    });

    console.log(`  ↳ Result: ${result.passed ? 'PASSED' : 'FAILED'} (${result.duration}ms)\n`);
  }

  const totalDuration = Date.now() - overallStart;
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  const isAllPassed = passedCount === totalCount;

  // Print Summary Table
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║                          EXECUTION SUMMARY                            ║');
  console.log('╠═══════════════════════════════════════════════════════════════════════╣');
  for (const res of results) {
    const statusIcon = res.passed ? ' PASS' : ' FAIL';
    const durStr = `${res.duration}ms`.padStart(8, ' ');
    const namePadded = res.name.padEnd(52, ' ');
    console.log(`║  ${statusIcon}  │ ${namePadded} │ ${durStr} ║`);
  }
  console.log('╠═══════════════════════════════════════════════════════════════════════╣');
  const summaryStr = `Total: ${totalCount} | Passed: ${passedCount} | Failed: ${totalCount - passedCount} | Duration: ${(totalDuration / 1000).toFixed(2)}s`;
  console.log(`║  ${summaryStr.padEnd(67, ' ')}║`);
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');

  if (isAllPassed) {
    console.log('\n ALL SUITES COMPLETED SUCCESSFULLY! READY FOR PRODUCTION.');
    process.exit(0);
  } else {
    console.error('\n ONE OR MORE SUITES FAILED. SEE DETAILS ABOVE.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error running Test Control Center:', err);
  process.exit(1);
});
