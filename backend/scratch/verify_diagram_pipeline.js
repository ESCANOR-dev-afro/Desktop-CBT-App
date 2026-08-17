/**
 * verify_diagram_pipeline.js
 * 
 * End-to-End Integration Verification Script for:
 * 1. Dual Question Bank + Diagram Asset Upload Handler (POST /api/admin/questions/upload-bank)
 * 2. ZIP Archive & Image File Extraction & SQLite linking
 * 3. Diagram image URL resolution for student exam view
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
                try {
                    const parsed = JSON.parse(data);
                    resolve({ statusCode: res.statusCode, body: parsed });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, body: data });
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.write(bodyBuffer);
        req.end();
    });
}

async function runVerification() {
    console.log('----------------------------------------------------');
    console.log('🚀 TESTING QUESTION BANK & DIAGRAM ASSET UPLOAD PIPELINE');
    console.log('----------------------------------------------------');

    server = http.createServer(app);
    await new Promise(res => server.listen(PORT, '127.0.0.1', res));
    console.log(`✅ Test Server running on port ${PORT}`);

    try {
        // 1. Create a dummy spreadsheet with questions referencing diagram_filename
        const worksheetData = [
            ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer', 'marks', 'diagram_filename'],
            ['Identify the organelle shown in the diagram bio_q14_amoeba.png.', 'Mitochondria', 'Cell Membrane / Amoeba', 'Ribosome', 'Nucleus', 'B', '1', 'bio_q14_amoeba.png'],
            ['What is the angle of refraction in figure opt_q02_prism.jpg?', '30 degrees', '45 degrees', '60 degrees', '90 degrees', 'C', '2', 'opt_q02_prism.jpg']
        ];
        const ws = XLSX.utils.aoa_to_sheet(worksheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Questions');
        const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // 2. Create sample dummy image buffer and a .zip archive
        const sampleImageBuffer = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;');

        const zip = new AdmZip();
        zip.addFile('bio_q14_amoeba.png', sampleImageBuffer);
        zip.addFile('opt_q02_prism.jpg', sampleImageBuffer);
        const zipBuffer = zip.toBuffer();

        console.log('\n[1] Testing POST /api/admin/questions/upload-bank with Excel + ZIP Diagram Archive:');
        const uploadResult = await makeMultipartRequest(
            '/api/admin/questions/upload-bank',
            { class: 'JSS 1', subject: 'Biology', duration_minutes: '30' },
            [
                { fieldname: 'file', filename: 'biology_paper_with_diagrams.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: excelBuffer },
                { fieldname: 'diagram_zip', filename: 'diagrams_bundle.zip', contentType: 'application/zip', buffer: zipBuffer }
            ]
        );

        console.log(`  Upload Status: ${uploadResult.statusCode}`);
        console.log(`  Upload Response:`, JSON.stringify(uploadResult.body, null, 2));

        if (uploadResult.statusCode !== 200 && uploadResult.statusCode !== 201) {
            throw new Error(`Upload bank endpoint failed with status ${uploadResult.statusCode}`);
        }

        // 3. Verify extracted image files on disk
        const publicDiagramPath = path.join(__dirname, '../public/uploads/diagrams/bio_q14_amoeba.png');
        const backendDiagramPath = path.join(__dirname, '../uploads/diagrams/opt_q02_prism.jpg');

        if (!fs.existsSync(publicDiagramPath)) {
            throw new Error(`Extracted diagram image not found on disk at: ${publicDiagramPath}`);
        }
        console.log(`✅ Extracted diagram file verified at: public/uploads/diagrams/bio_q14_amoeba.png`);

        // 4. Test GET /api/exam/questions/Biology to verify diagram_image_url is returned
        console.log('\n[2] Testing GET /api/exam/questions/Biology to verify student client diagram URL:');
        const getQuestionsRes = await new Promise((res, rej) => {
            http.get(`http://127.0.0.1:${PORT}/api/exam/questions/Biology?class=JSS%201`, (r) => {
                let d = '';
                r.on('data', chunk => d += chunk);
                r.on('end', () => res({ statusCode: r.statusCode, body: JSON.parse(d) }));
            }).on('error', rej);
        });

        console.log(`  Exam Questions Status: ${getQuestionsRes.statusCode}`);
        console.log(`  Questions Count: ${getQuestionsRes.body.count}`);

        const firstQuestion = getQuestionsRes.body.questions.find(q => q.diagram_image_url);
        console.log('  Uploaded Question with Linked Diagram:', firstQuestion);

        if (!firstQuestion || !firstQuestion.diagram_image_url) {
            throw new Error('Question missing linked diagram_image_url!');
        }

        console.log('----------------------------------------------------');
        console.log('🎉 ALL DUAL QUESTION & DIAGRAM PIPELINE TESTS PASSED CLEANLY');
        console.log('----------------------------------------------------');

        process.exit(0);

    } catch (err) {
        console.error('❌ Integration Verification Failed:', err);
        process.exit(1);
    }
}

runVerification();
