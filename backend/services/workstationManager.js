/**
 * workstationManager.js
 * 
 * Hardware Workstation Hall Monitor & Automatic LAN-IP Seat Binding Manager (100% Offline).
 * Manages in-memory live state for 92 physical client workstations (NODE-101 through NODE-192).
 * Automatically maps incoming client LAN-IPs (192.168.10.101 - 192.168.10.192) to seat nodes.
 * CBT Local Server IP: 192.168.10.91
 */

const db = require('../database');
const { logAuditAction } = require('./auditLogger');

// 92-Seat Workstation In-Memory Registry (NODE-101 to NODE-192)
const nodes = new Map();

function initNodes() {
    nodes.clear();
    for (let i = 101; i <= 192; i++) {
        const nodeId = `NODE-${i}`;
        nodes.set(nodeId, {
            node_id: nodeId,
            ip: `192.168.10.${i}`,
            seat_number: i,
            status: 'OFFLINE', // 'OFFLINE' | 'CONNECTED' | 'IN_PROGRESS' | 'FLAGGED' | 'SUBMITTED'
            student_name: null,
            student_reg: null,
            class_tier: null,
            subject: null,
            assessment_slot: null,
            current_question: 0,
            total_questions: 0,
            answered_count: 0,
            time_remaining: null,
            last_heartbeat: 0,
            is_locked: false,
            recent_events: []
        });
    }
    console.log('🖥️ [Workstation Registry] Initialized 92 physical hardware workstation nodes on 192.168.10.x subnet (NODE-101 to NODE-192).');
}

// Initialize on module load
initNodes();

/**
 * Extracts and cleans client IP address from Express request or raw string.
 */
function extractClientIp(req) {
    if (typeof req === 'string') {
        return req.replace(/^::ffff:/, '').trim();
    }
    if (!req) return '127.0.0.1';

    // 1. Authoritative physical socket remote address / Express req.ip (for LAN workstations)
    const socketIp = (req.socket?.remoteAddress || req.connection?.remoteAddress || req.ip || '').replace(/^::ffff:/, '').trim();
    if (socketIp && socketIp !== '127.0.0.1' && socketIp !== '::1' && socketIp !== 'localhost') {
        return socketIp;
    }

    // 2. Standard forwarded IP header (for reverse proxy or trusted LAN routers)
    const forwarded = req.headers?.['x-forwarded-for'];
    if (forwarded) {
        const parts = String(forwarded).split(',');
        const first = parts[0].replace(/^::ffff:/, '').trim();
        if (first) return first;
    }

    // 3. Custom headers / simulation parameters (restricted to dev/test/benchmark environments)
    if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_CUSTOM_IP === 'true') {
        const customIp = req.headers?.['x-workstation-ip'] || req.query?.ip || req.body?.workstation_ip || req.body?.ip;
        if (customIp) {
            return String(customIp).replace(/^::ffff:/, '').trim();
        }
    }

    // 4. Fallback to socket IP or loopback
    return socketIp || '127.0.0.1';
}

/**
 * Resolves a workstation node from client IP or explicit node ID.
 */
function resolveNode(reqOrIp, customNodeId) {
    if (customNodeId && nodes.has(customNodeId)) {
        return nodes.get(customNodeId);
    }

    const ip = extractClientIp(reqOrIp);

    // Direct IP match in registry
    for (const node of nodes.values()) {
        if (node.ip === ip) return node;
    }

    // Match last octet: e.g. 192.168.10.105 -> 105 -> NODE-105
    const octetMatch = ip.match(/(\d+)$/);
    if (octetMatch) {
        const octetNum = parseInt(octetMatch[1], 10);
        const candidateId = `NODE-${octetNum}`;
        if (nodes.has(candidateId)) {
            return nodes.get(candidateId);
        }
    }

    // If local loopback during testing, fallback to NODE-101 or first node
    if (ip === '127.0.0.1' || ip === 'localhost' || ip === '::1') {
        const reqSeat = reqOrIp?.query?.seat || reqOrIp?.body?.seat;
        if (reqSeat && nodes.has(`NODE-${reqSeat}`)) {
            return nodes.get(`NODE-${reqSeat}`);
        }
        return nodes.get('NODE-101');
    }

    return null;
}

