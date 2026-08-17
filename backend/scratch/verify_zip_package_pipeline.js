/**
 * verify_zip_package_pipeline.js
 * 
 * E2E Integration Verification Test for Direct .ZIP Package Processing:
 * Uploads a single .zip file containing BOTH questions.xlsx and diagram images
 * to POST /api/admin/questions/upload-bank
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const AdmZip = require('adm-zip');

const PORT = 61899;
const app = require('../server');
let server;

function makeMultipartRequest(urlPath, fields, files) {
    return new Promise((resolve, reject) => {
        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
        const chunks = [];

        // Add form fields
        for (const [key, val] of Object.entries(fields)) {
            chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`));
        }

        // Add files
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

async function runZipPackageVerification() {
    console.log('----------------------------------------------------');
    console.log('🚀 TESTING DIRECT .ZIP PACKAGE QUESTION BANK UPLOAD');
    console.log('----------------------------------------------------');

    server = http.createServer(app);
    await new Promise(res => server.listen(PORT, '127.0.0.1', res));
    console.log(`✅ Test Server running on port ${PORT}`);

    try {
        // 1. Create a dummy spreadsheet with questions referencing diagram_filename
        const worksheetData = [
            ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer', 'marks', 'diagram_filename', 'subject', 'class'],
            ['Identify the atomic structure shown in figure chem_q01_atom.png.', 'Bohr Atom', 'Rutherford Atom', 'Thomson Model', 'Quantum Cloud', 'A', '1', 'chem_q01_atom.png', 'Chemistry', 'SS 2'],
            ['What type of chemical bond is illustrated in chem_q02_bond.jpg?', 'Ionic Bond', 'Covalent Bond', 'Metallic Bond', 'Hydrogen Bond', 'B', '2', 'chem_q02_bond.jpg', 'Chemistry', 'SS 2']
        ];
        const ws = XLSX.utils.aoa_to_sheet(worksheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Chemistry_Questions');
        const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // 2. Create 1x1 transparent PNG image buffers for test diagrams
        const samplePngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

        // 3. Create a single ZIP package containing BOTH the spreadsheet AND diagram images
        const packageZip = new AdmZip();
        packageZip.addFile('chemistry_questions.xlsx', excelBuffer);
        packageZip.addFile('chem_q01_atom.png', samplePngBuffer);
        packageZip.addFile('chem_q02_bond.jpg', samplePngBuffer);
        const packageZipBuffer = packageZip.toBuffer();

        console.log('\n[1] Uploading single .zip package (spreadsheet + 2 images) to POST /api/admin/questions/upload-bank:');
        const uploadRes = await makeMultipartRequest(
            '/api/admin/questions/upload-bank',
            { subject: 'Chemistry', class: 'SS 2', duration_minutes: '40' },
            [
                { fieldname: 'file', filename: 'chemistry_package.zip', contentType: 'application/zip', buffer: packageZipBuffer }
            ]
        );

        console.log(`  Upload Status: ${uploadRes.statusCode}`);
        console.log('  Upload Response:', JSON.stringify(uploadRes.body, null, 2));

        if (uploadRes.statusCode !== 201 || !uploadRes.body.success) {
            throw new Error(`Direct .zip package upload failed with status ${uploadRes.statusCode}`);
        }

        if (uploadRes.body.importedCount !== 2 || uploadRes.body.imagesCount !== 2) {
            throw new Error(`Expected 2 questions and 2 images imported, got importedCount: ${uploadRes.body.importedCount}, imagesCount: ${uploadRes.body.imagesCount}`);
        }

        console.log('  ✅ API response feedback verified:', uploadRes.body.message);

        // 4. Verify extracted diagram assets on disk
        const img1Path = path.join(__dirname, '../public/uploads/diagrams/chem_q01_atom.png');
        const img2Path = path.join(__dirname, '../public/uploads/diagrams/chem_q02_bond.jpg');

        if (!fs.existsSync(img1Path) || !fs.existsSync(img2Path)) {
            throw new Error('Extracted diagram image files missing from public/uploads/diagrams!');
        }
        console.log('  ✅ Extracted diagram image files verified on disk.');

        // 5. Verify database questions fetch via GET /api/exam/questions/Chemistry
        const getQuestionsRes = await new Promise((resolve, reject) => {
            http.get(`http://127.0.0.1:${PORT}/api/exam/questions/Chemistry?class=SS%202`, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(data) }));
            }).on('error', reject);
        });

        const chemQuestions = getQuestionsRes.body.questions.filter(q => q.subject === 'Chemistry');
        console.log(`\n[2] GET /api/exam/questions/Chemistry returned ${chemQuestions.length} chemistry questions.`);

        const qWithDiagram = chemQuestions.find(q => q.diagram_image_url && q.diagram_image_url.includes('chem_q01_atom.png'));
        console.log('  Question with linked diagram URL:', qWithDiagram);

        if (!qWithDiagram || !qWithDiagram.diagram_image_url) {
            throw new Error('Question missing linked diagram_image_url from .zip package!');
        }

        console.log('----------------------------------------------------');
        console.log('🎉 DIRECT .ZIP PACKAGE QUESTION BANK UPLOAD TEST PASSED');
        console.log('----------------------------------------------------');

        server.close();
        process.exit(0);

    } catch (err) {
        console.error('❌ Integration Verification Failed:', err);
        if (server) server.close();
        process.exit(1);
    }
}

runZipPackageVerification();
