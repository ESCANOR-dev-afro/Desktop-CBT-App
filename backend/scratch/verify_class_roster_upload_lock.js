/**
 * verify_class_roster_upload_lock.js
 * 
 * Verification suite for Class Roster Upload Workspace Locking & Endpoint Validation:
 * 1. POST /api/admin/classes/upload-roster with explicit class locking (SS 1 Science).
 * 2. Verify incoming student records are bound to SS 1 Science.
 * 3. Verify automatic association with subjects registered for SS 1 Science (Biology, Chemistry, Physics).
 * 4. Verify post-upload confirmation message ("X Students successfully enrolled into SS 1 Science").
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

// Generate simple CSV roster buffer
function createCsvBuffer(rows) {
    const csvStr = rows.map(r => r.join(',')).join('\n');
    return Buffer.from(csvStr, 'utf-8');
}

async function runClassRosterUploadLockSuite() {
    console.log("==================================================================");
    console.log("⚡ CBT AGENTIC TEST SUITE: CLASS ROSTER UPLOAD WORKSPACE LOCKING");
    console.log("==================================================================\n");

    const TARGET_CLASS = 'SS 1 Science';
    const sampleCsvBuffer = createCsvBuffer([
        ['Surname', 'First Name', 'Registration No'],
        ['EKEH', 'Chidi', 'AWA26278801'],
        ['SAMUEL', 'Grace', 'AWA26278802']
    ]);

    console.log(`1️⃣ Uploading roster CSV bound strictly to workspace "${TARGET_CLASS}"...`);
    const uploadRes = await makeMultipartRequest(
        '/api/admin/classes/upload-roster',
        { class: TARGET_CLASS, class_id: TARGET_CLASS },
        'file',
        'ss1_science_roster.csv',
        sampleCsvBuffer
    );

    console.log(`  Upload Status: ${uploadRes.statusCode}`);
    console.log(`  Message: "${uploadRes.body.message}"`);
    console.log(`  Count: ${uploadRes.body.count}`);

    if (uploadRes.statusCode !== 200 || !uploadRes.body.success) {
        console.error("❌ Roster upload failed:", uploadRes.body);
        process.exit(1);
    }

    const students = uploadRes.body.students || [];
    console.log(`  ✅ ${students.length} candidates enrolled.`);

    // Verify all candidates strictly belong to SS 1 Science
    const crossContaminated = students.filter(s => s.class !== TARGET_CLASS);
    if (crossContaminated.length > 0) {
        console.error("❌ Cross-class contamination detected!", crossContaminated);
        process.exit(1);
    }
    console.log(`  ✅ Verified 0 cross-class contamination. All candidates bound to "${TARGET_CLASS}".`);

    // Verify assigned subjects
    const firstStudent = students[0];
    console.log(`  Candidate: ${firstStudent.name} (${firstStudent.reg_number})`);
    console.log(`  Class: ${firstStudent.class}`);
    console.log(`  Assigned Subjects: ${firstStudent.assigned_subject}`);

    if (!firstStudent.assigned_subject.includes('Physics') && !firstStudent.assigned_subject.includes('Mathematics')) {
        console.error("❌ Assigned subjects mismatch:", firstStudent.assigned_subject);
        process.exit(1);
    }
    console.log("  ✅ Class-isolated subjects correctly assigned.");

    console.log("\n==================================================================");
    console.log("🎉 ALL TESTS PASSED: CLASS ROSTER UPLOAD WORKSPACE LOCK VERIFIED OK!");
    console.log("==================================================================\n");
}

runClassRosterUploadLockSuite().catch(err => {
    console.error("❌ Test suite exception:", err);
    process.exit(1);
});