/**
 * Pushes a timestamped event into node recent_events log (caps at 20 entries).
 */
function pushNodeEvent(node, type, message) {
    if (!node) return;
    if (!Array.isArray(node.recent_events)) {
        node.recent_events = [];
    }
    const eventObj = {
        id: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString(),
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        type,
        message
    };
    node.recent_events.unshift(eventObj);
    if (node.recent_events.length > 25) {
        node.recent_events = node.recent_events.slice(0, 25);
    }
}

/**
 * Records student login from workstation terminal.
 */
function recordLogin(reqOrIp, payload = {}) {
    const node = resolveNode(reqOrIp, payload.node_id);
    if (!node) return null;

    node.status = 'CONNECTED';
    node.student_name = payload.student_name || payload.studentName || node.student_name;
    node.student_reg = payload.student_reg || payload.studentReg || payload.regNumber || node.student_reg;
    node.class_tier = payload.class_tier || payload.classId || payload.studentClass || node.class_tier;
    node.subject = payload.subject || payload.subjectName || node.subject;
    node.last_heartbeat = Date.now();
    node.is_locked = false;

    pushNodeEvent(node, 'STUDENT_LOGIN', `Candidate ${node.student_name || node.student_reg || 'Student'} logged in on Seat #${node.seat_number}`);
    return node;
}

/**
 * Records 5-second student terminal heartbeat telemetry.
 */
function recordHeartbeat(reqOrIp, payload = {}) {
    const node = resolveNode(reqOrIp, payload.node_id || payload.nodeId);
    if (!node) return null;

    node.last_heartbeat = Date.now();
    if (payload.student_name || payload.studentName) {
        node.student_name = payload.student_name || payload.studentName;
    }
    if (payload.student_reg || payload.studentReg || payload.regNumber || payload.registration_no) {
        node.student_reg = payload.student_reg || payload.studentReg || payload.regNumber || payload.registration_no;
    }
    if (payload.class_tier || payload.classId || payload.class || payload.studentClass) {
        node.class_tier = payload.class_tier || payload.classId || payload.class || payload.studentClass;
    }
    if (payload.subject || payload.subjectName || payload.subject_name) {
        node.subject = payload.subject || payload.subjectName || payload.subject_name;
    }
    if (payload.assessment_slot || payload.assessmentSlot || payload.slot) {
        node.assessment_slot = payload.assessment_slot || payload.assessmentSlot || payload.slot;
    }

    if (payload.current_question !== undefined || payload.currentQuestionIndex !== undefined) {
        node.current_question = payload.current_question !== undefined ? payload.current_question : payload.currentQuestionIndex;
    }
    if (payload.total_questions !== undefined || payload.totalQuestions !== undefined) {
        node.total_questions = payload.total_questions !== undefined ? payload.total_questions : payload.totalQuestions;
    }
    if (payload.answered_count !== undefined || payload.answeredCount !== undefined) {
        node.answered_count = payload.answered_count !== undefined ? payload.answered_count : payload.answeredCount;
    }
    if (payload.time_remaining !== undefined || payload.remainingSeconds !== undefined) {
        node.time_remaining = payload.time_remaining !== undefined ? payload.time_remaining : payload.remainingSeconds;
    }

    // Security Tab-Switch / Blur Detection
    if (payload.is_blurred === true || payload.status === 'FLAGGED' || payload.event === 'WINDOW_BLUR_TAB_SWITCH') {
        node.status = 'FLAGGED';
        node.is_locked = true;
        const msg = 'Suspicious Activity: Candidate switched windows or minimized browser';
        pushNodeEvent(node, 'SECURITY_ALERT', msg);
        logAuditAction({
            action: 'SECURITY_TAB_BLUR_FLAG',
            entity_type: 'workstations',
            entity_id: node.node_id,
            details: {
                seat: node.seat_number,
                ip: node.ip,
                student_reg: node.student_reg,
                student_name: node.student_name,
                subject: node.subject,
                alert: msg
            },
            ip_address: node.ip,
            performed_by: 'ANTI_CHEAT_ENGINE'
        });
    } else if (payload.status === 'SUBMITTED') {
        node.status = 'SUBMITTED';
        pushNodeEvent(node, 'EXAM_SUBMITTED', `Exam submitted for ${node.subject || 'Subject'}`);
    } else if (payload.status === 'IN_PROGRESS' || payload.status === 'LIVE') {
        if (node.status !== 'FLAGGED') {
            node.status = 'IN_PROGRESS';
        }
    } else if (payload.status === 'CONNECTED' && node.status === 'OFFLINE') {
        node.status = 'CONNECTED';
    }

    return node;
}

