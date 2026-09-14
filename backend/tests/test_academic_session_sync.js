/**
 * test_academic_session_sync.js
 *
 * Automated verification of Unified Academic Session & Term state synchronization,
 * auto-reset to '1st Term', SQLite persistence (system_settings & academic_terms),
 * and REST endpoints (/api/admin/active-context, /api/admin/system-settings).
 *
 * 100% Offline — Node.js native.
 */

const assert = require('assert');
const http = require('http');
const express = require('express');

let passedTests = 0;
let failedTests = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}\n`);
    failedTests++;
  }
}

async function startTestServer() {
  const app = express();
  app.use(express.json());

  const adminRoutes = require('../adminRoutes');
  app.use('/api/admin', adminRoutes);

  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

function requestJson(port, method, pathUrl, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: pathUrl,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            resolve({ status: res.statusCode, data });
          } catch (e) {
            resolve({ status: res.statusCode, raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runAll() {
  console.log('======================================================================');
  console.log('🧪 RUNNING TEST SUITE: UNIFIED ACADEMIC SESSION & TERM SYNC & PERSISTENCE');
  console.log('======================================================================\n');

  const { server, port } = await startTestServer();
  const db = require('../database');

  try {
    // TEST 1: GET /api/admin/active-context returns session and term
    await runTest('GET /api/admin/active-context returns initial session and term', async () => {
      const res = await requestJson(port, 'GET', '/api/admin/active-context');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(res.data.session, 'session property must exist');
      assert.ok(res.data.term, 'term property must exist');
      assert.ok(Array.isArray(res.data.terms), 'terms list must exist');
    });

    // TEST 2: PUT /api/admin/active-context updates session to 2028/2029 with auto-reset to 1st Term
    await runTest('PUT /api/admin/active-context switches session to 2028/2029 with 1st Term in SQLite', async () => {
      const res = await requestJson(port, 'PUT', '/api/admin/active-context', {
        session: '2028/2029',
        term: '1st Term',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.session, '2028/2029');
      assert.strictEqual(res.data.term, '1st Term');

      // Verify system_settings table
      const sessionSetting = await new Promise((resolve, reject) => {
        db.get("SELECT value FROM system_settings WHERE key = 'current_session'", [], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      assert.ok(sessionSetting, 'current_session setting must exist');
      assert.strictEqual(sessionSetting.value, '2028/2029');

      const termSetting = await new Promise((resolve, reject) => {
        db.get("SELECT value FROM system_settings WHERE key = 'current_term'", [], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      assert.ok(termSetting, 'current_term setting must exist');
      assert.strictEqual(termSetting.value, '1st Term');

      // Verify academic_terms table
      const activeTermRow = await new Promise((resolve, reject) => {
        db.get("SELECT name, session, is_current FROM academic_terms WHERE is_current = 1", [], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      assert.ok(activeTermRow, 'Active academic term record must exist');
      assert.strictEqual(activeTermRow.session, '2028/2029');
      assert.strictEqual(activeTermRow.name, '1st Term');
      assert.strictEqual(activeTermRow.is_current, 1);
    });

    // TEST 3: PUT /api/admin/active-context updates term to 3rd Term while keeping 2028/2029 session
    await runTest('PUT /api/admin/active-context updates term to 3rd Term within current session', async () => {
      const res = await requestJson(port, 'PUT', '/api/admin/active-context', {
        session: '2028/2029',
        term: '3rd Term',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.session, '2028/2029');
      assert.strictEqual(res.data.term, '3rd Term');

      // Check system_settings
      const termSetting = await new Promise((resolve, reject) => {
        db.get("SELECT value FROM system_settings WHERE key = 'current_term'", [], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      assert.strictEqual(termSetting.value, '3rd Term');

      // Check academic_terms
      const activeTermRow = await new Promise((resolve, reject) => {
        db.get("SELECT name, session, is_current FROM academic_terms WHERE is_current = 1", [], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      assert.strictEqual(activeTermRow.session, '2028/2029');
      assert.strictEqual(activeTermRow.name, '3rd Term');
    });

    // TEST 4: GET /api/admin/system-settings alias endpoint returns updated context
    await runTest('GET /api/admin/system-settings returns updated active context', async () => {
      const res = await requestJson(port, 'GET', '/api/admin/system-settings');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.session, '2028/2029');
      assert.strictEqual(res.data.term, '3rd Term');
    });

    // TEST 5: Switching session to 2026/2027 auto-resets to 1st Term and logs audit action
    await runTest('Switching session to 2026/2027 auto-resets term to 1st Term and logs audit', async () => {
      const res = await requestJson(port, 'PUT', '/api/admin/active-context', {
        session: '2026/2027',
        term: '1st Term',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.session, '2026/2027');
      assert.strictEqual(res.data.term, '1st Term');

      // Check audit log
      const auditLog = await new Promise((resolve, reject) => {
        db.get("SELECT action, entity_type, entity_id FROM audit_logs WHERE action = 'SWITCH_ACADEMIC_TERM' ORDER BY id DESC LIMIT 1", [], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      assert.ok(auditLog, 'Audit log must be created');
      assert.strictEqual(auditLog.action, 'SWITCH_ACADEMIC_TERM');
    });

    // TEST 6: Attempting to switch to elapsed 2025/2026 session is auto-sanitized to 2026/2027
    await runTest('Attempting to use legacy 2025/2026 session auto-sanitizes to 2026/2027', async () => {
      const res = await requestJson(port, 'PUT', '/api/admin/active-context', {
        session: '2025/2026',
        term: '1st Term',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.session, '2026/2027', 'Must sanitize 2025/2026 to 2026/2027');

      // Verify no active 2025/2026 in database
      const count2025 = await new Promise((resolve, reject) => {
        db.get("SELECT COUNT(*) as cnt FROM academic_terms WHERE session = '2025/2026' AND is_current = 1", [], (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.cnt : 0);
        });
      });
      assert.strictEqual(count2025, 0, 'Zero current 2025/2026 academic term records');
    });

  } finally {
    server.close();
  }

  console.log('\n----------------------------------------------------------------------');
  console.log(`TOTAL TESTS: ${passedTests + failedTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('======================================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL ACADEMIC SESSION & TERM SYNC TESTS PASSED PERFECTLY!\n');
  }
}

runAll();
