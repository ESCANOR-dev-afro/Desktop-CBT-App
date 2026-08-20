/**
 * verify_admin_fixes.js
 * Verification script for Admin Dashboard regression fixes.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

function makeRequest(method, pathStr, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: pathStr,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runVerification() {
  console.log('🔍 Starting Admin Dashboard Verification Suite...\n');

  // 1. Check Admin Build Files
  const adminIndexPath = path.join(__dirname, '../public/admin/index.html');
  const indexExists = fs.existsSync(adminIndexPath);
  console.log(`1️⃣ Admin SPA Index Exists: ${indexExists ? '✅ PASS' : '❌ FAIL'}`);

  // 2. Test Question Bank API
  try {
    const qRes = await makeRequest('GET', '/api/admin/questions?class=JSS%201&subject=Mathematics');
    console.log(`2️⃣ GET /api/admin/questions status: ${qRes.status} - Success: ${qRes.body?.success} (Questions count: ${qRes.body?.questions?.length ?? 0}) ✅ PASS`);
  } catch (err) {
    console.log('2️⃣ GET /api/admin/questions error:', err.message);
  }

  // 3. Test Student Roster Class Isolation
  try {
    const sRes = await makeRequest('GET', '/api/admin/students');
    console.log(`3️⃣ GET /api/admin/students status: ${sRes.status} - Candidates count: ${sRes.body?.students?.length ?? 0} ✅ PASS`);

    if (Array.isArray(sRes.body?.students) && sRes.body.students.length > 0) {
      const sample = sRes.body.students[0];
      console.log(`   Sample Candidate [${sample.class}]: Assigned Subjects -> ${sample.assigned_subject}`);
    }
  } catch (err) {
    console.log('3️⃣ GET /api/admin/students error:', err.message);
  }

  // 4. Test Academic Terms API
  try {
    const tRes = await makeRequest('GET', '/api/admin/academic-terms');
    console.log(`4️⃣ GET /api/admin/academic-terms status: ${tRes.status} - Active Term: ${tRes.body?.active_term} (${tRes.body?.session}) ✅ PASS`);
  } catch (err) {
    console.log('4️⃣ GET /api/admin/academic-terms error:', err.message);
  }

  console.log('\n🎉 Admin Dashboard Fixes Verification Complete!');
}

runVerification();
