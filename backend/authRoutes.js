/**
 * authRoutes.js
 * 
 * Authentication and Exam Session Management Routes for Desktop CBT App.
 * Handles student authentication, case-insensitive surname verification,
 * session lock checking, and active exam session creation/resume.
 */

const express = require('express');
const router = express.Router();
const db = require('./database');

/**
 * Utility helper to run SQL queries returning a single row as a Promise.
 */
function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

/**
 * Utility helper to run SQL queries modifying data (INSERT, UPDATE) as a Promise.
 */
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this); // contains lastID and changes
        });
    });
}

/**
 * POST /api/login
 * 
 * Authenticates a student using reg_number & surname (UPPERCASE), checks session status,
 * and initializes or resumes an active exam session.
 */
router.post('/login', async (req, res, next) => {
    try {
        const { reg_number, surname, workstation_ip } = req.body;

        // Step a: Validate required fields
        if (!reg_number || !surname) {
            return res.status(400).json({
                success: false,
                message: "Registration number and surname are required."
            });
        }

        // Step b: Convert surname to UPPERCASE strictly & trim inputs
        const formattedRegNumber = String(reg_number).trim();
        const formattedSurname = String(surname).trim().toUpperCase();
        const clientIp = workstation_ip || req.ip || '127.0.0.1';

        // Step c: Query matching student record
        const studentSql = `
            SELECT id, reg_number, surname, class, assigned_subject 
            FROM students 
            WHERE reg_number = ? AND surname = ?
        `;
        const student = await dbGet(studentSql, [formattedRegNumber, formattedSurname]);

        // Step d: If no student matches
        if (!student) {
            return res.status(401).json({
                success: false,
                message: "Invalid Registration Number or Surname."
            });
        }

        // Step e: Check for existing exam sessions for this student
        const sessionCheckSql = `
            SELECT id, status, is_locked 
            FROM exam_sessions 
            WHERE student_id = ? 
            ORDER BY id DESC 
            LIMIT 1
        `;
        const existingSession = await dbGet(sessionCheckSql, [student.id]);

        if (existingSession) {
            // Block login if exam already submitted or locked by administrator
            if (existingSession.status === 'submitted' || existingSession.is_locked === 1) {
                return res.status(403).json({
                    success: false,
                    message: "Exam already taken or session locked."
                });
            }
        }

        let sessionId;

        // Step f: Create new active session or update workstation IP on active session
        if (existingSession && existingSession.status === 'active' && existingSession.is_locked === 0) {
            // Resume existing active session
            sessionId = existingSession.id;
            const updateSessionSql = `
                UPDATE exam_sessions 
                SET workstation_ip = ?, login_time = CURRENT_TIMESTAMP 
                WHERE id = ?
            `;
            await dbRun(updateSessionSql, [clientIp, sessionId]);
            console.log(`🔑 [Session Resumed] Student ID ${student.id} resumed Session #${sessionId} from IP ${clientIp}`);
        } else {
            // Insert new session
            const insertSessionSql = `
                INSERT INTO exam_sessions (student_id, workstation_ip, login_time, status, is_locked)
                VALUES (?, ?, CURRENT_TIMESTAMP, 'active', 0)
            `;
            const result = await dbRun(insertSessionSql, [student.id, clientIp]);
            sessionId = result.lastID;
            console.log(`🔑 [New Session Created] Student ID ${student.id} started Session #${sessionId} from IP ${clientIp}`);
        }

        // Step g: Return success response with student metadata & session_id
        return res.status(200).json({
            success: true,
            message: "Login successful",
            student: {
                id: student.id,
                reg_number: student.reg_number,
                surname: student.surname,
                class: student.class,
                assigned_subject: student.assigned_subject
            },
            session_id: sessionId
        });

    } catch (error) {
        console.error('❌ [Login Route Error]:', error);
        next(error); // Pass to global error handling middleware in server.js
    }
});

module.exports = router;
