/**
 * test_term_sync.js
 *
 * Automated verification of Academic Term & Session state persistence and synchronization.
 * Tests SQLite table updates (academic_terms), REST endpoints, and multi-term isolation.
 *
 * 100% Offline — Node.js native.
 */

const assert = require('assert');
const path = require('path');
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
  console.log('🧪 RUNNING TEST SUITE: ACADEMIC TERM SYNCHRONIZATION & BACKEND PERSISTENCE');
  console.log('======================================================================\n');

  const { server, port } = await startTestServer();
  const db = require('../database');

  try {
    // TEST 1: GET /api/admin/academic-terms returns active term and list
    await runTest('GET /api/admin/academic-terms returns active term and term list', async () => {
      const res = await requestJson(port, 'GET', '/api/admin/academic-terms');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(res.data.active_term, 'active_term must be present');
      assert.ok(Array.isArray(res.data.terms), 'terms must be an array');
      assert.ok(res.data.terms.length >= 3, 'Must have at least 3 terms');
    });

    // TEST 2: POST /api/admin/academic-terms/active switches to 2nd Term and sets is_current
    await runTest('POST /api/admin/academic-terms/active switches active term to 2nd Term in SQLite', async () => {
      const res = await requestJson(port, 'POST', '/api/admin/academic-terms/active', {
        term: '2nd Term',
        session: '2026/2027',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.active_term, '2nd Term');

      // Verify SQLite state
      const currentRows = await new Promise((resolve, reject) => {
        db.all('SELECT name, session, is_current FROM academic_terms WHERE is_current = 1', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      assert.strictEqual(currentRows.length, 1, 'Exactly one term must have is_current = 1');
      assert.strictEqual(currentRows[0].name, '2nd Term');
      assert.strictEqual(currentRows[0].session, '2026/2027');
    });

    // TEST 3: PUT /api/admin/academic-term switches to 3rd Term via REST alias
    await runTest('PUT /api/admin/academic-term switches to 3rd Term via REST alias', async () => {
      const res = await requestJson(port, 'PUT', '/api/admin/academic-term', {
        term: '3rd Term',
        session: '2026/2027',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.active_term, '3rd Term');

      const current = await new Promise((resolve, reject) => {
        db.get('SELECT name FROM academic_terms WHERE is_current = 1 LIMIT 1', [], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      assert.strictEqual(current.name, '3rd Term');
    });

    // TEST 4: Switch back to 1st Term and verify audit log record
    await runTest('POST /api/admin/academic-terms/active switches back to 1st Term and writes audit log', async () => {
      const res = await requestJson(port, 'POST', '/api/admin/academic-terms/active', {
        term: '1st Term',
        session: '2026/2027',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.active_term, '1st Term');

      // Check audit log
      const auditLog = await new Promise((resolve, reject) => {
        db.get('SELECT action, entity_type, entity_id FROM audit_logs WHERE action = "SWITCH_ACADEMIC_TERM" ORDER BY id DESC LIMIT 1', [], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      assert.ok(auditLog, 'Audit log entry must be created');
      assert.strictEqual(auditLog.action, 'SWITCH_ACADEMIC_TERM');
      assert.strictEqual(auditLog.entity_type, 'academic_terms');
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
    console.log('🎉 ALL ACADEMIC TERM SYNC TESTS PASSED PERFECTLY!\n');
  }
}

runAll();
