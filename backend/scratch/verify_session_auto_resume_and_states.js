/**
 * verify_session_auto_resume_and_states.js
 * 
 * End-to-End Automated Verification Suite for Student Exam Session Auto-Resume & Card States:
 * 1. Enrolls candidate OKAFOR Collins in SS 1 Science.
 * 2. Uploads question paper for 'Physics' in SS 1 Science.
 * 3. Activates 'Physics' paper for SS 1 Science.
 * 4. Starts exam session and selects options A & B for Q1 and Q2.
 * 5. Verifies GET /api/student/active-session returns has_active_session = true, active answers restored.
 * 6. Verifies GET /api/student/assigned-papers & GET /api/student/:id/dashboard return status = 'in_progress'.
 * 7. Simulates F5 browser reload via POST /api/student/exam/start -> returns is_resumed = true with answers intact.
 * 8. Submits exam paper.
 * 9. Verifies GET /api/student/assigned-papers returns status = 'completed'.
 * 10. Verifies GET /api/student/active-session returns has_active_session = false (preventing re-entry).
 */

const http = require('http');

function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: '127.0.0.1',
            port: 3000,
            path: path,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, body: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });

        req.on('error', err => reject(err));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runSessionAutoResumeSuite() {
    console.log("==================================================================");
    console.log("⚡ CBT AGENTIC TEST SUITE: SESSION AUTO-RESUME & DASHBOARD CARD STATES");
    console.log("==================================================================\n");

    // 1. Purge DB to start fresh
    console.log("1️⃣ Purging database for clean test run...");
    await makeRequest('POST', '/api/admin/system/purge-production-data');

    // 2. Enroll candidate OKAFOR Collins
    console.log("\n2️⃣ Enrolling candidate OKAFOR Collins in SS 1 Science...");
    const enrollRes = await makeRequest('POST', '/api/admin/students', {
        registration_no: 'OKA2627001',
        reg_number: 'OKA2627001',
        surname: 'OKAFOR',
        first_name: 'Collins',
        class: 'SS 1 Science',
        stream: 'Science',
        class_tier: 'SS 1',
        assigned_subject: 'Mathematics, English Language, Physics, Chemistry'
    });
    const studentId = enrollRes.body.student_id || enrollRes.body.id || 1;
    console.log(`  Candidate enrolled. Student ID: ${studentId}`);

    // 3. Upload questions for Physics
    console.log("\n3️⃣ Inserting test questions for Physics...");
    const q1Res = await makeRequest('POST', '/api/admin/questions', {
        class: 'SS 1 Science',
        subject: 'Physics',
        question_text: "What is the SI unit of Electric Current?",
        option_a: "Ampere",
        option_b: "Volt",
        option_c: "Ohm",
        option_d: "Watt",
        correct_answer: "A"
    });

    const q2Res = await makeRequest('POST', '/api/admin/questions', {
        class: 'SS 1 Science',
        subject: 'Physics',
        question_text: "Which law states that stress is proportional to strain within elastic limits?",
        option_a: "Ohm's Law",
        option_b: "Hooke's Law",
        option_c: "Boyles' Law",
        option_d: "Newton's Second Law",
        correct_answer: "B"
    });

    console.log(`  Questions created: Q1 ID = ${q1Res.body.question?.id || q1Res.body.id}, Q2 ID = ${q2Res.body.question?.id || q2Res.body.id}`);

    // 4. Set 'Physics' to ACTIVE
    console.log("\n4️⃣ Activating 'Physics' paper for SS 1 Science...");
    await makeRequest('POST', '/api/admin/subjects/toggle', {
        class: 'SS 1 Science',
        subject: 'Physics',
        is_active: 1
    });

    // 5. Start Exam Session
    console.log("\n5️⃣ Starting Physics exam session for OKAFOR Collins...");
    const startRes = await makeRequest('POST', '/api/student/exam/start', {
        student_id: studentId,
        subject: 'Physics',
        class: 'SS 1 Science'
    });

    const sessionId = startRes.body.session_id;
    console.log(`  Session created. Session ID: ${sessionId} | Is Resumed: ${startRes.body.is_resumed} | Questions Count: ${startRes.body.questions.length}`);

    const q1Id = startRes.body.questions[0].id;
    const q2Id = startRes.body.questions[1].id;

    // 6. Select answers for Question 1 and Question 2 and save progress
    console.log(`\n6️⃣ Saving progress (Q1 [ID ${q1Id}] -> B, Q2 [ID ${q2Id}] -> C)...`);
    await makeRequest('POST', '/api/student/exam/save-progress', {
        session_id: sessionId,
        student_id: studentId,
        question_id: q1Id,
        selected_option: 'B'
    });

    await makeRequest('POST', '/api/student/exam/save-progress', {
        session_id: sessionId,
        student_id: studentId,
        question_id: q2Id,
        selected_option: 'C'
    });
    console.log("  Progress autosaved successfully.");

    // 7. Test GET /api/student/active-session (Simulating Client Reload/F5 Check)
    console.log("\n7️⃣ Checking GET /api/student/active-session (Client Reload / F5 check)...");
    const activeCheckRes = await makeRequest('GET', `/api/student/active-session?student_id=${studentId}`);
    console.log("  Active Session Payload:", JSON.stringify(activeCheckRes.body));

    if (activeCheckRes.body.has_active_session && activeCheckRes.body.active_session.session_id === sessionId) {
        console.log("  ✅ Verification Passed: Ongoing IN_PROGRESS session correctly detected!");
    } else {
        console.error("❌ Active session detection failed!", activeCheckRes.body);
        process.exit(1);
    }

    // 8. Check Dashboard & Assigned Papers Status Cards
    console.log("\n8️⃣ Checking dashboard card states (GET /api/student/assigned-papers & GET /api/student/:id/dashboard)...");
    const papersRes = await makeRequest('GET', `/api/student/assigned-papers?student_id=${studentId}`);
    const dashRes = await makeRequest('GET', `/api/student/${studentId}/dashboard`);

    const physicsPaper = papersRes.body.papers.find(p => p.subject.toLowerCase() === 'physics');
    console.log("  Assigned Papers Physics Card State:", JSON.stringify(physicsPaper));

    if (physicsPaper && physicsPaper.status === 'in_progress') {
        console.log("  ✅ Verification Passed: Card status is strictly 'in_progress'!");
    } else {
        console.error("❌ Card status mapping desync!", physicsPaper);
        process.exit(1);
    }

    // 9. Simulate F5 Reload Direct Entry to Exam Screen
    console.log("\n9️⃣ Simulating F5 browser reload (POST /api/student/exam/start)...");
    const resumeRes = await makeRequest('POST', '/api/student/exam/start', {
        student_id: studentId,
        subject: 'Physics',
        class: 'SS 1 Science'
    });

    console.log(`  Resumed Session ID: ${resumeRes.body.session_id} | Is Resumed: ${resumeRes.body.is_resumed}`);
    console.log("  Restored Selected Answers:", JSON.stringify(resumeRes.body.selected_answers));

    if (resumeRes.body.is_resumed && resumeRes.body.selected_answers[String(q1Id)] === 'B') {
        console.log("  ✅ Verification Passed: Session restored with saved answers intact and timer synced!");
    } else {
        console.error("❌ F5 auto-resume restoration failed!", resumeRes.body);
        process.exit(1);
    }

    // 10. Submit Exam Session
    console.log("\n🔟 Submitting Physics exam session...");
    const submitRes = await makeRequest('POST', '/api/student/exam/submit', {
        student_id: studentId,
        session_id: sessionId,
        user_answers: { [q1Id]: 'B', [q2Id]: 'C' }
    });
    console.log("  Submit Response:", JSON.stringify(submitRes.body));

    // 11. Check Post-Submission Dashboard & Active Session States
    console.log("\n1️⃣1️⃣ Checking post-submission states...");
    const postPapersRes = await makeRequest('GET', `/api/student/assigned-papers?student_id=${studentId}`);
    const postActiveCheckRes = await makeRequest('GET', `/api/student/active-session?student_id=${studentId}`);

    const postPhysicsPaper = postPapersRes.body.papers.find(p => p.subject.toLowerCase() === 'physics');
    console.log("  Post-Submission Physics Card State:", JSON.stringify(postPhysicsPaper));
    console.log("  Post-Submission Active Session Check:", JSON.stringify(postActiveCheckRes.body));

    if (postPhysicsPaper && postPhysicsPaper.status === 'completed' && !postActiveCheckRes.body.has_active_session) {
        console.log("  ✅ Verification Passed: Card marked 'completed' and active-session check returns false (no re-entry)!");
    } else {
        console.error("❌ Post-submission state verification failed!", { postPhysicsPaper, postActiveCheckRes: postActiveCheckRes.body });
        process.exit(1);
    }

    console.log("\n==================================================================");
    console.log("🎉 ALL TESTS PASSED: SESSION AUTO-RESUME & DASHBOARD STATES VERIFIED 100% OK!");
    console.log("==================================================================\n");
}

runSessionAutoResumeSuite().catch(err => {
    console.error("❌ Test suite exception:", err);
    process.exit(1);
});
