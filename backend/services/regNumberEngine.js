/**
 * regNumberEngine.js
 * 
 * Dual-Year Academic Session Registration Number Engine for Desktop CBT Platform.
 * 
 * Format: AWA[YY1][YY2][4_DIGIT_SERIAL] (e.g., AWA26270001 for 2026/2027 session,
 * transitioning to AWA27280001 for 2027/2028 session).
 * 
 * Flow:
 * 1. Resolves active session prefix from system config or academic_terms table (e.g., '2026/2027 • 1st Term' -> '2627').
 * 2. Maintains a school-wide auto-incrementing serial counter that flows continuously across all class tiers.
 */

/**
 * Extracts 4-digit session code (YY1YY2) from session string.
 * Examples:
 *   '2026/2027' -> '2627'
 *   '2026/2027 • 1st Term' -> '2627'
 *   '2027/2028' -> '2728'
 *   '2025/2026' -> '2526'
 */
function deriveSessionPrefix(sessionString) {
    if (!sessionString || typeof sessionString !== 'string') {
        return '2627'; // Default fallback
    }

    // Match patterns like "2026/2027" or "26/27" or "2026-2027"
    const fullMatch = sessionString.match(/20(\d{2})[\/\-]20(\d{2})/);
    if (fullMatch) {
        return `${fullMatch[1]}${fullMatch[2]}`;
    }

    const shortMatch = sessionString.match(/\b(\d{2})[\/\-](\d{2})\b/);
    if (shortMatch) {
        return `${shortMatch[1]}${shortMatch[2]}`;
    }

    return '2627';
}

/**
 * Resolves active academic term session string from database.
 * If none found, defaults to '2026/2027'.
 */
function getActiveSessionString(db) {
    return new Promise((resolve) => {
        db.get(
            `SELECT session FROM academic_terms WHERE is_current = 1 ORDER BY id DESC LIMIT 1`,
            [],
            (err, row) => {
                if (!err && row && row.session) {
                    resolve(row.session);
                } else {
                    resolve('2026/2027');
                }
            }
        );
    });
}

/**
 * Generates an AWA formatted registration number from session year and index.
 * Example: ("2026/2027", 1) -> "AWA26270001"
 */
function generateRegNumber(sessionYear, index) {
    const cleanSession = (sessionYear ? deriveSessionPrefix(sessionYear) : '2627').replace(/[^0-9]/g, '').slice(-4);
    const paddedIndex = String(index).padStart(4, '0');
    return `AWA${cleanSession}${paddedIndex}`;
}

/**
 * Generates the next sequential registration number for the active academic session.
 * Query extracts highest numeric serial among all existing candidates with prefix AWA[YY1][YY2].
 * Returns formatted registration number string e.g. "AWA26270001".
 * 
 * @param {Object} db SQLite database instance
 * @param {String} [overrideSession] Optional session string
 * @returns {Promise<String>}
 */
async function generateNextRegistrationNo(db, overrideSession = null) {
    const sessionStr = overrideSession || await getActiveSessionString(db);
    const sessionCode = deriveSessionPrefix(sessionStr); // e.g., '2627'
    const fullPrefix = `AWA${sessionCode}`;

    return new Promise((resolve, reject) => {
        // Query highest serial integer matching prefix AWA[YY1][YY2]XXXX across reg_number and registration_no
        const sql = `
            SELECT 
                reg_number,
                registration_no
            FROM students 
            WHERE reg_number LIKE ? OR registration_no LIKE ? OR reg_number LIKE ? OR registration_no LIKE ?
        `;
        const param = `${fullPrefix}%`;
        const legacyParam = `AWBA${sessionCode}%`;

        db.all(sql, [param, param, legacyParam, legacyParam], (err, rows) => {
            if (err) {
                return reject(err);
            }

            let maxSerial = 0;

            if (rows && rows.length > 0) {
                rows.forEach(r => {
                    [r.reg_number, r.registration_no].forEach(val => {
                        if (val) {
                            const upperVal = String(val).toUpperCase().trim();
                            if (upperVal.startsWith(fullPrefix)) {
                                const digitsPart = upperVal.substring(fullPrefix.length).trim();
                                const parsed = parseInt(digitsPart, 10);
                                if (!isNaN(parsed) && parsed > maxSerial) {
                                    maxSerial = parsed;
                                }
                            } else if (upperVal.startsWith(`AWBA${sessionCode}`)) {
                                const digitsPart = upperVal.substring(`AWBA${sessionCode}`.length).trim();
                                const parsed = parseInt(digitsPart, 10);
                                if (!isNaN(parsed) && parsed > maxSerial) {
                                    maxSerial = parsed;
                                }
                            }
                        }
                    });
                });
            }

            const nextSerial = maxSerial + 1;
            const serialPadded = String(nextSerial).padStart(4, '0');
            const nextRegNo = `${fullPrefix}${serialPadded}`;

            resolve(nextRegNo);
        });
    });
}

module.exports = {
    deriveSessionPrefix,
    getActiveSessionString,
    generateRegNumber,
    generateNextRegistrationNo
};
