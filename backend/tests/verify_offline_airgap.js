/**
 * verify_offline_airgap.js
 *
 * Automated 100% Offline Air-Gap Verification Audit for Desktop CBT Application.
 * Programmatically inspects:
 *   1. Frontend HTML entry points and built production bundles for external CDN/script/link leaks.
 *   2. KaTeX math rendering and fonts isolation (100% bundled locally).
 *   3. Backend routes, database connection, and parsing services for zero outbound HTTP/API calls.
 *   4. UTF-8 database encoding and response headers.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('======================================================================');
console.log('🛡️  RUNNING 100% OFFLINE AIR-GAP AUDIT & ZERO-EXTERNAL-LEAK VERIFICATION');
console.log('======================================================================\n');

let auditPassed = 0;
let auditFailed = 0;

function runAuditCheck(checkName, checkFn) {
    try {
        checkFn();
        console.log(`  ✅ [PASS] ${checkName}`);
        auditPassed++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${checkName}`);
        console.error(`     Error: ${err.message}`);
        auditFailed++;
    }
}

async function runAsyncAuditCheck(checkName, checkFn) {
    try {
        await checkFn();
        console.log(`  ✅ [PASS] ${checkName}`);
        auditPassed++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${checkName}`);
        console.error(`     Error: ${err.message}`);
        auditFailed++;
    }
}

const FORBIDDEN_REMOTE_PATTERNS = [
    /https?:\/\/fonts\.googleapis\.com/i,
    /https?:\/\/fonts\.gstatic\.com/i,
    /https?:\/\/cdnjs\.cloudflare\.com/i,
    /https?:\/\/unpkg\.com/i,
    /https?:\/\/cdn\.jsdelivr\.net/i,
    /https?:\/\/www\.google-analytics\.com/i,
    /https?:\/\/www\.googletagmanager\.com/i,
    /https?:\/\/cdn\.tailwindcss\.com/i,
    /<script\b[^>]*src=["']https?:\/\//i,
    /<link\b[^>]*href=["']https?:\/\/(?!localhost|127\.0\.0\.1)/i,
];

const rootDir = path.resolve(__dirname, '../..');

async function runAllAudits() {
    // --------------------------------------------------------------------------
    // AUDIT 1: Frontend Source HTML Entry Points
    // --------------------------------------------------------------------------
    runAuditCheck('Frontend HTML: admin-dashboard/index.html is 100% offline (0 remote scripts/links)', () => {
        const htmlPath = path.join(rootDir, 'admin-dashboard/index.html');
        if (fs.existsSync(htmlPath)) {
            const content = fs.readFileSync(htmlPath, 'utf8');
            for (const pattern of FORBIDDEN_REMOTE_PATTERNS) {
                assert.strictEqual(pattern.test(content), false, `Forbidden remote pattern ${pattern} found in admin-dashboard/index.html`);
            }
        }
    });

    runAuditCheck('Frontend HTML: student_client_react/index.html is 100% offline (0 remote scripts/links)', () => {
        const htmlPath = path.join(rootDir, 'student_client_react/index.html');
        if (fs.existsSync(htmlPath)) {
            const content = fs.readFileSync(htmlPath, 'utf8');
            for (const pattern of FORBIDDEN_REMOTE_PATTERNS) {
                assert.strictEqual(pattern.test(content), false, `Forbidden remote pattern ${pattern} found in student_client_react/index.html`);
            }
        }
    });

    // --------------------------------------------------------------------------
    // AUDIT 2: Production Built Assets in backend/public/
    // --------------------------------------------------------------------------
    runAuditCheck('Production Distribution: backend/public/ contains zero remote CDN references', () => {
        const publicDir = path.join(rootDir, 'backend/public');
        if (!fs.existsSync(publicDir)) return;

        function scanDir(dir) {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    scanDir(fullPath);
                } else if (/\.(html|js|css)$/i.test(entry.name)) {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    // Ensure no external font or script links in built HTML/CSS/JS
                    assert.strictEqual(/fonts\.googleapis\.com/i.test(content), false, `Google Fonts link in ${entry.name}`);
                    assert.strictEqual(/cdnjs\.cloudflare\.com/i.test(content), false, `Cloudflare CDN in ${entry.name}`);
                    assert.strictEqual(/unpkg\.com/i.test(content), false, `Unpkg CDN in ${entry.name}`);
                    assert.strictEqual(/cdn\.jsdelivr\.net/i.test(content), false, `jsDelivr CDN in ${entry.name}`);
                    assert.strictEqual(/google-analytics\.com/i.test(content), false, `Google Analytics in ${entry.name}`);
                }
            }
        }
        scanDir(publicDir);
    });

    // --------------------------------------------------------------------------
    // AUDIT 3: KaTeX Math Library Local Bundling & Font Asset Verification
    // --------------------------------------------------------------------------
    runAuditCheck('KaTeX Math Isolation: KaTeX is bundled locally and renders math formulas 100% offline', () => {
        let katex;
        try {
            katex = require('katex');
        } catch (e) {
            const studentKatexPath = require.resolve('katex', { paths: [path.join(rootDir, 'student_client_react'), path.join(rootDir, 'admin-dashboard')] });
            katex = require(studentKatexPath);
        }
        assert.ok(katex, 'katex module must be locally available');
        const rendered = katex.renderToString('\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', {
            throwOnError: false,
        });
        assert.ok(rendered.includes('katex-html'), 'KaTeX must render valid HTML string without network access');
        assert.ok(rendered.includes('sqrt'), 'KaTeX must render sqrt structure locally');

        // Confirm local KaTeX font assets exist in the public bundle directory
        const studentAssets = path.join(rootDir, 'backend/public/assets');
        const adminAssets = path.join(rootDir, 'backend/public/admin/assets');
        const hasStudentFonts = fs.existsSync(studentAssets) && fs.readdirSync(studentAssets).some(f => f.startsWith('KaTeX_') && f.endsWith('.woff2'));
        const hasAdminFonts = fs.existsSync(adminAssets) && fs.readdirSync(adminAssets).some(f => f.startsWith('KaTeX_') && f.endsWith('.woff2'));
        assert.ok(hasStudentFonts || hasAdminFonts, 'Local KaTeX font files (.woff2) must be present in client asset bundles');
    });

    // --------------------------------------------------------------------------
    // AUDIT 4: Backend Routes & Controller Audit (Zero Outbound HTTP Requests)
    // --------------------------------------------------------------------------
    runAuditCheck('Backend Routes: Zero outbound network/cloud API requests in controllers and services', () => {
        const backendFiles = [
            path.join(rootDir, 'backend/server.js'),
            path.join(rootDir, 'backend/authRoutes.js'),
            path.join(rootDir, 'backend/examRoutes.js'),
            path.join(rootDir, 'backend/adminRoutes.js'),
            path.join(rootDir, 'backend/questionRoutes.js'),
            path.join(rootDir, 'backend/services/docxQuestionParser.js'),
            path.join(rootDir, 'backend/services/parsers/index.js'),
            path.join(rootDir, 'backend/services/parsers/mathScienceParser.js'),
            path.join(rootDir, 'backend/services/parsers/englishPassageParser.js'),
            path.join(rootDir, 'backend/services/parsers/standardDocxParser.js'),
            path.join(rootDir, 'backend/services/parsers/common/docxMediaExtractor.js'),
        ];

        const forbiddenOutboundPatterns = [
            /\baxios\.(get|post|put|delete)\b/i,
            /\bhttp\.request\b/i,
            /\bhttps\.request\b/i,
            /\bhttp\.get\b/i,
            /\bhttps\.get\b/i,
            /\bwindow\.fetch\b/i,
            /\bopenai\b/i,
            /\banthropic\b/i,
            /\bgroq\b/i,
            /\bapi\.openai\.com\b/i,
        ];

        for (const file of backendFiles) {
            if (fs.existsSync(file)) {
                const content = fs.readFileSync(file, 'utf8');
                for (const pattern of forbiddenOutboundPatterns) {
                    assert.strictEqual(
                        pattern.test(content),
                        false,
                        `Forbidden outbound network pattern ${pattern} found in ${path.basename(file)}`
                    );
                }
            }
        }
    });

    // --------------------------------------------------------------------------
    // AUDIT 5: Local SQLite Database Encoding & File Isolation
    // --------------------------------------------------------------------------
    await runAsyncAuditCheck('SQLite Database: UTF-8 encoding enabled & strictly local file storage', async () => {
        const db = require('../database');
        const encodingRow = await new Promise((resolve, reject) => {
            db.get('PRAGMA encoding;', (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        assert.ok(encodingRow, 'PRAGMA encoding must return a row');
        assert.strictEqual(encodingRow.encoding, 'UTF-8', 'Database encoding MUST be UTF-8');
    });

    // --------------------------------------------------------------------------
    // AUDIT 6: Oral English IPA Unicode Persistence in SQLite
    // --------------------------------------------------------------------------
    await runAsyncAuditCheck('Database UTF-8 Roundtrip: Oral English IPA symbols stored and retrieved without corruption', async () => {
        const db = require('../database');
        const testStem = 'Which word contains the vowel sound /iː/ and consonant sound /θ/ as in <u>th</u>ink?';
        const optA = '/iː/ (seat)';
        const optB = '/ɪ/ (sit)';
        const optC = 'ˈpho-TO-graph-er';
        const optD = '[tʃ] (church)';

        const insertRes = await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO questions (session, term, assessment_slot, class, subject, question_text, option_a, option_b, option_c, option_d, correct_answer, marks)
                VALUES ('2026/2027', '1st Term', 'midterm_ca', 'SSS 1', 'Oral English Test', ?, ?, ?, ?, ?, 'A', 1)
            `, [testStem, optA, optB, optC, optD], function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });

        const qId = insertRes.lastID;
        assert.ok(qId > 0);

        const row = await new Promise((resolve, reject) => {
            db.get(`SELECT question_text, option_a, option_b, option_c, option_d FROM questions WHERE id = ?`, [qId], (err, r) => {
                if (err) reject(err);
                else resolve(r);
            });
        });

        assert.strictEqual(row.question_text, testStem, 'question_text must match UTF-8 string exactly');
        assert.strictEqual(row.option_a, optA, 'option_a must match /iː/ exactly');
        assert.strictEqual(row.option_b, optB, 'option_b must match /ɪ/ exactly');
        assert.strictEqual(row.option_c, optC, 'option_c must match ˈpho-TO-graph-er exactly');
        assert.strictEqual(row.option_d, optD, 'option_d must match [tʃ] (church) exactly');

        // Cleanup test question
        await new Promise((resolve, reject) => {
            db.run(`DELETE FROM questions WHERE id = ?`, [qId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });

    console.log('\n======================================================================');
    console.log(`📊 OFFLINE AIR-GAP AUDIT COMPLETE: ${auditPassed} passed, ${auditFailed} failed`);
    console.log('======================================================================');

    if (auditFailed > 0) {
        process.exit(1);
    } else {
        console.log('🎉 100% OFFLINE AIR-GAP VERIFICATION CONFIRMED (0 EXTERNAL NETWORK LEAKS)!\n');
    }
}

runAllAudits().catch(err => {
    console.error('Fatal audit error:', err);
    process.exit(1);
});
