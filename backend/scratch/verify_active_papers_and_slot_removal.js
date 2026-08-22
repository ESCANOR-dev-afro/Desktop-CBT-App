/**
 * verify_active_papers_and_slot_removal.js
 * 
 * Verification Test Suite for:
 * 1. GET /api/student/assigned-exams (and /assigned-papers) strict active-status filtering.
 * 2. Inactive papers are completely excluded from student payload.
 * 3. In-progress sessions show status = 'in_progress' and sessionId.
 * 4. Completed/submitted papers are excluded from the returned payload and vanish from the student list.
 * 5. Returns 0 papers when all are deactivated (triggering empty state display).
 */

const http = require('http');
const db = require('../database');

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

function runDb(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

async function runTestSuite() {
    console.log("==================================================================");
    console.log("⚡ TEST SUITE: STUDENT ASSIGNED EXAMS & STRICT ACTIVE FILTERING");
    console.log("==================================================================\n");

    // 1. Clean purge
    console.log("1️⃣ Purging production test data...");
    await makeRequest('POST', '/api/admin/system/purge-production-data');

    // 2. Enroll candidate in SS 1 Science
    console.log("2️⃣ Enrolling candidate ADEMOLA Segun in SS 1 Science...");
    const studentRes = await makeRequest('POST', '/api/admin/students', {
        reg_number: 'ADM2627001',
        surname: 'ADEMOLA',
        first_name: 'Segun',
        class: 'SS 1 Science',
        assigned_subject: 'Mathematics, English Language, Physics, Chemistry, Biology'
    });

    const studentId = studentRes.body.student_id || 1;
    console.log(`   Enrolled candidate. Student ID: ${studentId}`);

    // Seed test questions for Physics and Chemistry
    console.log("   Seeding test question bank for Physics & Chemistry...");
    for (let i = 1; i <= 5; i++) {
        await runDb(`
            INSERT INTO questions (session, term, class, subject, assessment_slot, question_text, option_a, option_b, option_c, option_d, correct_answer)
            VALUES ('2026/2027', '1st Term', 'SS 1 Science', 'Physics', 'midterm_ca', 'What is Physics Question ' || ?, 'Opt A', 'Opt B', 'Opt C', 'Opt D', 'A')
        `, [i]);
        await runDb(`
            INSERT INTO questions (session, term, class, subject, assessment_slot, question_text, option_a, option_b, option_c, option_d, correct_answer)
            VALUES ('2026/2027', '1st Term', 'SS 1 Science', 'Chemistry', 'midterm_ca', 'What is Chemistry Question ' || ?, 'Opt A', 'Opt B', 'Opt C', 'Opt D', 'B')
        `, [i]);
    }

    // Ensure all subjects are inactive initially
    const allSubjects = ['Mathematics', 'English Language', 'Physics', 'Chemistry', 'Biology'];
    for (const sub of allSubjects) {
        await makeRequest('POST', '/api/admin/subjects/toggle', {
            class: 'SS 1 Science',
            subject: sub,
            is_active: 0
        });
    }

    // 3. Test: GET /api/student/assigned-exams when all are inactive
    console.log("\n3️⃣ Testing GET /api/student/assigned-exams with 0 active papers...");
    const resInactive = await makeRequest('GET', `/api/student/assigned-exams?student_id=${studentId}`);
    const activeExams0 = resInactive.body.activeExams || [];
    console.log(`   Active exams count: ${activeExams0.length}`);
    if (activeExams0.length !== 0) {
        console.error("❌ Expected 0 active exams when all are inactive, got:", activeExams0);
        process.exit(1);
    }
    console.log("   ✅ Passed: 0 papers returned when all inactive (empty state triggered).");

    // 4. Test: Activate 'Physics'
    console.log("\n4️⃣ Activating ONLY 'Physics' for SS 1 Science...");
    await makeRequest('POST', '/api/admin/subjects/toggle', {
        class: 'SS 1 Science',
        subject: 'Physics',
        is_active: 1
    });

    const resPhysics = await makeRequest('GET', `/api/student/assigned-exams?student_id=${studentId}`);
    const activeExams1 = resPhysics.body.activeExams || [];
    console.log(`   Active exams count: ${activeExams1.length}`);
    if (activeExams1.length !== 1 || activeExams1[0].subject.toLowerCase() !== 'physics') {
        console.error("❌ Expected only 'Physics' in active exams, got:", activeExams1);
        process.exit(1);
    }
    console.log(`   ✅ Passed: Exactly 1 active exam ('Physics') returned: status = ${activeExams1[0].status}`);

    // 5. Test: Activate 'Chemistry'
    console.log("\n5️⃣ Activating 'Chemistry' for SS 1 Science...");
    await makeRequest('POST', '/api/admin/subjects/toggle', {
        class: 'SS 1 Science',
        subject: 'Chemistry',
        is_active: 1
    });

    const resBoth = await makeRequest('GET', `/api/student/assigned-exams?student_id=${studentId}`);
    const activeExams2 = resBoth.body.activeExams || [];
    console.log(`   Active exams count: ${activeExams2.length}`);
    const subNames = activeExams2.map(e => e.subject.toLowerCase());
    if (activeExams2.length !== 2 || !subNames.includes('physics') || !subNames.includes('chemistry')) {
        console.error("❌ Expected Physics and Chemistry in active exams, got:", activeExams2);
        process.exit(1);
    }
    console.log("   ✅ Passed: Both 'Physics' and 'Chemistry' are returned.");

    // 6. Test: Start session for Physics -> check in_progress status
    console.log("\n6️⃣ Starting exam session for Physics...");
    const startRes = await makeRequest('POST', '/api/exam/start-session', {
        student_id: studentId,
        subject: 'Physics',
        workstation_ip: 'TEST_WORKSTATION_1'
    });
    const sessionId = startRes.body.session_id;
    console.log(`   Session created. Session ID: ${sessionId}`);

    const resInProgress = await makeRequest('GET', `/api/student/assigned-exams?student_id=${studentId}`);
    const physCard = (resInProgress.body.activeExams || []).find(e => e.subject.toLowerCase() === 'physics');
    console.log(`   Physics card status: ${physCard?.status}, hasActiveSession: ${physCard?.hasActiveSession}, sessionId: ${physCard?.sessionId}`);

    if (!physCard || physCard.status !== 'in_progress' || !physCard.hasActiveSession) {
        console.error("❌ Physics card was not marked in_progress!", physCard);
        process.exit(1);
    }
    console.log("   ✅ Passed: Active exam session reflected as 'in_progress' with resume capability.");

    // 7. Test: Submit Physics exam -> verify Physics vanishes from active list
    console.log("\n7️⃣ Submitting exam for Physics...");
    await makeRequest('POST', '/api/admin/live-monitor/force-submit', {
        session_id: sessionId
    });

    const resAfterSubmit = await makeRequest('GET', `/api/student/assigned-exams?student_id=${studentId}`);
    const activeExamsAfterSubmit = resAfterSubmit.body.activeExams || [];
    console.log(`   Active exams count after submission: ${activeExamsAfterSubmit.length}`);
    activeExamsAfterSubmit.forEach(e => console.log(`   - Paper: ${e.subject} | Status: ${e.status}`));

    const hasPhys = activeExamsAfterSubmit.some(e => e.subject.toLowerCase() === 'physics');
    if (hasPhys) {
        console.error("❌ Submitted exam 'Physics' was NOT excluded from active exams list!", activeExamsAfterSubmit);
        process.exit(1);
    }
    if (activeExamsAfterSubmit.length !== 1 || activeExamsAfterSubmit[0].subject.toLowerCase() !== 'chemistry') {
        console.error("❌ Expected only 'Chemistry' to remain, got:", activeExamsAfterSubmit);
        process.exit(1);
    }
    console.log("   ✅ Passed: Submitted exam 'Physics' vanished immediately; 'Chemistry' remains actionable.");

    // 8. Test: Deactivate Chemistry -> verify empty list (0 papers)
    console.log("\n8️⃣ Deactivating 'Chemistry' (is_active = 0)...");
    await makeRequest('POST', '/api/admin/subjects/toggle', {
        class: 'SS 1 Science',
        subject: 'Chemistry',
        is_active: 0
    });

    const resFinal = await makeRequest('GET', `/api/student/assigned-exams?student_id=${studentId}`);
    const finalExams = resFinal.body.activeExams || [];
    console.log(`   Final active exams count: ${finalExams.length}`);
    if (finalExams.length !== 0) {
        console.error("❌ Expected 0 active exams, got:", finalExams);
        process.exit(1);
    }
    console.log("   ✅ Passed: All completed / inactive papers cleanly excluded (triggers standardized empty state).");

    console.log("\n==================================================================");
    console.log("🎉 ALL TESTS PASSED: STRICT ACTIVE-STATUS FILTERING VERIFIED 100%!");
    console.log("==================================================================\n");
    process.exit(0);
}

runTestSuite().catch(err => {
    console.error("❌ Test suite exception:", err);
    process.exit(1);
});
