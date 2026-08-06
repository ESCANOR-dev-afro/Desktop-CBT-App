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

        // 1. Fetch unique subjects in question bank
        const questionSubjects = await dbAll(`SELECT DISTINCT subject FROM questions WHERE subject IS NOT NULL AND TRIM(subject) != ''`);

        // 2. Fetch unique subjects assigned to students
        const studentSubjects = await dbAll(`SELECT DISTINCT assigned_subject AS subject FROM students WHERE assigned_subject IS NOT NULL AND TRIM(assigned_subject) != ''`);

        // Keyed Map for deduplication based on lowercased key
        const subjectMap = new Map();

        // Include master defaults
        defaultSubjects.forEach(s => {
            const norm = normalizeSubjectName(s);
            if (norm) subjectMap.set(norm.toLowerCase(), norm);
        });

        // Merge question bank subjects
        questionSubjects.forEach(row => {
            const norm = normalizeSubjectName(row.subject);
            if (norm) subjectMap.set(norm.toLowerCase(), norm);
        });

        // Merge student registration subjects
        studentSubjects.forEach(row => {
            const norm = normalizeSubjectName(row.subject);
            if (norm) subjectMap.set(norm.toLowerCase(), norm);
        });

        const subjectsList = Array.from(subjectMap.values()).sort((a, b) => a.localeCompare(b));

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

        const studentSql = `SELECT id, reg_number, surname, class, assigned_subject FROM students WHERE id = ?`;
        const student = await dbGet(studentSql, [student_id]);

        if (!student) {
            return res.status(404).json({ success: false, message: "Student not found." });
        }

        // Fetch completed sessions for this student
        const completedSessionsSql = `
            SELECT id, subject, status, score, login_time 
            FROM exam_sessions 
            WHERE student_id = ? AND status = 'submitted'
        `;
        const completedSessions = await dbAll(completedSessionsSql, [student_id]);
        const completedSubjects = new Set(
            completedSessions.map(s => s.subject ? s.subject.trim().toLowerCase() : '')
        );

        // Standard default subjects list for CBT Portal Hub
        const allSubjects = [
            { name: 'Mathematics', code: 'MTH101', schedule: 'Now Available' },
            { name: 'English Language', code: 'ENG101', schedule: 'Now Available' },
            { name: 'Biology', code: 'BIO101', schedule: 'Now Available' },
            { name: 'Chemistry', code: 'CHM101', schedule: 'Now Available' },
            { name: 'Physics', code: 'PHY101', schedule: 'Now Available' },
            { name: 'Computer Studies', code: 'CSC101', schedule: 'Now Available' },
            { name: 'Civic Education', code: 'CVE101', schedule: 'Now Available' },
            { name: 'Further Mathematics', code: 'MTH102', schedule: 'Scheduled for 2:00 PM - 3:00 PM', forced_status: 'not_scheduled' }
        ];

        // Format subjects with real-time status
        const formattedSubjects = allSubjects.map(sub => {
            const isCompleted = completedSubjects.has(sub.name.toLowerCase());
            let status = 'available';
            let message = 'Ready to Start';

            if (isCompleted) {
                status = 'completed';
                message = 'Exam Completed';
            } else if (sub.forced_status === 'not_scheduled') {
                status = 'not_scheduled';
                message = `Scheduled for 2:00 PM - 3:00 PM. Sorry, you are not scheduled for this exam yet.`;
            }

            return {
                name: sub.name,
                code: sub.code,
                schedule: sub.schedule,
                status: status, // 'available', 'not_scheduled', 'completed'
                message: message
            };
        });

        return res.status(200).json({
            success: true,
            student: {
                id: student.id,
                reg_number: student.reg_number,
                surname: student.surname,
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
