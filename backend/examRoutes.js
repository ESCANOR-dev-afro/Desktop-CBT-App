/**
 * examRoutes.js
 * 
 * Exam Logic Routes for Desktop CBT Platform.
 * Handles question paper retrieval, background choice autosaving,
 * auto-grading, and exam session locking upon submission.
 */

const express = require('express');
const router = express.Router();
const db = require('./database');

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
 * Utility helper to run SQL SELECT queries returning a single row as a Promise.
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
 * Utility helper to run SQL write queries (INSERT, UPDATE, DELETE) as a Promise.
 */
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

// --------------------------------------------------------------------------
/**
 * Fisher-Yates Shuffle Algorithm
 * Produces an unbiased random permutation of an array.
 */
function fisherYatesShuffle(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// --------------------------------------------------------------------------
// 1. GET /api/exam/questions/:subject
/**
 * Resolves configured exam duration in minutes for a specific class and subject combination.
 * Checks exam_configs -> subjects table -> default fallback (45 minutes).
 */
async function getExamDurationMinutes(studentClass, subject) {
    try {
        const normSub = String(subject || '').trim();
        if (studentClass) {
            const classCfg = await dbGet(
                `SELECT duration_minutes FROM exam_configs WHERE LOWER(class) = LOWER(?) AND LOWER(subject) = LOWER(?)`,
                [studentClass.trim(), normSub]
            );
            if (classCfg && classCfg.duration_minutes) return classCfg.duration_minutes;

            const baseTier = studentClass.replace(/\s+(Science|Art|Commercial|Gold|Silver|Diamond)$/i, '').trim();
            const tierCfg = await dbGet(
                `SELECT duration_minutes FROM exam_configs WHERE LOWER(class) = LOWER(?) AND LOWER(subject) = LOWER(?)`,
                [baseTier, normSub]
            );
            if (tierCfg && tierCfg.duration_minutes) return tierCfg.duration_minutes;
        }

        const generalCfg = await dbGet(
            `SELECT duration_minutes FROM exam_configs WHERE (class IS NULL OR TRIM(class) = '') AND LOWER(subject) = LOWER(?)`,
            [normSub]
        );
        if (generalCfg && generalCfg.duration_minutes) return generalCfg.duration_minutes;

        const subRec = await dbGet(
            `SELECT duration_minutes FROM subjects WHERE LOWER(name) = LOWER(?)`,
            [normSub]
        );
        if (subRec && subRec.duration_minutes) return subRec.duration_minutes;

        return 45;
    } catch (e) {
        return 45;
    }
}

/**
 * Resolves active status for a specific class and subject combination.
 * Checks exam_configs -> subjects table -> default (1/Active).
 */
async function isExamActive(studentClass, subject) {
    try {
        const normSub = String(subject || '').trim();
        if (studentClass) {
            const classCfg = await dbGet(
                `SELECT is_active FROM exam_configs WHERE LOWER(class) = LOWER(?) AND LOWER(subject) = LOWER(?)`,
                [studentClass.trim(), normSub]
            );
            if (classCfg && classCfg.is_active !== undefined && classCfg.is_active !== null) {
                return classCfg.is_active === 1;
            }

            const baseTier = studentClass.replace(/\s+(Science|Art|Commercial|Gold|Silver|Diamond)$/i, '').trim();
            const tierCfg = await dbGet(
                `SELECT is_active FROM exam_configs WHERE LOWER(class) = LOWER(?) AND LOWER(subject) = LOWER(?)`,
                [baseTier, normSub]
            );
            if (tierCfg && tierCfg.is_active !== undefined && tierCfg.is_active !== null) {
                return tierCfg.is_active === 1;
            }
        }

        const generalCfg = await dbGet(
            `SELECT is_active FROM exam_configs WHERE (class IS NULL OR TRIM(class) = '') AND LOWER(subject) = LOWER(?)`,
            [normSub]
        );
        if (generalCfg && generalCfg.is_active !== undefined && generalCfg.is_active !== null) {
            return generalCfg.is_active === 1;
        }

        const subRec = await dbGet(
            `SELECT is_active FROM subjects WHERE LOWER(name) = LOWER(?)`,
            [normSub]
        );
        if (subRec && subRec.is_active !== undefined && subRec.is_active !== null) {
            return subRec.is_active === 1;
        }

        return true;
    } catch (e) {
        return true;
    }
}

// --------------------------------------------------------------------------
// 1. GET /api/exam/questions/:subject
// Fetch randomized test paper tailored per student session with persistence
// --------------------------------------------------------------------------
router.get('/questions/:subject', async (req, res, next) => {
    try {
        const { subject } = req.params;
        const studentId = req.query.student_id || req.query.studentId || null;
        const sessionIdParam = req.query.session_id || req.query.sessionId || null;
        const classScope = req.query.class ? req.query.class.trim() : null;

        if (!subject) {
            return res.status(400).json({
                success: false,
                message: "Subject parameter is required."
            });
        }

        const normalizedSubject = subject.trim();

        // 3. Look up student class dynamically if student_id is provided
        let targetClass = classScope;
        if (!targetClass && studentId) {
            const studentRec = await dbGet(`SELECT class FROM students WHERE id = ?`, [studentId]);
            if (studentRec && studentRec.class) {
                targetClass = studentRec.class.trim();
            }
        }

        // Check if subject is active for this class scope
        const active = await isExamActive(targetClass, normalizedSubject);
        if (!active) {
            return res.status(403).json({
                success: false,
                message: `The examination paper for "${normalizedSubject}" is currently inactive / disabled by administrator.`,
                questions: []
            });
        }

        // 1. Check if an active exam session exists for this student
        let activeSession = null;
        if (sessionIdParam) {
            activeSession = await dbGet(
                `SELECT id, student_id, question_order, status, is_locked, duration_minutes FROM exam_sessions WHERE id = ? AND status = 'active' AND is_locked = 0`,
                [sessionIdParam]
            );
        } else if (studentId) {
            activeSession = await dbGet(
                `SELECT id, student_id, question_order, status, is_locked, duration_minutes FROM exam_sessions 
                 WHERE student_id = ? AND LOWER(subject) = LOWER(?) AND status = 'active' AND is_locked = 0
                 ORDER BY id DESC LIMIT 1`,
                [studentId, normalizedSubject]
            );
        }

        // 3. Look up student class dynamically if student_id is provided
        const targetStudentId = studentId || (activeSession ? activeSession.student_id : null);
        if (!targetClass && targetStudentId) {
            const studentRec = await dbGet(`SELECT class FROM students WHERE id = ?`, [targetStudentId]);
            if (studentRec && studentRec.class) {
                targetClass = studentRec.class.trim();
            }
        }

        const durationMinutes = activeSession?.duration_minutes || (await getExamDurationMinutes(targetClass, normalizedSubject));

        // 2. If active session has a persisted question_order, fetch and preserve that exact order
        if (activeSession && activeSession.question_order) {
            try {
                const questionIds = JSON.parse(activeSession.question_order);
                if (Array.isArray(questionIds) && questionIds.length > 0) {
                    const placeholders = questionIds.map(() => '?').join(',');
                    const fetchSql = `
                        SELECT id, class, subject, question_text, option_a, option_b, option_c, option_d, marks
                        FROM questions
                        WHERE id IN (${placeholders})
                    `;
                    const rows = await dbAll(fetchSql, questionIds);

                    // Re-sort fetched rows to match exact saved question_order sequence
                    const rowMap = new Map(rows.map(q => [q.id, q]));
                    const orderedQuestions = questionIds
                        .map(id => rowMap.get(id))
                        .filter(Boolean);

                    if (orderedQuestions.length > 0) {
                        return res.status(200).json({
                            success: true,
                            subject: normalizedSubject.toLowerCase(),
                            session_id: activeSession.id,
                            student_id: activeSession.student_id,
                            is_persisted: true,
                            duration_minutes: durationMinutes,
                            duration_seconds: durationMinutes * 60,
                            count: orderedQuestions.length,
                            questions: orderedQuestions
                        });
                    }
                }
            } catch (jsonErr) {
                console.warn('⚠️ [Question Order JSON Parse Error]:', jsonErr.message);
            }
        }

        // 4. Query eligible question pool matching subject and class
        let fetchQuestionsSql = `
            SELECT id, class, subject, question_text, option_a, option_b, option_c, option_d, marks
            FROM questions
            WHERE LOWER(subject) = LOWER(?)
        `;
        const params = [normalizedSubject];
        if (targetClass) {
            const baseTier = targetClass.replace(/\s+(Science|Art|Commercial|Gold|Silver|Diamond)$/i, '').trim();
            fetchQuestionsSql += ` AND (class IS NULL OR TRIM(class) = '' OR LOWER(class) = LOWER(?) OR LOWER(class) = LOWER(?))`;
            params.push(targetClass, baseTier);
        }

        let rawQuestions = await dbAll(fetchQuestionsSql, params);

        // Fallback if class filter yielded no questions: load general subject question pool
        if (rawQuestions.length === 0 && targetClass) {
            rawQuestions = await dbAll(
                `SELECT id, class, subject, question_text, option_a, option_b, option_c, option_d, marks FROM questions WHERE LOWER(subject) = LOWER(?)`,
                [normalizedSubject]
            );
        }

        if (rawQuestions.length === 0) {
            return res.status(200).json({
                success: true,
                subject: normalizedSubject.toLowerCase(),
                duration_minutes: durationMinutes,
                duration_seconds: durationMinutes * 60,
                count: 0,
                questions: []
            });
        }

        // 5. Perform Fisher-Yates shuffle algorithm and sub-sample top 50 questions
        const shuffledQuestions = fisherYatesShuffle(rawQuestions).slice(0, 50);
        const shuffledIds = shuffledQuestions.map(q => q.id);

        // 6. Securely persist shuffled question order to active student session
        if (activeSession) {
            await dbRun(
                `UPDATE exam_sessions SET question_order = ?, duration_minutes = ? WHERE id = ?`,
                [JSON.stringify(shuffledIds), durationMinutes, activeSession.id]
            );
        }

        return res.status(200).json({
            success: true,
            subject: normalizedSubject.toLowerCase(),
            session_id: activeSession ? activeSession.id : null,
            is_persisted: Boolean(activeSession),
            duration_minutes: durationMinutes,
            duration_seconds: durationMinutes * 60,
            count: shuffledQuestions.length,
            questions: shuffledQuestions
        });

    } catch (error) {
        console.error('❌ [Get Questions Error]:', error);
        next(error);
    }
});

// --------------------------------------------------------------------------
// 2. POST /api/exam/autosave
// Atomic UPSERT background save for 90 concurrent lab workstations
// --------------------------------------------------------------------------
router.post('/autosave', async (req, res, next) => {
    try {
        const { student_id, question_id, selected_option } = req.body;

        // Input validation
        if (!student_id || !question_id || !selected_option) {
            return res.status(400).json({
                success: false,
                message: "student_id, question_id, and selected_option are required."
            });
        }

        const normalizedOption = String(selected_option).trim().toUpperCase();
        if (!['A', 'B', 'C', 'D'].includes(normalizedOption)) {
            return res.status(400).json({
                success: false,
                message: "selected_option must be 'A', 'B', 'C', or 'D'."
            });
        }

        // Check if session is active and not locked/submitted
        const activeSessionSql = `
            SELECT id, status, is_locked 
            FROM exam_sessions 
            WHERE student_id = ? AND status = 'active' AND is_locked = 0 
            ORDER BY id DESC LIMIT 1
        `;
        const activeSession = await dbGet(activeSessionSql, [student_id]);

        if (!activeSession) {
            return res.status(403).json({
                success: false,
                message: "Cannot save answer: Exam session is inactive, locked, or already submitted."
            });
        }

        // High-Speed Atomic UPSERT to prevent DB locking under 90 active workstations
        const upsertSql = `
            INSERT INTO answers (student_id, question_id, selected_option, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(student_id, question_id) DO UPDATE SET
                selected_option = excluded.selected_option,
                updated_at = CURRENT_TIMESTAMP
        `;
        await dbRun(upsertSql, [student_id, question_id, normalizedOption]);

        // Silent success response for real-time background saving
        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('❌ [Autosave Error]:', error);
        next(error);
    }
});

// --------------------------------------------------------------------------
// POST /api/exam/heartbeat
// Live heartbeat update for active client workstations (90 concurrent labs)
// --------------------------------------------------------------------------
router.post('/heartbeat', async (req, res, next) => {
    try {
        const { student_id, session_id } = req.body;

        if (!student_id || !session_id) {
            return res.status(400).json({
                success: false,
                message: "student_id and session_id are required."
            });
        }

        const updateHeartbeatSql = `
            UPDATE exam_sessions 
            SET last_heartbeat = CURRENT_TIMESTAMP 
            WHERE id = ? AND student_id = ? AND status = 'active' AND is_locked = 0
        `;
        await dbRun(updateHeartbeatSql, [session_id, student_id]);

        return res.status(200).json({ success: true, timestamp: new Date().toISOString() });
    } catch (error) {
        console.error('❌ [Heartbeat Error]:', error);
        next(error);
    }
});

// --------------------------------------------------------------------------
// 3. POST /api/exam/submit
// Final submission, automatic grading, and session locking
// --------------------------------------------------------------------------
router.post('/submit', async (req, res, next) => {
    try {
        const { student_id, session_id } = req.body;

        if (!student_id || !session_id) {
            return res.status(400).json({
                success: false,
                message: "student_id and session_id are required."
            });
        }

        // Fetch target exam session
        const sessionSql = `
            SELECT id, status, is_locked 
            FROM exam_sessions 
            WHERE id = ? AND student_id = ?
        `;
        const session = await dbGet(sessionSql, [session_id, student_id]);

        if (!session) {
            return res.status(404).json({
                success: false,
                message: "Exam session not found for this student."
            });
        }

        if (session.status === 'submitted' || session.is_locked === 1) {
            return res.status(400).json({
                success: false,
                message: "Exam session has already been submitted or locked."
            });
        }

        // Step a & b: Fetch student's answers & join with correct answers for auto-grading
        const gradingSql = `
            SELECT a.selected_option, q.correct_answer 
            FROM answers a 
            JOIN questions q ON a.question_id = q.id 
            WHERE a.student_id = ?
        `;
        const studentAnswers = await dbAll(gradingSql, [student_id]);

        let calculatedScore = 0;
        studentAnswers.forEach(record => {
            if (record.selected_option && record.correct_answer && 
                record.selected_option.trim().toUpperCase() === record.correct_answer.trim().toUpperCase()) {
                calculatedScore += 1;
            }
        });

        // Step c: Update session status = 'submitted', is_locked = 1, and save score in DB
        const lockSessionSql = `
            UPDATE exam_sessions 
            SET status = 'submitted', is_locked = 1, score = ? 
            WHERE id = ? AND student_id = ?
        `;
        await dbRun(lockSessionSql, [calculatedScore, session_id, student_id]);

        console.log(`🏁 [Exam Submitted] Student ID ${student_id} (Session #${session_id}) completed exam. Score recorded: ${calculatedScore}`);

        // Step d: Return submission confirmation without exposing score to student client
        return res.status(200).json({
            success: true,
            message: "Exam submitted successfully."
        });

    } catch (error) {
        console.error('❌ [Exam Submit Error]:', error);
        next(error);
    }
});

// --------------------------------------------------------------------------
// 4. POST /api/exam/start-session
// Initializes or resumes an active exam session for a specific subject paper
// --------------------------------------------------------------------------
router.post('/start-session', async (req, res, next) => {
    try {
        const { student_id, subject, workstation_ip } = req.body;

        if (!student_id || !subject) {
            return res.status(400).json({
                success: false,
                message: "student_id and subject are required."
            });
        }

        const clientIp = workstation_ip || req.ip || '127.0.0.1';
        const normalizedSubject = String(subject).trim();

        // Look up student class to resolve duration, active status & question pool
        const studentRec = await dbGet(`SELECT class FROM students WHERE id = ?`, [student_id]);
        const studentClass = studentRec ? studentRec.class : null;

        // Check if subject is active for this class scope
        const active = await isExamActive(studentClass, normalizedSubject);
        if (!active) {
            return res.status(403).json({
                success: false,
                message: `The examination paper for "${normalizedSubject}" is currently inactive / disabled by administrator.`
            });
        }

        // Check if student already submitted this specific subject
        const checkSubmittedSql = `
            SELECT id FROM exam_sessions 
            WHERE student_id = ? AND LOWER(subject) = LOWER(?) AND status = 'submitted'
        `;
        const alreadySubmitted = await dbGet(checkSubmittedSql, [student_id, normalizedSubject]);

        if (alreadySubmitted) {
            return res.status(403).json({
                success: false,
                message: `You have already completed the exam paper for ${normalizedSubject}.`
            });
        }

        // Check if active session exists for this subject
        const checkActiveSql = `
            SELECT id, question_order FROM exam_sessions 
            WHERE student_id = ? AND LOWER(subject) = LOWER(?) AND status = 'active' AND is_locked = 0
            ORDER BY id DESC LIMIT 1
        `;
        const activeSession = await dbGet(checkActiveSql, [student_id, normalizedSubject]);

        const durationMinutes = await getExamDurationMinutes(studentClass, normalizedSubject);

        let sessionId;
        let questionOrder = null;

        if (activeSession) {
            sessionId = activeSession.id;
            questionOrder = activeSession.question_order;
            await dbRun(
                `UPDATE exam_sessions SET workstation_ip = ?, login_time = CURRENT_TIMESTAMP, duration_minutes = ? WHERE id = ?`,
                [clientIp, durationMinutes, sessionId]
            );
        } else {
            const insertResult = await dbRun(
                `INSERT INTO exam_sessions (student_id, workstation_ip, login_time, status, is_locked, subject, duration_minutes) VALUES (?, ?, CURRENT_TIMESTAMP, 'active', 0, ?, ?)`,
                [student_id, clientIp, normalizedSubject, durationMinutes]
            );
            sessionId = insertResult.lastID;
        }

        // If question_order is not yet stored, generate shuffled question order and store it
        if (!questionOrder) {
            let querySql = `SELECT id FROM questions WHERE LOWER(subject) = LOWER(?)`;
            const queryParams = [normalizedSubject];

            if (studentClass) {
                const baseTier = studentClass.replace(/\s+(Science|Art|Commercial|Gold|Silver|Diamond)$/i, '').trim();
                querySql += ` AND (class IS NULL OR TRIM(class) = '' OR LOWER(class) = LOWER(?) OR LOWER(class) = LOWER(?))`;
                queryParams.push(studentClass, baseTier);
            }

            let rawQuestions = await dbAll(querySql, queryParams);

            if (rawQuestions.length === 0 && studentClass) {
                rawQuestions = await dbAll(
                    `SELECT id FROM questions WHERE LOWER(subject) = LOWER(?)`,
                    [normalizedSubject]
                );
            }

            if (rawQuestions.length > 0) {
                const shuffled = fisherYatesShuffle(rawQuestions).slice(0, 50);
                const shuffledIds = shuffled.map(q => q.id);
                questionOrder = JSON.stringify(shuffledIds);
                await dbRun(
                    `UPDATE exam_sessions SET question_order = ?, duration_minutes = ? WHERE id = ?`,
                    [questionOrder, durationMinutes, sessionId]
                );
            }
        }

        return res.status(200).json({
            success: true,
            session_id: sessionId,
            subject: normalizedSubject,
            duration_minutes: durationMinutes,
            duration_seconds: durationMinutes * 60,
            question_order: questionOrder ? JSON.parse(questionOrder) : []
        });

    } catch (error) {
        console.error('❌ [Start Session Error]:', error);
        next(error);
    }
});

module.exports = router;
