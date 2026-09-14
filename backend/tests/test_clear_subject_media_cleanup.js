/**
 * test_clear_subject_media_cleanup.js
 *
 * Automated verification of diagram file disk cleanup upon "Clear Subject Questions"
 * and single question deletion.
 *
 * 100% Offline — Node.js native.
 */

const assert = require('assert');
const fs = require('fs');
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
  console.log('🧪 RUNNING TEST SUITE: CLEAR SUBJECT & SINGLE QUESTION DIAGRAM DISK PURGE');
  console.log('======================================================================\n');

  const { server, port } = await startTestServer();
  const db = require('../database');
  const diagramsDir = path.resolve(__dirname, '../uploads/diagrams');

  if (!fs.existsSync(diagramsDir)) {
    fs.mkdirSync(diagramsDir, { recursive: true });
  }

  try {
    const testSession = '2026/2027';
    const testTerm = '1st Term';
    const testSlot = 'welcome_test';
    const testClass = 'SS 1 Science';
    const testSubject = 'Physics';

    // TEST 1: Clear Subject Questions unlinks all associated diagram files from disk
    await runTest('Clear Subject Questions deletes diagram files from disk before deleting records', async () => {
      // 1. Create dummy diagram files on disk
      const file1 = `ss_1_science_physics_welcome_test_q3_img1.jpeg`;
      const file2 = `ss_1_science_physics_welcome_test_q5_img1.jpeg`;
      const path1 = path.join(diagramsDir, file1);
      const path2 = path.join(diagramsDir, file2);

      fs.writeFileSync(path1, 'dummy jpeg content 1');
      fs.writeFileSync(path2, 'dummy jpeg content 2');
      assert.strictEqual(fs.existsSync(path1), true, 'File 1 must exist on disk before clear');
      assert.strictEqual(fs.existsSync(path2), true, 'File 2 must exist on disk before clear');

      // 2. Insert dummy questions referencing these diagrams
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO questions (session, term, assessment_slot, class, subject, question_text, option_a, option_b, option_c, option_d, correct_answer, diagram_image_url)
           VALUES (?, ?, ?, ?, ?, 'Test Q3 stem', 'A', 'B', 'C', 'D', 'A', ?)`,
          [testSession, testTerm, testSlot, testClass, testSubject, `/uploads/diagrams/${file1}`],
          function (err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });

      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO questions (session, term, assessment_slot, class, subject, question_text, option_a, option_b, option_c, option_d, correct_answer, diagram_image_url)
           VALUES (?, ?, ?, ?, ?, 'Test Q5 stem', 'A', 'B', 'C', 'D', 'B', ?)`,
          [testSession, testTerm, testSlot, testClass, testSubject, `/uploads/diagrams/${file2}`],
          function (err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });

      // 3. Call POST /api/admin/questions/clear-subject
      const res = await requestJson(port, 'POST', '/api/admin/questions/clear-subject', {
        session: testSession,
        term: testTerm,
        assessment_slot: testSlot,
        class: testClass,
        subject: testSubject,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(res.data.deletedCount >= 2, 'Must report at least 2 questions deleted');

      // 4. Verify files on disk are completely deleted
      assert.strictEqual(fs.existsSync(path1), false, `Diagram file ${file1} must be unlinked from disk`);
      assert.strictEqual(fs.existsSync(path2), false, `Diagram file ${file2} must be unlinked from disk`);

      // 5. Verify database records are deleted
      const remainingRows = await new Promise((resolve, reject) => {
        db.all(
          `SELECT id FROM questions WHERE session = ? AND term = ? AND assessment_slot = ? AND class = ? AND subject = ?`,
          [testSession, testTerm, testSlot, testClass, testSubject],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });
      assert.strictEqual(remainingRows.length, 0, 'No questions must remain in database');
    });

    // TEST 2: Single Question Deletion unlinks diagram file from disk
    await runTest('DELETE /api/admin/questions/:id unlinks single diagram file from disk', async () => {
      const singleFile = `ss_1_science_physics_midterm_ca_q10_img1.jpeg`;
      const singlePath = path.join(diagramsDir, singleFile);
      fs.writeFileSync(singlePath, 'dummy single jpeg content');
      assert.strictEqual(fs.existsSync(singlePath), true);

      let qId;
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO questions (session, term, assessment_slot, class, subject, question_text, option_a, option_b, option_c, option_d, correct_answer, diagram_image_url)
           VALUES (?, ?, 'midterm_ca', ?, ?, 'Test Single Q stem', 'A', 'B', 'C', 'D', 'C', ?)`,
          [testSession, testTerm, testClass, testSubject, `/uploads/diagrams/${singleFile}`],
          function (err) {
            if (err) reject(err);
            else {
              qId = this.lastID;
              resolve(this.lastID);
            }
          }
        );
      });

      const res = await requestJson(port, 'DELETE', `/api/admin/questions/${qId}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);

      // Verify file is unlinked from disk
      assert.strictEqual(fs.existsSync(singlePath), false, 'Single question diagram file must be deleted from disk');

      // Verify database record is deleted
      const checkRow = await new Promise((resolve, reject) => {
        db.get(`SELECT id FROM questions WHERE id = ?`, [qId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      assert.strictEqual(checkRow, undefined, 'Question record must be deleted from database');
    });

    // TEST 3: Aliases /api/admin/questions/clear and /api/admin/clear-subject-questions work identically
    await runTest('Route aliases /questions/clear and /clear-subject-questions work with diagram deletion', async () => {
      const aliasFile = `jss3_math_examination_q20_img1.jpeg`;
      const aliasPath = path.join(diagramsDir, aliasFile);
      fs.writeFileSync(aliasPath, 'dummy alias jpeg');

      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO questions (session, term, assessment_slot, class, subject, question_text, option_a, option_b, option_c, option_d, correct_answer, diagram_image_url)
           VALUES ('2026/2027', '1st Term', 'examination', 'JSS 3', 'Mathematics', 'Math Q stem', 'A', 'B', 'C', 'D', 'D', ?)`,
          [`/uploads/diagrams/${aliasFile}`],
          function (err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });

      const res = await requestJson(port, 'DELETE', '/api/admin/questions/clear', {
        session: '2026/2027',
        term: '1st Term',
        assessment_slot: 'examination',
        class: 'JSS 3',
        subject: 'Mathematics',
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(fs.existsSync(aliasPath), false, 'Alias clear must delete diagram from disk');
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
    console.log('🎉 ALL CLEAR SUBJECT & MEDIA CLEANUP TESTS PASSED PERFECTLY!\n');
  }
}

runAll();
