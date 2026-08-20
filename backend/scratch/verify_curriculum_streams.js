/**
 * verify_curriculum_streams.js
 * Verification script for curriculum stream allocations across JSS, Science, Arts, Commercial.
 */

const http = require('http');

function makeRequest(method, pathStr) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: pathStr,
      method: method,
      headers: { 'Content-Type': 'application/json' },
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
  console.log('🔍 Starting Curriculum Stream Verification Suite...\n');

  // 1. Check JSS 1 Class Subjects (Expected: 16)
  try {
    const res = await makeRequest('GET', '/api/subjects?class=JSS%201');
    const count = res.body?.count ?? res.body?.subjects?.length ?? 0;
    console.log(`1️⃣ JSS 1 Subjects Count: ${count} (Expected: 16) -> ${count === 16 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   List: ${JSON.stringify(res.body?.subjects)}`);
  } catch (err) {
    console.error('1️⃣ Error checking JSS 1:', err.message);
  }

  // 2. Check SS 1 Science Subjects (Expected: 11)
  try {
    const res = await makeRequest('GET', '/api/subjects?class=SS%201%20Science');
    const count = res.body?.count ?? res.body?.subjects?.length ?? 0;
    console.log(`\n2️⃣ SS 1 Science Subjects Count: ${count} (Expected: 11) -> ${count === 11 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   List: ${JSON.stringify(res.body?.subjects)}`);
  } catch (err) {
    console.error('2️⃣ Error checking SS 1 Science:', err.message);
  }

  // 3. Check SS 1 Art Subjects (Expected: 8)
  try {
    const res = await makeRequest('GET', '/api/subjects?class=SS%201%20Art');
    const count = res.body?.count ?? res.body?.subjects?.length ?? 0;
    console.log(`\n3️⃣ SS 1 Art Subjects Count: ${count} (Expected: 8) -> ${count === 8 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   List: ${JSON.stringify(res.body?.subjects)}`);
  } catch (err) {
    console.error('3️⃣ Error checking SS 1 Art:', err.message);
  }

  // 4. Check SS 1 Commercial Subjects (Expected: 9)
  try {
    const res = await makeRequest('GET', '/api/subjects?class=SS%201%20Commercial');
    const count = res.body?.count ?? res.body?.subjects?.length ?? 0;
    console.log(`\n4️⃣ SS 1 Commercial Subjects Count: ${count} (Expected: 9) -> ${count === 9 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   List: ${JSON.stringify(res.body?.subjects)}`);
  } catch (err) {
    console.error('4️⃣ Error checking SS 1 Commercial:', err.message);
  }

  // 5. Test GET /api/admin/classes/SS%201%20Science/subjects
  try {
    const res = await makeRequest('GET', '/api/admin/classes/SS%201%20Science/subjects');
    const count = res.body?.count ?? res.body?.subjects?.length ?? 0;
    console.log(`\n5️⃣ GET /api/admin/classes/SS 1 Science/subjects Count: ${count} -> ${count === 11 ? '✅ PASS' : '❌ FAIL'}`);
  } catch (err) {
    console.error('5️⃣ Error checking admin class subjects:', err.message);
  }

  console.log('\n🎉 Curriculum Stream Verification Complete!');
}

runVerification();