/**
 * Records student exam submission.
 */
function recordSubmit(reqOrIp, payload = {}) {
    const node = resolveNode(reqOrIp, payload.node_id);
    if (!node) return null;

    node.status = 'SUBMITTED';
    node.last_heartbeat = Date.now();
    pushNodeEvent(node, 'EXAM_SUBMITTED', `Candidate ${node.student_reg || ''} completed and submitted exam`);
    return node;
}

/**
 * Returns full 92-node floor grid with auto-stale OFFLINE resolution and summary counts.
 */
function getWorkstationGrid() {
    const now = Date.now();
    let countOnline = 0;
    let countInProgress = 0;
    let countConnected = 0;
    let countFlagged = 0;
    let countSubmitted = 0;
    let countOffline = 0;

    const allNodes = [];

    for (const node of nodes.values()) {
        // Auto-mark stale nodes as OFFLINE if no heartbeat in >15s
        if (node.status !== 'OFFLINE' && node.status !== 'SUBMITTED' && (now - node.last_heartbeat > 15000)) {
            if (node.status !== 'OFFLINE') {
                pushNodeEvent(node, 'DISCONNECTED', `Workstation signal lost (>15s timeout on IP ${node.ip})`);
            }
            node.status = 'OFFLINE';
        }

        if (node.status === 'IN_PROGRESS') countInProgress++;
        else if (node.status === 'CONNECTED') countConnected++;
        else if (node.status === 'FLAGGED') countFlagged++;
        else if (node.status === 'SUBMITTED') countSubmitted++;
        else countOffline++;

        if (node.status !== 'OFFLINE') countOnline++;

        allNodes.push({
            ...node,
            seconds_since_heartbeat: node.last_heartbeat > 0 ? Math.floor((now - node.last_heartbeat) / 1000) : null
        });
    }

    return {
        summary: {
            total_seats: nodes.size,
            online: countOnline,
            in_progress: countInProgress,
            connected: countConnected,
            flagged: countFlagged,
            submitted: countSubmitted,
            offline: countOffline
        },
        nodes: allNodes
    };
}

/**
 * Translates technical audit log action codes to human-readable invigilator messages.
 */
function humanizeAuditAction(action, detailsStr) {
    let detailsObj = null;
    try {
        if (typeof detailsStr === 'string' && detailsStr.startsWith('{')) {
            detailsObj = JSON.parse(detailsStr);
        }
    } catch (_) {}

    switch (action) {
        case 'SECURITY_TAB_BLUR_FLAG':
            return detailsObj?.alert || 'Suspicious Activity: Candidate switched windows or minimized browser';
        case 'UNLOCK_WORKSTATION':
            return 'Workstation unlocked by invigilator';
        case 'FORCE_SUBMIT_EXAM':
            return 'Exam forcefully submitted by invigilator';
        case 'STUDENT_LOGIN':
            return 'Candidate logged in from workstation terminal';
        case 'EXAM_SUBMIT':
            return 'Exam paper successfully submitted for grading';
        case 'PURGE_TEST_RESULTS':
            return 'Workstation exam session purged';
        case 'UPLOAD_QUESTIONS':
            return 'Question paper uploaded and parsed';
        default:
            return action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
    }
}

/**
 * Returns chronological audit trail for a specific workstation seat.
 */
