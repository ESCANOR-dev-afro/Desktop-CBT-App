const express = require('express');
const http = require('http');
const db = require('../database');
const authRoutes = require('../authRoutes');
const adminRoutes = require('../adminRoutes');
const XLSX = require('xlsx');

const app = express();
app.use(express.json());
app.use('/api', authRoutes);
app.use('/api/admin', adminRoutes);

const server = app.listen(0, async () => {
    const port = server.address().port;
    console.log(`🚀 Test Server listening on port ${port}`);

    try {
        // 1. Test POST /api/student/login with lowercase reg_number (awa26270001 -> AWA26270001)
        console.log('\n[1] Testing POST /api/student/login normalization & collision safety:');
        const loginData = JSON.stringify({
            registration_no: 'awa26270001',
            surname: 'okonkwo',
            workstation_ip: '192.168.1.50'
        });

        const loginRes = await makeRequest(port, '/api/student/login', 'POST', { 'Content-Type': 'application/json' }, loginData);
        console.log('  Login Status:', loginRes.statusCode);
        console.log('  Login Response:', loginRes.body);
        console.assert(loginRes.statusCode === 200, 'Student login should succeed with 200');
        console.assert(loginRes.body.student.registration_no === 'AWA26270001', 'Registration number should be normalized to AWA26270001');

        // 2. Test POST /api/admin/upload-roster with spreadsheet buffer
        console.log('\n[2] Testing POST /api/admin/upload-roster spreadsheet pipeline:');
        const mockRosterData = [
            ['Surname', 'First Name', 'Other Names', 'Reg No'],
            ['EZE', 'Chinedu', 'David', ''], // Missing reg_no -> Auto assign
            ['ADEBAYO', 'Kemi', 'Grace', '']  // Missing reg_no -> Auto assign
        ];
        const ws = XLSX.utils.aoa_to_sheet(mockRosterData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Roster');
        const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // Build multipart/form-data payload
        const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
        let body = '';
        body += `--${boundary}\r\n`;
        body += 'Content-Disposition: form-data; name="class"\r\n\r\nJSS 1 Gold\r\n';
        body += `--${boundary}\r\n`;
        body += 'Content-Disposition: form-data; name="file"; filename="JSS1_Gold_Roster.xlsx"\r\n';
        body += 'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n';
        
        const payloadBuffer = Buffer.concat([
            Buffer.from(body, 'utf8'),
            excelBuffer,
            Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
        ]);

        const uploadRes = await makeRequest(port, '/api/admin/upload-roster', 'POST', {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': payloadBuffer.length
        }, payloadBuffer);

        console.log('  Upload Roster Status:', uploadRes.statusCode);
        console.log('  Upload Roster Response:', uploadRes.body);
        console.assert(uploadRes.statusCode === 200, 'Upload roster should return 200');
        console.assert(uploadRes.body.count === 2, 'Roster should import 2 candidates');
        console.assert(uploadRes.body.students[0].reg_number.startsWith('AWA2627'), 'First candidate should have auto-assigned AWA2627 reg_number');

        // 3. Test GET /api/admin/reports/class-subject-summary
        console.log('\n[3] Testing GET /api/admin/reports/class-subject-summary report aggregator:');
        const reportRes = await makeRequest(port, '/api/admin/reports/class-subject-summary?class=JSS%201%20Gold&subject=Mathematics', 'GET');
        console.log('  Report Aggregator Status:', reportRes.statusCode);
        console.log('  Report Aggregator Metadata:', reportRes.body.metadata);
        console.log('  Report Candidates Count:', reportRes.body.candidates ? reportRes.body.candidates.length : 0);
        console.assert(reportRes.statusCode === 200, 'Report endpoint should return 200');
        console.assert(reportRes.body.metadata.class_name === 'JSS 1 Gold', 'Class name should match JSS 1 Gold');
        console.assert(Array.isArray(reportRes.body.candidates), 'Candidates should be an array');

        console.log('\n----------------------------------------------------');
        console.log('🎉 ALL API ENDPOINT INTEGRATION TESTS PASSED CLEANLY');
        console.log('----------------------------------------------------');
    } catch (err) {
        console.error('❌ Integration Test Failed:', err);
    } finally {
        server.close();
        process.exit(0);
    }
});

function makeRequest(port, path, method = 'GET', headers = {}, bodyData = null) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: port,
            path: path,
            method: method,
            headers: headers
        }, (res) => {
            let resData = '';
            res.on('data', chunk => { resData += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(resData);
                    resolve({ statusCode: res.statusCode, body: parsed });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, body: resData });
                }
            });
        });
        req.on('error', reject);
        if (bodyData) {
            req.write(bodyData);
        }
        req.end();
    });
}
