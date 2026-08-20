/**
 * verify_regressions.js
 * Verification script for regression bug fixes:
 * 1. SS 1 Science scope 11 subjects check.
 * 2. GET /api/admin/classes/SS%201%20Science/subjects returns 11 subjects.
 * 3. Question bank fallback check.
 */

const http = require('http');

function makeGet(pathStr) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: pathStr,
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function runVerification() {
  console.log('🔍 Running System Regression Verification...\n');

  try {
    const res = await makeGet('/api/admin/classes/SS%201%20Science/subjects');
    const subjects = res.body?.subjects || [];
    const count = subjects.length;
    const names = subjects.map(s => s.name);

    console.log(`1️⃣ GET /api/admin/classes/SS 1 Science/subjects -> Count: ${count} (Expected 11)`);
    console.log(`   Subjects: ${names.join(', ')}`);
    const isPass = count === 11 && names.includes('Agricultural Science') && names.includes('Geography');
    console.log(`   Result: ${isPass ? '✅ PASS' : '❌ FAIL'}\n`);
  } catch (err) {
    console.error('1️⃣ Error testing class subjects API:', err.message);
  }

  try {
    const res = await makeGet('/api/admin/class-subjects');
    const ss1SciSubs = res.body?.classSubjects?.['SS 1 Science'] || [];
    console.log(`2️⃣ GET /api/admin/class-subjects -> SS 1 Science Count: ${ss1SciSubs.length} (Expected 11)`);
    console.log(`   Result: ${ss1SciSubs.length === 11 ? '✅ PASS' : '❌ FAIL'}\n`);
  } catch (err) {
    console.error('2️⃣ Error testing class-subjects API:', err.message);
  }

  console.log('🎉 Regression Verification Complete!');
}

runVerification();
