const http = require('http');
const express = require('express');
const authRoutes = require('../authRoutes');
const db = require('../database');

async function runTests() {
    console.log('🧪 Starting Student Login Error Contract Validation...');
    let passed = 0;
    let failed = 0;

    function assert(condition, name) {
        if (condition) {
            console.log(`  ✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${name}`);
            failed++;
        }
    }

    // Set up ephemeral express app with authRoutes
    const app = express();
    app.use(express.json());
    app.use('/api', authRoutes);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    async function postLogin(body) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(body);
            const req = http.request(`${baseUrl}/api/student/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            }, (res) => {
                let chunks = '';
                res.on('data', chunk => chunks += chunk);
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(chunks) });
                    } catch (e) {
                        resolve({ status: res.statusCode, body: chunks });
                    }
                });
            });
            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    try {
        // Case 1: Missing Registration Number
        const r1 = await postLogin({ surname: 'SMITH' });
        assert(r1.status === 400, 'Missing Reg Number returns HTTP 400');
        assert(r1.body.success === false, 'Missing Reg Number returns success: false');
        assert(r1.body.field === 'regNumber', 'Missing Reg Number specifies field: "regNumber"');
        assert(r1.body.message === 'Please enter your Registration Number.', 'Missing Reg Number has correct message');

        // Case 2: Missing Surname
        const r2 = await postLogin({ registration_no: 'AWA26270001' });
        assert(r2.status === 400, 'Missing Surname returns HTTP 400');
        assert(r2.body.success === false, 'Missing Surname returns success: false');
        assert(r2.body.field === 'surname', 'Missing Surname specifies field: "surname"');
        assert(r2.body.message === 'Please enter your Surname.', 'Missing Surname has correct message');

        // Case 3: Unknown Candidate (Reg Number not found)
        const r3 = await postLogin({ registration_no: 'INVALID_REG_99999999', surname: 'SMITH' });
        assert(r3.status === 401, 'Unknown Candidate returns HTTP 401');
        assert(r3.body.success === false, 'Unknown Candidate returns success: false');
        assert(r3.body.field === 'regNumber', 'Unknown Candidate targets field: "regNumber"');
        assert(r3.body.message === 'Registration number not found. Please verify your ID slip.', 'Unknown Candidate has correct message');

        // Query an existing student from DB (READ-ONLY)
        const sampleStudent = await db.getAsync(`SELECT id, reg_number, registration_no, surname FROM students WHERE (registration_no IS NOT NULL OR reg_number IS NOT NULL) AND surname IS NOT NULL LIMIT 1`);
        
        if (sampleStudent) {
            const validReg = sampleStudent.registration_no || sampleStudent.reg_number;
            const validSurname = sampleStudent.surname;

            // Case 4: Password / Surname Mismatch
            const r4 = await postLogin({ registration_no: validReg, surname: 'DEFINITELY_WRONG_SURNAME_XYZ' });
            assert(r4.status === 401, 'Surname Mismatch returns HTTP 401');
            assert(r4.body.success === false, 'Surname Mismatch returns success: false');
            assert(r4.body.field === 'surname', 'Surname Mismatch targets field: "surname"');
            assert(r4.body.message === 'Incorrect surname. Enter ONLY your Surname in ALL CAPS.', 'Surname Mismatch has correct message');

            // Case 5: Valid Credentials
            const r5 = await postLogin({ registration_no: validReg, surname: validSurname });
            assert(r5.status === 200, 'Valid credentials return HTTP 200');
            assert(r5.body.success === true, 'Valid credentials return success: true');
            assert(r5.body.student && r5.body.student.id === sampleStudent.id, 'Valid credentials return student data');
        } else {
            console.warn('⚠️ No sample student found in database for mismatch and valid login tests');
        }

    } finally {
        server.close();
    }

    console.log(`\n========================================`);
    console.log(`Validation Completed: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Fatal error running tests:', err);
    process.exit(1);
});
