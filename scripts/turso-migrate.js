/**
 * ⚡ XDM TURBO: ONE-CLICK LOCAL-TO-TURSO DATABASE MIGRATION SCRIPT
 * 
 * Safely copies all existing licenses, devices, security records, and audit logs
 * from the local SQLite database (licenses.db) into your hosted Turso/libSQL cloud database.
 * 
 * Usage:
 *   $env:TURSO_DATABASE_URL="libsql://your-db-name.turso.io"
 *   $env:TURSO_AUTH_TOKEN="your_turso_auth_token"
 *   node scripts/turso-migrate.js
 */

const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

const LOCAL_DB_PATH = path.resolve(__dirname, '../license-server/data/licenses.db').replace(/\\/g, '/');

async function migrate() {
  console.log('================================================================');
  console.log('  ⚡ XDM TURBO: DATABASE MIGRATION TO TURSO CLOUD');
  console.log('================================================================\n');

  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (!tursoUrl) {
    console.error('❌ ERROR: TURSO_DATABASE_URL environment variable is missing!');
    console.log('\nHow to set it:');
    console.log('  1. Create a free database at https://turso.tech (Free Forever, 9GB storage, 1B reads/mo)');
    console.log('  2. Run in PowerShell:');
    console.log('     $env:TURSO_DATABASE_URL="libsql://your-db.turso.io"');
    console.log('     $env:TURSO_AUTH_TOKEN="your-token"');
    console.log('     node scripts/turso-migrate.js\n');
    process.exit(1);
  }

  console.log(`[Source] Connecting to local database: file:${LOCAL_DB_PATH}...`);
  const localClient = createClient({ url: `file:${LOCAL_DB_PATH}` });

  console.log(`[Target] Connecting to Turso Cloud: ${tursoUrl}...`);
  const tursoClient = createClient({ url: tursoUrl, authToken: tursoToken });

  // 1. Create tables on Turso
  console.log('\n[1/3] Ensuring tables exist on Turso Cloud...');
  const tableStatements = [
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
      PRIMARY KEY (id, license_id)
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

  for (const sql of tableStatements) {
    await tursoClient.execute(sql);
  }
  console.log('✅ Turso Cloud schema initialized successfully.');

  // 2. Migrate data table by table
  console.log('\n[2/3] Migrating data rows...');
  const tables = ['admin_users', 'users', 'licenses', 'devices', 'device_security', 'audit_logs'];

  for (const table of tables) {
    const srcRows = (await localClient.execute(`SELECT * FROM ${table}`)).rows;
    if (srcRows.length === 0) {
      console.log(`-> ${table}: 0 rows (skipped)`);
      continue;
    }

    console.log(`-> Migrating ${table} (${srcRows.length} rows)...`);
    const cols = Object.keys(srcRows[0]);
    const placeholders = cols.map(() => '?').join(', ');
    const insertSql = `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;

    // Batch insert in chunks of 50 for optimal serverless network efficiency
    const CHUNK_SIZE = 50;
    for (let i = 0; i < srcRows.length; i += CHUNK_SIZE) {
      const chunk = srcRows.slice(i, i + CHUNK_SIZE);
      const batchStmts = chunk.map(row => ({
        sql: insertSql,
        args: cols.map(c => row[c] !== undefined ? row[c] : null)
      }));
      await tursoClient.batch(batchStmts, 'write');
    }
    console.log(`   ✅ ${table}: ${srcRows.length} rows migrated.`);
  }

  // 3. Verification
  console.log('\n[3/3] Verifying row counts on Turso Cloud...');
  let allMatched = true;
  for (const table of tables) {
    const localCount = Number((await localClient.execute(`SELECT COUNT(*) as c FROM ${table}`)).rows[0].c);
    const tursoCount = Number((await tursoClient.execute(`SELECT COUNT(*) as c FROM ${table}`)).rows[0].c);
    const match = localCount === tursoCount;
    if (!match) allMatched = false;
    console.log(`-> ${table.padEnd(16)} Local: ${String(localCount).padStart(5)} | Turso: ${String(tursoCount).padStart(5)} [${match ? 'MATCH ✅' : 'MISMATCH ❌'}]`);
  }

  localClient.close();
  tursoClient.close();

  if (allMatched) {
    console.log('\n================================================================');
    console.log('🎉 MIGRATION COMPLETE! 100% of data is now live on Turso Cloud.');
    console.log('Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to Vercel Environment Variables.');
    console.log('================================================================\n');
  } else {
    console.warn('\n⚠️ Some row counts mismatched. Please check table differences above.');
  }
}

migrate().catch(err => {
  console.error('\n❌ Fatal Migration Error:', err);
  process.exit(1);
});
