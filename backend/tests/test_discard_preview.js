/**
 * test_discard_preview.js
 * 
 * Verification suite for:
 * 1. Auto-cleanup of unconfirmed preview diagrams on modal cancel (POST /api/admin/questions/discard-preview)
 * 2. Active database diagram preservation (never delete images referenced in SQLite)
 * 3. Path traversal protection & malicious filename rejection
 * 4. Staging TTL background sweep (auto-purging abandoned unreferenced staging files older than TTL threshold)
 * 
 * 100% Offline, zero external dependencies.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const db = require('../database');
const adminRoutes = require('../adminRoutes');
const questionRoutes = require('../questionRoutes');
const { cleanupStalePreviewDiagrams } = require('../services/docxQuestionParser');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);
app.use('/api/questions', questionRoutes);

function requestHttp(server, method, pathUrl, body = null) {
    return new Promise((resolve, reject) => {
        const port = server.address().port;
        const reqOpts = {
            hostname: '127.0.0.1',
            port,
            path: pathUrl,
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        const req = http.request(reqOpts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (_) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runDiscardPreviewTests() {
    console.log('======================================================================');
    console.log('🧪 RUNNING TEST SUITE: AUTO-CLEANUP PREVIEW DIAGRAMS & STAGING TTL');
    console.log('======================================================================\n');

    let totalTests = 0;
    let passedTests = 0;

    function check(cond, msg) {
        totalTests++;
        if (cond) {
            console.log(`  ✅ [PASS] ${msg}`);
            passedTests++;
        } else {
            console.error(`  ❌ [FAIL] ${msg}`);
        }
    }

    const diagramsDir = path.join(__dirname, '../uploads/diagrams');
    if (!fs.existsSync(diagramsDir)) {
        fs.mkdirSync(diagramsDir, { recursive: true });
    }

    const server = await new Promise(resolve => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });

    try {
        // ----------------------------------------------------------------------
        // TEST 1: Discard Unconfirmed Preview Assets via Admin Route
        // ----------------------------------------------------------------------
        console.log('🔍 TEST 1: Discard Unconfirmed Preview Assets (POST /api/admin/questions/discard-preview)');
        const tempImg1 = 'docx_preview_test_temp_001.png';
        const tempImg2 = 'biology_ss1_preview_q14_img1.jpeg';
        const path1 = path.join(diagramsDir, tempImg1);
        const path2 = path.join(diagramsDir, tempImg2);

        fs.writeFileSync(path1, 'dummy_preview_image_bytes_1');
        fs.writeFileSync(path2, 'dummy_preview_image_bytes_2');
        check(fs.existsSync(path1) && fs.existsSync(path2), 'Staging preview files created on disk');

        const res1 = await requestHttp(server, 'POST', '/api/admin/questions/discard-preview', {
            imagePaths: [`/uploads/diagrams/${tempImg1}`, tempImg2]
        });

        check(res1.status === 200, 'POST /api/admin/questions/discard-preview returns HTTP 200');
        check(res1.body?.success === true, 'Response indicates success: true');
        check(res1.body?.discardedCount === 2, `Discarded count matches 2 (got: ${res1.body?.discardedCount})`);
        check(!fs.existsSync(path1), `Staging file 1 (${tempImg1}) unlinked from disk`);
        check(!fs.existsSync(path2), `Staging file 2 (${tempImg2}) unlinked from disk`);

        // ----------------------------------------------------------------------
        // TEST 2: Active Database Diagram Preservation (Do NOT Delete Referenced Images)
        // ----------------------------------------------------------------------
        console.log('\n🔍 TEST 2: Active Database Diagram Preservation');
        const activeImg = 'persisted_active_exam_diagram.png';
        const activePath = path.join(diagramsDir, activeImg);
        fs.writeFileSync(activePath, 'critical_active_exam_diagram_data');

        // Insert question referencing this active image
        const insertRes = await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO questions (subject, class, question_text, option_a, option_b, option_c, option_d, correct_answer, diagram_image_url)
                 VALUES ('Physics', 'SS1', 'Sample Active Question', 'A', 'B', 'C', 'D', 'A', ?)`,
                [`/uploads/diagrams/${activeImg}`],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        const activeQuestionId = insertRes;
        check(activeQuestionId > 0, `Active test question inserted in database (ID: ${activeQuestionId})`);

        // Attempt to discard active diagram
        const res2 = await requestHttp(server, 'POST', '/api/admin/questions/discard-preview', {
            imagePaths: [`/uploads/diagrams/${activeImg}`]
        });

        check(res2.status === 200, 'Discard request returns HTTP 200');
        check(res2.body?.discardedCount === 0, `Active referenced image protected (discardedCount: ${res2.body?.discardedCount})`);
        check(fs.existsSync(activePath), 'Referenced diagram safely preserved on disk');

        // Clean up test question and file
        await new Promise(r => db.run(`DELETE FROM questions WHERE id = ?`, [activeQuestionId], () => r()));
        if (fs.existsSync(activePath)) fs.unlinkSync(activePath);

        // ----------------------------------------------------------------------
        // TEST 3: Path Traversal & Sanity Protection
        // ----------------------------------------------------------------------
        console.log('\n🔍 TEST 3: Path Traversal & Malformed Payload Handling');
        const resTraversal = await requestHttp(server, 'POST', '/api/admin/questions/discard-preview', {
            imagePaths: ['../../package.json', '/etc/passwd', '..\\server.js', '']
        });

        check(resTraversal.status === 200, 'Malicious path traversal payload handled gracefully with HTTP 200');
        check(resTraversal.body?.discardedCount === 0, 'Zero files deleted from path traversal attack');

        const resEmpty = await requestHttp(server, 'POST', '/api/admin/questions/discard-preview', {
            imagePaths: []
        });
        check(resEmpty.status === 200 && resEmpty.body?.success === true, 'Empty payload returns HTTP 200 OK');

        // ----------------------------------------------------------------------
        // TEST 4: Staging TTL Sweep (Cleanup of Stale Abandoned Preview Files)
        // ----------------------------------------------------------------------
        console.log('\n🔍 TEST 4: Staging TTL Sweep (Background Expiry Cleanup)');
        const staleFile = 'docx_abandoned_stale_9999_img1.png';
        const freshFile = 'docx_fresh_preview_active_img1.png';
        const stalePath = path.join(diagramsDir, staleFile);
        const freshPath = path.join(diagramsDir, freshFile);

        fs.writeFileSync(stalePath, 'stale_abandoned_data');
        fs.writeFileSync(freshPath, 'fresh_active_data');

        // Set mtime of staleFile to 3 hours ago (180 minutes)
        const threeHoursAgo = new Date(Date.now() - 180 * 60 * 1000);
        fs.utimesSync(stalePath, threeHoursAgo, threeHoursAgo);

        // Run TTL cleanup with 60-minute cutoff
        const purgedCount = await cleanupStalePreviewDiagrams(db, 60, diagramsDir);
        check(purgedCount >= 1, `TTL sweep purged expired staging file (purged: ${purgedCount})`);
        check(!fs.existsSync(stalePath), 'Stale staging file (>60m) removed from disk');
        check(fs.existsSync(freshPath), 'Fresh staging file (<60m) preserved on disk');

        // Clean up fresh test file
        if (fs.existsSync(freshPath)) fs.unlinkSync(freshPath);

        console.log('\n======================================================================');
        console.log(`📊 TEST RUN COMPLETE: ${passedTests} passed, ${totalTests - passedTests} failed`);
        console.log('======================================================================\n');

        if (totalTests === passedTests) {
            console.log('🎉 ALL AUTO-CLEANUP & STAGING TTL TESTS PASSED PERFECTLY!\n');
        } else {
            process.exit(1);
        }

    } finally {
        server.close();
    }
}

runDiscardPreviewTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
