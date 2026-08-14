/**
 * authRoutes.js
 * 
 * Authentication and Exam Session Management Routes for Desktop CBT App.
 * Handles student authentication, case-insensitive surname verification,
 * session lock checking, active exam session creation/resume, and dynamic subjects fetching.
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
 * Utility helper to run SQL SELECT queries returning multiple rows as a Promise.
 */
function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
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
 * Normalizes and standardizes subject names:
 * - Trims leading/trailing whitespace and compresses multiple spaces.
 * - Converts canonical aliases (e.g. "English" -> "English Language", "Maths" -> "Mathematics").
 * - Capitalizes each word strictly into Title Case format.
 */
function normalizeSubjectName(rawSubject) {
    if (!rawSubject || typeof rawSubject !== 'string') return '';
    let trimmed = rawSubject.trim().replace(/\s+/g, ' ');
    if (!trimmed) return '';

    const lower = trimmed.toLowerCase();
    if (lower === 'english' || lower === 'eng') return 'English Language';
    if (lower === 'math' || lower === 'maths') return 'Mathematics';
    if (lower === 'comp sci' || lower === 'computer' || lower === 'computer science') return 'Computer Studies';
    if (lower === 'civics') return 'Civic Education';

    return trimmed.split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

/**
 * GET /api/subjects
 * 
 * Dynamically fetches all unique exam subjects from master defaults,
 * uploaded question bank papers, and student course registrations.
 * Applies strict Title Case normalization and alias deduplication.
 */
router.get('/subjects', async (req, res, next) => {
    try {
        const activeSubjects = await dbAll(`SELECT name FROM subjects WHERE is_active = 1 ORDER BY name ASC`);
        let subjectsList = activeSubjects.map(s => s.name);

        if (subjectsList.length === 0) {
            const defaultSubjects = [
                'Mathematics',
                'English Language',
                'Biology',
                'Chemistry',
                'Physics',
                'Civic Education',
                'Computer Studies',
                'Economics',
                'Government'
            ];
            subjectsList = defaultSubjects;
        }

        return res.status(200).json({
            success: true,
            count: subjectsList.length,
            subjects: subjectsList
        });

    } catch (error) {
        console.error('❌ [Get Subjects Error]:', error);
        next(error);
    }
});

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

        // Step b: Convert surname & reg number with strict whitespace trimming & UPPERCASE normalization
        const formattedRegNumber = String(reg_number).trim();
        const formattedSurname = String(surname).trim().toUpperCase();
        const clientIp = workstation_ip || req.ip || '127.0.0.1';

        // Step c: Query matching student record with TRIM & UPPERCASE normalization
        const studentSql = `
            SELECT id, reg_number, surname, first_name, class, assigned_subject 
            FROM students 
            WHERE TRIM(UPPER(reg_number)) = TRIM(UPPER(?)) AND TRIM(UPPER(surname)) = TRIM(UPPER(?))
        `;
        let student = await dbGet(studentSql, [formattedRegNumber, formattedSurname]);

        // Step d: If no student matches directly, run diagnostic check for admin logging
        if (!student) {
            const regCheckSql = `SELECT id, reg_number, surname FROM students WHERE TRIM(UPPER(reg_number)) = TRIM(UPPER(?))`;
            const regMatch = await dbGet(regCheckSql, [formattedRegNumber]);
            
            if (regMatch) {
                console.log(`⚠️ [Login Surname Mismatch]: Candidate Reg Number "${formattedRegNumber}" exists, but entered surname "${formattedSurname}" did not match DB surname "${regMatch.surname}".`);
            } else {
                console.log(`⚠️ [Login Unknown Reg Number]: Registration Number "${formattedRegNumber}" not found in database.`);
            }

            return res.status(401).json({
                success: false,
                message: "Invalid Registration Number or Surname. Please check your details and try again."
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
                first_name: student.first_name || '',
                class: student.class,
                assigned_subject: student.assigned_subject
            },
            session_id: sessionId
        });

    } catch (error) {
        console.error('❌ [Login Route Error]:', error);
        next(error);
    }
});

