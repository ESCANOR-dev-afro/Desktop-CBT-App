/**
 * verify_all.js
 * 
 * End-to-End Verification Script for CBT Platform Database Schema Refactoring,
 * Academic Term Dropdown & Auto-Persistence, Diagram Modeling, and Audit Logging.
 */

const http = require('http');
const db = require('../database');

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function makeHttpRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const reqOptions = { ...options, headers: { ...(options.headers || {}) } };
        let bodyPayload = null;
        if (postData) {
            bodyPayload = typeof postData === 'string' ? postData : JSON.stringify(postData);
            reqOptions.headers['Content-Length'] = Buffer.byteLength(bodyPayload);
        }
        const req = http.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ statusCode: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, raw: data });
                }
            });
        });
        req.on('error', reject);
        if (bodyPayload) {
            req.write(bodyPayload);
        }
        req.end();
    });
}

async function runVerification() {
    console.log('====================================================');
    console.log('🧪 Starting CBT Backend Verification Suite...');
    console.log('====================================================\n');

    let passedTests = 0;
    let totalTests = 0;

    function assert(condition, message) {
        totalTests++;
        if (condition) {
            console.log(`✅ [PASS] ${message}`);
            passedTests++;
        } else {
            console.error(`❌ [FAIL] ${message}`);
        }
    }

    try {
        // 1. Verify Normalized Database Tables
        console.log('--- 1. DATABASE SCHEMA & NORMALIZED ENTITIES ---');
        const tables = await dbAll(`SELECT name FROM sqlite_master WHERE type='table'`);
        const tableNames = new Set(tables.map(t => t.name));

        assert(tableNames.has('classes'), 'Normalized "classes" table exists in SQLite');
        assert(tableNames.has('academic_terms'), 'Normalized "academic_terms" table exists in SQLite');
        assert(tableNames.has('exams'), 'Normalized "exams" table exists in SQLite');
        assert(tableNames.has('question_options'), 'Normalized "question_options" table exists in SQLite');
        assert(tableNames.has('audit_logs'), 'Normalized "audit_logs" table exists in SQLite');

        // Verify columns on existing tables
        const questionCols = await dbAll(`PRAGMA table_info(questions)`);
        const qColNames = new Set(questionCols.map(c => c.name));
        assert(qColNames.has('diagram_image_url'), '"questions" table contains diagram_image_url column');

        // Verify academic terms seeded
        const terms = await dbAll(`SELECT * FROM academic_terms ORDER BY id ASC`);
        assert(terms.length >= 3, `Academic terms seeded in DB (${terms.length} terms found)`);
        const activeTerm = terms.find(t => t.is_current === 1);
        assert(Boolean(activeTerm), `Active academic term exists in DB: "${activeTerm?.name}"`);

        // Verify question options normalized
        const optionsCount = await dbGet(`SELECT COUNT(*) AS total FROM question_options`);
        assert(optionsCount.total > 0, `Normalized question options populated in question_options (${optionsCount.total} rows)`);

        console.log('\n--- 2. ACADEMIC TERM AUTO-PERSISTENCE API TEST ---');
        // Test switching term to '3rd Term'
        const termSwitchRes = await makeHttpRequest({
            hostname: '127.0.0.1',
            port: 3000,
            path: '/api/admin/academic-terms/active',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { term: '3rd Term', session: '2025/2026' });

        console.log('Term Switch Response:', JSON.stringify(termSwitchRes));

        assert(termSwitchRes.statusCode === 200 && termSwitchRes.data.success, 'POST /api/admin/academic-terms/active returned success 200');
        
        // Verify in DB
        const updatedActiveTerm = await dbGet(`SELECT name FROM academic_terms WHERE is_current = 1`);
        assert(updatedActiveTerm && updatedActiveTerm.name === '3rd Term', 'Active academic term updated in SQLite database to "3rd Term"');

        // Switch back to '2nd Term'
        await makeHttpRequest({
            hostname: '127.0.0.1',
            port: 3000,
            path: '/api/admin/academic-terms/active',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { term: '2nd Term', session: '2025/2026' });

        const resetActiveTerm = await dbGet(`SELECT name FROM academic_terms WHERE is_current = 1`);
        assert(resetActiveTerm && resetActiveTerm.name === '2nd Term', 'Active academic term restored to "2nd Term"');

        console.log('\n--- 3. AUDIT LOGGING TEST ---');
        const auditLogsRes = await makeHttpRequest({
            hostname: '127.0.0.1',
            port: 3000,
            path: '/api/admin/audit-logs',
            method: 'GET'
        });
        assert(auditLogsRes.statusCode === 200 && auditLogsRes.data.success, 'GET /api/admin/audit-logs returned 200 success');
        assert(Array.isArray(auditLogsRes.data.logs) && auditLogsRes.data.logs.length > 0, `Audit logs generated in database (${auditLogsRes.data.logs.length} log entries)`);

        console.log('\n--- 4. FULL API ENDPOINT COMPATIBILITY ---');
        // Admin Subjects API
        const subjectsRes = await makeHttpRequest({
            hostname: '127.0.0.1',
            port: 3000,
            path: '/api/admin/subjects',
            method: 'GET'
        });
        console.log('GET /api/admin/subjects Response:', JSON.stringify(subjectsRes));
        assert(subjectsRes.statusCode === 200 && subjectsRes.data.success, 'GET /api/admin/subjects returned 200');

        // Admin Overview API
        const overviewRes = await makeHttpRequest({
            hostname: '127.0.0.1',
            port: 3000,
            path: '/api/admin/overview',
            method: 'GET'
        });
        assert(overviewRes.statusCode === 200 && overviewRes.data.success, 'GET /api/admin/overview returned 200');

        // Admin Students API
        const studentsRes = await makeHttpRequest({
            hostname: '127.0.0.1',
            port: 3000,
            path: '/api/admin/students',
            method: 'GET'
        });
        assert(studentsRes.statusCode === 200 && studentsRes.data.success, 'GET /api/admin/students returned 200');

        // Admin Results API
        const resultsRes = await makeHttpRequest({
            hostname: '127.0.0.1',
            port: 3000,
            path: '/api/admin/results',
            method: 'GET'
        });
        assert(resultsRes.statusCode === 200 && resultsRes.data.success, 'GET /api/admin/results returned 200');

        // Student Auth Login API
        const loginRes = await makeHttpRequest({
            hostname: '127.0.0.1',
            port: 3000,
            path: '/api/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { reg_number: '1009001', surname: 'OKONKWO' });

        assert(loginRes.statusCode === 200 && loginRes.data.success, 'POST /api/login returned 200 success for student auth');

        // Student Session Verification API Test
        const verifySessRes = await makeHttpRequest({
            hostname: '127.0.0.1',
            port: 3000,
            path: '/api/student/verify-session',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { student_id: loginRes.data.student?.id || 1, session_id: loginRes.data.session_id || 1 });

        assert(verifySessRes.statusCode === 200 && verifySessRes.data.valid === true, 'POST /api/student/verify-session validated active session token');

        // Student Questions API
        const questionsRes = await makeHttpRequest({
            hostname: '127.0.0.1',
            port: 3000,
            path: '/api/exam/questions/Mathematics?student_id=' + (loginRes.data.student?.id || 1),
            method: 'GET'
        });
        assert(questionsRes.statusCode === 200 && questionsRes.data.success, 'GET /api/exam/questions/Mathematics returned 200 with question paper');

        console.log('\n====================================================');
        console.log(`🎉 VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
        console.log('====================================================');
    } catch (err) {
        console.error('❌ [Verification Error]:', err);
    }
}

// Run verification if server is running, or start database check directly
runVerification();
