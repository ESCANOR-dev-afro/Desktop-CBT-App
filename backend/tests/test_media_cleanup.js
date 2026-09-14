const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { deleteDiagramFiles, cleanupOrphanedDiagramFiles } = require('../services/parsers/common/docxMediaExtractor');
const db = require('../database');

console.log('======================================================================');
console.log('🧪 RUNNING TEST SUITE: MEDIA CLEANUP & DISK LEAK PREVENTION');
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

function createTempTestDir() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cbt_media_test_'));
    return tmpDir;
}

function cleanTempTestDir(tmpDir) {
    try {
        if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    } catch (err) {
        // ignore cleanup errors
    }
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
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

async function runAll() {
    // --------------------------------------------------------------------------
    // TEST 1: deleteDiagramFiles single file deletion
    // --------------------------------------------------------------------------
    await runTest('deleteDiagramFiles: Deletes a single image file on disk', () => {
        const tmpDir = createTempTestDir();
        try {
            const testFile = path.join(tmpDir, 'docx_12345_img001.png');
            fs.writeFileSync(testFile, 'dummy image content');
            assert.strictEqual(fs.existsSync(testFile), true);

            const deletedCount = deleteDiagramFiles('/uploads/diagrams/docx_12345_img001.png', tmpDir);
            assert.strictEqual(deletedCount, 1);
            assert.strictEqual(fs.existsSync(testFile), false, 'File should have been unlinked');
        } finally {
            cleanTempTestDir(tmpDir);
        }
    });

    // --------------------------------------------------------------------------
    // TEST 2: deleteDiagramFiles multiple files deletion
    // --------------------------------------------------------------------------
    await runTest('deleteDiagramFiles: Deletes multiple image files when passed an array', () => {
        const tmpDir = createTempTestDir();
        try {
            const f1 = path.join(tmpDir, 'docx_111_img001.png');
            const f2 = path.join(tmpDir, 'docx_111_img002.jpeg');
            const f3 = path.join(tmpDir, 'docx_111_img003.png');
            fs.writeFileSync(f1, 'img1');
            fs.writeFileSync(f2, 'img2');
            fs.writeFileSync(f3, 'img3');

            const urls = [
                '/uploads/diagrams/docx_111_img001.png',
                '/uploads/diagrams/docx_111_img002.jpeg'
            ];
            const deletedCount = deleteDiagramFiles(urls, tmpDir);
            assert.strictEqual(deletedCount, 2);
            assert.strictEqual(fs.existsSync(f1), false);
            assert.strictEqual(fs.existsSync(f2), false);
            assert.strictEqual(fs.existsSync(f3), true, 'f3 should remain untouched');
        } finally {
            cleanTempTestDir(tmpDir);
        }
    });

    // --------------------------------------------------------------------------
    // TEST 3: deleteDiagramFiles path traversal protection
    // --------------------------------------------------------------------------
    await runTest('deleteDiagramFiles: Path traversal attempts are sanitized by path.basename', () => {
        const tmpDir = createTempTestDir();
        try {
            const secretFile = path.join(tmpDir, 'secret.txt');
            fs.writeFileSync(secretFile, 'sensitive data');

            // Attempt relative directory traversal
            const traversalUrl = `../../secret.txt`;
            const deletedCount = deleteDiagramFiles(traversalUrl, tmpDir);

            // path.basename('../../secret.txt') -> 'secret.txt' in tmpDir
            // If secret.txt is directly in tmpDir, it matches filename.
            // But let's verify parent escaping outside tmpDir:
            const parentFile = path.join(os.tmpdir(), 'cbt_parent_secret.txt');
            fs.writeFileSync(parentFile, 'parent secret');

            const escapedCount = deleteDiagramFiles('../cbt_parent_secret.txt', tmpDir);
            // Since path.basename('../cbt_parent_secret.txt') = 'cbt_parent_secret.txt',
            // it only looks inside tmpDir, NOT in os.tmpdir().
            assert.strictEqual(fs.existsSync(parentFile), true, 'Parent file outside target dir must NOT be deleted');
            try { fs.unlinkSync(parentFile); } catch (e) { }
        } finally {
            cleanTempTestDir(tmpDir);
        }
    });

    // --------------------------------------------------------------------------
    // TEST 4: deleteDiagramFiles handles null, invalid, or non-existent files gracefully
    // --------------------------------------------------------------------------
    await runTest('deleteDiagramFiles: Gracefully handles non-existent, null, or empty inputs', () => {
        const tmpDir = createTempTestDir();
        try {
            assert.strictEqual(deleteDiagramFiles(null, tmpDir), 0);
            assert.strictEqual(deleteDiagramFiles([], tmpDir), 0);
            assert.strictEqual(deleteDiagramFiles(['/uploads/diagrams/non_existent.png'], tmpDir), 0);
            assert.strictEqual(deleteDiagramFiles([null, undefined, '', '   '], tmpDir), 0);
        } finally {
            cleanTempTestDir(tmpDir);
        }
    });

    // --------------------------------------------------------------------------
    // TEST 5: cleanupOrphanedDiagramFiles cleans unreferenced docx_ images only
    // --------------------------------------------------------------------------
    await runTest('cleanupOrphanedDiagramFiles: Deletes unreferenced docx_ images and preserves seed/referenced files', () => {
        const tmpDir = createTempTestDir();
        try {
            // Seed static assets
            const seedAmoeba = path.join(tmpDir, 'bio_q5_amoeba.png');
            const seedCell = path.join(tmpDir, 'bio_q10_plant_cell.png');
            fs.writeFileSync(seedAmoeba, 'seed image 1');
            fs.writeFileSync(seedCell, 'seed image 2');

            // Active referenced docx images
            const activeDocx1 = path.join(tmpDir, 'docx_active_img001.png');
            fs.writeFileSync(activeDocx1, 'active docx image');

            // Orphaned docx images (not in referencedUrls)
            const orphanDocx1 = path.join(tmpDir, 'docx_orphan_img002.jpeg');
            const orphanDocx2 = path.join(tmpDir, 'docx_orphan_img003.png');
            fs.writeFileSync(orphanDocx1, 'orphan docx image 1');
            fs.writeFileSync(orphanDocx2, 'orphan docx image 2');

            const referencedList = [
                '/uploads/diagrams/docx_active_img001.png',
                '/uploads/diagrams/bio_q5_amoeba.png'
            ];

            const removedCount = cleanupOrphanedDiagramFiles(referencedList, tmpDir);
            assert.strictEqual(removedCount, 2, 'Should have removed 2 orphaned docx files');

            assert.strictEqual(fs.existsSync(orphanDocx1), false, 'Orphan 1 must be deleted');
            assert.strictEqual(fs.existsSync(orphanDocx2), false, 'Orphan 2 must be deleted');
            assert.strictEqual(fs.existsSync(activeDocx1), true, 'Active docx file must be preserved');
            assert.strictEqual(fs.existsSync(seedAmoeba), true, 'Seed amoeba image must be preserved');
            assert.strictEqual(fs.existsSync(seedCell), true, 'Seed plant cell image must be preserved even if unreferenced');
        } finally {
            cleanTempTestDir(tmpDir);
        }
    });

    // --------------------------------------------------------------------------
    // TEST 6: SQLite integration - Single question deletion cleans diagram
    // --------------------------------------------------------------------------
    await runTest('Database Integration: Single question deletion unlinks diagram from disk', async () => {
        const diagramsDir = path.join(__dirname, '../uploads/diagrams');
        if (!fs.existsSync(diagramsDir)) fs.mkdirSync(diagramsDir, { recursive: true });

        const testImgName = `docx_test_single_del_${Date.now()}.png`;
        const testImgPath = path.join(diagramsDir, testImgName);
        fs.writeFileSync(testImgPath, 'test single del image');
        assert.strictEqual(fs.existsSync(testImgPath), true);

        const imgUrl = `/uploads/diagrams/${testImgName}`;

        // Insert test question
        const res = await dbRun(`
            INSERT INTO questions (session, term, assessment_slot, class, subject, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, diagram_image_url)
            VALUES ('2026/2027', '1st Term', 'midterm_ca', 'SSS 1', 'Test Biology', 'What is shown in the diagram?', 'A', 'B', 'C', 'D', 'A', 1, ?)
        `, [imgUrl]);

        const qId = res.lastID;
        assert.ok(qId > 0);

        // Execute single question delete logic
        const qRow = await dbGet(`SELECT diagram_image_url FROM questions WHERE id = ?`, [qId]);
        if (qRow && qRow.diagram_image_url) {
            deleteDiagramFiles(qRow.diagram_image_url);
        }
        await dbRun(`DELETE FROM question_options WHERE question_id = ?`, [qId]);
        await dbRun(`DELETE FROM questions WHERE id = ?`, [qId]);

        assert.strictEqual(fs.existsSync(testImgPath), false, 'Diagram file on disk must be unlinked after question deletion');
    });

    // --------------------------------------------------------------------------
    // TEST 7: SQLite integration - Clear subject questions cleans all subject diagrams
    // --------------------------------------------------------------------------
    await runTest('Database Integration: Clear Subject Questions unlinks all associated diagrams on disk', async () => {
        const diagramsDir = path.join(__dirname, '../uploads/diagrams');
        if (!fs.existsSync(diagramsDir)) fs.mkdirSync(diagramsDir, { recursive: true });

        const testImg1 = `docx_test_clr1_${Date.now()}.png`;
        const testImg2 = `docx_test_clr2_${Date.now()}.png`;
        const p1 = path.join(diagramsDir, testImg1);
        const p2 = path.join(diagramsDir, testImg2);
        fs.writeFileSync(p1, 'img 1');
        fs.writeFileSync(p2, 'img 2');

        const testSub = `TestChem_${Date.now()}`;
        const testClass = 'SSS 2';
        const testSlot = 'midterm_ca';
        const testSession = '2026/2027';
        const testTerm = '1st Term';

        // Insert 2 test questions
        await dbRun(`
            INSERT INTO questions (session, term, assessment_slot, class, subject, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, diagram_image_url)
            VALUES (?, ?, ?, ?, ?, 'Q1 text', 'A', 'B', 'C', 'D', 'A', 1, ?)
        `, [testSession, testTerm, testSlot, testClass, testSub, `/uploads/diagrams/${testImg1}`]);

        await dbRun(`
            INSERT INTO questions (session, term, assessment_slot, class, subject, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, diagram_image_url)
            VALUES (?, ?, ?, ?, ?, 'Q2 text', 'A', 'B', 'C', 'D', 'B', 1, ?)
        `, [testSession, testTerm, testSlot, testClass, testSub, `/uploads/diagrams/${testImg2}`]);

        // Query diagrams and delete
        const findSql = `SELECT diagram_image_url FROM questions WHERE session = ? AND term = ? AND assessment_slot = ? AND LOWER(subject) = LOWER(?) AND LOWER(class) = LOWER(?)`;
        const qRows = await new Promise((res, rej) => {
            db.all(findSql, [testSession, testTerm, testSlot, testSub, testClass], (err, rows) => {
                if (err) rej(err);
                else res(rows);
            });
        });

        const urls = qRows.map(r => r.diagram_image_url).filter(Boolean);
        assert.strictEqual(urls.length, 2);

        const count = deleteDiagramFiles(urls);
        assert.strictEqual(count, 2);

        // Delete from DB
        await dbRun(`DELETE FROM questions WHERE session = ? AND term = ? AND assessment_slot = ? AND LOWER(subject) = LOWER(?) AND LOWER(class) = LOWER(?)`,
            [testSession, testTerm, testSlot, testSub, testClass]);

        assert.strictEqual(fs.existsSync(p1), false, 'Image 1 must be deleted from disk');
        assert.strictEqual(fs.existsSync(p2), false, 'Image 2 must be deleted from disk');
    });

    // --------------------------------------------------------------------------
    // TEST 8: Live directory scan - Clean orphaned docx files currently in backend/uploads/diagrams
    // --------------------------------------------------------------------------
    await runTest('System Maintenance: Scanning and cleaning existing orphaned docx files in backend/uploads/diagrams', async () => {
        const allQuestions = await new Promise((res, rej) => {
            db.all(`SELECT diagram_image_url FROM questions WHERE diagram_image_url IS NOT NULL`, (err, rows) => {
                if (err) rej(err);
                else res(rows || []);
            });
        });

        const referencedUrls = allQuestions.map(q => q.diagram_image_url).filter(Boolean);
        const removedCount = cleanupOrphanedDiagramFiles(referencedUrls);
        console.log(`     🧹 Cleaned ${removedCount} orphaned docx diagrams from disk.`);

        const diagramsDir = path.join(__dirname, '../uploads/diagrams');
        const remainingFiles = fs.readdirSync(diagramsDir);

        // Verify that only valid referenced files remain
        const refBasenames = new Set(referencedUrls.map(u => path.basename(u.split('?')[0])));
        for (const file of remainingFiles) {
            if (file.startsWith('docx_')) {
                assert.ok(refBasenames.has(file), `Remaining file ${file} must be referenced in the database`);
            }
        }
    });

    console.log('\n======================================================================');
    console.log(`📊 TEST RUN COMPLETE: ${passedTests} passed, ${failedTests} failed`);
    console.log('======================================================================');

    if (failedTests > 0) {
        process.exit(1);
    }
}

runAll().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
