/**
 * auditLogger.js
 * 
 * Centralized audit logging utility for administrative and system actions.
 * Inserts immutable logs into the SQLite `audit_logs` table.
 */

const db = require('../database');

/**
 * Inserts an administrative audit log entry into SQLite.
 * 
 * @param {Object} params
 * @param {string} params.action - Event action code (e.g., 'UPLOAD_QUESTIONS', 'SWITCH_ACADEMIC_TERM')
 * @param {string} params.entity_type - Affected entity type (e.g., 'academic_terms', 'questions', 'students')
 * @param {string|number} [params.entity_id] - Affected entity primary key or target identifier
 * @param {Object|string} [params.details] - Additional contextual metadata (will be stringified if object)
 * @param {string} [params.ip_address] - Requesting IP address
 * @param {string} [params.performed_by] - Username or role executing action (default 'ADMIN')
 * @returns {Promise<number>} - Inserted log ID
 */
function logAuditAction({
    action,
    entity_type,
    entity_id = null,
    details = null,
    ip_address = '127.0.0.1',
    performed_by = 'ADMIN'
}) {
    return new Promise((resolve) => {
        if (!action || !entity_type) {
            console.warn('⚠️ [Audit Log Warning] Action and entity_type are required for audit logging.');
            return resolve(null);
        }

        const detailsString = typeof details === 'object' && details !== null
            ? JSON.stringify(details)
            : (details ? String(details) : null);

        const sql = `
            INSERT INTO audit_logs (action, entity_type, entity_id, details, ip_address, performed_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;

        db.run(sql, [action, entity_type, String(entity_id || ''), detailsString, ip_address, performed_by], function (err) {
            if (err) {
                // Notice log only, never throw to prevent breaking main Express operations
                console.error('❌ [Audit Log Error] Failed to write audit log entry:', err.message);
                resolve(null);
            } else {
                console.log(`🛡️ [Audit Logged] [${action}] ${entity_type} ID: ${entity_id || 'N/A'}`);
                resolve(this.lastID);
            }
        });
    });
}

module.exports = {
    logAuditAction
};