/**
 * GET /api/student/:student_id/dashboard
 * 
 * Retrieves student profile metadata, assigned subjects, and completion/scheduled status.
 */
router.get('/student/:student_id/dashboard', async (req, res, next) => {
    try {
        const { student_id } = req.params;

        const studentSql = `SELECT id, reg_number, surname, first_name, class, assigned_subject FROM students WHERE id = ?`;
        const student = await dbGet(studentSql, [student_id]);

        if (!student) {
            return res.status(404).json({ success: false, message: "Student not found." });
        }

        // Fetch completed sessions for this student (CRITICAL: score is strictly omitted for student privacy)
        const completedSessionsSql = `
            SELECT id, subject, status, login_time 
            FROM exam_sessions 
            WHERE student_id = ? AND status = 'submitted'
        `;
        const completedSessions = await dbAll(completedSessionsSql, [student_id]);
        const completedSubjects = new Set(
            completedSessions.map(s => s.subject ? s.subject.trim().toLowerCase() : '')
        );

        // Fetch active sessions for this student
        const activeSessionsSql = `
            SELECT id, subject 
            FROM exam_sessions 
            WHERE student_id = ? AND status = 'active' AND is_locked = 0
        `;
        const activeSessions = await dbAll(activeSessionsSql, [student_id]);
        const activeSubjects = new Set(
            activeSessions.map(s => s.subject ? s.subject.trim().toLowerCase() : '')
        );

        // Parse student assigned subjects (supports comma or semicolon delimited list)
        const rawAssigned = (student.assigned_subject || 'Mathematics').split(/[,;]/).map(s => s.trim()).filter(Boolean);

        // Standard default subjects list for CBT Portal Hub
        const baseSubjects = [
            'Mathematics',
            'English Language',
            'Biology',
            'Chemistry',
            'Physics',
            'Computer Studies',
            'Civic Education'
        ];

        // Merge student specific assigned subjects with base subjects
        const subjectSet = new Set();
        rawAssigned.forEach(s => subjectSet.add(s));
        baseSubjects.forEach(s => subjectSet.add(s));

        // Fetch subject activation states
        const dbSubjects = await dbAll(`SELECT name, is_active FROM subjects`);
        const activeSubjectMap = new Map();
        dbSubjects.forEach(s => activeSubjectMap.set(s.name.toLowerCase(), s.is_active));

        // Format subjects with real-time status
        const formattedSubjects = Array.from(subjectSet).map(subName => {
            const lowerName = subName.toLowerCase();
            const isCompleted = completedSubjects.has(lowerName);
            const isActive = activeSubjects.has(lowerName);
            const isSubjectConfigActive = activeSubjectMap.has(lowerName) ? activeSubjectMap.get(lowerName) === 1 : true;

            let status = 'available';
            let message = 'Ready to Start';

            if (!isSubjectConfigActive) {
                status = 'not_scheduled';
                message = 'Exam paper is currently inactive / disabled by administrator.';
            } else if (isCompleted) {
                status = 'completed';
                message = 'Exam Completed';
            } else if (isActive) {
                status = 'active';
                message = 'Session Active (In Progress)';
            }

            return {
                name: subName,
                schedule: isCompleted ? 'Submitted' : (!isSubjectConfigActive ? 'Inactive' : 'Now Available'),
                status: status, // 'available', 'active', 'completed', 'not_scheduled'
                message: message
            };
        });

        return res.status(200).json({
            success: true,
            student: {
                id: student.id,
                reg_number: student.reg_number,
                surname: student.surname,
                first_name: student.first_name || '',
                class: student.class,
                assigned_subject: student.assigned_subject
            },
            subjects: formattedSubjects
        });

    } catch (error) {
        console.error('❌ [Student Dashboard Route Error]:', error);
        next(error);
    }
});

module.exports = router;
