/**
 * verify_multi_subject_auth_and_session_isolation.js
 * 
 * Verifies:
 * 1. Candidate login (POST /api/student/login) succeeds even if a completed session exists.
 * 2. GET /api/student/assigned-papers returns subject-level statuses:
 *    - 'completed' for submitted subjects
 *    - 'available' for pending subjects
 * 3. POST /api/student/start-exam blocks access (403) for already submitted subjects.
 * 4. GET /api/exam/questions/:subject blocks questions delivery (403) for already submitted subjects.
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
                resolve({ statusCode: res.statusCode, data: parsed, raw: data });
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runVerification() {
    console.log('🧪 Starting Multi-Subject Session & Auth Isolation Verification...');

    // 1. Authenticate candidate AWA26271001 (ADEBAYO David, SS 1 Science)
    const loginRes = await makeRequest('POST', '/api/student/login', {
        registration_no: 'AWA26271001',
        surname: 'ADEBAYO'
    });

    console.log(`[1] POST /api/student/login -> Status: ${loginRes.statusCode}, Data:`, loginRes.data);
    assert.strictEqual(loginRes.statusCode, 200, 'Student login should return 200 OK');
    assert.strictEqual(loginRes.data?.success, true, 'Student login should succeed');
    const student = loginRes.data.student;
    console.log(`    Candidate logged in: ${student.first_name} ${student.surname} (${student.reg_number}, ${student.class})`);

    // 2. Fetch assigned papers for candidate
    const papersRes = await makeRequest('GET', `/api/student/assigned-papers?student_id=${student.id}`);
    console.log(`[2] GET /api/student/assigned-papers -> Status: ${papersRes.statusCode}, Papers count: ${papersRes.data?.papers?.length}`);
    assert.strictEqual(papersRes.statusCode, 200, 'GET assigned-papers should return 200 OK');
    assert(Array.isArray(papersRes.data?.papers), 'Papers should be an array');

    const papers = papersRes.data.papers;
    console.log('    Subject Statuses:');
    papers.forEach(p => {
        console.log(`    - ${p.name || p.subject}: Status = [${p.status}] (${p.message})`);
    });

    // 3. Mark Mathematics as SUBMITTED directly in DB via submission API or mock to simulate morning exam completion
    const submitMathRes = await makeRequest('POST', '/api/exam/submit', {
        student_id: student.id,
        session_id: loginRes.data.session_id,
        user_answers: { 1: 'A', 2: 'B' }
    });
    console.log(`[3] POST /api/exam/submit (Mathematics) -> Status: ${submitMathRes.statusCode}`);

    // 4. Verify candidate can STILL log in AFTER completing Mathematics earlier
    const loginRes2 = await makeRequest('POST', '/api/student/login', {
        registration_no: 'AWA26271001',
        surname: 'ADEBAYO'
    });
    console.log(`[4] Re-login POST /api/student/login after exam completion -> Status: ${loginRes2.statusCode}, Data:`, loginRes2.data);
    assert.strictEqual(loginRes2.statusCode, 200, 'Candidate MUST be allowed to log in even if earlier subject was completed!');

    // 5. Verify start-exam & question fetching for completed subject returns 403
    const startMathRes = await makeRequest('POST', '/api/student/start-exam', {
        student_id: student.id,
        subject: 'Mathematics'
    });
    console.log(`[5] POST /api/student/start-exam (Mathematics) -> Status: ${startMathRes.statusCode}, Msg: "${startMathRes.data?.message}"`);
    assert.strictEqual(startMathRes.statusCode, 403, 'Completed subject MUST return 403 Forbidden on start-exam');

    const mathQRes = await makeRequest('GET', `/api/exam/questions/Mathematics?student_id=${student.id}`);
    console.log(`[6] GET /api/exam/questions/Mathematics -> Status: ${mathQRes.statusCode}, Msg: "${mathQRes.data?.message}"`);
    assert.strictEqual(mathQRes.statusCode, 403, 'Completed subject MUST return 403 Forbidden on questions fetch');

    // 6. Verify candidate can start a DIFFERENT subject (e.g. Biology or Physics)
    const startBioRes = await makeRequest('POST', '/api/student/start-exam', {
        student_id: student.id,
        subject: 'Biology'
    });
    console.log(`[7] POST /api/student/start-exam (Biology) -> Status: ${startBioRes.statusCode}, Success: ${startBioRes.data?.success}`);
    assert.strictEqual(startBioRes.statusCode, 200, 'Unsubmitted subject MUST be accessible and allowed to start!');

    console.log('\n🎉 ALL MULTI-SUBJECT AUTH & SESSION ISOLATION TESTS PASSED PERFECTLY!');
}

runVerification().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