async function getNodeAudit(nodeId) {
    const node = nodes.get(nodeId);
    if (!node) return { success: false, message: `Node ${nodeId} not found.` };

    // In-memory events
    const inMemoryEvents = (node.recent_events || []).map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        time: e.time,
        type: e.type,
        message: e.message,
        source: 'IN_MEMORY_TELEMETRY'
    }));

    // Query SQLite audit_logs
    let dbLogs = [];
    try {
        const rows = await new Promise((resolve, reject) => {
            db.all(
                `SELECT id, action, entity_type, entity_id, details, ip_address, performed_by, created_at 
                 FROM audit_logs 
                 WHERE ip_address = ? OR entity_id = ? OR entity_id = ?
                 ORDER BY id DESC LIMIT 20`,
                [node.ip, node.node_id, node.student_reg || ''],
                (err, r) => {
                    if (err) reject(err);
                    else resolve(r || []);
                }
            );
        });

        dbLogs = rows.map(r => ({
            id: `db-${r.id}`,
            timestamp: r.created_at,
            time: new Date(r.created_at).toLocaleTimeString('en-US', { hour12: false }),
            type: r.action,
            message: humanizeAuditAction(r.action, r.details),
            source: 'PERSISTENT_AUDIT_LOG',
            performed_by: r.performed_by
        }));
    } catch (err) {
        console.warn('Notice: SQLite audit log fetch fallback active for node audit', err.message);
    }

    // Merge and sort chronologically (newest first)
    const combined = [...inMemoryEvents, ...dbLogs].sort((a, b) => {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return {
        success: true,
        node: {
            ...node,
            seconds_since_heartbeat: node.last_heartbeat > 0 ? Math.floor((Date.now() - node.last_heartbeat) / 1000) : null
        },
        audit_history: combined
    };
}

/**
 * Unlocks a flagged/locked workstation node.
 */
async function unlockNode(nodeId, performedBy = 'ADMIN') {
    const node = nodes.get(nodeId);
    if (!node) return { success: false, message: `Node ${nodeId} not found.` };

    node.status = 'IN_PROGRESS';
    node.is_locked = false;
    node.last_heartbeat = Date.now();

    const msg = `Workstation ${node.node_id} unlocked by invigilator (${performedBy})`;
    pushNodeEvent(node, 'INVIGILATOR_ACTION', msg);

    await logAuditAction({
        action: 'UNLOCK_WORKSTATION',
        entity_type: 'workstations',
        entity_id: node.node_id,
        details: { seat: node.seat_number, ip: node.ip, student_reg: node.student_reg, message: msg },
        ip_address: node.ip,
        performed_by: performedBy
    });

    // Update SQLite exam_sessions lock state
    if (node.student_reg) {
        db.run(
            `UPDATE exam_sessions SET is_locked = 0 WHERE workstation_ip = ? AND status = 'active'`,
            [node.ip],
            () => {}
        );
    }

    return { success: true, message: `Seat #${node.seat_number} successfully unlocked.`, node };
}

/**
 * Force-submits candidate exam on a workstation node.
 */
async function forceSubmitNode(nodeId, performedBy = 'ADMIN') {
    const node = nodes.get(nodeId);
    if (!node) return { success: false, message: `Node ${nodeId} not found.` };

    node.status = 'SUBMITTED';
    node.is_locked = true;
    node.last_heartbeat = Date.now();

    const msg = `Exam on Workstation ${node.node_id} was forcefully submitted by invigilator (${performedBy})`;
    pushNodeEvent(node, 'FORCE_SUBMIT_EXAM', msg);

    await logAuditAction({
        action: 'FORCE_SUBMIT_EXAM',
        entity_type: 'workstations',
        entity_id: node.node_id,
        details: { seat: node.seat_number, ip: node.ip, student_reg: node.student_reg, message: msg },
        ip_address: node.ip,
        performed_by: performedBy
    });

    // Update SQLite exam_sessions status
    if (node.ip) {
        db.run(
            `UPDATE exam_sessions SET status = 'submitted', is_locked = 1, last_heartbeat = CURRENT_TIMESTAMP WHERE workstation_ip = ? AND status = 'active'`,
            [node.ip],
            () => {}
        );
        db.run(
            `UPDATE student_exam_sessions SET status = 'SUBMITTED' WHERE workstation_ip = ? AND status = 'IN_PROGRESS'`,
            [node.ip],
            () => {}
        );
    }

    return { success: true, message: `Exam on Seat #${node.seat_number} forcefully submitted.`, node };
}

module.exports = {
    nodes,
    initNodes,
    extractClientIp,
    resolveNode,
    recordLogin,
    recordHeartbeat,
    recordSubmit,
    getWorkstationGrid,
    getNodeAudit,
    unlockNode,
    forceSubmitNode
};
