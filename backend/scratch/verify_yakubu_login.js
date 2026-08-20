/**
 * verify_yakubu_login.js
 * 
 * Verifies candidate AWA26271050 (YAKUBU) can log in cleanly via POST /api/student/login
 * and fetch assigned subjects via GET /api/student/assigned-subjects.
 */

const http = require('http');
const assert = require('assert');

function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch (_) {}
                resolve({ statusCode: res.statusCode, data: parsed });
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runTest() {
    console.log('🧪 Testing Candidate AWA26271050 (YAKUBU) Login & Subject Selection...');

    // 1. Authenticate candidate AWA26271050 (YAKUBU)
    const loginRes = await makeRequest('POST', '/api/student/login', {
        registration_no: 'AWA26271050',
        surname: 'YAKUBU'
    });

    console.log(`[1] POST /api/student/login -> Status: ${loginRes.statusCode}, Success: ${loginRes.data?.success}`);
    assert.strictEqual(loginRes.statusCode, 200, 'Student login MUST return 200 OK');
    assert.strictEqual(loginRes.data?.success, true, 'Student login MUST return success: true');
    
    const student = loginRes.data.student;
    console.log(`    Candidate metadata: ID ${student.id}, ${student.first_name} ${student.surname} (${student.reg_number}, ${student.class})`);

    // 2. Fetch assigned subjects via GET /api/student/assigned-subjects
    const subRes = await makeRequest('GET', `/api/student/assigned-subjects?student_id=${student.id}`);
    console.log(`[2] GET /api/student/assigned-subjects -> Status: ${subRes.statusCode}, Papers count: ${subRes.data?.papers?.length}`);
    assert.strictEqual(subRes.statusCode, 200, 'Assigned subjects endpoint MUST return 200 OK');
    assert(Array.isArray(subRes.data?.papers), 'Assigned subjects MUST return papers array');

    // 3. Simulate submitting Mathematics paper
    const submitRes = await makeRequest('POST', '/api/exam/submit', {
        student_id: student.id,
        session_id: loginRes.data.session_id,
        subject: 'Mathematics',
        user_answers: { 1: 'A' }
    });
    console.log(`[3] POST /api/exam/submit (Mathematics) -> Status: ${submitRes.statusCode}`);

    // 4. Re-login as AWA26271050 after completing Mathematics
    const reloginRes = await makeRequest('POST', '/api/student/login', {
        registration_no: 'AWA26271050',
        surname: 'YAKUBU'
    });
    console.log(`[4] Re-login POST /api/student/login after Math completion -> Status: ${reloginRes.statusCode}, Success: ${reloginRes.data?.success}`);
    assert.strictEqual(reloginRes.statusCode, 200, 'Re-login MUST succeed (200 OK) regardless of completed subjects!');

    // 5. Check assigned subjects again -> Mathematics should now show 'completed'
    const subRes2 = await makeRequest('GET', `/api/student/assigned-subjects?student_id=${student.id}`);
    const mathPaper = subRes2.data?.papers?.find(p => String(p.name || p.subject).toLowerCase() === 'mathematics');
    console.log(`[5] Mathematics subject status on dashboard -> Status: [${mathPaper?.status}]`);
    assert.strictEqual(mathPaper?.status, 'completed', 'Mathematics paper MUST be marked completed');

    // 6. Attempt start-exam on Mathematics -> MUST return 403 Forbidden
    const startMathRes = await makeRequest('POST', '/api/student/start-exam', {
        student_id: student.id,
        subject: 'Mathematics'
    });
    console.log(`[6] POST /api/student/start-exam (Mathematics) -> Status: ${startMathRes.statusCode}, Message: "${startMathRes.data?.message}"`);
    assert.strictEqual(startMathRes.statusCode, 403, 'Attempting to restart submitted subject MUST return 403 Forbidden');

    // 7. Attempt start-exam on Biology -> MUST return 200 OK
    const startBioRes = await makeRequest('POST', '/api/student/start-exam', {
        student_id: student.id,
        subject: 'Biology'
    });
    console.log(`[7] POST /api/student/start-exam (Biology) -> Status: ${startBioRes.statusCode}, Success: ${startBioRes.data?.success}`);
    assert.strictEqual(startBioRes.statusCode, 200, 'Starting pending subject MUST return 200 OK');

    console.log('\n🎉 ALL CANDIDATE LOGIN & SUBJECT ISOLATION VERIFICATIONS PASSED!');
}

runTest().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
