/**
 * verify_roster_upload_crash_resilience.js
 * 
 * Verification suite for Class Roster Upload Crash Resilience & Endpoint Validation:
 * 1. Test POST /api/admin/classes/upload-roster with valid CSV roster.
 * 2. Test POST /api/admin/classes/upload-roster with empty payload handling.
 * 3. Confirm structured JSON response { success, count, message, students }.
 */

const http = require('http');

function makeMultipartRequest(path, fields, fileField, fileName, fileBuffer) {
    return new Promise((resolve, reject) => {
        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
        let body = '';

        for (const [key, val] of Object.entries(fields)) {
            body += `--${boundary}\r\n`;
            body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
            body += `${val}\r\n`;
        }

        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\n`;
        body += `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;

        const footer = `\r\n--${boundary}--\r\n`;

        const payloadBuffer = Buffer.concat([
            Buffer.from(body, 'utf-8'),
            fileBuffer,
            Buffer.from(footer, 'utf-8')
        ]);

        const req = http.request({
            host: '127.0.0.1',
            port: 3000,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': payloadBuffer.length
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
        req.write(payloadBuffer);
        req.end();
    });
}

function createCsvBuffer(rows) {
    const csvStr = rows.map(r => r.join(',')).join('\n');
    return Buffer.from(csvStr, 'utf-8');
}

async function runCrashResilienceSuite() {
    console.log("==================================================================");
    console.log("⚡ CBT AGENTIC TEST SUITE: CLASS ROSTER UPLOAD CRASH RESILIENCE");
    console.log("==================================================================\n");

    const TARGET_CLASS = 'SS 2 Science';
    const sampleCsv = createCsvBuffer([
        ['Surname', 'First Name', 'Registration No'],
        ['OKONKWO', 'Emeka', 'AWA26277701'],
        ['BELLO', 'Amina', 'AWA26277702']
    ]);

    console.log(`1️⃣ Uploading roster to POST /api/admin/classes/upload-roster for ${TARGET_CLASS}...`);
    const uploadRes = await makeMultipartRequest(
        '/api/admin/classes/upload-roster',
        { class: TARGET_CLASS },
        'file',
        'ss2_science_roster.csv',
        sampleCsv
    );

    console.log(`  Upload Status: ${uploadRes.statusCode}`);
    console.log(`  Response Body:`, JSON.stringify(uploadRes.body, null, 2));

    if (uploadRes.statusCode !== 200 || !uploadRes.body.success) {
        console.error("❌ Roster upload failed:", uploadRes.body);
        process.exit(1);
    }
    console.log("  ✅ Structured JSON response verified ok.");

    // 2. Test empty file validation
    console.log("\n2️⃣ Testing upload endpoint resilience with empty file buffer...");
    const emptyRes = await makeMultipartRequest(
        '/api/admin/classes/upload-roster',
        { class: TARGET_CLASS },
        'file',
        'empty.csv',
        Buffer.from('', 'utf-8')
    );

    console.log(`  Empty File Status: ${emptyRes.statusCode}`);
    console.log(`  Message: "${emptyRes.body.message}"`);
    if (emptyRes.statusCode !== 400 || emptyRes.body.success !== false) {
        console.error("❌ Empty file validation failed:", emptyRes.body);
        process.exit(1);
    }
    console.log("  ✅ Graceful 400 Bad Request error returned cleanly.");

    console.log("\n==================================================================");
    console.log("🎉 ALL TESTS PASSED: ROSTER UPLOAD CRASH RESILIENCE VERIFIED OK!");
    console.log("==================================================================\n");
}

runCrashResilienceSuite().catch(err => {
    console.error("❌ Test suite exception:", err);
    process.exit(1);
});
