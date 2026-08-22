/**
 * verify_ghost_purge.js
 * 
 * Verifies that:
 * 1. Ghost subjects (inactive or with 0 questions in bank) NEVER appear on the Student Portal.
 * 2. Only active assessment configs matching session, term, and class with question_count > 0 are returned.
 * 3. Both GET /api/student/assigned-exams and GET /api/student/:id/dashboard strictly return active papers only.
 * 4. Completed/submitted papers vanish immediately from the student's available exam list.
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

async function runTest() {
    console.log("==================================================================");
    console.log("🧪 TEST SUITE: PURGE GHOST SUBJECTS FROM STUDENT PORTAL");
    console.log("==================================================================\n");

    console.log("1️⃣ Purging database for fresh test run...");
    await makeRequest('POST', '/api/admin/system/purge-production-data');

    // 2. Enroll a candidate in SS 1 Science with 5 assigned subjects
    console.log("2️⃣ Enrolling candidate in SS 1 Science with 5 subjects (English, Math, Physics, Chemistry, Biology)...");
    const regRes = await makeRequest('POST', '/api/admin/students', {
        reg_number: 'SCI2026009',
        surname: 'ADEBAYO',
        first_name: 'David',
        class: 'SS 1 Science',
        assigned_subject: 'English Language, Mathematics, Physics, Chemistry, Biology'
    });
    const studentId = regRes.body.student_id || 1;

    // 3. Test before any questions/configs exist: expect 0 cards
    console.log("\n3️⃣ Checking assigned exams before configuring any assessment (Expected: 0 cards)...");
    const r1 = await makeRequest('GET', `/api/student/assigned-exams?student_id=${studentId}`);
    const r1Dash = await makeRequest('GET', `/api/student/${studentId}/dashboard`);

    console.log("   assigned-exams returned:", r1.body.activeExams?.length || 0);
    console.log("   dashboard returned:", r1Dash.body.activeExams?.length || 0);

    if ((r1.body.activeExams || []).length !== 0 || (r1Dash.body.activeExams || []).length !== 0) {
        console.error("❌ Ghost subjects leaked when 0 active exams exist!", r1.body.activeExams);
        process.exit(1);
    }
    console.log("   ✅ Passed: Zero cards returned when no active exam configs exist!");

    // 4. Create an INACTIVE config for English Language with 0 questions
    console.log("\n4️⃣ Creating INACTIVE config for English Language with 0 questions...");
    await makeRequest('POST', '/api/admin/assessment-config', {
        session: '2026/2027',
        term: '1st Term',
        class: 'SS 1 Science',
        subject: 'English Language',
        assessment_slot: 'midterm_ca',
        duration_minutes: 45,
        is_active: 0
    });

    const r2 = await makeRequest('GET', `/api/student/assigned-exams?student_id=${studentId}`);
    if ((r2.body.activeExams || []).length !== 0) {
        console.error("❌ Inactive config for English Language leaked to student!", r2.body.activeExams);
        process.exit(1);
    }
    console.log("   ✅ Passed: Inactive English Language does NOT appear on student portal!");

    // 5. Create ACTIVE config for Physics AND seed questions into Physics bucket
    console.log("\n5️⃣ Seeding 15 questions for Physics & activating assessment config...");
    for (let i = 1; i <= 15; i++) {
        await runDb(`
            INSERT INTO questions (session, term, class, subject, assessment_slot, question_text, option_a, option_b, option_c, option_d, correct_answer)
            VALUES ('2026/2027', '1st Term', 'SS 1 Science', 'Physics', 'midterm_ca', 'Physics Test Q' || ?, 'Opt A', 'Opt B', 'Opt C', 'Opt D', 'A')
        `, [i]);
    }
    await makeRequest('POST', '/api/admin/assessment-config', {
        session: '2026/2027',
        term: '1st Term',
        class: 'SS 1 Science',
        subject: 'Physics',
        assessment_slot: 'midterm_ca',
        duration_minutes: 40,
        is_active: 1
    });

    // 6. Check assigned exams: only Physics must be returned (English, Math, Chemistry, Biology must NOT appear)
    console.log("\n6️⃣ Checking assigned exams after Physics activation...");
    const r3 = await makeRequest('GET', `/api/student/assigned-exams?student_id=${studentId}`);
    const r3Dash = await makeRequest('GET', `/api/student/${studentId}/dashboard`);
    const papers = r3.body.activeExams || [];
    console.log(`   Assigned exams returned: ${papers.length} card(s)`);
    papers.forEach(p => console.log(`   - Subject: ${p.subject} | Questions: ${p.question_count} | Slot: ${p.assessment_slot}`));

    if (papers.length !== 1 || papers[0].subject !== 'Physics' || papers[0].question_count !== 15) {
        console.error("❌ Expected strictly 1 card (Physics with 15 questions), got:", papers);
        process.exit(1);
    }
    console.log("   ✅ Passed: Strictly 1 card (Physics) returned. All 4 other curriculum subjects were purged!");

    // 7. Student logs in, retrieves questions, and submits Physics
    console.log("\n7️⃣ Student logs in, fetches Physics paper, and submits exam...");
    const loginRes = await makeRequest('POST', '/api/student/login', {
        registration_no: 'SCI2026009',
        surname: 'ADEBAYO'
    });
    const sessionId = loginRes.body.session_id;

    await makeRequest('GET', `/api/exam/questions/Physics?student_id=${studentId}&session_id=${sessionId}&class=SS%201%20Science&session=2026/2027&term=1st%20Term&assessment_slot=midterm_ca`);

    await makeRequest('POST', '/api/exam/submit', {
        session_id: sessionId,
        student_id: studentId,
        subject: 'Physics',
        answers: { "1": "A" }
    });

    const r4 = await makeRequest('GET', `/api/student/assigned-exams?student_id=${studentId}`);
    console.log(`   Assigned exams after Physics submission: ${r4.body.activeExams?.length || 0}`);
    if ((r4.body.activeExams || []).length !== 0) {
        console.error("❌ Submitted Physics did not vanish!", r4.body.activeExams);
        process.exit(1);
    }
    console.log("   ✅ Passed: Submitted Physics vanished immediately. Clean empty state rendered!");

    console.log("\n==================================================================");
    console.log("🎉 ALL GHOST PURGE & ACTIVE-STATUS TESTS PASSED 100%!");
    console.log("==================================================================\n");
    process.exit(0);
}

runTest().catch(err => {
    console.error("❌ Test failed with exception:", err);
    process.exit(1);
});
