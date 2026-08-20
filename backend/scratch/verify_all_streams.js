/**
 * verify_all_streams.js
 * Verification script for database re-sync and static path resolution.
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
  console.log('🔍 Verifying 3-Tier Architecture & Stream Allocations...\n');

  try {
    const resJss = await makeGet('/api/admin/classes/JSS%201/subjects');
    const jssCount = resJss.body?.subjects?.length || 0;
    console.log(`1️⃣ JSS 1 Stream Subjects -> Count: ${jssCount} (Expected 16) -> ${jssCount === 16 ? '✅ PASS' : '❌ FAIL'}`);

    const resSci = await makeGet('/api/admin/classes/SS%201%20Science/subjects');
    const sciCount = resSci.body?.subjects?.length || 0;
    console.log(`2️⃣ SS 1 Science Stream Subjects -> Count: ${sciCount} (Expected 9) -> ${sciCount === 9 ? '✅ PASS' : '❌ FAIL'}`);

    const resArt = await makeGet('/api/admin/classes/SS%201%20Art/subjects');
    const artCount = resArt.body?.subjects?.length || 0;
    console.log(`3️⃣ SS 1 Art Stream Subjects -> Count: ${artCount} (Expected 8) -> ${artCount === 8 ? '✅ PASS' : '❌ FAIL'}`);

    const resCom = await makeGet('/api/admin/classes/SS%201%20Commercial/subjects');
    const comCount = resCom.body?.subjects?.length || 0;
    console.log(`4️⃣ SS 1 Commercial Stream Subjects -> Count: ${comCount} (Expected 9) -> ${comCount === 9 ? '✅ PASS' : '❌ FAIL'}`);
  } catch (err) {
    console.error('Error during verification:', err.message);
  }

  console.log('\n🎉 Stream Allocation Verification Complete!');
}

runVerification();
