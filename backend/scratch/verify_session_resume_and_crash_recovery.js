const http = require('http');

function makeRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });
        req.on('error', reject);
        if (postData) req.write(JSON.stringify(postData));
        req.end();
    });
}

async function runSessionResumeAndCrashRecoverySuite() {
    console.log("==================================================================");
    console.log("⚡ CBT AGENTIC TEST SUITE: SESSION PERSISTENCE & CRASH RECOVERY");
    console.log("==================================================================\n");

    const host = '127.0.0.1';
    const port = 3000;

    // Step 1: Initial Login
    console.log("1️⃣ Testing Initial Student Login (AWA26270005 / KALU)...");
    const loginRes = await makeRequest({
        host, port, path: '/api/student/login', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { registration_no: 'AWA26270005', surname: 'KALU' });

    if (loginRes.status !== 200 || !loginRes.data.success) {
        console.error("❌ Login failed:", loginRes.data);
        process.exit(1);
    }
    const student = loginRes.data.student;
    console.log(`  ✅ Login successful for ${student.first_name || ''} ${student.surname} (ID: ${student.id}, Class: ${student.class})`);
    console.log(`  ℹ️ Initial Active Session Present: ${loginRes.data.has_active_session}`);

    // Step 2: Start New Exam Session for Biology
    console.log("\n2️⃣ Starting New Exam Session for Biology...");
    const startRes = await makeRequest({
        host, port, path: '/api/student/exam/start', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { student_id: student.id, subject: 'Biology', class: student.class });

    if (startRes.status !== 200 || !startRes.data.success) {
        console.error("❌ Failed to start exam session:", startRes.data);
        process.exit(1);
    }

    const sessionData = startRes.data;
    console.log("  DEBUG startRes.data:", sessionData);
    const sessionId = sessionData.session_id;
    const questions = sessionData.questions || [];
    console.log(`  ✅ Exam Session initialized: Session ID #${sessionId}`);
    console.log(`  ✅ Delivered Questions: ${questions.length} questions`);
    console.log(`  ✅ Duration Seconds: ${sessionData.duration_seconds}s`);
    console.log(`  ✅ Resumed Flag: ${sessionData.is_resumed}`);

    if (questions.length === 0) {
        console.error("❌ No questions delivered for Biology exam!");
        process.exit(1);
    }

    // Step 3: Save Progress (Simulate answering questions mid-exam)
    console.log("\n3️⃣ Simulating Mid-Exam Progress Autosave (Selecting Answers)...");
    const q1Id = questions[0].id;
    const q2Id = questions.length > 1 ? questions[1].id : 999;
    const selectedAnswersObj = {};
    selectedAnswersObj[String(q1Id)] = 'B';
    if (questions.length > 1) selectedAnswersObj[String(q2Id)] = 'C';

    const saveRes = await makeRequest({
        host, port, path: '/api/student/exam/save-progress', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        session_id: sessionId,
        student_id: student.id,
        selected_answers: selectedAnswersObj,
        question_id: q1Id,
        selected_option: 'B'
    });

    if (saveRes.status !== 200 || !saveRes.data.success) {
        console.error("❌ Failed to save progress:", saveRes.data);
        process.exit(1);
    }
    console.log(`  ✅ Real-time progress saved successfully at ${saveRes.data.timestamp}`);

    // Step 4: Simulate Browser Crash / Re-login Auto-Resume
    console.log("\n4️⃣ Simulating Browser Crash & Re-login Auto-Resume...");
    const reloginRes = await makeRequest({
        host, port, path: '/api/student/login', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { registration_no: 'AWA26270005', surname: 'KALU' });

    if (reloginRes.status !== 200 || !reloginRes.data.has_active_session) {
        console.error("❌ Re-login failed to detect active session:", reloginRes.data);
        process.exit(1);
    }

    const activeSes = reloginRes.data.active_session;
    console.log(`  ✅ Auto-Resume Detected! Session #${activeSes.session_id} for ${activeSes.subject}`);
    console.log(`  ✅ Remaining Duration: ${activeSes.duration_seconds}s`);
    console.log(`  ✅ Restored Answers:`, activeSes.selected_answers);

    if (activeSes.selected_answers[String(q1Id)] !== 'B') {
        console.error(`❌ Expected restored answer 'B' for Q#${q1Id}, got: ${activeSes.selected_answers[String(q1Id)]}`);
        process.exit(1);
    }

    // Step 5: Check Assigned Papers Status
    console.log("\n5️⃣ Checking Assigned Papers Dashboard Status...");
    const papersRes = await makeRequest({
        host, port, path: `/api/student/assigned-papers?student_id=${student.id}`, method: 'GET'
    });

    if (papersRes.status !== 200 || !papersRes.data.success) {
        console.error("❌ Failed to fetch assigned papers:", papersRes.data);
        process.exit(1);
    }
    console.log("  DEBUG papersRes.data.papers:", papersRes.data.papers);

    const bioPaper = papersRes.data.papers.find(p => p.subject.toLowerCase() === 'biology');
    console.log(`  ✅ Biology Paper Status: '${bioPaper.status}' (${bioPaper.message})`);
    if (bioPaper.status !== 'active' && bioPaper.status !== 'in_progress') {
        console.error(`❌ Expected status 'active' or 'in_progress', got '${bioPaper.status}'`);
        process.exit(1);
    }

    // Step 6: Submit Exam Session
    console.log("\n6️⃣ Submitting Examination Paper...");
    const submitRes = await makeRequest({
        host, port, path: '/api/student/exam/submit', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { student_id: student.id, session_id: sessionId, user_answers: selectedAnswersObj });

    if (submitRes.status !== 200 || !submitRes.data.success) {
        console.error("❌ Failed to submit exam:", submitRes.data);
        process.exit(1);
    }
    console.log(`  ✅ Exam Submitted! Final Score: ${submitRes.data.score}`);

    // Step 7: Post-Submission Re-Entry Rejection
    console.log("\n7️⃣ Verifying Post-Submission Gateway Lock Rejection...");
    const reenterRes = await makeRequest({
        host, port, path: '/api/student/exam/start', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { student_id: student.id, subject: 'Biology', class: student.class });

    console.log(`  ✅ Gateway Rejection HTTP Status: ${reenterRes.status}`);
    console.log(`  ✅ Gateway Rejection Message: "${reenterRes.data.message}"`);

    if (reenterRes.status !== 403) {
        console.error(`❌ Expected HTTP 403 Forbidden after submission, got HTTP ${reenterRes.status}`);
        process.exit(1);
    }

    // Step 8: Post-Submission Assigned Papers Check
    console.log("\n8️⃣ Verifying Dashboard Status After Submission...");
    const finalPapersRes = await makeRequest({
        host, port, path: `/api/student/assigned-papers?student_id=${student.id}`, method: 'GET'
    });
    const finalBioPaper = finalPapersRes.data.papers.find(p => p.subject.toLowerCase() === 'biology');
    console.log(`  ✅ Final Biology Paper Status: '${finalBioPaper.status}' (${finalBioPaper.message})`);

    if (finalBioPaper.status !== 'completed') {
        console.error(`❌ Expected status 'completed' after submission, got '${finalBioPaper.status}'`);
        process.exit(1);
    }

    console.log("\n==================================================================");
    console.log("🎉 ALL TESTS PASSED: SESSION RESUME & CRASH RECOVERY SUITE OK!");
    console.log("==================================================================");
}

runSessionResumeAndCrashRecoverySuite().catch(err => {
    console.error("❌ Suite exception:", err);
    process.exit(1);
});
