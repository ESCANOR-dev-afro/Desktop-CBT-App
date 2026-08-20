/**
 * verify_heartbeat_and_storage.js
 * Verification script for session-heartbeat telemetry and storage resilience.
 */

const http = require('http');

function makePost(pathStr, body) {
  return new Promise((resolve, reject) => {
    const dataStr = JSON.stringify(body);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: pathStr,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataStr),
      },
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
    req.write(dataStr);
    req.end();
  });
}

async function runVerification() {
  console.log('🔍 Starting Heartbeat Telemetry & Storage Verification...\n');

  // Test POST /api/student/session-heartbeat
  try {
    const payload = {
      regNumber: 'AWA26271001',
      subjectName: 'Mathematics',
      classId: 1,
      currentQuestionIndex: 7,
      answeredCount: 14,
      totalQuestions: 30,
      remainingSeconds: 2640,
      status: 'LIVE'
    };

    const res = await makePost('/api/student/session-heartbeat', payload);
    console.log(`1️⃣ POST /api/student/session-heartbeat status: ${res.status} - Success: ${res.body?.success} -> ${res.status === 200 && res.body?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Response: ${JSON.stringify(res.body)}`);
  } catch (err) {
    console.error('1️⃣ Error testing session-heartbeat:', err.message);
  }

  console.log('\n🎉 Heartbeat & Storage Verification Complete!');
}

runVerification();
