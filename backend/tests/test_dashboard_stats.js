/**
 * test_dashboard_stats.js
 * 
 * Test suite for Real-Time Dynamic Dashboard Analytics & Live Class Allocation.
 * Verifies:
 * 1. Live Candidate Enrollment per Class & Arm (SS 1 Science = 50, JSS 3 Gold = 50)
 * 2. Tier roll-up aggregations (SS 1 = 50, JSS 3 = 50)
 * 3. Node Runtime CBT System Uptime calculation
 * 4. Average CBT score and completed exam count per session & term
 * 5. Total isolated class subjects dynamic count
 * 6. Clean handling of terms with zero submissions (0.0% / "No completed exams yet")
 */

const http = require('http');
const path = require('path');
const express = require(path.resolve(__dirname, '../node_modules/express'));
const db = require('../database');
const adminRoutes = require('../adminRoutes');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

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
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, body: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        }).on('error', reject);
    });
}

async function runDashboardStatsTests() {
    console.log('======================================================================');
    console.log('🧪 RUNNING TEST SUITE: REAL-TIME DYNAMIC DASHBOARD STATS (100% OFFLINE)');
    console.log('======================================================================\n');

    const server = app.listen(0);
    const port = server.address().port;

    try {
        // TEST 1: GET /api/admin/dashboard-stats for Active Session & 1st Term
        console.log('🔍 TEST 1: GET /api/admin/dashboard-stats (Active Session & 1st Term)');
        const res1 = await requestGet(port, '/api/admin/dashboard-stats?session=2026/2027&term=1st Term');
        assert(res1.status === 200, 'HTTP Status 200 OK returned');
        assert(res1.body.success === true, 'Response body indicates success: true');
        assert(res1.body.stats !== undefined, 'Stats object is present in response');

        const stats1 = res1.body.stats;
        assert(stats1.total_candidates === 100, `Total enrolled candidates equals 100 (got: ${stats1.total_candidates})`);
        assert(stats1.total_subjects === 444, `Total isolated class subjects equals 444 (got: ${stats1.total_subjects})`);
        assert(typeof stats1.uptime_seconds === 'number' && stats1.uptime_seconds >= 0, `Uptime seconds is a positive number (${stats1.uptime_seconds}s)`);
        assert(typeof stats1.uptime_formatted === 'string' && stats1.uptime_formatted.includes('Operational'), `Uptime is formatted with Operational label: "${stats1.uptime_formatted}"`);
        assert(stats1.total_classes >= 24, `Configured classes summary is dynamic: ${stats1.total_classes} classes`);

        // TEST 2: Granular Class & Arm Candidate Allocation
        console.log('\n🔍 TEST 2: Granular Class & Arm Candidate Allocation');
        assert(stats1.class_stats['SS 1 Science'] !== undefined, 'SS 1 Science arm exists in class_stats');
        assert(stats1.class_stats['SS 1 Science'].candidate_count === 50, `SS 1 Science has exactly 50 candidates (got: ${stats1.class_stats['SS 1 Science'].candidate_count})`);
        assert(stats1.class_stats['JSS 3 Gold'].candidate_count === 50, `JSS 3 Gold has exactly 50 candidates (got: ${stats1.class_stats['JSS 3 Gold'].candidate_count})`);
        assert(stats1.class_stats['SS 1'].candidate_count === 50, `SS 1 tier rolled-up count has 50 candidates (got: ${stats1.class_stats['SS 1'].candidate_count})`);
        assert(stats1.class_stats['JSS 3'].candidate_count === 50, `JSS 3 tier rolled-up count has 50 candidates (got: ${stats1.class_stats['JSS 3'].candidate_count})`);

        // TEST 3: Average CBT Score & Completed Tests for 1st Term
        console.log('\n🔍 TEST 3: Average CBT Score & Completed Tests for 1st Term');
        assert(stats1.total_completed_exams === 11, `Total completed exams for 1st Term equals 11 (got: ${stats1.total_completed_exams})`);
        assert(stats1.avg_score_formatted === '0.4%', `Average CBT score formatted equals 0.4% (got: ${stats1.avg_score_formatted})`);
        assert(stats1.score_subtext.includes('11 Completed Exams'), `Score subtext indicates 11 completed exams: "${stats1.score_subtext}"`);

        // TEST 4: Term with Zero Submissions (2nd Term Empty Case)
        console.log('\n🔍 TEST 4: Term with Zero Submissions (2nd Term Empty Case)');
        const res2 = await requestGet(port, '/api/admin/dashboard-stats?session=2026/2027&term=2nd Term');
        assert(res2.status === 200, 'HTTP Status 200 OK for 2nd Term');
        const stats2 = res2.body.stats;
        assert(stats2.total_completed_exams === 0, 'Total completed exams for 2nd Term is 0');
        assert(stats2.avg_score_formatted === '0.0%', `Average CBT score for 2nd Term is 0.0% (got: ${stats2.avg_score_formatted})`);
        assert(stats2.score_subtext === 'No completed exams yet', `Score subtext is "No completed exams yet" (got: "${stats2.score_subtext}")`);
        assert(stats2.score_badge === 'Pending Submissions', `Score badge is "Pending Submissions" (got: "${stats2.score_badge}")`);

        // TEST 5: REST Endpoint Alias /api/admin/dashboard/stats
        console.log('\n🔍 TEST 5: REST Endpoint Alias /api/admin/dashboard/stats');
        const resAlias = await requestGet(port, '/api/admin/dashboard/stats?session=2026/2027&term=1st Term');
        assert(resAlias.status === 200, 'Alias /api/admin/dashboard/stats returns HTTP 200');
        assert(resAlias.body.stats.total_candidates === 100, 'Alias returns identical dynamic stats');

    } finally {
        server.close();
    }

    console.log('\n======================================================================');
    console.log(`📊 TEST RUN COMPLETE: ${passedTests} passed, ${totalTests - passedTests} failed`);
    console.log('======================================================================');

    if (passedTests === totalTests) {
        console.log('🎉 ALL DASHBOARD STATS & LIVE ALLOCATION TESTS PASSED PERFECTLY!\n');
        process.exit(0);
    } else {
        console.error('❌ SOME TESTS FAILED!\n');
        process.exit(1);
    }
}

setTimeout(runDashboardStatsTests, 500);
