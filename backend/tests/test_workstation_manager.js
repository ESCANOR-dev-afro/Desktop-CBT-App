/**
 * test_workstation_manager.js
 * 
 * Test suite for Hardware Workstation Hall Monitor & Automatic LAN-IP Seat Binding (100% Offline).
 * Verifies:
 * 1. 92-Seat Registry Initialization (NODE-101 through NODE-192)
 * 2. Automatic LAN-IP Seat Mapping (192.168.10.101 -> NODE-101)
 * 3. Real-Time Heartbeat Telemetry & Progress Ingestion
 * 4. Anti-Cheat Security Blur / Window Switch Flagging
 * 5. Invigilator Unlock & Force Submit Commands
 * 6. Workstation Audit Trail & Humanized Actions
 * 7. Stale Heartbeat Auto-Offline Timeout (>15s)
 */

const http = require('http');
const path = require('path');
const express = require(path.resolve(__dirname, '../node_modules/express'));
const db = require('../database');
const workstationManager = require('../services/workstationManager');
const adminRoutes = require('../adminRoutes');
const examRoutes = require('../examRoutes');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);
app.use('/api/exam', examRoutes);

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

function requestHttp(serverPort, method, pathUrl, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = `http://localhost:${serverPort}${pathUrl}`;
        const reqOpts = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(url, reqOpts, (res) => {
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
        });

        req.on('error', reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runWorkstationTests() {
    console.log('======================================================================');
    console.log('🧪 RUNNING TEST SUITE: WORKSTATION LAB MONITOR & LAN-IP BINDING');
    console.log('======================================================================\n');

    // Reset registry to clean state
    workstationManager.initNodes();

    const server = app.listen(0);
    const port = server.address().port;

    try {
        // TEST 1: Initial Grid State
        console.log('🔍 TEST 1: Initial 92-Seat Floor Grid');
        const resGrid1 = await requestHttp(port, 'GET', '/api/admin/workstation-grid');
        assert(resGrid1.status === 200, 'GET /api/admin/workstation-grid returns HTTP 200');
        assert(resGrid1.body.success === true, 'Response indicates success: true');
        assert(resGrid1.body.summary.total_seats === 92, `Total seats initialized equals 92 (got: ${resGrid1.body.summary.total_seats})`);
        assert(resGrid1.body.nodes.length === 92, 'Nodes array contains 92 seat items');
        assert(resGrid1.body.nodes[0].node_id === 'NODE-101', 'First node is NODE-101');
        assert(resGrid1.body.nodes[0].ip === '192.168.10.101', 'NODE-101 IP is 192.168.10.101');
        assert(resGrid1.body.nodes[91].node_id === 'NODE-192', 'Last node is NODE-192');

        // TEST 2: Automatic LAN-IP Seat Binding from 192.168.10.105
        console.log('\n🔍 TEST 2: Automatic LAN-IP Seat Binding from IP 192.168.10.105');
        const hbPayload = {
            student_name: 'Adebisi, Tolu',
            student_reg: 'AWA26273003',
            class_tier: 'SS 1 Science',
            subject: 'Physics',
            assessment_slot: 'midterm_ca',
            current_question: 14,
            total_questions: 30,
            answered_count: 12,
            time_remaining: 1680,
            status: 'IN_PROGRESS'
        };

        const resHb = await requestHttp(port, 'POST', '/api/exam/node-heartbeat', hbPayload, {
            'x-forwarded-for': '192.168.10.105'
        });

        assert(resHb.status === 200, 'Heartbeat returns HTTP 200');
        assert(resHb.body.node_id === 'NODE-105', `Auto-bound to NODE-105 (got: ${resHb.body.node_id})`);
        assert(resHb.body.seat_number === 105, `Seat number is 105 (got: ${resHb.body.seat_number})`);
        assert(resHb.body.status === 'IN_PROGRESS', 'Workstation status set to IN_PROGRESS');

        // TEST 3: Floor Grid Reflection of Active Seat
        console.log('\n🔍 TEST 3: Verification of Active Seat in Workstation Grid');
        const resGrid2 = await requestHttp(port, 'GET', '/api/admin/workstation-grid');
        const node105 = resGrid2.body.nodes.find(n => n.node_id === 'NODE-105');
        assert(node105 !== undefined, 'NODE-105 found in grid');
        assert(node105.status === 'IN_PROGRESS', 'NODE-105 status is IN_PROGRESS');
        assert(node105.student_name === 'Adebisi, Tolu', 'NODE-105 student_name is Adebisi, Tolu');
        assert(node105.subject === 'Physics', 'NODE-105 subject is Physics');
        assert(node105.current_question === 14, 'NODE-105 current_question is 14');
        assert(resGrid2.body.summary.in_progress === 1, 'Summary reflects 1 in_progress seat');

        // TEST 4: Anti-Cheat Tab Blur Flagging on 192.168.10.112
        console.log('\n🔍 TEST 4: Anti-Cheat Tab-Switch / Blur Flagging (192.168.10.112)');
        const blurPayload = {
            student_name: 'Adegoke, Favour',
            student_reg: 'AWA26273004',
            class_tier: 'SS 1 Science',
            subject: 'Biology',
            current_question: 8,
            total_questions: 30,
            is_blurred: true,
            event: 'WINDOW_BLUR_TAB_SWITCH'
        };

        const resBlur = await requestHttp(port, 'POST', '/api/exam/node-heartbeat', blurPayload, {
            'x-forwarded-for': '192.168.10.112'
        });

        assert(resBlur.body.node_id === 'NODE-112', 'Auto-bound to NODE-112');
        assert(resBlur.body.status === 'FLAGGED', 'Workstation status flagged as FLAGGED');

        const resGrid3 = await requestHttp(port, 'GET', '/api/admin/workstation-grid');
        const node112 = resGrid3.body.nodes.find(n => n.node_id === 'NODE-112');
        assert(node112.status === 'FLAGGED', 'NODE-112 grid tile status is FLAGGED');
        assert(node112.is_locked === true, 'NODE-112 is locked');
        assert(resGrid3.body.summary.flagged === 1, 'Summary reflects 1 flagged seat');

        // TEST 5: Seat Audit Trail & Humanized Descriptions
        console.log('\n🔍 TEST 5: Workstation Audit History for NODE-112');
        const resAudit = await requestHttp(port, 'GET', '/api/admin/workstation/NODE-112/audit');
        assert(resAudit.status === 200, 'GET /api/admin/workstation/NODE-112/audit returns HTTP 200');
        assert(resAudit.body.audit_history.length > 0, 'Audit history contains logged events');
        const alertEvent = resAudit.body.audit_history.find(e => e.message && e.message.includes('switched windows'));
        assert(alertEvent !== undefined, 'Human-readable window switch alert present in audit log');

        // TEST 6: Invigilator Unlock Command
        console.log('\n🔍 TEST 6: Invigilator Unlock Command on NODE-112');
        const resUnlock = await requestHttp(port, 'POST', '/api/admin/workstation/NODE-112/unlock', {
            performed_by: 'CHIEF_INVIGILATOR'
        });
        assert(resUnlock.status === 200, 'Unlock endpoint returns HTTP 200');
        assert(resUnlock.body.node.status === 'IN_PROGRESS', 'Node status returned to IN_PROGRESS');
        assert(resUnlock.body.node.is_locked === false, 'Node is_locked is false');

        // TEST 7: Invigilator Force Submit Command
        console.log('\n🔍 TEST 7: Invigilator Force Submit on NODE-105');
        const resForceSubmit = await requestHttp(port, 'POST', '/api/admin/workstation/NODE-105/force-submit', {
            performed_by: 'CHIEF_INVIGILATOR'
        });
        assert(resForceSubmit.status === 200, 'Force submit returns HTTP 200');
        assert(resForceSubmit.body.node.status === 'SUBMITTED', 'Node status changed to SUBMITTED');

        // TEST 8: Stale Heartbeat Auto-Offline Timeout (>15s)
        console.log('\n🔍 TEST 8: Stale Heartbeat Auto-Offline Timeout Simulation');
        const mockStaleNode = workstationManager.nodes.get('NODE-150');
        mockStaleNode.status = 'IN_PROGRESS';
        mockStaleNode.last_heartbeat = Date.now() - 20000; // 20 seconds ago

        const resGridStale = await requestHttp(port, 'GET', '/api/admin/workstation-grid');
        const node150 = resGridStale.body.nodes.find(n => n.node_id === 'NODE-150');
        assert(node150.status === 'OFFLINE', `Stale node automatically marked OFFLINE (got: ${node150.status})`);

    } finally {
        server.close();
    }

    console.log('\n======================================================================');
    console.log(`📊 TEST RUN COMPLETE: ${passedTests} passed, ${totalTests - passedTests} failed`);
    console.log('======================================================================');

    if (passedTests === totalTests) {
        console.log('🎉 ALL WORKSTATION MANAGER & LAN-IP BINDING TESTS PASSED PERFECTLY!\n');
        process.exit(0);
    } else {
        console.error('❌ SOME TESTS FAILED!\n');
        process.exit(1);
    }
}

setTimeout(runWorkstationTests, 500);
