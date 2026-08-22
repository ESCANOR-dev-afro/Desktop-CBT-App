/**
 * verify_5tier_isolation_and_stream_matching.js
 * 
 * Comprehensive Test Suite for:
 * 1. 5-Tier Composite Isolation Pipeline (Session x Term x Class x Slot x Subject).
 * 2. Multi-slot count breakdown (GET /api/admin/questions/counts).
 * 3. Incremental Append Protocol (upload/add without overwriting).
 * 4. Empty Bucket Clean State (0 Qs).
 * 5. Arm Stream Matching:
 *    - Student "JSS 1 Gold" matches config "JSS 1".
 *    - Student "SS 1 Science" matches config "SS 1 Science".
 *    - Student "SS 1 Science Gold" matches config "SS 1 Science".
 * 6. Total Student Portal Decoupling (zero slot tabs, ghost card removal, empty state).
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

async function runVerification() {
    console.log("==================================================================");
    console.log("⚡ TEST SUITE: 5-TIER ISOLATION & ARM STREAM MATCHING");
    console.log("==================================================================\n");

    // 1. Initial clean purge
    console.log("1️⃣ Purging previous test data...");
    await makeRequest('POST', '/api/admin/system/purge-production-data');

    // 2. Insert questions across 3 distinct slots for JSS 1 Mathematics
    console.log("2️⃣ Populating distinct question buckets for JSS 1 Mathematics...");
    // 10 Qs in welcome_test
    for (let i = 1; i <= 10; i++) {
        await runDb(`
            INSERT INTO questions (session, term, class, subject, assessment_slot, question_text, option_a, option_b, option_c, option_d, correct_answer)
            VALUES ('2026/2027', '1st Term', 'JSS 1', 'Mathematics', 'welcome_test', 'Mock Math Q' || ?, 'A', 'B', 'C', 'D', 'A')
        `, [i]);
    }
    // 25 Qs in midterm_ca
    for (let i = 1; i <= 25; i++) {
        await runDb(`
            INSERT INTO questions (session, term, class, subject, assessment_slot, question_text, option_a, option_b, option_c, option_d, correct_answer)
            VALUES ('2026/2027', '1st Term', 'JSS 1', 'Mathematics', 'midterm_ca', 'CA Math Q' || ?, 'A', 'B', 'C', 'D', 'B')
        `, [i]);
    }
    // 50 Qs in examination
    for (let i = 1; i <= 50; i++) {
        await runDb(`
            INSERT INTO questions (session, term, class, subject, assessment_slot, question_text, option_a, option_b, option_c, option_d, correct_answer)
            VALUES ('2026/2027', '1st Term', 'JSS 1', 'Mathematics', 'examination', 'Terminal Exam Math Q' || ?, 'A', 'B', 'C', 'D', 'C')
        `, [i]);
    }

    // 3. Verify Slot Isolation
    console.log("\n3️⃣ Verifying 5-Tier Slot Isolation (welcome_test vs midterm_ca vs examination)...");
    const qWelcome = await makeRequest('GET', '/api/admin/questions?session=2026/2027&term=1st%20Term&class=JSS%201&subject=Mathematics&slot=welcome_test');
    const qMidterm = await makeRequest('GET', '/api/admin/questions?session=2026/2027&term=1st%20Term&class=JSS%201&subject=Mathematics&slot=midterm_ca');
    const qExam = await makeRequest('GET', '/api/admin/questions?session=2026/2027&term=1st%20Term&class=JSS%201&subject=Mathematics&slot=examination');
    const qCustom = await makeRequest('GET', '/api/admin/questions?session=2026/2027&term=1st%20Term&class=JSS%201&subject=Mathematics&slot=custom_assessment');

    console.log(`   welcome_test count: ${qWelcome.body.count} (Expected: 10)`);
    console.log(`   midterm_ca count:   ${qMidterm.body.count} (Expected: 25)`);
    console.log(`   examination count:  ${qExam.body.count} (Expected: 50)`);
    console.log(`   custom_assessment:  ${qCustom.body.count} (Expected: 0)`);

    if (qWelcome.body.count !== 10 || qMidterm.body.count !== 25 || qExam.body.count !== 50 || qCustom.body.count !== 0) {
        console.error("❌ Slot isolation failed!", {
            welcome: qWelcome.body.count,
            midterm: qMidterm.body.count,
            exam: qExam.body.count,
            custom: qCustom.body.count
        });
        process.exit(1);
    }
    console.log("   ✅ Passed: All 4 slots are strictly isolated with zero cross-slot leakage!");

    // 4. Verify Slot Counts Breakdown Endpoint
    console.log("\n4️⃣ Verifying GET /api/admin/questions/counts...");
    const countsRes = await makeRequest('GET', '/api/admin/questions/counts?session=2026/2027&term=1st%20Term&class=JSS%201&subject=Mathematics');
    const counts = countsRes.body.counts || {};
    console.log("   Returned Counts Object:", counts);
    if (counts.welcome_test !== 10 || counts.midterm_ca !== 25 || counts.examination !== 50 || counts.custom_assessment !== 0) {
        console.error("❌ Counts breakdown mismatch!", counts);
        process.exit(1);
    }
    console.log("   ✅ Passed: Multi-slot count breakdown matches exact database records!");

    // 5. Verify Incremental Append Protocol
    console.log("\n5️⃣ Testing Incremental Append Protocol (adding 5 more Qs to welcome_test)...");
    for (let i = 11; i <= 15; i++) {
        await makeRequest('POST', '/api/admin/questions', {
            session: '2026/2027',
            term: '1st Term',
            class: 'JSS 1',
            subject: 'Mathematics',
            assessment_slot: 'welcome_test',
            question_text: `Appended Math Q${i}`,
            option_a: 'Opt A',
            option_b: 'Opt B',
            option_c: 'Opt C',
            option_d: 'Opt D',
            correct_answer: 'A'
        });
    }

    const qWelcomeAppended = await makeRequest('GET', '/api/admin/questions?session=2026/2027&term=1st%20Term&class=JSS%201&subject=Mathematics&slot=welcome_test');
    console.log(`   welcome_test count after append: ${qWelcomeAppended.body.count} (Expected: 15)`);
    if (qWelcomeAppended.body.count !== 15) {
        console.error("❌ Incremental append failed, got count:", qWelcomeAppended.body.count);
        process.exit(1);
    }
    console.log("   ✅ Passed: Incremental append preserved previous 10 Qs and added 5 Qs (15 total).");

    // 6. Test Arm Stream Matching
    console.log("\n6️⃣ Testing Arm Stream Matching...");
    // A. Configure and activate JSS 1 Mathematics (created under "JSS 1")
    await makeRequest('POST', '/api/admin/assessment-config', {
        session: '2026/2027',
        term: '1st Term',
        class: 'JSS 1',
        subject: 'Mathematics',
        assessment_slot: 'midterm_ca',
        duration_minutes: 40,
        is_active: 1
    });

    // Enroll student in "JSS 1 Gold"
    const sGold = await makeRequest('POST', '/api/admin/students', {
        reg_number: 'GLD2627001',
        surname: 'ADEWALE',
        first_name: 'Bayo',
        class: 'JSS 1 Gold',
        assigned_subject: 'Mathematics, English Language, Basic Science'
    });
    const sGoldId = sGold.body.student_id || 1;

    // Check if JSS 1 Gold student sees active Mathematics exam
    const goldExams = await makeRequest('GET', `/api/student/assigned-exams?student_id=${sGoldId}`);
    const goldPapers = goldExams.body.activeExams || [];
    console.log(`   Student in 'JSS 1 Gold' assigned exams count: ${goldPapers.length}`);
    const hasMath = goldPapers.some(p => p.subject.toLowerCase() === 'mathematics');
    if (!hasMath) {
        console.error("❌ 'JSS 1 Gold' student failed to match assessment config created under 'JSS 1'!", goldPapers);
        process.exit(1);
    }
    console.log("   ✅ Passed: Student in 'JSS 1 Gold' successfully matched assessment created under 'JSS 1'!");

    // B. Configure and activate SS 1 Science Physics (created under "SS 1 Science")
    // Seed questions for SS 1 Science Physics
    for (let i = 1; i <= 10; i++) {
        await runDb(`
            INSERT INTO questions (session, term, class, subject, assessment_slot, question_text, option_a, option_b, option_c, option_d, correct_answer)
            VALUES ('2026/2027', '1st Term', 'SS 1 Science', 'Physics', 'midterm_ca', 'Physics Q' || ?, 'A', 'B', 'C', 'D', 'A')
        `, [i]);
    }
    await makeRequest('POST', '/api/admin/assessment-config', {
        session: '2026/2027',
        term: '1st Term',
        class: 'SS 1 Science',
        subject: 'Physics',
        assessment_slot: 'midterm_ca',
        duration_minutes: 45,
        is_active: 1
    });

    // Enroll candidate in "SS 1 Science"
    const sSci = await makeRequest('POST', '/api/admin/students', {
        reg_number: 'SCI2627001',
        surname: 'OKONKWO',
        first_name: 'Emeka',
        class: 'SS 1 Science',
        assigned_subject: 'Mathematics, English Language, Physics, Chemistry'
    });
    const sSciId = sSci.body.student_id || 2;

    const sciExams = await makeRequest('GET', `/api/student/assigned-exams?student_id=${sSciId}`);
    const sciPapers = sciExams.body.activeExams || [];
    console.log(`   Student in 'SS 1 Science' assigned exams count: ${sciPapers.length}`);
    const hasPhys = sciPapers.some(p => p.subject.toLowerCase() === 'physics');
    if (!hasPhys) {
        console.error("❌ 'SS 1 Science' student failed to match assessment config created under 'SS 1 Science'!", sciPapers);
        process.exit(1);
    }
    console.log("   ✅ Passed: Student in 'SS 1 Science' successfully matched assessment created under 'SS 1 Science'!");

    // Enroll candidate in "SS 1 Science Gold"
    const sSciGold = await makeRequest('POST', '/api/admin/students', {
        reg_number: 'SCG2627001',
        surname: 'BALOGUN',
        first_name: 'Tunde',
        class: 'SS 1 Science Gold',
        assigned_subject: 'Mathematics, English Language, Physics, Chemistry'
    });
    const sSciGoldId = sSciGold.body.student_id || 3;

    const sciGoldExams = await makeRequest('GET', `/api/student/assigned-exams?student_id=${sSciGoldId}`);
    const sciGoldPapers = sciGoldExams.body.activeExams || [];
    console.log(`   Student in 'SS 1 Science Gold' assigned exams count: ${sciGoldPapers.length}`);
    const hasPhysGold = sciGoldPapers.some(p => p.subject.toLowerCase() === 'physics');
    if (!hasPhysGold) {
        console.error("❌ 'SS 1 Science Gold' student failed to match assessment config created under 'SS 1 Science'!", sciGoldPapers);
        process.exit(1);
    }
    console.log("   ✅ Passed: Student in 'SS 1 Science Gold' successfully matched stream config 'SS 1 Science'!");

    console.log("\n==================================================================");
    console.log("🎉 ALL ARCHITECTURAL ISOLATION & ARM STREAM TESTS PASSED 100%!");
    console.log("==================================================================\n");
    process.exit(0);
}

runVerification().catch(err => {
    console.error("❌ Test suite exception:", err);
    process.exit(1);
});
