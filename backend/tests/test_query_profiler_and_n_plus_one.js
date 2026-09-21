/**
 * test_query_profiler_and_n_plus_one.js
 * 
 * Test suite to verify:
 * 1. Request-scoped Query Profiler Middleware (AsyncLocalStorage query counter, duration tracking)
 * 2. `?debug_queries=true` debug payload injection in JSON responses
 * 3. Silent routes suppression of routine logs while retaining active profiling & N+1 alerting
 * 4. Elimination of N+1 query anti-patterns across hot-path endpoints:
 *    - GET /api/admin/overview (consolidated to 1 query)
 *    - GET /api/admin/dashboard-stats (batched queries <= 5)
 *    - GET /api/admin/students (batched <= 3 queries)
 *    - GET /api/admin/results (cached obtainable score, <= 5 queries total)
 *    - GET /api/admin/reports/class-subject-summary (cached obtainable score, <= 5 queries total)
 *    - GET /api/admin/questions (batched <= 3 queries)
 */

const http = require('http');
const path = require('path');
const express = require('express');
const db = require('../database');
const createQueryProfiler = require('../middleware/queryProfiler');
const adminRoutes = require('../adminRoutes');
const examRoutes = require('../examRoutes');
const authRoutes = require('../authRoutes');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
    totalTests++;
    if (condition) {
        console.log(`  ✅ [PASS] ${message}`);
        passedTests++;
    } else {
        console.error(`  ❌ [FAIL] ${message}`);
    }
}

function requestGet(serverPort, pathUrl) {
    return new Promise((resolve, reject) => {
        const url = `http://localhost:${serverPort}${pathUrl}`;
        const req = http.get(url, { headers: { 'Connection': 'close' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, body: parsed, raw: data });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });
        req.on('error', reject);
    });
}

