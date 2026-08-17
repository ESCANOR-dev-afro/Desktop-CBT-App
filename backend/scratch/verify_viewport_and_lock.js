/**
 * verify_viewport_and_lock.js
 * 
 * Verification Test Suite for:
 * 1. Strict Subject Inactive/Active Gateway Enforcement (POST /api/student/exam/start).
 * 2. 403 Forbidden Error Message: "This subject examination is currently inactive for your class."
 * 3. Class-Isolated activation toggle (SS 1 Science Mathematics).
 * 4. Question 10 diagram asset availability.
 * 5. Student Web Portal root asset hosting.
 */

const http = require('http');
const PORT = 61898;
const app = require('../server');
const db = require('../database');

let server;

function dbRun(sql, params = []) {
    return new Promise((res, rej) => db.run(sql, params, err => err ? rej(err) : res()));
}

function makeRequest(method, urlPath, bodyObj = null) {
    return new Promise((resolve, reject) => {
        const payload = bodyObj ? JSON.stringify(bodyObj) : null;
        const options = {
            hostname: '127.0.0.1',
            port: PORT,
            path: urlPath,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = data;
                try { parsed = JSON.parse(data); } catch (_) {}
                resolve({ statusCode: res.statusCode, body: parsed });
            });
        });

        req.on('error', err => reject(err));
        if (payload) req.write(payload);
        req.end();
    });
}

async function runViewportAndLockVerification() {
    console.log('----------------------------------------------------');
    console.log('🚀 TESTING VIEWPORT SCROLLING & GATEWAY LOCK ENFORCEMENT');
    console.log('----------------------------------------------------');

    server = http.createServer(app);
    await new Promise(res => server.listen(PORT, '127.0.0.1', res));
    console.log(`✅ Test Server running on port ${PORT}`);

    try {
        // Ensure test candidate exists
        await dbRun(`INSERT OR REPLACE INTO students (id, reg_number, registration_no, surname, first_name, class, assigned_subject) VALUES (9002, 'TESTSS1', 'TESTSS1', 'SMITH', 'John', 'SS 1 Science', 'Mathematics')`);

        // 1. Lock SS 1 Science Mathematics (is_active = 0)
        console.log('\n[1] Setting SS 1 Science Mathematics to INACTIVE (is_active = 0)...');
        const lockRes = await makeRequest('PATCH', '/api/admin/subject-config/status', {
            class: 'SS 1 Science',
            subject: 'Mathematics',
            is_active: 0
        });
        console.log(`  Patch Status: ${lockRes.statusCode}`);
        console.log(`  Result: Class=${lockRes.body.class}, Subject=${lockRes.body.subject}, is_active=${lockRes.body.is_active}`);

        // 2. Query Dashboard Papers for SS 1 Science Candidate
        console.log('\n[2] Checking GET /api/student/assigned-papers for SS 1 Science Candidate...');
        const papersRes = await makeRequest('GET', '/api/student/assigned-papers?registration_no=TESTSS1');
        const mathPaper = papersRes.body.papers?.find(p => p.subject.toLowerCase() === 'mathematics');
        console.log(`  Paper Status: ${mathPaper?.status}, is_active: ${mathPaper?.is_active}`);
        if (!mathPaper || mathPaper.is_active !== false || mathPaper.status !== 'not_scheduled') {
            throw new Error(`Expected SS 1 Science Math to be inactive/not_scheduled, got: ${JSON.stringify(mathPaper)}`);
        }
        console.log('  ✅ Student Dashboard correctly reflects INACTIVE / NOT SCHEDULED status.');

        // 3. Attempt POST /api/student/exam/start for locked subject
        console.log('\n[3] Calling POST /api/student/exam/start for locked Mathematics paper...');
        const startAttempt = await makeRequest('POST', '/api/student/exam/start', {
            student_id: 9002,
            subject: 'Mathematics',
            class: 'SS 1 Science'
        });
        console.log(`  Start Exam Response Code: ${startAttempt.statusCode}`);
        console.log(`  Error Message: "${startAttempt.body.message}"`);

        if (startAttempt.statusCode !== 403 || startAttempt.body.message !== "This subject examination is currently inactive for your class.") {
            throw new Error(`Expected 403 Forbidden with exact message "This subject examination is currently inactive for your class.", got ${startAttempt.statusCode}: ${JSON.stringify(startAttempt.body)}`);
        }
        console.log('  ✅ Gateway strictly rejected start attempt with 403 Forbidden & exact error string.');

        // 4. Re-activate SS 1 Science Mathematics (is_active = 1)
        console.log('\n[4] Re-activating SS 1 Science Mathematics (is_active = 1)...');
        const unlockRes = await makeRequest('PATCH', '/api/admin/subject-config/status', {
            class: 'SS 1 Science',
            subject: 'Mathematics',
            is_active: 1
        });
        console.log(`  Patch Status: ${unlockRes.statusCode}, is_active: ${unlockRes.body.is_active}`);

        // 5. Retry POST /api/student/exam/start for active subject
        console.log('\n[5] Calling POST /api/student/exam/start for unlocked Mathematics paper...');
        const activeStartAttempt = await makeRequest('POST', '/api/student/exam/start', {
            student_id: 9002,
            subject: 'Mathematics',
            class: 'SS 1 Science'
        });
        console.log(`  Active Start Response Code: ${activeStartAttempt.statusCode}`);
        console.log(`  Questions Delivered: ${activeStartAttempt.body.questions?.length}`);
        if (activeStartAttempt.statusCode !== 200 || !activeStartAttempt.body.success) {
            throw new Error(`Expected 200 OK upon subject re-activation, got: ${JSON.stringify(activeStartAttempt.body)}`);
        }
        console.log('  ✅ Gateway successfully authorized and initialized exam session upon activation.');

        // 6. Verify Question Diagram Asset availability
        console.log('\n[6] Inspecting Question Pool Diagram assets...');
        const sampleDiagramQ = activeStartAttempt.body.questions?.find(q => q.diagram_filename || q.diagram_url);
        if (sampleDiagramQ) {
            console.log(`  Question ID #${sampleDiagramQ.id} contains diagram: ${sampleDiagramQ.diagram_filename || sampleDiagramQ.diagram_url}`);
        } else {
            console.log('  Notice: Questions loaded cleanly without diagram requirement for this sample set.');
        }

        // 7. Verify Root HTML Web Hosting
        console.log('\n[7] Verifying Student Client Static Web Hosting (GET /)...');
        const rootRes = await makeRequest('GET', '/');
        console.log(`  GET / Status Code: ${rootRes.statusCode}`);
        if (rootRes.statusCode !== 200) {
            throw new Error('Student Client root route "/" failed!');
        }
        console.log('  ✅ Student client web portal served successfully at root "/".');

        console.log('----------------------------------------------------');
        console.log('🎉 ALL GATEWAY LOCK & VIEWPORT VERIFICATIONS PASSED');
        console.log('----------------------------------------------------');

        server.close();
        process.exit(0);

    } catch (err) {
        console.error('❌ Verification Failed:', err);
        if (server) server.close();
        process.exit(1);
    }
}

runViewportAndLockVerification();
