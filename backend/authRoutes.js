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
        const className = req.query.class || req.query.class_name || req.query.className;
        let subjectsList = [];

        if (className) {
            const mapped = await dbAll(
                `SELECT subject_name FROM class_subjects WHERE LOWER(class_name) = LOWER(?) ORDER BY id ASC`,
                [String(className).trim()]
            );
            if (mapped && mapped.length > 0) {
                subjectsList = mapped.map(m => m.subject_name);
            }
        }

        if (subjectsList.length === 0) {
            const activeSubjects = await dbAll(`SELECT name FROM subjects WHERE is_active = 1 ORDER BY name ASC`);
            subjectsList = activeSubjects.map(s => s.name);
        }

        return res.status(200).json({
            success: true,
            class: className || 'ALL',
            count: subjectsList.length,
            subjects: subjectsList
        });

    } catch (error) {
        console.error('❌ [Get Subjects Error]:', error);
        next(error);
    }
});

/**
 * POST /api/student/login (Alias: /api/login)
 * 
 * Authenticates student using registration_no (normalized uppercase e.g. AWA26270042) & password/surname (UPPERCASE).
 * Unique registration numbers prevent collisions between students sharing identical surnames.
 */
const handleStudentLogin = async (req, res, next) => {
    try {
        const { reg_number, registration_no, regNo, surname, password, workstation_ip } = req.body;

        const rawReg = registration_no || reg_number || regNo;
        const rawPass = password || surname;

        if (!rawReg || !rawPass) {
            return res.status(400).json({
                success: false,
                message: "Registration number and surname/password are required."
            });
        }

        // Step a: Normalize registration_no to UPPERCASE (e.g., awa26270042 -> AWA26270042)
        const formattedRegNumber = String(rawReg).trim().toUpperCase();
        const formattedSurname = String(rawPass).trim().toUpperCase();
        const clientIp = workstation_ip || req.ip || '127.0.0.1';

        // Step b: Query matching student record strictly by registration_no (guarantees collision safety)
        const studentSql = `
            SELECT id, reg_number, registration_no, surname, first_name, class, assigned_subject, class_id, academic_term_id, password
            FROM students 
            WHERE (TRIM(UPPER(COALESCE(registration_no, reg_number))) = ? OR TRIM(UPPER(reg_number)) = ?)
        `;
        let student = await dbGet(studentSql, [formattedRegNumber, formattedRegNumber]);

        // Step c: If student found by reg_no, verify surname/password
        if (student) {
            const dbSurname = String(student.surname || '').trim().toUpperCase();
            const crypto = require('crypto');
            const passHash = crypto.createHash('sha256').update(formattedSurname).digest('hex');

            const isSurnameMatch = dbSurname === formattedSurname;
            const isPasswordMatch = student.password && (student.password === passHash || student.password === formattedSurname);

            if (!isSurnameMatch && !isPasswordMatch) {
                console.log(`⚠️ [Login Password Mismatch]: Candidate Reg Number "${formattedRegNumber}" exists, but entered password/surname "${formattedSurname}" did not match DB surname "${dbSurname}".`);
                return res.status(401).json({
                    success: false,
                    message: "Invalid Registration Number or Surname/Password. Please check your details and try again."
                });
            }
        } else {
            console.log(`⚠️ [Login Unknown Reg Number]: Registration Number "${formattedRegNumber}" not found in database.`);
            return res.status(401).json({
                success: false,
                message: "Invalid Registration Number or Surname. Please check your details and try again."
            });
        }

        // Step d: Resolve active academic term & class_id if null on student record
        if (!student.academic_term_id) {
            const activeTerm = await dbGet(`SELECT id FROM academic_terms WHERE is_current = 1 ORDER BY id DESC LIMIT 1`);
            if (activeTerm) student.academic_term_id = activeTerm.id;
        }

        if (!student.class_id && student.class) {
            const classRow = await dbGet(`SELECT id FROM classes WHERE LOWER(name) = LOWER(?)`, [student.class.trim()]);
            if (classRow) student.class_id = classRow.id;
        }

        // Step e: Retrieve or reuse active exam session ID for login trace
        const sessionCheckSql = `
            SELECT id, status, is_locked 
            FROM exam_sessions 
            WHERE student_id = ? AND status = 'active' AND is_locked = 0
            ORDER BY id DESC 
            LIMIT 1
        `;
        const existingSession = await dbGet(sessionCheckSql, [student.id]);

        let sessionId;

        // Step f: Check for unexpired active exam session in student_exam_sessions
        let activeSessionObj = null;
        const activeSesRow = await dbGet(
            `SELECT * FROM student_exam_sessions WHERE student_id = ? AND status = 'IN_PROGRESS' ORDER BY session_id DESC LIMIT 1`,
            [student.id]
        );

        if (activeSesRow) {
            let deliveredQuestions = [];
            try { deliveredQuestions = JSON.parse(activeSesRow.delivered_questions_json || '[]'); } catch (_) {}

            const now = new Date();
            const expiresAt = activeSesRow.expires_at ? new Date(activeSesRow.expires_at) : new Date(now.getTime() + 45 * 60 * 1000);

            if (expiresAt.getTime() > now.getTime() && deliveredQuestions.length > 0) {
                const remainingSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
                let selectedAnswers = {};
                try { selectedAnswers = JSON.parse(activeSesRow.selected_answers_json || '{}'); } catch (_) {}

                activeSessionObj = {
                    session_id: activeSesRow.session_id,
                    student_id: student.id,
                    subject: activeSesRow.subject_name,
                    class: activeSesRow.class_name || student.class,
                    started_at: activeSesRow.started_at,
                    expires_at: activeSesRow.expires_at,
                    duration_minutes: activeSesRow.duration_minutes || 45,
                    duration_seconds: remainingSeconds,
                    delivered_questions: deliveredQuestions,
                    selected_answers: selectedAnswers
                };
            }
        }

        // Create new active session or update workstation IP on active session
        if (existingSession && existingSession.status === 'active' && existingSession.is_locked === 0) {
            sessionId = existingSession.id;
            const updateSessionSql = `
                UPDATE exam_sessions 
                SET workstation_ip = ?, login_time = CURRENT_TIMESTAMP 
                WHERE id = ?
            `;
            await dbRun(updateSessionSql, [clientIp, sessionId]);
            console.log(`🔑 [Session Resumed] Student ID ${student.id} (${student.registration_no || student.reg_number}) resumed Session #${sessionId} from IP ${clientIp}`);
        } else {
            const insertSessionSql = `
                INSERT INTO exam_sessions (student_id, workstation_ip, login_time, status, is_locked, term_id)
                VALUES (?, ?, CURRENT_TIMESTAMP, 'active', 0, ?)
            `;
            const result = await dbRun(insertSessionSql, [student.id, clientIp, student.academic_term_id || null]);
            sessionId = result.lastID;
            console.log(`🔑 [New Session Created] Student ID ${student.id} (${student.registration_no || student.reg_number}) started Session #${sessionId} from IP ${clientIp}`);
        }

        // Step g: Return success response with student metadata & session_id
        return res.status(200).json({
            success: true,
            message: "Login successful",
            student: {
                id: student.id,
                reg_number: student.registration_no || student.reg_number,
                registration_no: student.registration_no || student.reg_number,
                surname: student.surname,
                first_name: student.first_name || '',
                class: student.class,
                class_id: student.class_id || null,
                academic_term_id: student.academic_term_id || null,
                assigned_subject: student.assigned_subject
            },
            session_id: sessionId,
            has_active_session: activeSessionObj !== null,
            active_session: activeSessionObj
        });

    } catch (error) {
        console.error('❌ [Login Route Error]:', error);
        next(error);
    }
};