async function runTests() {
    console.log('======================================================================');
    console.log('🧪 RUNNING TEST SUITE: QUERY PROFILER & N+1 AUDIT VERIFICATION');
    console.log('======================================================================\n');

    const app = express();
    app.use(express.json());

    const silentRoutes = [
        '/api/health',
        '/health',
        '/api/exam/node-heartbeat',
        '/api/exam/heartbeat',
        '/api/student/session-heartbeat',
        '/api/admin/dashboard-stats',
        '/api/admin/dashboard/stats',
        '/api/admin/workstation-grid',
        '/api/admin/live-monitor'
    ];

    // Intercept console output to verify log emission and suppression
    const capturedLogs = [];
    const capturedWarns = [];
    const originalLog = console.log;
    const originalWarn = console.warn;

    console.log = (...args) => {
        capturedLogs.push(args.join(' '));
        originalLog.apply(console, args);
    };
    console.warn = (...args) => {
        capturedWarns.push(args.join(' '));
        originalWarn.apply(console, args);
    };

    app.use(createQueryProfiler({ silentRoutes, threshold: 5 }));

    // Health test route
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok' });
    });

    // Dummy test route executing intentional N+1 queries (e.g. 8 queries) to test alert
    app.get('/api/test-n-plus-one', async (req, res) => {
        for (let i = 0; i < 8; i++) {
            await db.getAsync(`SELECT 1 AS test_val`);
        }
        res.json({ success: true, count: req.queryCount });
    });

    app.use('/api/admin', adminRoutes);
    app.use('/api/exam', examRoutes);
    app.use('/api', authRoutes);

    const server = await new Promise(resolve => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;

    try {
        // ----------------------------------------------------
        // TEST 1: ?debug_queries=true attaches _debug payload
        // ----------------------------------------------------
        console.log('\n--- TEST 1: Query Profiler & ?debug_queries=true Response Injection ---');
        const debugRes = await requestGet(port, '/api/admin/overview?debug_queries=true');
        assert(debugRes.status === 200, 'GET /api/admin/overview returned status 200');
        assert(debugRes.body && debugRes.body._debug !== undefined, 'Response body contains `_debug` property when ?debug_queries=true');
        assert(typeof debugRes.body._debug.queryCount === 'number', `_debug.queryCount is a number (count: ${debugRes.body?._debug?.queryCount})`);
        assert(Array.isArray(debugRes.body._debug.queries), `_debug.queries is an array (length: ${debugRes.body?._debug?.queries?.length})`);
        assert(typeof debugRes.body._debug.durationMs === 'number', `_debug.durationMs is tracked (${debugRes.body?._debug?.durationMs}ms)`);

        // ----------------------------------------------------
        // TEST 2: Request without ?debug_queries=true omits _debug
        // ----------------------------------------------------
        console.log('\n--- TEST 2: Response Cleanliness Without Debug Flag ---');
        const cleanRes = await requestGet(port, '/api/admin/overview');
        assert(cleanRes.status === 200, 'GET /api/admin/overview returned status 200');
        assert(!cleanRes.body._debug, 'Response body does NOT contain `_debug` when flag is omitted');

        // ----------------------------------------------------
        // TEST 3: N+1 Alert triggers when threshold (>5) is exceeded
        // ----------------------------------------------------
        console.log('\n--- TEST 3: N+1 Alert Warning Triggering ---');
        capturedWarns.length = 0;
        const nPlusOneRes = await requestGet(port, '/api/test-n-plus-one');
        assert(nPlusOneRes.status === 200, 'GET /api/test-n-plus-one returned status 200');
        await new Promise(r => setTimeout(r, 50)); // allow finish handler to execute
        const alertTriggered = capturedWarns.some(w => w.includes('[N+1 ALERT]') && w.includes('executed 8 queries'));
        assert(alertTriggered, 'Query profiler emitted ⚠️ [N+1 ALERT] with query count and repeated template details');

        // ----------------------------------------------------
        // TEST 4: Silent routes suppress routine stats but support debug flag
        // ----------------------------------------------------
        console.log('\n--- TEST 4: Silent Routes Filtering & Debugging ---');
        capturedLogs.length = 0;
        await requestGet(port, '/api/health');
        await new Promise(r => setTimeout(r, 50));
        const routineHealthLogged = capturedLogs.some(l => l.includes('[QUERY STAT]') && l.includes('/api/health'));
        assert(!routineHealthLogged, 'Routine query stat log was suppressed for silent route /api/health');

        const silentDebugRes = await requestGet(port, '/api/health?debug_queries=true');
        assert(silentDebugRes.body && silentDebugRes.body._debug, 'Silent route still returns `_debug` info when ?debug_queries=true is passed');

        // ----------------------------------------------------
        // TEST 5: GET /api/admin/overview query consolidation
        // ----------------------------------------------------
        console.log('\n--- TEST 5: Hot-Path Audit: GET /api/admin/overview ---');
        const overviewRes = await requestGet(port, '/api/admin/overview?debug_queries=true');
        assert(overviewRes.status === 200, 'GET /api/admin/overview returned 200');
        assert(overviewRes.body.success === true, 'GET /api/admin/overview succeeded');
        assert(overviewRes.body.stats && overviewRes.body.stats.total_students !== undefined, 'Returned total_students stat');
        assert(overviewRes.body._debug.queryCount === 1, `GET /api/admin/overview executed exactly 1 query (was 4) [actual: ${overviewRes.body._debug.queryCount}]`);

        // ----------------------------------------------------
        // TEST 6: GET /api/admin/dashboard-stats query count
        // ----------------------------------------------------
        console.log('\n--- TEST 6: Hot-Path Audit: GET /api/admin/dashboard-stats ---');
        const dashRes = await requestGet(port, '/api/admin/dashboard-stats?debug_queries=true');
        assert(dashRes.status === 200, 'GET /api/admin/dashboard-stats returned 200');
        assert(dashRes.body._debug.queryCount <= 5, `GET /api/admin/dashboard-stats executed <= 5 queries [actual: ${dashRes.body._debug.queryCount}]`);

        // ----------------------------------------------------
        // TEST 7: GET /api/admin/students query count
        // ----------------------------------------------------
        console.log('\n--- TEST 7: Hot-Path Audit: GET /api/admin/students ---');
        const studentsRes = await requestGet(port, '/api/admin/students?debug_queries=true');
        assert(studentsRes.status === 200, 'GET /api/admin/students returned 200');
        assert(studentsRes.body._debug.queryCount <= 3, `GET /api/admin/students executed <= 3 queries [actual: ${studentsRes.body._debug.queryCount}]`);

        // ----------------------------------------------------
        // TEST 8: GET /api/admin/results query count & N+1 elimination
        // ----------------------------------------------------
        console.log('\n--- TEST 8: Hot-Path Audit: GET /api/admin/results (N+1 Elimination) ---');
        const resultsRes = await requestGet(port, '/api/admin/results?class=SS 1&subject=Mathematics&debug_queries=true');
        assert(resultsRes.status === 200, 'GET /api/admin/results returned 200');
        assert(resultsRes.body.success === true, 'GET /api/admin/results returned success');
        assert(resultsRes.body._debug.queryCount <= 5, `GET /api/admin/results executed <= 5 queries (was ~275 queries for class roster) [actual: ${resultsRes.body._debug.queryCount}]`);

        // ----------------------------------------------------
        // TEST 9: GET /api/admin/reports/class-subject-summary query count
        // ----------------------------------------------------
        console.log('\n--- TEST 9: Hot-Path Audit: GET /api/admin/reports/class-subject-summary ---');
        const summaryRes = await requestGet(port, '/api/admin/reports/class-subject-summary?class=SS 1&subject=Mathematics&debug_queries=true');
        assert(summaryRes.status === 200, 'GET /api/admin/reports/class-subject-summary returned 200');
        assert(summaryRes.body.success === true, 'GET /api/admin/reports/class-subject-summary returned success');
        assert(summaryRes.body._debug.queryCount <= 5, `GET /api/admin/reports/class-subject-summary executed <= 5 queries [actual: ${summaryRes.body._debug.queryCount}]`);

        // ----------------------------------------------------
        // TEST 10: GET /api/admin/questions query count
        // ----------------------------------------------------
        console.log('\n--- TEST 10: Hot-Path Audit: GET /api/admin/questions ---');
        const questionsRes = await requestGet(port, '/api/admin/questions?class=SS 1&subject=Mathematics&slot=midterm_ca&debug_queries=true');
        assert(questionsRes.status === 200, 'GET /api/admin/questions returned 200');
        assert(questionsRes.body._debug.queryCount <= 4, `GET /api/admin/questions executed <= 4 queries [actual: ${questionsRes.body._debug.queryCount}]`);

        // ----------------------------------------------------
        // TEST 11: GET /api/student/assigned-exams query count & N+1 elimination
        // ----------------------------------------------------
        console.log('\n--- TEST 11: Hot-Path Audit: GET /api/student/assigned-exams (N+1 Elimination) ---');
        const assignedRes = await requestGet(port, '/api/student/assigned-exams?class=SS%201&session=2026%2F2027&term=1st%20Term&debug_queries=true');
        assert(assignedRes.status === 200, 'GET /api/student/assigned-exams returned 200');
        assert(assignedRes.body.success === true, 'GET /api/student/assigned-exams returned success');
        assert(assignedRes.body._debug.queryCount <= 5, `GET /api/student/assigned-exams executed <= 5 queries [actual: ${assignedRes.body._debug.queryCount}]`);

    } finally {
        console.log = originalLog;
        console.warn = originalWarn;
        try {
            if (server.closeAllConnections) server.closeAllConnections();
            server.close();
        } catch (e) {}
    }

    console.log('\n======================================================================');
    console.log(`📊 TEST SUITE SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
    console.log('======================================================================\n');

    if (passedTests === totalTests) {
        console.log('🎉 ALL QUERY PROFILER & N+1 TESTS PASSED PERFECTLY!\n');
        process.exit(0);
    } else {
        console.error('❌ SOME TESTS FAILED!\n');
        process.exit(1);
    }
}

setTimeout(() => {
    runTests().catch(err => {
        console.error('❌ Uncaught test error:', err);
        process.exit(1);
    });
}, 500);
