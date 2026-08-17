/**
 * verify_live_monitor_realtime.js
 * 
 * Production verification suite for Full Database Purge & Real-Time Live Workstation Monitor:
 * 1. Verify clean database state (0 mock records).
 * 2. Register real candidate for "SS 1 Art".
 * 3. Launch live exam session for student candidate.
 * 4. Query GET /api/admin/live-monitor?class=SS 1 Art and verify dynamic streaming card.
 * 5. Test live control actions (+5m extension, Force Submit).
 */

const http = require('http');

function makeRequest(method, path, body = null, port = 3000) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : '';
        const req = http.request({
            host: '127.0.0.1',
            port: port,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let responseText = '';
            res.on('data', chunk => responseText += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(responseText);
                    resolve({ statusCode: res.statusCode, body: parsed });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, body: responseText });
                }
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function runLiveMonitorVerificationSuite() {
    console.log("==================================================================");
    console.log("⚡ CBT AGENTIC TEST SUITE: REAL-TIME LIVE WORKSTATION MONITOR");
    console.log("==================================================================\n");

    const TEST_CLASS = 'SS 1 Art';
    const TEST_SUBJECT = 'Government';

    // 1. Initial Live Monitor Query (Clean DB)
    console.log(`1️⃣ Querying GET /api/admin/live-monitor?class=${encodeURIComponent(TEST_CLASS)} (Clean DB)...`);
    const initialRes = await makeRequest('GET', `/api/admin/live-monitor?class=${encodeURIComponent(TEST_CLASS)}`);
    
    console.log(`  Status: ${initialRes.statusCode}`);
    console.log(`  Enrolled Candidates: ${initialRes.body.metrics.enrolledCandidates}`);
    console.log(`  Active Workstations: ${initialRes.body.metrics.activeWorkstations}`);
    console.log(`  Active Sessions Count: ${initialRes.body.sessions.length}`);

    if (initialRes.body.metrics.enrolledCandidates !== 0 || initialRes.body.sessions.length !== 0) {
        console.error("❌ Clean state check failed! Mock data detected:", initialRes.body);
        process.exit(1);
    }
    console.log("  ✅ Verified 0 mock records in clean monitor.");

    // 2. Register Candidate & Question
    console.log(`\n2️⃣ Registering Candidate & Seeding Exam Question for ${TEST_CLASS}...`);
    const candRes = await makeRequest('POST', '/api/admin/students', {
        reg_number: 'AWA26279901',
        surname: 'NWACHUKWU',
        first_name: 'Chidi',
        class: TEST_CLASS,
        assigned_subject: TEST_SUBJECT
    });
    const studentId = candRes.body.student_id;

    await makeRequest('POST', '/api/admin/questions', {
        class: TEST_CLASS,
        subject: TEST_SUBJECT,
        question_text: 'Live Monitor Test Question: What is arms of government?',
        option_a: 'Executive, Legislature, Judiciary',
        option_b: 'Federal, State, Local',
        option_c: 'Monopoly, Oligopoly',
        option_d: 'Primary, Secondary',
        correct_answer: 'A',
        marks: 1
    });

    console.log(`  ✅ Student candidate created (ID #${studentId})`);

    // 3. Launch Student Exam Session
    console.log(`\n3️⃣ Launching Exam Session for Student #${studentId}...`);
    const startRes = await makeRequest('POST', '/api/student/exam/start', {
        student_id: studentId,
        subject: TEST_SUBJECT,
        subject_name: TEST_SUBJECT,
        duration_minutes: 45
    });

    if (!startRes.body.success) {
        console.error("❌ Failed to start student session:", startRes.body);
        process.exit(1);
    }
    const sessionId = startRes.body.session_id;
    console.log(`  ✅ Student Exam Session started (Session #${sessionId})`);

    // 4. Query Live Monitor API
    console.log(`\n4️⃣ Querying GET /api/admin/live-monitor?class=${encodeURIComponent(TEST_CLASS)} with Active Session...`);
    const liveRes = await makeRequest('GET', `/api/admin/live-monitor?class=${encodeURIComponent(TEST_CLASS)}`);

    console.log(`  Enrolled Candidates: ${liveRes.body.metrics.enrolledCandidates}`);
    console.log(`  Active Workstations: ${liveRes.body.metrics.activeWorkstations}`);
    console.log(`  Idle Nodes: ${liveRes.body.metrics.idleNodes}`);
    
    if (liveRes.body.sessions.length !== 1) {
        console.error("❌ Active session card missing from live monitor!", liveRes.body);
        process.exit(1);
    }

    const card = liveRes.body.sessions[0];
    console.log(`  Live Card Candidate: ${card.studentName} (${card.regNo})`);
    console.log(`  Subject: ${card.subject}`);
    console.log(`  Status: ${card.status}`);
    console.log(`  Progress: Q ${card.currentQuestion} / ${card.totalQuestions}`);

    if (card.studentName !== 'NWACHUKWU, Chidi' || card.status !== 'IN_PROGRESS') {
        console.error("❌ Live card details mismatch:", card);
        process.exit(1);
    }
    console.log("  ✅ Real-time student session streaming verified ok.");

    // 5. Test Time Extension Action (+5m)
    console.log(`\n5️⃣ Testing POST /api/admin/live-monitor/extend-time (+5m)...`);
    const extendRes = await makeRequest('POST', '/api/admin/live-monitor/extend-time', {
        session_id: sessionId,
        minutes: 5
    });
    console.log(`  Extend Time Response: "${extendRes.body.message}"`);
    if (!extendRes.body.success) {
        console.error("❌ Time extension action failed:", extendRes.body);
        process.exit(1);
    }
    console.log("  ✅ +5m extension action verified.");

    // 6. Test Force Submit Action
    console.log(`\n6️⃣ Testing POST /api/admin/live-monitor/force-submit...`);
    const submitRes = await makeRequest('POST', '/api/admin/live-monitor/force-submit', {
        session_id: sessionId
    });
    console.log(`  Force Submit Response: "${submitRes.body.message}"`);
    if (!submitRes.body.success) {
        console.error("❌ Force submit action failed:", submitRes.body);
        process.exit(1);
    }

    // 7. Re-query Live Monitor after Force Submit
    const postSubmitRes = await makeRequest('GET', `/api/admin/live-monitor?class=${encodeURIComponent(TEST_CLASS)}`);
    console.log(`\n7️⃣ Live Monitor Metrics After Submit:`);
    console.log(`  Active Workstations: ${postSubmitRes.body.metrics.activeWorkstations}`);
    console.log(`  Submitted Exams: ${postSubmitRes.body.metrics.submittedExams}`);

    if (postSubmitRes.body.metrics.activeWorkstations !== 0 || postSubmitRes.body.metrics.submittedExams !== 1) {
        console.error("❌ Post-submit live metric calculation failed:", postSubmitRes.body.metrics);
        process.exit(1);
    }
    console.log("  ✅ Live metrics calculation after submission verified ok.");

    console.log("\n==================================================================");
    console.log("🎉 ALL TESTS PASSED: REAL-TIME LIVE WORKSTATION MONITOR VERIFIED OK!");
    console.log("==================================================================\n");
}

runLiveMonitorVerificationSuite().catch(err => {
    console.error("❌ Test suite exception:", err);
    process.exit(1);
});
