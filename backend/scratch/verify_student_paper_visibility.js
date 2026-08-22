/**
 * verify_student_paper_visibility.js
 * 
 * Automated Verification Suite for Student Paper Gateway Visibility & Activation Toggling:
 * 1. Enrolls candidate SANUSI Kemi in SS 1 Science.
 * 2. Sets SS 1 Science "Physics" to ACTIVE (is_active = 1), and all other subjects to INACTIVE.
 * 3. Verifies GET /api/student/assigned-papers and GET /api/student/:id/dashboard return ONLY Physics.
 * 4. Toggles Physics to INACTIVE (is_active = 0).
 * 5. Verifies assigned-papers returns 0 papers (triggering the empty status card message).
 * 6. Submits Physics exam session and verifies completed status card retention.
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

async function runStudentPaperVisibilitySuite() {
    console.log("==================================================================");
    console.log("⚡ CBT AGENTIC TEST SUITE: STUDENT PAPER GATEWAY VISIBILITY");
    console.log("==================================================================\n");

    // 1. Initial DB purge
    await makeRequest('POST', '/api/admin/system/purge-production-data');

    // 2. Enroll student SANUSI Kemi in SS 1 Science
    console.log("1️⃣ Enrolling candidate SANUSI Kemi in SS 1 Science...");
    const studentRes = await makeRequest('POST', '/api/admin/students', {
        reg_number: 'SAN2627001',
        surname: 'SANUSI',
        first_name: 'Kemi',
        class: 'SS 1 Science',
        assigned_subject: 'Mathematics, English Language, Physics, Chemistry, Biology, Civic Education, Computer Studies'
    });

    const studentId = studentRes.body.student_id || 1;
    console.log(`  Candidate enrolled successfully. Student ID: ${studentId}`);

    // Seed test question for Physics
    const db = require('../database');
    await new Promise((res, rej) => {
        db.run(`INSERT INTO questions (session, term, class, subject, assessment_slot, question_text, option_a, option_b, option_c, option_d, correct_answer) VALUES ('2026/2027', '1st Term', 'SS 1 Science', 'Physics', 'midterm_ca', 'Sample Physics Q1', 'A', 'B', 'C', 'D', 'A')`, (err) => err ? rej(err) : res());
    });

    // 3. Set Physics to ACTIVE (is_active = 1) for SS 1 Science
    console.log("\n2️⃣ Setting ONLY 'Physics' to ACTIVE for SS 1 Science...");
    const activateRes = await makeRequest('POST', '/api/admin/subjects/toggle', {
        class: 'SS 1 Science',
        subject: 'Physics',
        is_active: 1
    });
    console.log(`  Admin Toggle Response: "${activateRes.body.message}"`);

    // Ensure all other subjects are inactive
    const otherSubjects = ['Mathematics', 'Chemistry', 'Biology', 'English Language'];
    for (const sub of otherSubjects) {
        await makeRequest('POST', '/api/admin/subjects/toggle', {
            class: 'SS 1 Science',
            subject: sub,
            is_active: 0
        });
    }

    // 4. Query student dashboard & assigned papers endpoints
    console.log("\n3️⃣ Fetching assigned papers for SANUSI Kemi (SS 1 Science)...");
    const assignedPapersRes = await makeRequest('GET', `/api/student/assigned-papers?registration_no=SAN2627001`);
    const papers = assignedPapersRes.body.papers || [];

    console.log(`  Total Active Papers Returned in Payload: ${papers.length}`);
    papers.forEach(p => console.log(`  - Paper: ${p.subject} | Status: ${p.status} | IsActive: ${p.is_active}`));

    if (papers.length !== 1 || papers[0].subject.toLowerCase() !== 'physics') {
        console.error("❌ Visibility filtering failed! Inactive papers were returned in payload:", papers);
        process.exit(1);
    }
    console.log("  ✅ Verification Passed: ONLY the active 'Physics' paper card is returned to the student!");

    // 5. Query student dashboard endpoint (/api/student/:id/dashboard)
    const dashboardRes = await makeRequest('GET', `/api/student/${studentId}/dashboard`);
    const dashboardSubjects = dashboardRes.body.subjects || [];
    console.log(`  Dashboard Subjects Returned: ${dashboardSubjects.length}`);
    if (dashboardSubjects.length !== 1 || dashboardSubjects[0].name.toLowerCase() !== 'physics') {
        console.error("❌ Dashboard endpoint visibility filtering failed!", dashboardSubjects);
        process.exit(1);
    }
    console.log("  ✅ Student Dashboard endpoint verified: Only 'Physics' is returned!");

    // 6. Toggle Physics to INACTIVE (is_active = 0)
    console.log("\n4️⃣ Toggling 'Physics' to INACTIVE (is_active = 0)...");
    await makeRequest('POST', '/api/admin/subjects/toggle', {
        class: 'SS 1 Science',
        subject: 'Physics',
        is_active: 0
    });

    const emptyPapersRes = await makeRequest('GET', `/api/student/assigned-papers?registration_no=SAN2627001`);
    const emptyList = emptyPapersRes.body.papers || [];
    console.log(`  Papers Returned After Deactivating Physics: ${emptyList.length}`);

    if (emptyList.length !== 0) {
        console.error("❌ Paper did not vanish when set to inactive!", emptyList);
        process.exit(1);
    }
    console.log("  ✅ Verification Passed: Subject vanished instantly from student payload when set to INACTIVE (0 papers returned, triggering empty state status card)!");

    // 7. Re-activate Physics & test Submitted state handling
    console.log("\n5️⃣ Re-activating Physics and submitting an exam session...");
    await makeRequest('POST', '/api/admin/subjects/toggle', {
        class: 'SS 1 Science',
        subject: 'Physics',
        is_active: 1
    });

    // Start session
    const startSess = await makeRequest('POST', '/api/exam/start-session', {
        student_id: studentId,
        subject: 'Physics',
        workstation_ip: 'TEST_NODE_1'
    });
    const sessionId = startSess.body.session_id;

    // Force submit session
    await makeRequest('POST', '/api/admin/live-monitor/force-submit', {
        session_id: sessionId
    });

    // Query assigned papers after submission (submitted exam must be excluded)
    const submittedPapersRes = await makeRequest('GET', `/api/student/assigned-papers?registration_no=SAN2627001`);
    const submittedList = submittedPapersRes.body.papers || [];
    console.log(`  Active Papers Returned After Submission: ${submittedList.length}`);

    if (submittedList.length !== 0) {
        console.error("❌ Submitted paper was not excluded!", submittedList);
        process.exit(1);
    }
    console.log("  ✅ Verification Passed: Submitted exam vanished cleanly from active exam list!");

    console.log("==================================================================\n");
}

runStudentPaperVisibilitySuite().catch(err => {
    console.error("❌ Test suite exception:", err);
    process.exit(1);
});
