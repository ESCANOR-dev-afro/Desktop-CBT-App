/**
 * verify_scoped_purge_isolation.js
 * 
 * Production Verification Suite for Scoped Isolation Purge Endpoints:
 * 1. Enrolls candidates across SS 1 Science, SS 1 Commercial, and SS 1 Art.
 * 2. Triggers "Clear Class Students" for SS 1 Commercial ONLY.
 * 3. Verifies SS 1 Commercial resets to 0, while SS 1 Science & SS 1 Art remain 100% intact.
 * 4. Seeds questions for "SS 1 Science - Mathematics" and "JSS 1 Gold - Mathematics".
 * 5. Triggers "Clear Subject Questions" for "SS 1 Science - Mathematics".
 * 6. Verifies SS 1 Science - Mathematics resets to 0, while JSS 1 Gold - Mathematics remains intact.
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

async function runScopedPurgeVerificationSuite() {
    console.log("==================================================================");
    console.log("⚡ CBT AGENTIC TEST SUITE: SCOPED ISOLATION PURGE ENDPOINTS");
    console.log("==================================================================\n");

    // 1. Clean initial DB purge
    await makeRequest('POST', '/api/admin/system/purge-production-data');

    // 2. Enroll 5 students each in SS 1 Science, SS 1 Commercial, and SS 1 Art
    console.log("1️⃣ Enrolling 5 candidates each into SS 1 Science, SS 1 Commercial, and SS 1 Art...");
    
    for (let i = 1; i <= 5; i++) {
        await makeRequest('POST', '/api/admin/students', {
            reg_number: `SCI262700${i}`,
            surname: `SCI_STUDENT_${i}`,
            first_name: 'Science',
            class: 'SS 1 Science',
            assigned_subject: 'Mathematics, Physics, Chemistry'
        });

        await makeRequest('POST', '/api/admin/students', {
            reg_number: `COM262700${i}`,
            surname: `COM_STUDENT_${i}`,
            first_name: 'Commercial',
            class: 'SS 1 Commercial',
            assigned_subject: 'Mathematics, Account, Economics'
        });

        await makeRequest('POST', '/api/admin/students', {
            reg_number: `ART262700${i}`,
            surname: `ART_STUDENT_${i}`,
            first_name: 'Art',
            class: 'SS 1 Art',
            assigned_subject: 'Mathematics, Government, Literature'
        });
    }

    // Verify initial student counts
    const allStudentsRes = await makeRequest('GET', '/api/admin/students');
    const studentsList = allStudentsRes.body.students || [];
    console.log(`  Total Enrolled Candidates Across All Streams: ${studentsList.length}`);
    
    const sciCount = studentsList.filter(s => s.class === 'SS 1 Science').length;
    const comCount = studentsList.filter(s => s.class === 'SS 1 Commercial').length;
    const artCount = studentsList.filter(s => s.class === 'SS 1 Art').length;

    console.log(`  SS 1 Science Candidates: ${sciCount}`);
    console.log(`  SS 1 Commercial Candidates: ${comCount}`);
    console.log(`  SS 1 Art Candidates: ${artCount}`);

    if (sciCount !== 5 || comCount !== 5 || artCount !== 5) {
        console.error("❌ Candidate enrollment setup failed!", studentsList);
        process.exit(1);
    }
    console.log("  ✅ Baseline multi-stream student rosters verified.");

    // 3. Clear Class Students for SS 1 Commercial ONLY
    console.log("\n2️⃣ Triggering Clear Class Students strictly for 'SS 1 Commercial'...");
    const clearComRes = await makeRequest('POST', '/api/admin/classes/reset-roster', {
        class: 'SS 1 Commercial'
    });

    console.log(`  API Response: "${clearComRes.body.message}" (Deleted: ${clearComRes.body.deletedCount})`);
    if (!clearComRes.body.success || clearComRes.body.deletedCount !== 5) {
        console.error("❌ Reset roster failed for SS 1 Commercial:", clearComRes.body);
        process.exit(1);
    }

    // 4. Verify candidate roster isolation after clearing SS 1 Commercial
    console.log("\n3️⃣ Verifying candidate rosters across all streams after SS 1 Commercial purge...");
    const postPurgeStudentsRes = await makeRequest('GET', '/api/admin/students');
    const postPurgeList = postPurgeStudentsRes.body.students || [];

    const postSciCount = postPurgeList.filter(s => s.class === 'SS 1 Science').length;
    const postComCount = postPurgeList.filter(s => s.class === 'SS 1 Commercial').length;
    const postArtCount = postPurgeList.filter(s => s.class === 'SS 1 Art').length;

    console.log(`  Remaining SS 1 Commercial Candidates: ${postComCount} (Expected: 0)`);
    console.log(`  Remaining SS 1 Science Candidates: ${postSciCount} (Expected: 5)`);
    console.log(`  Remaining SS 1 Art Candidates: ${postArtCount} (Expected: 5)`);

    if (postComCount !== 0 || postSciCount !== 5 || postArtCount !== 5) {
        console.error("❌ Multi-tenant isolation bug detected! Other class streams were affected!", { postComCount, postSciCount, postArtCount });
        process.exit(1);
    }
    console.log("  🎉 Multi-tenant class student roster isolation verified 100% OK!");

    // 5. Test Question Bank Clear Subject Scoping
    console.log("\n4️⃣ Seeding Question Bank for 'SS 1 Science - Mathematics' & 'JSS 1 Gold - Mathematics'...");
    await makeRequest('POST', '/api/admin/questions', {
        class: 'SS 1 Science',
        subject: 'Mathematics',
        question_text: 'Solve for x: 3x - 9 = 0',
        option_a: '3', option_b: '6', option_c: '9', option_d: '0',
        correct_answer: 'A'
    });

    await makeRequest('POST', '/api/admin/questions', {
        class: 'JSS 1 Gold',
        subject: 'Mathematics',
        question_text: 'What is 12 + 15?',
        option_a: '27', option_b: '25', option_c: '30', option_d: '20',
        correct_answer: 'A'
    });

    console.log("  Clearing questions strictly for 'SS 1 Science - Mathematics'...");
    const clearQRes = await makeRequest('POST', '/api/admin/questions/clear-subject', {
        class: 'SS 1 Science',
        subject: 'Mathematics'
    });
    console.log(`  Clear Questions Response: "${clearQRes.body.message}" (Deleted: ${clearQRes.body.deletedCount})`);

    const ss1MathRes = await makeRequest('GET', '/api/admin/questions?class=SS%201%20Science&subject=Mathematics');
    const jss1MathRes = await makeRequest('GET', '/api/admin/questions?class=JSS%201%20Gold&subject=Mathematics');

    console.log(`  SS 1 Science Mathematics Questions Count: ${ss1MathRes.body.questions.length} (Expected: 0)`);
    console.log(`  JSS 1 Gold Mathematics Questions Count: ${jss1MathRes.body.questions.length} (Expected: 1)`);

    if (ss1MathRes.body.questions.length !== 0 || jss1MathRes.body.questions.length !== 1) {
        console.error("❌ Question bank clear-subject scoping failed!", { ss1: ss1MathRes.body, jss1: jss1MathRes.body });
        process.exit(1);
    }
    console.log("  🎉 Question bank clear-subject scoping verified 100% OK!");

    console.log("\n==================================================================");
    console.log("🎉 ALL TESTS PASSED: SCOPED ISOLATION PURGE ENDPOINTS VERIFIED OK!");
    console.log("==================================================================\n");
}

runScopedPurgeVerificationSuite().catch(err => {
    console.error("❌ Test suite exception:", err);
    process.exit(1);
});
