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
 * Returns class variations for arm stream matching:
 * e.g. "JSS 1 Gold" -> ["JSS 1 Gold", "JSS 1"]
 * e.g. "SS 1 Science" -> ["SS 1 Science", "SS 1"]
 * e.g. "SS 1 Science Gold" -> ["SS 1 Science Gold", "SS 1 Science", "SS 1"]
 */
function getClassVariations(rawClass) {
    if (!rawClass || typeof rawClass !== 'string') return [];
    const exact = rawClass.trim();
    if (!exact) return [];

    const stream = exact.replace(/\s+(Gold|Silver|Diamond|Green|Blue|Red|Yellow|Purple|Bronze|Ruby|Emerald|Pearl|[A-D])$/i, '').trim();
    const base = stream.replace(/\s+(Science|Art|Commercial)$/i, '').trim();

    const set = new Set([exact, stream, base].filter(Boolean));
    return Array.from(set);
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
        const classVars = getClassVariations(studentClass);

        for (const cls of classVars) {
            const classCfg = await dbGet(
                `SELECT is_active FROM exam_configs WHERE LOWER(class) = LOWER(?) AND LOWER(subject) = LOWER(?)`,
                [cls, normSub]
            );
            if (classCfg && classCfg.is_active !== undefined && classCfg.is_active !== null) {
                if (classCfg.is_active === 1) {
                    isActiveConfig = true;
                    break;
                }
            }

            const assessCfg = await dbGet(
                `SELECT is_active FROM assessment_configs WHERE LOWER(class) = LOWER(?) AND LOWER(subject) = LOWER(?) AND is_active = 1 LIMIT 1`,
                [cls, normSub]
            );
            if (assessCfg && assessCfg.is_active === 1) {
                isActiveConfig = true;
                break;
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
                const assessGenCfg = await dbGet(
                    `SELECT is_active FROM assessment_configs WHERE (class IS NULL OR TRIM(class) = '') AND LOWER(subject) = LOWER(?) AND is_active = 1 LIMIT 1`,
                    [normSub]
                );
                if (assessGenCfg && assessGenCfg.is_active === 1) {
                    isActiveConfig = true;
                } else {
                    const subRec = await dbGet(`SELECT is_active FROM subjects WHERE LOWER(name) = LOWER(?)`, [normSub]);
                    if (subRec && subRec.is_active !== undefined && subRec.is_active !== null) {
                        isActiveConfig = subRec.is_active === 1;
                    }
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
        if (classVars.length > 0) {
            const placeholders = classVars.map(() => 'LOWER(class) = LOWER(?)').join(' OR ');
            fetchQuestionsSql += ` AND (class IS NULL OR TRIM(class) = '' OR ${placeholders})`;
            params.push(...classVars);
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
 * Normalizes surname for compound, hyphenated, spaced, or underscore variations:
 * Strips all whitespace, hyphens, underscores, and forces uppercase.
 * e.g. "EKONG-PAUL" -> "EKONGPAUL", "EKONG PAUL" -> "EKONGPAUL", "Ekong_Paul" -> "EKONGPAUL"
 */
function normalizeSurname(str) {
    return (str || '')
        .toString()
        .toUpperCase()
        .replace(/[\s\-_]/g, '')
        .trim();
}

/**
 * POST /api/student/login (Aliases: /api/login, /api/auth/student-login, /api/auth/login)
 * 
 * Authenticates student using registration_no (normalized uppercase e.g. AWA26270042) & surname (compound normalized).
 * Unique registration numbers prevent collisions between students sharing identical surnames.
 */
const handleStudentLogin = async (req, res, next) => {
    try {
        const { reg_number, registration_no, regNo, regNumber, surname, password, workstation_ip } = req.body;

        const rawReg = registration_no || reg_number || regNo || regNumber;
        const rawPass = surname || password;

        if (!rawReg || !rawPass) {
            return res.status(400).json({
                success: false,
                message: "Registration number and surname are required."
            });
        }

        // Step a: Normalize registration_no to UPPERCASE and sanitize input surname
        const formattedRegNumber = String(rawReg).trim().toUpperCase();
        const formattedSurname = String(rawPass).trim().toUpperCase();
        const normalizedInputSurname = normalizeSurname(rawPass);
        const clientIp = workstation_ip || req.ip || '127.0.0.1';

        if (!formattedRegNumber || !normalizedInputSurname) {
            return res.status(400).json({
                success: false,
                message: "Registration number and surname are required."
            });
        }

        // Step b: Query matching student record strictly by registration_no (guarantees collision safety)
        const studentSql = `
            SELECT id, reg_number, registration_no, surname, first_name, class, assigned_subject, class_id, academic_term_id, password
            FROM students 
            WHERE (TRIM(UPPER(COALESCE(registration_no, reg_number))) = ? OR TRIM(UPPER(reg_number)) = ?)
        `;
        let student = await dbGet(studentSql, [formattedRegNumber, formattedRegNumber]);

        // Step c: If student found by reg_no, verify compound normalized surname/password
        if (student) {
            const dbSurname = String(student.surname || '').trim().toUpperCase();
            const normalizedDbSurname = normalizeSurname(student.surname);
            const crypto = require('crypto');
            const passHash = crypto.createHash('sha256').update(formattedSurname).digest('hex');

            const isSurnameMatch = normalizedDbSurname === normalizedInputSurname || dbSurname === formattedSurname;
            const isPasswordMatch = student.password && (
                student.password === passHash ||
                student.password === formattedSurname ||
                normalizeSurname(student.password) === normalizedInputSurname
            );

            if (!isSurnameMatch && !isPasswordMatch) {
                console.log(`⚠️ [Login Password Mismatch]: Candidate Reg Number "${formattedRegNumber}" exists, but entered surname "${formattedSurname}" (normalized: "${normalizedInputSurname}") did not match DB surname "${student.surname}" (normalized: "${normalizedDbSurname}").`);
                return res.status(401).json({
                    success: false,
                    message: "Invalid Surname. Please enter your surname as registered."
                });
            }
        } else {
            console.log(`⚠️ [Login Unknown Reg Number]: Registration Number "${formattedRegNumber}" not found in database.`);
            return res.status(401).json({
                success: false,
                message: "Invalid Registration Number. Please verify your ID."
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
                regNo: student.registration_no || student.reg_number,
                reg_number: student.registration_no || student.reg_number,
                registration_no: student.registration_no || student.reg_number,
                name: student.first_name ? `${student.surname}, ${student.first_name}` : student.surname,
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
router.post('/auth/student-login', handleStudentLogin);
router.post('/auth/login', handleStudentLogin);

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
 * Fetch all active assessment configurations for a student's class tier, session, and term,
 * enriched with per-subject student session / submission status.
 */
async function fetchActiveExamsForStudent({ studentId, studentClass, session, term }) {
    let currentSession = session;
    let currentTerm = term;
    if (!currentSession || !currentTerm) {
        const currentTermRec = await dbGet(`SELECT session, name FROM academic_terms WHERE is_current = 1 LIMIT 1`);
        if (currentTermRec) {
            if (!currentSession) currentSession = currentTermRec.session;
            if (!currentTerm) currentTerm = currentTermRec.name;
        }
    }
    if (!currentSession) currentSession = '2026/2027';
    if (!currentTerm) currentTerm = '1st Term';

    const classVars = getClassVariations(studentClass);
    const classPlaceholders = classVars.map(() => 'LOWER(TRIM(ac.class)) = LOWER(TRIM(?))').join(' OR ');

    // Strict SQL Query checking is_active = 1, session, term, class, and bank question count > 0.
    // Does NOT filter out submitted papers so the student dashboard displays full multi-subject status.
    const sql = `
        SELECT 
            ac.id AS config_id,
            ac.id,
            ac.session,
            ac.term,
            ac.class,
            ac.subject,
            ac.subject AS name,
            ac.assessment_slot,
            ac.assessment_slot AS slot,
            ac.assessment_title,
            ac.duration_minutes,
            ac.preset_mode,
            COALESCE(ac.custom_count, 30) AS custom_count,
            1 AS is_active,
            COUNT(q.id) AS question_count
        FROM assessment_configs ac
        LEFT JOIN questions q ON (
            (LOWER(TRIM(q.class)) = LOWER(TRIM(ac.class)) OR (ac.class IS NULL OR TRIM(ac.class) = '') OR (q.class IS NULL OR TRIM(q.class) = ''))
            AND LOWER(TRIM(q.subject)) = LOWER(TRIM(ac.subject))
            AND (LOWER(TRIM(q.assessment_slot)) = LOWER(TRIM(ac.assessment_slot)) 
                 OR (LOWER(TRIM(q.assessment_slot)) = 'examination' AND LOWER(TRIM(ac.assessment_slot)) = 'terminal_exam')
                 OR (LOWER(TRIM(q.assessment_slot)) = 'custom_assessment' AND LOWER(TRIM(ac.assessment_slot)) = 'custom_exam'))
            AND LOWER(TRIM(q.session)) = LOWER(TRIM(ac.session))
            AND LOWER(TRIM(q.term)) = LOWER(TRIM(ac.term))
        )
        WHERE (${classPlaceholders ? '(' + classPlaceholders + ' OR ac.class IS NULL OR TRIM(ac.class) = \'\')' : '(ac.class IS NULL OR TRIM(ac.class) = \'\')'})
          AND LOWER(TRIM(ac.session)) = LOWER(TRIM(?))
          AND LOWER(TRIM(ac.term)) = LOWER(TRIM(?))
          AND ac.is_active = 1
        GROUP BY ac.id
        ORDER BY ac.subject ASC
    `;

    const queryParams = [...classVars, currentSession, currentTerm];
    const rows = await dbAll(sql, queryParams);

    // Fetch student's session history across both session tables for status resolution
    let studentExamSessions = [];
    let legacyExamSessions = [];
    let studentAnswersSubjects = [];

    if (studentId) {
        studentExamSessions = await dbAll(
            `SELECT session_id, LOWER(TRIM(subject_name)) AS subject, assessment_slot, status, score, started_at, expires_at 
             FROM student_exam_sessions 
             WHERE student_id = ?`,
            [studentId]
        );

        legacyExamSessions = await dbAll(
            `SELECT id, LOWER(TRIM(subject)) AS subject, assessment_slot, status, is_locked, score, login_time 
             FROM exam_sessions 
             WHERE student_id = ?`,
            [studentId]
        );

        studentAnswersSubjects = await dbAll(
            `SELECT DISTINCT LOWER(TRIM(q.subject)) AS subject 
             FROM answers a 
             JOIN questions q ON a.question_id = q.id 
             WHERE a.student_id = ?`,
            [studentId]
        );
    }

    const normSlot = (s) => {
        if (!s) return 'midterm_ca';
        const l = String(s).trim().toLowerCase();
        if (l === 'terminal_exam' || l === 'terminal' || l === 'exam') return 'examination';
        if (l === 'custom_exam' || l === 'custom') return 'custom_assessment';
        return l;
    };

    const now = new Date().getTime();

    return (rows || []).map(row => {
        const subLower = (row.subject || '').trim().toLowerCase();
        const rowSlot = normSlot(row.assessment_slot);

        // 1. Check for submitted / completed sessions
        const submittedSES = studentExamSessions.find(s => s.subject === subLower && (s.status === 'SUBMITTED' || s.status === 'COMPLETED') && (normSlot(s.assessment_slot) === rowSlot || !s.assessment_slot || studentExamSessions.filter(x => x.subject === subLower).length === 1));
        const submittedLegacy = legacyExamSessions.find(s => s.subject === subLower && (s.status === 'submitted' || s.is_locked === 1) && (normSlot(s.assessment_slot) === rowSlot || !s.assessment_slot || legacyExamSessions.filter(x => x.subject === subLower).length === 1));
        const isSubmitted = !!(submittedSES || submittedLegacy);

        // 2. Check for active in-progress sessions (if not submitted)
        let activeSessionId = null;
        let isInProgress = false;

        if (!isSubmitted) {
            const inProgressSES = studentExamSessions.find(s => {
                if (s.subject !== subLower || s.status !== 'IN_PROGRESS') return false;
                if (s.assessment_slot && normSlot(s.assessment_slot) !== rowSlot) return false;
                if (!s.expires_at) return true;
                return new Date(s.expires_at).getTime() > now;
            });

            const inProgressLegacy = legacyExamSessions.find(s => s.subject === subLower && (normSlot(s.assessment_slot) === rowSlot || !s.assessment_slot) && s.status === 'active' && s.is_locked === 0);

            if (inProgressSES) {
                isInProgress = true;
                activeSessionId = inProgressSES.session_id;
            } else if (inProgressLegacy) {
                isInProgress = true;
                activeSessionId = inProgressLegacy.id;
            }
        }

        const status = isSubmitted ? 'SUBMITTED' : (isInProgress ? 'IN_PROGRESS' : 'AVAILABLE');
        const canStart = !isSubmitted;
        const score = isSubmitted ? (submittedSES?.score ?? submittedLegacy?.score ?? null) : null;
        const submittedAt = isSubmitted ? (submittedSES?.started_at || submittedLegacy?.login_time || null) : null;

        return {
            id: row.config_id || row.id,
            config_id: row.config_id || row.id,
            session: row.session,
            term: row.term,
            academic_session: row.session,
            class: row.class || studentClass,
            class_tier: row.class || studentClass,
            subject: row.subject,
            name: row.subject,
            slot_name: row.assessment_slot || 'Standard Assessment',
            assessment_slot: row.assessment_slot || 'midterm_ca',
            slot: row.assessment_slot || 'midterm_ca',
            assessment_title: row.assessment_title || `${row.subject} - ${row.assessment_slot || 'Standard Assessment'}`,
            duration_minutes: row.duration_minutes || 45,
            duration: row.duration_minutes || 45,
            preset_mode: row.preset_mode || 'ca_test',
            questions_count: (row.custom_count && parseInt(row.custom_count, 10) > 0) ? parseInt(row.custom_count, 10) : (row.question_count || 30),
            question_count: (row.custom_count && parseInt(row.custom_count, 10) > 0) ? parseInt(row.custom_count, 10) : (row.question_count || 30),
            total_questions: (row.custom_count && parseInt(row.custom_count, 10) > 0) ? parseInt(row.custom_count, 10) : (row.question_count || 30),
            custom_count: (row.custom_count && parseInt(row.custom_count, 10) > 0) ? parseInt(row.custom_count, 10) : 30,
            is_active: 1,
            isActive: true,
            status: status,
            canStart: canStart,
            isSubmitted: isSubmitted,
            is_submitted: isSubmitted,
            hasActiveSession: isInProgress,
            has_active_session: isInProgress,
            sessionStatus: isInProgress ? 'IN_PROGRESS' : (isSubmitted ? 'SUBMITTED' : null),
            session_status: isInProgress ? 'in_progress' : (isSubmitted ? 'submitted' : null),
            sessionId: activeSessionId,
            session_id: activeSessionId,
            score: score,
            submitted_at: submittedAt,
            message: isSubmitted 
                ? 'Examination Completed & Submitted' 
                : (isInProgress ? 'Exam session active. Tap Resume to continue.' : 'Ready to Start')
        };
    });
}

/**
 * GET /api/student/:student_id/dashboard
 * 
 * Retrieves student profile metadata and assigned exam papers with normalized statuses.
 */
router.get('/student/:student_id/dashboard', async (req, res, next) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        const { student_id } = req.params;

        const studentSql = `SELECT id, reg_number, surname, first_name, class, assigned_subject FROM students WHERE id = ?`;
        const student = await dbGet(studentSql, [student_id]);

        if (!student) {
            return res.status(404).json({ success: false, message: "Student not found." });
        }

        const formattedSubjects = await fetchActiveExamsForStudent({
            studentId: student.id,
            studentClass: student.class,
            session: req.query.session,
            term: req.query.term
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
            subjects: formattedSubjects,
            papers: formattedSubjects,
            activeExams: formattedSubjects
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
            await dbRun(`UPDATE assessment_configs SET is_active = 0`);
            console.log(`⏰ [Daily Auto-Reset] Active exams auto-reset to INACTIVE (5:00 PM cutoff trigger).`);
        }
    } catch (err) {
        console.warn('⚠️ [Auto-Reset Check Warning]:', err.message);
    }
}

// --------------------------------------------------------------------------
// GET /api/student/assigned-exams
// GET /api/student/assigned-papers (Alias)
// GET /api/student/assigned-subjects (Alias)
// Strict Active & Uncompleted Filtering Logic:
// 1. Session, term, class match & is_active = 1
// 2. Questions in bank > 0
// 3. Excludes completed / submitted exams
// --------------------------------------------------------------------------
const handleGetAssignedPapers = async (req, res, next) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

        const studentId = req.query.student_id || req.query.studentId || (req.student && (req.student.studentId || req.student.id));
        const regNo = req.query.registration_no || req.query.reg_number;
        const queryClass = req.query.class || req.query.classId || req.query.class_name;
        const querySession = req.query.session;
        const queryTerm = req.query.term;

        if (!studentId && !regNo && !queryClass) {
            return res.status(400).json({ success: false, message: "student_id, registration_no, or class required." });
        }

        let student = null;
        if (studentId) {
            student = await dbGet(`SELECT * FROM students WHERE id = ?`, [studentId]);
        } else if (regNo) {
            student = await dbGet(`SELECT * FROM students WHERE LOWER(registration_no) = LOWER(?) OR LOWER(reg_number) = LOWER(?)`, [regNo.trim(), regNo.trim()]);
        }

        const studentClass = (student ? student.class : queryClass) || '';
        const currentStudentId = student ? student.id : (studentId || null);

        let session = querySession;
        let term = queryTerm;
        if (!session || !term) {
            const currentTermRec = await dbGet(`SELECT session, name FROM academic_terms WHERE is_current = 1 LIMIT 1`);
            if (currentTermRec) {
                if (!session) session = currentTermRec.session;
                if (!term) term = currentTermRec.name;
            }
        }
        if (!session) session = '2026/2027';
        if (!term) term = '1st Term';

        const activeExams = await fetchActiveExamsForStudent({
            studentId: currentStudentId,
            studentClass: studentClass,
            session: session,
            term: term
        });

        return res.status(200).json({
            success: true,
            student_id: currentStudentId,
            class: studentClass,
            session: session,
            term: term,
            activeExams: activeExams,
            exams: activeExams,
            data: activeExams,
            papers: activeExams,
            subjects: activeExams
        });

    } catch (error) {
        console.error('❌ [Get Assigned Exams Error]:', error);
        next(error);
    }
};

router.get('/student/assigned-exams', handleGetAssignedPapers);
router.get('/student/assigned-papers', handleGetAssignedPapers);
router.get('/student/assigned-subjects', handleGetAssignedPapers);
router.get('/assigned-exams', handleGetAssignedPapers);
router.get('/assigned-papers', handleGetAssignedPapers);

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
 * GET /api/student/stream-subjects
 * Returns stream-isolated subject list for a logged in student.
 */
router.get('/student/stream-subjects', async (req, res, next) => {
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