router.post('/login', handleStudentLogin);
router.post('/student/login', handleStudentLogin);

/**
 * POST /api/student/verify-session
 * 
 * Verifies if a stored student session token (student_id + session_id) is valid, active, and unlocked.
 */
router.post('/student/verify-session', async (req, res, next) => {
    try {
        const { student_id, session_id } = req.body;

        if (!student_id || !session_id) {
            return res.status(400).json({
                success: false,
                valid: false,
                message: "student_id and session_id are required for verification."
            });
        }

        // Verify student exists
        const student = await dbGet(`SELECT id, reg_number, surname, first_name, class FROM students WHERE id = ?`, [student_id]);
        if (!student) {
            return res.status(401).json({
                success: false,
                valid: false,
                message: "Student candidate record not found."
            });
        }

        // Verify session status
        const session = await dbGet(`SELECT id, status, is_locked FROM exam_sessions WHERE id = ? AND student_id = ?`, [session_id, student_id]);

        if (!session) {
            return res.status(401).json({
                success: false,
                valid: false,
                message: "Exam session not found or invalidated."
            });
        }

        if (session.status === 'submitted' || session.is_locked === 1) {
            return res.status(401).json({
                success: false,
                valid: false,
                message: session.status === 'submitted'
                    ? "Exam session has already been completed and submitted."
                    : "Exam session has been locked by administrator."
            });
        }

        return res.status(200).json({
            success: true,
            valid: true,
            message: "Session is active and valid",
            student: student
        });
    } catch (error) {
        console.error('❌ [Verify Session Route Error]:', error);
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
        const sessionId = req.query.session_id || req.query.sessionId || null;

        const studentSql = `SELECT id, reg_number, surname, first_name, class, assigned_subject FROM students WHERE id = ?`;
        const student = await dbGet(studentSql, [student_id]);

        if (!student) {
            return res.status(404).json({ success: false, message: "Student not found." });
        }

        // If session_id is provided, verify session status
        if (sessionId) {
            const checkSess = await dbGet(`SELECT status, is_locked FROM exam_sessions WHERE id = ? AND student_id = ?`, [sessionId, student_id]);
            if (checkSess) {
                if (checkSess.status === 'submitted' || checkSess.is_locked === 1) {
                    return res.status(401).json({
                        success: false,
                        valid: false,
                        message: "Exam session is locked or already submitted."
                    });
                }
            }
        }

        // Fetch completed sessions for this student (CRITICAL: score is strictly omitted for student privacy)
        const completedSessions = await dbAll(
            `SELECT LOWER(subject_name) as subject FROM student_exam_sessions WHERE student_id = ? AND status = 'SUBMITTED'
             UNION
             SELECT LOWER(subject) as subject FROM exam_sessions WHERE student_id = ? AND status = 'submitted'`,
            [student_id, student_id]
        );
        const completedSubjects = new Set(
            completedSessions.map(s => s.subject ? s.subject.trim().toLowerCase() : '').filter(Boolean)
        );

        // Fetch active sessions for this student with session IDs
        const activeSesRows = await dbAll(
            `SELECT session_id, LOWER(subject_name) as subject, expires_at FROM student_exam_sessions WHERE student_id = ? AND status = 'IN_PROGRESS'`,
            [student_id]
        );
        const legacyActiveSesRows = await dbAll(
            `SELECT id as session_id, LOWER(subject) as subject FROM exam_sessions WHERE student_id = ? AND status = 'active' AND is_locked = 0`,
            [student_id]
        );

        const nowTime = Date.now();
        const activeSubjectsMap = new Map();

        activeSesRows.forEach(s => {
            if (s.subject) {
                const exp = s.expires_at ? new Date(s.expires_at).getTime() : (nowTime + 10000);
                if (exp > nowTime) {
                    activeSubjectsMap.set(s.subject.trim().toLowerCase(), s.session_id);
                }
            }
        });

        legacyActiveSesRows.forEach(s => {
            if (s.subject && !activeSubjectsMap.has(s.subject.trim().toLowerCase())) {
                activeSubjectsMap.set(s.subject.trim().toLowerCase(), s.session_id);
            }
        });

        // Fetch stream-isolated subjects for candidate's class from `class_subjects` mapping table
        const mappedSubjectsRows = await dbAll(
            `SELECT subject_name FROM class_subjects WHERE LOWER(class_name) = LOWER(?) ORDER BY id ASC`,
            [String(student.class || '').trim()]
        );
        let streamSubjects = mappedSubjectsRows.map(m => m.subject_name);

        // Fallback stream logic if class mapping isn't directly matched
        if (streamSubjects.length === 0) {
            const clsUpper = String(student.class || '').toUpperCase();
            if (clsUpper.startsWith('JSS')) {
                streamSubjects = [
                    "English Language", "Mathematics", "Yoruba", "French", "Fine Art", "Music",
                    "Basic Science", "Basic Technology", "PHE", "Digital Technology", "Social Studies",
                    "Civic Education", "Home Economics", "Agricultural Science", "Business Studies", "History"
                ];
            } else if (clsUpper.includes('COMMERCIAL')) {
                streamSubjects = ["Mathematics", "English Language", "Civic Education", "Further Mathematics", "Economics", "Digital Technology", "Account", "Commerce"];
            } else if (clsUpper.includes('ART')) {
                streamSubjects = ["Mathematics", "English Language", "Civic Education", "Economics", "Digital Technology", "Government", "CRS", "Literature in English"];
            } else {
                streamSubjects = ["Mathematics", "English Language", "Biology", "Chemistry", "Physics", "Civic Education", "Further Mathematics", "Economics", "Digital Technology", "Geography", "Agricultural Science"];
            }
        }

        // Parse candidate specific assigned subjects (if explicitly specified on candidate record)
        const rawAssigned = (student.assigned_subject || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);

        // Build stream-isolated subject set for this student
        const subjectSet = new Set();
        const streamLowerSet = new Set(streamSubjects.map(s => s.toLowerCase()));

        if (rawAssigned.length > 0) {
            rawAssigned.forEach(s => {
                if (streamLowerSet.has(s.toLowerCase())) {
                    subjectSet.add(s);
                }
            });
        }

        // Default to full allocated stream subjects if candidate specific list was empty or generic
        if (subjectSet.size === 0) {
            streamSubjects.forEach(s => subjectSet.add(s));
        }

        // Format subjects with class-isolated real-time status
        const formattedSubjects = (await Promise.all(Array.from(subjectSet).map(async (subName) => {
            const lowerName = subName.toLowerCase();
            const isCompleted = completedSubjects.has(lowerName);
            const isActive = activeSubjectsMap.has(lowerName);
            const activeSessionId = activeSubjectsMap.get(lowerName) || null;
            const isSubjectConfigActive = await isSubjectActiveForClass(student.class, subName);

            if (!isSubjectConfigActive && !isCompleted && !isActive) {
                return null;
            }

            let status = 'available';
            let message = 'Ready to Start';

            if (isCompleted) {
                status = 'completed';
                message = 'You have already completed and submitted this examination.';
            } else if (isActive) {
                status = 'in_progress';
                message = 'Exam session active. Tap Resume to continue.';
            }

            return {
                name: subName,
                subject: subName,
                is_active: isSubjectConfigActive,
                hasActiveSession: isActive,
                has_active_session: isActive,
                sessionStatus: isActive ? 'IN_PROGRESS' : null,
                sessionId: activeSessionId,
                session_id: activeSessionId,
                schedule: isCompleted ? 'Submitted' : (isActive ? 'In Progress' : 'Now Available'),
                status: status,
                message: message
            };
        }))).filter(Boolean);

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

let lastResetDateStr = '';
let hasResetAt5PM = false;

/**
 * Daily Auto-Reset / Time-Bound Expiration Helper
 * Checks if current local server time is past 17:00 (5:00 PM).
 * If past 5:00 PM or on a new day, auto-resets all active exams back to is_active = 0 (INACTIVE) ONCE per cutoff.
 */
async function checkDailyAutoReset() {
    try {
        const now = new Date();
        const currentDateStr = now.toISOString().split('T')[0];
        const currentHour = now.getHours();

        // Reset tracking flag on a new calendar day
        if (lastResetDateStr !== currentDateStr) {
            lastResetDateStr = currentDateStr;
            hasResetAt5PM = false;
        }

        // Trigger auto-reset ONCE when 17:00 (5:00 PM) cutoff is reached for the day
        if (currentHour >= 17 && !hasResetAt5PM) {
            hasResetAt5PM = true;
            await dbRun(`UPDATE exam_configs SET is_active = 0`);
            await dbRun(`UPDATE subjects SET is_active = 0`);
            console.log(`⏰ [Daily Auto-Reset] Active exams auto-reset to INACTIVE (5:00 PM cutoff trigger).`);
        }
    } catch (err) {
        console.warn('⚠️ [Auto-Reset Check Warning]:', err.message);
    }
}

/**
 * Resolves active status for a specific class and subject combination.
 * Must satisfy BOTH conditions:
 * 1. is_active === 1 (Admin explicitly toggled Exam Activation Status to ACTIVE).
 * 2. Total uploaded questions in bank > 0.
 */
async function isSubjectActiveForClass(studentClass, subject) {
    try {
        await checkDailyAutoReset();

        const normSub = String(subject || '').trim();
        if (!normSub) return false;

        let isActiveConfig = false;

        if (studentClass) {
            const normClass = String(studentClass).trim();
            const baseTier = normClass.replace(/\s+(Science|Art|Commercial|Gold|Silver|Diamond)$/i, '').trim();

            const classCfg = await dbGet(
                `SELECT is_active FROM exam_configs WHERE LOWER(class) = LOWER(?) AND LOWER(subject) = LOWER(?)`,
                [normClass, normSub]
            );
            if (classCfg && classCfg.is_active !== undefined && classCfg.is_active !== null) {
                isActiveConfig = classCfg.is_active === 1;
            } else {
                const tierCfg = await dbGet(
                    `SELECT is_active FROM exam_configs WHERE LOWER(class) = LOWER(?) AND LOWER(subject) = LOWER(?)`,
                    [baseTier, normSub]
                );
                if (tierCfg && tierCfg.is_active !== undefined && tierCfg.is_active !== null) {
                    isActiveConfig = tierCfg.is_active === 1;
                }
            }
        }

        if (!isActiveConfig) {
            const generalCfg = await dbGet(
                `SELECT is_active FROM exam_configs WHERE (class IS NULL OR TRIM(class) = '') AND LOWER(subject) = LOWER(?)`,
                [normSub]
            );
            if (generalCfg && generalCfg.is_active !== undefined && generalCfg.is_active !== null) {
                isActiveConfig = generalCfg.is_active === 1;
            } else {
                const subRec = await dbGet(`SELECT is_active FROM subjects WHERE LOWER(name) = LOWER(?)`, [normSub]);
                if (subRec && subRec.is_active !== undefined && subRec.is_active !== null) {
                    isActiveConfig = subRec.is_active === 1;
                }
            }
        }

        // Condition 1: If admin has not explicitly toggled is_active === 1, paper is INACTIVE
        if (!isActiveConfig) {
            return false;
        }

        // Condition 2: Question bank count > 0 for this subject & class scope
        let fetchQuestionsSql = `SELECT COUNT(*) as cnt FROM questions WHERE LOWER(subject) = LOWER(?)`;
        const params = [normSub.toLowerCase()];
        if (studentClass) {
            const baseTier = studentClass.replace(/\s+(Science|Art|Commercial|Gold|Silver|Diamond)$/i, '').trim();
            fetchQuestionsSql += ` AND (class IS NULL OR TRIM(class) = '' OR LOWER(class) = LOWER(?) OR LOWER(class) = LOWER(?))`;
            params.push(studentClass.trim().toLowerCase(), baseTier.toLowerCase());
        }

        const qCount = await dbGet(fetchQuestionsSql, params);
        if (!qCount || qCount.cnt <= 0) {
            const genQCount = await dbGet(`SELECT COUNT(*) as cnt FROM questions WHERE LOWER(subject) = LOWER(?)`, [normSub.toLowerCase()]);
            if (!genQCount || genQCount.cnt <= 0) {
                return false; // No questions uploaded -> INACTIVE / NOT SCHEDULED
            }
        }

        return true;
    } catch (e) {
        return false;
    }
}

// --------------------------------------------------------------------------
// GET /api/student/assigned-papers (Alias: GET /api/student/assigned-subjects)
// Returns class-isolated assigned exam papers with individual subject status
// --------------------------------------------------------------------------
const handleGetAssignedPapers = async (req, res, next) => {
    try {
        const studentId = req.query.student_id || req.query.studentId;
        const regNo = req.query.registration_no || req.query.reg_number;

        if (!studentId && !regNo) {
            return res.status(400).json({ success: false, message: "student_id or registration_no required." });
        }

        let student;
        if (studentId) {
            student = await dbGet(`SELECT * FROM students WHERE id = ?`, [studentId]);
        } else {
            student = await dbGet(`SELECT * FROM students WHERE LOWER(registration_no) = LOWER(?) OR LOWER(reg_number) = LOWER(?)`, [regNo.trim(), regNo.trim()]);
        }

        if (!student) {
            return res.status(404).json({ success: false, message: "Student not found." });
        }

        // Fetch completed and active sessions from both student_exam_sessions and legacy exam_sessions
        const completedSessions = await dbAll(
            `SELECT LOWER(subject_name) as subject FROM student_exam_sessions WHERE student_id = ? AND status = 'SUBMITTED'
             UNION
             SELECT LOWER(subject) as subject FROM exam_sessions WHERE student_id = ? AND (status = 'submitted' OR is_locked = 1)`,
            [student.id, student.id]
        );
        const completedSubjects = new Set(completedSessions.map(s => s.subject ? s.subject.trim().toLowerCase() : '').filter(Boolean));

        const activeSessions = await dbAll(
            `SELECT session_id, LOWER(subject_name) as subject FROM student_exam_sessions WHERE student_id = ? AND status = 'IN_PROGRESS' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
             UNION
             SELECT id as session_id, LOWER(subject) as subject FROM exam_sessions WHERE student_id = ? AND status = 'active' AND is_locked = 0`,
            [student.id, student.id]
        );
        const activeSubjectsMap = new Map(activeSessions.map(s => [s.subject ? s.subject.trim().toLowerCase() : '', s.session_id]));

        let streamSubjects = [];
        const studentClass = student.class || '';
        if (studentClass) {
            const mappedSubjects = await dbAll(
                `SELECT subject_name FROM class_subjects WHERE LOWER(class_name) = LOWER(?) ORDER BY id ASC`,
                [studentClass.trim()]
            );
            if (mappedSubjects && mappedSubjects.length > 0) {
                streamSubjects = mappedSubjects.map(m => m.subject_name);
            }
        }

        const rawAssigned = (student.assigned_subject || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
        const subjectSet = new Set();
        if (streamSubjects.length > 0) {
            streamSubjects.forEach(s => subjectSet.add(s));
        } else if (rawAssigned.length > 0) {
            rawAssigned.forEach(s => subjectSet.add(s));
        }

        activeSessions.forEach(s => {
            if (s.subject) {
                const formatted = s.subject.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                subjectSet.add(formatted);
            }
        });
        completedSessions.forEach(s => {
            if (s.subject) {
                const formatted = s.subject.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                subjectSet.add(formatted);
            }
        });

        const papers = (await Promise.all(Array.from(subjectSet).map(async (subName) => {
            const lowerName = subName.toLowerCase();
            const isCompleted = completedSubjects.has(lowerName);
            const isActive = activeSubjectsMap.has(lowerName);
            const activeSessionId = activeSubjectsMap.get(lowerName) || null;
            const isSubjectConfigActive = await isSubjectActiveForClass(student.class, subName);

            let status = 'available';
            let message = 'Ready to Start';

            if (isCompleted) {
                status = 'completed';
                message = 'You have already completed and submitted this examination.';
            } else if (isActive) {
                status = 'in_progress';
                message = 'Exam session active. Tap Resume to continue.';
            } else if (!isSubjectConfigActive) {
                status = 'unavailable';
                message = 'Paper is not scheduled or activated yet.';
            }

            return {
                subject: subName,
                name: subName,
                class: student.class,
                is_active: isSubjectConfigActive,
                hasActiveSession: isActive,
                has_active_session: isActive,
                sessionStatus: isActive ? 'IN_PROGRESS' : null,
                sessionId: activeSessionId,
                session_id: activeSessionId,
                status: status,
                message: message
            };
        }))).filter(Boolean);

        return res.status(200).json({
            success: true,
            student_id: student.id,
            class: student.class,
            papers: papers,
            subjects: papers
        });

    } catch (error) {
        console.error('❌ [Get Assigned Papers Error]:', error);
        next(error);
    }
};

router.get('/student/assigned-papers', handleGetAssignedPapers);
router.get('/student/assigned-subjects', handleGetAssignedPapers);

/**
 * POST /api/student/start-exam
 * Validates candidate session request for a specific (student_id, subject) tuple.
 * Blocks start request if candidate has already submitted this specific subject.
 */
router.post('/student/start-exam', async (req, res, next) => {
    try {
        const { student_id, studentId, subject, subject_name } = req.body;
        const targetStudentId = student_id || studentId;
        const targetSubject = String(subject || subject_name || '').trim();

        if (!targetStudentId || !targetSubject) {
            return res.status(400).json({
                success: false,
                message: "student_id and subject are required to start examination."
            });
        }

        const normSubLower = targetSubject.toLowerCase();

        // Check if candidate already submitted this specific subject
        const submittedSession = await dbGet(
            `SELECT session_id as id FROM student_exam_sessions WHERE student_id = ? AND LOWER(subject_name) = ? AND status = 'SUBMITTED'
             UNION
             SELECT id FROM exam_sessions WHERE student_id = ? AND LOWER(subject) = ? AND (status = 'submitted' OR is_locked = 1)
             UNION
             SELECT session_id as id FROM answers WHERE student_id = ? AND question_id IN (SELECT id FROM questions WHERE LOWER(subject) = ?)`,
            [targetStudentId, normSubLower, targetStudentId, normSubLower, targetStudentId, normSubLower]
        );

        if (submittedSession) {
            return res.status(403).json({
                success: false,
                message: `You have already submitted the examination for this specific subject (${targetSubject}).`
            });
        }

        return res.status(200).json({
            success: true,
            message: `Subject "${targetSubject}" session validated and ready to start.`
        });

    } catch (error) {
        console.error('❌ [Start Exam Error]:', error);
        next(error);
    }
});

/**
 * GET /api/student/assigned-subjects
 * Returns stream-isolated subject list for a logged in student.
 */
router.get('/student/assigned-subjects', async (req, res, next) => {
    try {
        const studentId = req.query.student_id || req.query.studentId;
        const regNo = req.query.registration_no || req.query.reg_number;
        const className = req.query.class || req.query.class_name;

        let targetClass = className;
        if (!targetClass && (studentId || regNo)) {
            let student;
            if (studentId) {
                student = await dbGet(`SELECT * FROM students WHERE id = ?`, [studentId]);
            } else if (regNo) {
                student = await dbGet(`SELECT * FROM students WHERE LOWER(registration_no) = LOWER(?) OR LOWER(reg_number) = LOWER(?)`, [regNo.trim(), regNo.trim()]);
            }
            if (student) targetClass = student.class;
        }

        let subjectsList = [];
        if (targetClass) {
            const mapped = await dbAll(
                `SELECT subject_name FROM class_subjects WHERE LOWER(class_name) = LOWER(?) ORDER BY id ASC`,
                [String(targetClass).trim()]
            );
            if (mapped && mapped.length > 0) {
                subjectsList = mapped.map(m => m.subject_name);
            }
        }

        if (subjectsList.length === 0) {
            const activeSubjects = await dbAll(`SELECT name FROM subjects WHERE is_active = 1 ORDER BY name ASC`);
            subjectsList = activeSubjects.map(s => s.name);
        }

        return res.status(200).json({
            success: true,
            class: targetClass || 'ALL',
            count: subjectsList.length,
            subjects: subjectsList
        });

    } catch (error) {
        console.error('❌ [Get Student Assigned Subjects Error]:', error);
        next(error);
    }
});

/**
 * POST /api/student/session-heartbeat
 * Real-time Workstation Heartbeat Telemetry Endpoint.
 * Transmits live candidate progress, current index, remaining seconds, and last_heartbeat timestamp.
 */
router.post('/student/session-heartbeat', async (req, res, next) => {
    try {
        const {
            regNumber,
            registration_no,
            studentId,
            student_id,
            subjectId,
            subject_id,
            subjectName,
            subject,
            classId,
            class_id,
            currentQuestionIndex,
            current_question_index,
            answeredCount,
            answered_count,
            totalQuestions,
            total_questions,
            remainingSeconds,
            remaining_seconds,
            status
        } = req.body;

        const regNo = regNumber || registration_no;
        const stId = studentId || student_id;
        const subName = subjectName || subject;

        let student;
        if (regNo) {
            student = await dbGet(`SELECT * FROM students WHERE LOWER(registration_no) = LOWER(?) OR LOWER(reg_number) = LOWER(?)`, [String(regNo).trim(), String(regNo).trim()]);
        } else if (stId) {
            student = await dbGet(`SELECT * FROM students WHERE id = ?`, [stId]);
        }

        if (!student) {
            return res.status(404).json({ success: false, message: 'Candidate student record not found for heartbeat.' });
        }

        const currIdx = currentQuestionIndex !== undefined ? currentQuestionIndex : (current_question_index || 0);
        const remSecs = remainingSeconds !== undefined ? remainingSeconds : (remaining_seconds || 0);
        const activeStatus = status || 'LIVE';

        if (subName) {
            await dbRun(
                `UPDATE student_exam_sessions
                 SET last_heartbeat = CURRENT_TIMESTAMP,
                     current_question_index = ?,
                     remaining_seconds = ?,
                     status = CASE WHEN status = 'SUBMITTED' THEN 'SUBMITTED' ELSE 'IN_PROGRESS' END
                 WHERE student_id = ? AND LOWER(subject_name) = LOWER(?) AND status != 'SUBMITTED'`,
                [currIdx, remSecs, student.id, String(subName).trim()]
            );
        } else {
            await dbRun(
                `UPDATE student_exam_sessions
                 SET last_heartbeat = CURRENT_TIMESTAMP,
                     current_question_index = ?,
                     remaining_seconds = ?
                 WHERE student_id = ? AND status = 'IN_PROGRESS'`,
                [currIdx, remSecs, student.id]
            );
        }

        return res.status(200).json({
            success: true,
            message: 'Heartbeat recorded successfully.',
            timestamp: new Date().toISOString(),
            status: activeStatus
        });

    } catch (error) {
        console.error('❌ [Session Heartbeat Error]:', error);
        next(error);
    }
});

module.exports = router;
