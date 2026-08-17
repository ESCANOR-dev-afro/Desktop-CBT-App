/**
 * verify_admin_purge_actions.js
 * 
 * Automated test suite for validating Admin Dashboard granular purge actions:
 * 1. Clear Subject Questions (POST /api/admin/questions/clear-subject)
 * 2. Reset Class Student Roster (POST /api/admin/classes/reset-roster)
 * 3. Purge Test Submissions (POST /api/admin/system/purge-test-results)
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

async function runAdminPurgeVerificationSuite() {
    console.log("==================================================================");
    console.log("⚡ CBT AGENTIC TEST SUITE: ADMIN GRANULAR PURGE & CLEANUP ACTIONS");
    console.log("==================================================================\n");

    const TEST_CLASS = 'SS 1 Science';
    const TEST_SUBJECT = 'Physics';

    // 1. Seed dummy question for testing clear-subject
    console.log(`1️⃣ Adding Test Question for ${TEST_CLASS} - ${TEST_SUBJECT}...`);
    const addQRes = await makeRequest('POST', '/api/admin/questions', {
        class: TEST_CLASS,
        subject: TEST_SUBJECT,
        question_text: 'Purge Test Question: What is speed?',
        option_a: 'Distance / Time',
        option_b: 'Force * Distance',
        option_c: 'Mass / Volume',
        option_d: 'Time / Distance',
        correct_answer: 'A',
        marks: 1
    });

    console.log(`  Add Question Status: ${addQRes.statusCode}`);
    if (addQRes.statusCode !== 201 || !addQRes.body.success) {
        console.error("❌ Failed to seed question:", addQRes.body);
        process.exit(1);
    }
    console.log(`  ✅ Question seeded successfully (ID #${addQRes.body.question_id})`);

    // 2. Test Clear Subject Questions Endpoint
    console.log(`\n2️⃣ Testing POST /api/admin/questions/clear-subject for ${TEST_CLASS} - ${TEST_SUBJECT}...`);
    const clearSubRes = await makeRequest('POST', '/api/admin/questions/clear-subject', {
        class: TEST_CLASS,
        subject: TEST_SUBJECT
    });

    console.log(`  Clear Subject Status: ${clearSubRes.statusCode}`);
    console.log(`  Message: "${clearSubRes.body.message}"`);
    console.log(`  Deleted Count: ${clearSubRes.body.deletedCount}`);

    if (clearSubRes.statusCode !== 200 || !clearSubRes.body.success || clearSubRes.body.deletedCount < 1) {
        console.error("❌ Clear Subject Questions failed!", clearSubRes.body);
        process.exit(1);
    }
    console.log("  ✅ Question bank for subject cleared successfully.");

    // 3. Seed dummy candidate for testing reset-roster
    console.log(`\n3️⃣ Adding Test Candidate for ${TEST_CLASS}...`);
    const addCandRes = await makeRequest('POST', '/api/admin/students', {
        reg_number: 'AWA26279999',
        surname: 'PURGE_TEST_SURNAME',
        first_name: 'PURGE_TEST_FIRSTNAME',
        class: TEST_CLASS,
        assigned_subject: TEST_SUBJECT
    });

    console.log(`  Add Student Status: ${addCandRes.statusCode}`);
    if (addCandRes.statusCode !== 201 || !addCandRes.body.success) {
        console.error("❌ Failed to seed candidate:", addCandRes.body);
        process.exit(1);
    }
    const testStudentId = addCandRes.body.student_id;
    console.log(`  ✅ Test Candidate created successfully (ID #${testStudentId})`);

    // 4. Test Reset Class Roster Endpoint
    console.log(`\n4️⃣ Testing POST /api/admin/classes/reset-roster for ${TEST_CLASS}...`);
    const resetRosterRes = await makeRequest('POST', '/api/admin/classes/reset-roster', {
        class: TEST_CLASS
    });

    console.log(`  Reset Roster Status: ${resetRosterRes.statusCode}`);
    console.log(`  Message: "${resetRosterRes.body.message}"`);
    console.log(`  Deleted Candidates: ${resetRosterRes.body.deletedCount}`);

    if (resetRosterRes.statusCode !== 200 || !resetRosterRes.body.success) {
        console.error("❌ Reset Class Roster failed!", resetRosterRes.body);
        process.exit(1);
    }
    console.log("  ✅ Class roster reset successfully.");

    // 5. Test Purge Submissions Endpoint (Single Class Scope)
    console.log(`\n5️⃣ Testing POST /api/admin/system/purge-test-results (Class Scope)...`);
    const purgeClassRes = await makeRequest('POST', '/api/admin/system/purge-test-results', {
        scope: 'CLASS',
        target_class: 'JSS 1'
    });

    console.log(`  Purge Class Submissions Status: ${purgeClassRes.statusCode}`);
    console.log(`  Message: "${purgeClassRes.body.message}"`);

    if (purgeClassRes.statusCode !== 200 || !purgeClassRes.body.success) {
        console.error("❌ Purge Class Submissions failed!", purgeClassRes.body);
        process.exit(1);
    }
    console.log("  ✅ Class-scoped submissions purge verified.");

    // 6. Test Purge Submissions Endpoint (All Classes Scope)
    console.log(`\n6️⃣ Testing POST /api/admin/system/purge-test-results (ALL Scope)...`);
    const purgeAllRes = await makeRequest('POST', '/api/admin/system/purge-test-results', {
        scope: 'ALL'
    });

    console.log(`  Purge All Submissions Status: ${purgeAllRes.statusCode}`);
    console.log(`  Message: "${purgeAllRes.body.message}"`);

    if (purgeAllRes.statusCode !== 200 || !purgeAllRes.body.success) {
        console.error("❌ Purge All Submissions failed!", purgeAllRes.body);
        process.exit(1);
    }
    console.log("  ✅ Global submissions purge verified.");

    console.log("\n==================================================================");
    console.log("🎉 ALL TESTS PASSED: GRANULAR ADMIN PURGE ACTIONS VERIFIED OK!");
    console.log("==================================================================\n");
}

runAdminPurgeVerificationSuite().catch(err => {
    console.error("❌ Test suite exception:", err);
    process.exit(1);
});
