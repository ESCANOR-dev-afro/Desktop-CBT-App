/**
 * verify_class_isolation_and_scroll.js
 * 
 * Verification Test Suite for:
 * 1. Strict Class-Isolated Subject Activation (Fix Global Lock Bug).
 * 2. PATCH /api/admin/subject-config/status endpoint.
 * 3. GET /api/student/assigned-papers endpoint.
 * 4. Student client static web bundle availability.
 */

const http = require('http');

const PORT = 61897;
const app = require('../server');
let server;

function makeRequest(method, urlPath, bodyObj = null) {
    return new Promise((resolve, reject) => {
        const payload = bodyObj ? JSON.stringify(bodyObj) : null;
        const options = {
            hostname: '127.0.0.1',
            port: PORT,
            path: urlPath,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = data;
                try { parsed = JSON.parse(data); } catch (_) {}
                resolve({ statusCode: res.statusCode, body: parsed });
            });
        });

        req.on('error', err => reject(err));
        if (payload) req.write(payload);
        req.end();
    });
}

async function runClassIsolationVerification() {
    console.log('----------------------------------------------------');
    console.log('🚀 TESTING STRICT CLASS-ISOLATED SUBJECT ACTIVATION');
    console.log('----------------------------------------------------');

    server = http.createServer(app);
    await new Promise(res => server.listen(PORT, '127.0.0.1', res));
    console.log(`✅ Test Server running on port ${PORT}`);

    try {
        const db = require('../database');
        const dbRunLocal = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, err => err ? rej(err) : res()));
        
        await dbRunLocal(`INSERT OR REPLACE INTO students (id, reg_number, registration_no, surname, first_name, class, assigned_subject) VALUES (9001, 'TESTJSS1', 'TESTJSS1', 'DOE', 'Jane', 'JSS 1', 'Mathematics')`);
        await dbRunLocal(`INSERT OR REPLACE INTO students (id, reg_number, registration_no, surname, first_name, class, assigned_subject) VALUES (9002, 'TESTSS1', 'TESTSS1', 'SMITH', 'John', 'SS 1 Science', 'Mathematics')`);

        // 1. Ensure SS 1 Science Mathematics is ACTIVE
        console.log('\n[1] Activating SS 1 Science Mathematics via PATCH /api/admin/subject-config/status...');
        const setSS1Active = await makeRequest('PATCH', '/api/admin/subject-config/status', {
            class: 'SS 1 Science',
            subject: 'Mathematics',
            is_active: 1
        });
        console.log(`  Patch Status: ${setSS1Active.statusCode}`);
        console.log(`  Class: ${setSS1Active.body.class}, Subject: ${setSS1Active.body.subject}, IsActive: ${setSS1Active.body.is_active}`);

        // 2. Disable JSS 1 Mathematics via PATCH /api/admin/subject-config/status
        console.log('\n[2] Setting JSS 1 Mathematics to INACTIVE (is_active = 0)...');
        const setJSS1Inactive = await makeRequest('PATCH', '/api/admin/subject-config/status', {
            class: 'JSS 1',
            subject: 'Mathematics',
            is_active: 0
        });
        console.log(`  Patch Status: ${setJSS1Inactive.statusCode}`);
        console.log(`  Class: ${setJSS1Inactive.body.class}, Subject: ${setJSS1Inactive.body.subject}, IsActive: ${setJSS1Inactive.body.is_active}`);

        // 3. Verify JSS 1 Student sees Mathematics as INACTIVE
        console.log('\n[3] Querying GET /api/student/assigned-papers for JSS 1 student (TESTJSS1)...');
        const jss1Papers = await makeRequest('GET', '/api/student/assigned-papers?registration_no=TESTJSS1');
        console.log(`  JSS 1 Student Papers Response: ${jss1Papers.statusCode}`);
        const jss1Math = jss1Papers.body.papers?.find(p => p.subject.toLowerCase() === 'mathematics');
        console.log(`  JSS 1 Mathematics Status: ${jss1Math?.status} (is_active: ${jss1Math?.is_active})`);

        if (!jss1Math || jss1Math.is_active !== false || jss1Math.status !== 'not_scheduled') {
            throw new Error(`JSS 1 Mathematics expected to be inactive/not_scheduled, got: ${JSON.stringify(jss1Math)}`);
        }
        console.log('  ✅ JSS 1 Mathematics correctly marked as INACTIVE / not_scheduled.');

        // 4. Verify SS 1 Science Student sees Mathematics as AVAILABLE & ACTIVE
        console.log('\n[4] Querying GET /api/student/assigned-papers for SS 1 Science student (TESTSS1)...');
        const ss1Papers = await makeRequest('GET', '/api/student/assigned-papers?registration_no=TESTSS1');
        console.log(`  SS 1 Science Student Papers Response: ${ss1Papers.statusCode}`);
        const ss1Math = ss1Papers.body.papers?.find(p => p.subject.toLowerCase() === 'mathematics');
        console.log(`  SS 1 Science Mathematics Status: ${ss1Math?.status} (is_active: ${ss1Math?.is_active})`);

        if (!ss1Math || ss1Math.is_active !== true || ss1Math.status !== 'available') {
            throw new Error(`SS 1 Science Mathematics expected to remain AVAILABLE & active, got: ${JSON.stringify(ss1Math)}`);
        }
        console.log('  ✅ SS 1 Science Mathematics remains AVAILABLE & ACTIVE (Class Isolation verified!).');

        // 5. Test Question Fetch API endpoints
        console.log('\n[5] Testing GET /api/exam/questions/Mathematics for JSS 1 vs SS 1 Science:');
        const jss1Q = await makeRequest('GET', '/api/exam/questions/Mathematics?class=JSS%201');
        console.log(`  JSS 1 Questions API Status: ${jss1Q.statusCode} (${jss1Q.body.message})`);
        if (jss1Q.statusCode !== 403) {
            throw new Error('JSS 1 Mathematics GET questions expected 403 forbidden / inactive!');
        }

        const ss1Q = await makeRequest('GET', '/api/exam/questions/Mathematics?class=SS%201%20Science');
        console.log(`  SS 1 Science Questions API Status: ${ss1Q.statusCode}`);
        if (ss1Q.statusCode !== 200 || !ss1Q.body.success) {
            throw new Error('SS 1 Science Mathematics GET questions expected 200 success!');
        }
        console.log('  ✅ Question paper activation class-isolation verified strictly.');

        // 6. Verify Student Client Root Route & Assets
        console.log('\n[6] Checking Student Client root route & static assets...');
        const rootRes = await makeRequest('GET', '/');
        console.log(`  GET / Status: ${rootRes.statusCode}`);
        if (rootRes.statusCode !== 200) {
            throw new Error('Student Client root route "/" failed!');
        }
        console.log('  ✅ Student client web portal served successfully at root "/".');

        console.log('----------------------------------------------------');
        console.log('🎉 ALL CLASS ISOLATION & STUDENT PAPER TESTS PASSED');
        console.log('----------------------------------------------------');

        server.close();
        process.exit(0);

    } catch (err) {
        console.error('❌ Verification Failed:', err);
        if (server) server.close();
        process.exit(1);
    }
}

runClassIsolationVerification();
