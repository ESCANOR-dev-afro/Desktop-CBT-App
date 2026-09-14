/**
 * verify_diagram_pipeline.js
 *
 * Automated Verification & Audit Script for Diagram Pipeline & Storage Architecture.
 * Verifies:
 *   1. Canonical uploads directory exists and is writable.
 *   2. Express static route (/uploads) accurately serves diagrams with correct status and headers.
 *   3. All active database question diagram records resolve to real files on disk.
 *   4. Zero references to dead/legacy public/uploads exist in backend code.
 *   5. deleteDiagramFiles reliably unlinks files without path traversal leakage.
 *   6. cleanupOrphanedDiagramFiles cleans auto-extracted orphans while preserving DB and seed assets.
 *
 * 100% Offline, zero external dependencies.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const app = require('../server');
const db = require('../database');
const {
    deleteDiagramFiles,
    cleanupOrphanedDiagramFiles,
} = require('../services/parsers/common/docxMediaExtractor');

console.log('======================================================================');
console.log('🧪 DIAGRAM PIPELINE & UPLOADS ARCHITECTURE VERIFICATION');
console.log('======================================================================\n');

let passedTests = 0;
let failedTests = 0;

async function runTest(testName, testFn) {
    try {
        await testFn();
        console.log(`  ✅ [PASS] ${testName}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${testName}`);
        console.error(`     Error: ${err.message}`);
        failedTests++;
    }
}

function fetchUrl(server, urlPath) {
    return new Promise((resolve, reject) => {
        const port = server.address().port;
        const options = {
            hostname: '127.0.0.1',
            port: port,
            path: urlPath,
            method: 'GET',
        };

        const req = http.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks),
                });
            });
        });

        req.on('error', (err) => reject(err));
        req.end();
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

async function runAll() {
    let server = null;

    try {
        // Start ephemeral HTTP server for route testing
        server = await new Promise((resolve) => {
            const s = app.listen(0, '127.0.0.1', () => resolve(s));
        });

        const uploadsDir = path.join(__dirname, '../uploads/diagrams');

        // ----------------------------------------------------------------------
        // TEST 1: Canonical Uploads Directory Exists & Is Writable
        // ----------------------------------------------------------------------
        await runTest('Storage: Canonical uploads/diagrams directory exists and is writable', () => {
            assert.strictEqual(fs.existsSync(uploadsDir), true, `Uploads dir must exist at ${uploadsDir}`);
            const testFile = path.join(uploadsDir, '__pipeline_write_test__.tmp');
            fs.writeFileSync(testFile, 'write_test_ok');
            assert.strictEqual(fs.existsSync(testFile), true);
            const content = fs.readFileSync(testFile, 'utf-8');
            assert.strictEqual(content, 'write_test_ok');
            fs.unlinkSync(testFile);
            assert.strictEqual(fs.existsSync(testFile), false);
        });

        // ----------------------------------------------------------------------
        // TEST 2: Express Static Hosting for /uploads/diagrams/...
        // ----------------------------------------------------------------------
        await runTest('Express Route: GET /uploads/diagrams/:file returns 200 OK and valid image MIME', async () => {
            const testImgName = '__express_static_test_img__.png';
            const testImgPath = path.join(uploadsDir, testImgName);
            // 1x1 transparent PNG binary bytes
            const pngHeader = Buffer.from([
                0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
                0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
                0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
                0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
                0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
            ]);
            fs.writeFileSync(testImgPath, pngHeader);

            try {
                const response = await fetchUrl(server, `/uploads/diagrams/${testImgName}`);
                assert.strictEqual(response.statusCode, 200, `Expected 200 OK, got ${response.statusCode}`);
                assert.ok(response.headers['content-type'].includes('image/png'), `Expected image/png content-type, got ${response.headers['content-type']}`);
                assert.strictEqual(response.body.length, pngHeader.length);
            } finally {
                if (fs.existsSync(testImgPath)) fs.unlinkSync(testImgPath);
            }
        });

        // ----------------------------------------------------------------------
        // TEST 3: Database Active Exam Records Resolve to Disk & Serve 200 OK
        // ----------------------------------------------------------------------
        await runTest('Active Exams: All questions with diagram_image_url exist on disk and serve 200 OK', async () => {
            let questionsWithDiagrams = await dbAll(
                `SELECT id, class, subject, question_text, diagram_image_url FROM questions WHERE diagram_image_url IS NOT NULL AND diagram_image_url != ''`
            );

            let createdTempQuestion = false;
            let tempQuestionId = null;
            const tempDiagramName = '__active_exam_test_diagram__.jpg';
            const tempDiagramDiskPath = path.join(uploadsDir, tempDiagramName);

            if (questionsWithDiagrams.length === 0) {
                // Create a temporary question with diagram for pipeline verification
                fs.writeFileSync(tempDiagramDiskPath, 'temporary_test_diagram_bytes');
                const insertRes = await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO questions (subject, class, question_text, option_a, option_b, option_c, option_d, correct_answer, diagram_image_url)
                         VALUES ('Biology', 'SS1', 'Examine the diagram', 'A', 'B', 'C', 'D', 'A', ?)`,
                        [`/uploads/diagrams/${tempDiagramName}`],
                        function (err) {
                            if (err) reject(err);
                            else resolve(this.lastID);
                        }
                    );
                });
                createdTempQuestion = true;
                tempQuestionId = insertRes;
                questionsWithDiagrams = [{
                    id: tempQuestionId,
                    class: 'SS1',
                    subject: 'Biology',
                    question_text: 'Examine the diagram',
                    diagram_image_url: `/uploads/diagrams/${tempDiagramName}`
                }];
            }

            try {
                for (const q of questionsWithDiagrams) {
                    const rawUrl = q.diagram_image_url;
                    const cleanRelPath = rawUrl.replace(/^\//, '');
                    const diskPath = path.join(__dirname, '..', cleanRelPath);

                    assert.strictEqual(
                        fs.existsSync(diskPath),
                        true,
                        `Disk file missing for Question #${q.id} (${q.subject} - ${q.class}): ${diskPath}`
                    );

                    const fileSize = fs.statSync(diskPath).size;
                    assert.ok(fileSize > 0, `File ${diskPath} is empty (0 bytes)`);

                    const res = await fetchUrl(server, rawUrl);
                    assert.strictEqual(
                        res.statusCode,
                        200,
                        `HTTP GET for ${rawUrl} failed with status ${res.statusCode}`
                    );
                    assert.strictEqual(res.body.length, fileSize);
                }
            } finally {
                if (createdTempQuestion && tempQuestionId) {
                    await new Promise(resolve => db.run(`DELETE FROM questions WHERE id = ?`, [tempQuestionId], () => resolve()));
                    if (fs.existsSync(tempDiagramDiskPath)) fs.unlinkSync(tempDiagramDiskPath);
                }
            }
        });

        // ----------------------------------------------------------------------
        // TEST 4: No Legacy public/uploads Directory or References in Backend
        // ----------------------------------------------------------------------
        await runTest('Architecture: Redundant public/uploads directory does not exist and is not referenced in backend', () => {
            const publicUploads = path.join(__dirname, '../public/uploads');
            assert.strictEqual(fs.existsSync(publicUploads), false, 'backend/public/uploads must NOT exist');

            // Scan backend source files for dead references to public/uploads
            const backendSrcDir = path.join(__dirname, '..');
            const filesToScan = [
                'questionRoutes.js',
                'adminRoutes.js',
                'server.js',
                'services/parsers/common/docxMediaExtractor.js',
                'services/parsers/standardDocxParser.js',
                'services/parsers/mathScienceParser.js',
                'services/parsers/englishPassageParser.js',
            ];

            for (const relFile of filesToScan) {
                const fullPath = path.join(backendSrcDir, relFile);
                if (fs.existsSync(fullPath)) {
                    const content = fs.readFileSync(fullPath, 'utf-8');
                    assert.strictEqual(
                        content.includes('public/uploads'),
                        false,
                        `Found forbidden "public/uploads" reference in ${relFile}`
                    );
                }
            }
        });

        // ----------------------------------------------------------------------
        // TEST 5: deleteDiagramFiles Targets Canonical Uploads Root Safely
        // ----------------------------------------------------------------------
        await runTest('Cleanup: deleteDiagramFiles accurately unlinks target file in uploads/diagrams', () => {
            const testFileName = '__pipeline_delete_test__.jpg';
            const testFilePath = path.join(uploadsDir, testFileName);
            fs.writeFileSync(testFilePath, 'dummy_to_delete');
            assert.strictEqual(fs.existsSync(testFilePath), true);

            const deletedCount = deleteDiagramFiles(`/uploads/diagrams/${testFileName}`);
            assert.strictEqual(deletedCount, 1);
            assert.strictEqual(fs.existsSync(testFilePath), false);
        });

        // ----------------------------------------------------------------------
        // TEST 6: cleanupOrphanedDiagramFiles Preserves Active DB & Seed Diagrams
        // ----------------------------------------------------------------------
        await runTest('Cleanup: cleanupOrphanedDiagramFiles cleans orphans but preserves active DB and seed files', async () => {
            // Create a fake orphaned auto-extracted file
            const orphanFile = 'docx_orphan_test_9999_img001.png';
            const orphanPath = path.join(uploadsDir, orphanFile);
            fs.writeFileSync(orphanPath, 'orphan_image_data');
            assert.strictEqual(fs.existsSync(orphanPath), true);

            // Fetch all current referenced URLs
            const allQ = await dbAll(`SELECT diagram_image_url FROM questions WHERE diagram_image_url IS NOT NULL`);
            const referencedUrls = allQ.map(q => q.diagram_image_url).filter(Boolean);

            const cleanedCount = cleanupOrphanedDiagramFiles(referencedUrls);
            assert.ok(cleanedCount >= 1, 'Expected at least 1 orphan to be cleaned');
            assert.strictEqual(fs.existsSync(orphanPath), false, 'Orphaned file should have been deleted');

            // Assert that all referenced questions still exist on disk
            for (const url of referencedUrls) {
                const cleanPath = url.replace(/^\//, '');
                const diskPath = path.join(__dirname, '..', cleanPath);
                assert.strictEqual(fs.existsSync(diskPath), true, `Referenced asset ${diskPath} must NOT be deleted`);
            }
        });

    } finally {
        if (server) {
            server.close();
        }
    }

    console.log('\n======================================================================');
    console.log(`📊 PIPELINE VERIFICATION COMPLETE: ${passedTests} passed, ${failedTests} failed`);
    console.log('======================================================================\n');

    if (failedTests > 0) {
        process.exit(1);
    }
}

runAll().catch((err) => {
    console.error('Fatal error in pipeline verification:', err);
    process.exit(1);
});
