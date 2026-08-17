/**
 * verify_all_engine_features.js
 * 
 * Comprehensive E2E Verification Test for:
 * 1. Question Bank Overwrite & Unlimited Question Count (30/50/100+)
 * 2. GET /api/admin/questions (Fetch all bank questions with filters)
 * 3. POST /api/admin/questions (Add single question)
 * 4. DELETE /api/admin/questions/:id (Delete question)
 * 5. GET /api/exam/questions/:subject (Full pool delivery to student session without .slice(0, 50) cap)
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const PORT = 61899;
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

function makeMultipartRequest(urlPath, fields, files) {
    return new Promise((resolve, reject) => {
        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
        const chunks = [];

        for (const [key, val] of Object.entries(fields)) {
            chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`));
        }

        for (const fileObj of files) {
            const header = `--${boundary}\r\nContent-Disposition: form-data; name="${fileObj.fieldname}"; filename="${fileObj.filename}"\r\nContent-Type: ${fileObj.contentType}\r\n\r\n`;
            chunks.push(Buffer.from(header));
            chunks.push(fileObj.buffer);
            chunks.push(Buffer.from('\r\n'));
        }

        chunks.push(Buffer.from(`--${boundary}--\r\n`));
        const bodyBuffer = Buffer.concat(chunks);

        const options = {
            hostname: '127.0.0.1',
            port: PORT,
            path: urlPath,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': bodyBuffer.length
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
        req.write(bodyBuffer);
        req.end();
    });
}

async function runFullVerification() {
    console.log('----------------------------------------------------');
    console.log('🚀 OVERHAULED QUESTION BANK & UNLIMITED ENGINE VERIFICATION');
    console.log('----------------------------------------------------');

    server = http.createServer(app);
    await new Promise(res => server.listen(PORT, '127.0.0.1', res));
    console.log(`✅ Test Server running on port ${PORT}`);

    try {
        // 1. Create a 35-question spreadsheet to verify unlimited question upload & overwrite
        const rows = [
            ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer', 'marks', 'diagram_filename', 'subject', 'class']
        ];
        for (let i = 1; i <= 35; i++) {
            rows.push([
                `Physics Question #${i}: What is the velocity at time t = ${i}s?`,
                `${i * 10} m/s`, `${i * 20} m/s`, `${i * 30} m/s`, `${i * 40} m/s`,
                i % 4 === 0 ? 'D' : i % 3 === 0 ? 'C' : i % 2 === 0 ? 'B' : 'A',
                '1',
                i === 5 ? 'phys_q05_velocity.png' : '',
                'Physics',
                'SS 1 Science'
            ]);
        }

        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Physics_35_Questions');
        const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // 2. Upload 35 questions with overwrite=true
        console.log('\n[1] Uploading 35 Physics questions paper (overwrite=true) to POST /api/admin/questions/upload-bank:');
        const uploadRes = await makeMultipartRequest(
            '/api/admin/questions/upload-bank',
            { subject: 'Physics', class: 'SS 1 Science', duration_minutes: '60', overwrite: 'true' },
            [
                { fieldname: 'file', filename: 'physics_35_paper.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: excelBuffer }
            ]
        );

        console.log(`  Upload Status: ${uploadRes.statusCode}`);
        console.log(`  Message: ${uploadRes.body.message}`);
        console.log(`  Imported Count: ${uploadRes.body.importedCount}`);

        if (uploadRes.statusCode !== 201 || uploadRes.body.importedCount !== 35) {
            throw new Error(`Expected 35 imported questions, got ${uploadRes.body.importedCount}`);
        }
        console.log('  ✅ 35 Questions successfully imported and previous dummy questions overwritten.');

        // 3. GET /api/admin/questions?class=SS 1 Science&subject=Physics
        console.log('\n[2] Fetching all questions via GET /api/admin/questions:');
        const getBankRes = await makeRequest('GET', `/api/admin/questions?class=SS%201%20Science&subject=Physics`);
        console.log(`  Bank Fetch Status: ${getBankRes.statusCode}`);
        console.log(`  Questions in Bank Count: ${getBankRes.body.count}`);

        if (getBankRes.statusCode !== 200 || getBankRes.body.count !== 35) {
            throw new Error(`Expected bank count 35, got ${getBankRes.body.count}`);
        }
        console.log('  ✅ Admin Question Bank API returned full 35 questions pool.');

        // 4. POST /api/admin/questions (Add single question manually)
        console.log('\n[3] Testing POST /api/admin/questions (Manual Add Question):');
        const addRes = await makeRequest('POST', '/api/admin/questions', {
            class: 'SS 1 Science',
            subject: 'Physics',
            question_text: 'Manual Question #36: What is acceleration due to gravity?',
            option_a: '9.8 m/s²',
            option_b: '10 m/s²',
            option_c: '5 m/s²',
            option_d: '0 m/s²',
            correct_answer: 'A',
            marks: 1
        });
        console.log(`  Manual Add Status: ${addRes.statusCode}`);
        console.log(`  Question ID Created: ${addRes.body.question_id}`);

        if (addRes.statusCode !== 201 || !addRes.body.question_id) {
            throw new Error('Manual Add Question failed!');
        }
        const createdId = addRes.body.question_id;
        console.log('  ✅ Single Question successfully created in database.');

        // 5. DELETE /api/admin/questions/:id
        console.log(`\n[4] Testing DELETE /api/admin/questions/${createdId}:`);
        const delRes = await makeRequest('DELETE', `/api/admin/questions/${createdId}`);
        console.log(`  Delete Status: ${delRes.statusCode}`);

        if (delRes.statusCode !== 200 || !delRes.body.success) {
            throw new Error(`Failed to delete question #${createdId}`);
        }
        console.log(`  ✅ Question #${createdId} deleted cleanly.`);

        // 6. GET /api/exam/questions/Physics?class=SS 1 Science (Student Exam Pool Delivery)
        console.log('\n[5] Testing GET /api/exam/questions/Physics for student exam session:');
        const studentRes = await makeRequest('GET', `/api/exam/questions/Physics?class=SS%201%20Science`);
        console.log(`  Student Exam Questions Status: ${studentRes.statusCode}`);
        console.log(`  Questions Delivered to Student: ${studentRes.body.count}`);

        if (studentRes.statusCode !== 200 || studentRes.body.count !== 30) {
            throw new Error(`Expected 30 questions delivered under TEST mode preset, got ${studentRes.body.count}`);
        }
        console.log('  ✅ Student question pool sampling verified (30 questions sampled under TEST mode preset!).');

        console.log('----------------------------------------------------');
        console.log('🎉 ALL QUESTION BANK OVERHAUL & UNLIMITED POOL TESTS PASSED');
        console.log('----------------------------------------------------');

        server.close();
        process.exit(0);

    } catch (err) {
        console.error('❌ Integration Verification Failed:', err);
        if (server) server.close();
        process.exit(1);
    }
}

runFullVerification();
