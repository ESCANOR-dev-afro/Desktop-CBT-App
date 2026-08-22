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

/**
 * Sanitizes questions delivered to student clients by stripping correct answer keys.
 * Ensures CBT exam integrity by keeping answer keys strictly server-side.
 */
function sanitizeQuestionsForClient(questionsList) {
    if (!Array.isArray(questionsList)) return [];
    return questionsList.map(q => {
        if (!q) return null;
        const copy = { ...q };
        delete copy.correct_answer;
        delete copy.correct_option;
        delete copy.answer;
        delete copy.key;
        return copy;
    }).filter(Boolean);
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
 * Resolves configured exam duration, assessment mode, delivery question count,
 * and shuffling flags for a specific class, subject, session, term, and assessment slot combination.
 */
async function resolveExamConfig(studentClass, subject, session = '2026/2027', term = '1st Term', slot = 'midterm_ca') {
    try {
        let normSlot = slot ? String(slot).trim().toLowerCase() : 'midterm_ca';
        if (normSlot === 'terminal_exam' || normSlot === 'terminal' || normSlot === 'exam') normSlot = 'examination';
        if (normSlot === 'custom_exam' || normSlot === 'custom') normSlot = 'custom_assessment';

        let sql = `
            SELECT duration_minutes, is_active, preset_mode, custom_count, shuffle_questions, shuffle_options
            FROM assessment_configs
            WHERE session = ? AND term = ? AND (LOWER(assessment_slot) = LOWER(?) OR (LOWER(assessment_slot) = 'terminal_exam' AND ? = 'examination') OR (LOWER(assessment_slot) = 'custom_exam' AND ? = 'custom_assessment')) AND LOWER(subject) = LOWER(?)
        `;
        const params = [session, term, normSlot, normSlot, normSlot, subject.trim()];
        const classVars = getClassVariations(studentClass);
        if (classVars.length > 0) {
            const placeholders = classVars.map(() => 'LOWER(class) = LOWER(?)').join(' OR ');
            sql += ` AND (${placeholders} OR class IS NULL)`;
            params.push(...classVars);
        }
        sql += ` ORDER BY class DESC LIMIT 1`;

        const row = await dbGet(sql, params);
        if (row) {
            const preset = String(row.preset_mode || 'ca_test').toLowerCase();
            let count = parseInt(row.custom_count, 10);
            if (isNaN(count) || count <= 0) {
                count = (preset === 'terminal_exam' || preset === 'examination') ? 50 : 30;
            }
            return {
                duration_minutes: row.duration_minutes || 45,
                is_active: row.is_active === 1,
                assessment_mode: (preset === 'terminal_exam' || preset === 'examination') ? 'EXAM' : (preset === 'custom' ? 'CUSTOM' : 'TEST'),
                preset_mode: preset,
                delivery_count: count,
                shuffle_questions: row.shuffle_questions !== 0,
                shuffle_options: row.shuffle_options !== 0
            };
        }
    } catch (err) {
        console.warn('Notice resolving assessment config:', err.message);
    }

    // Fallback to legacy exam_configs table
    try {
        let legacySql = `
            SELECT duration_minutes, is_active, assessment_mode, delivery_count, shuffle_questions, shuffle_options
            FROM exam_configs
            WHERE LOWER(subject) = LOWER(?)
        `;
        const legacyParams = [subject.trim()];
        const classVars = getClassVariations(studentClass);
        if (classVars.length > 0) {
            const placeholders = classVars.map(() => 'LOWER(class) = LOWER(?)').join(' OR ');
            legacySql += ` AND (${placeholders} OR class IS NULL)`;
            legacyParams.push(...classVars);
        }
        legacySql += ` ORDER BY class DESC LIMIT 1`;

        const legacyRow = await dbGet(legacySql, legacyParams);
        if (legacyRow) {
            const mode = (legacyRow.assessment_mode && ['TEST', 'EXAM', 'CUSTOM'].includes(String(legacyRow.assessment_mode).toUpperCase()))
                ? String(legacyRow.assessment_mode).toUpperCase()
                : 'TEST';
            
            let count = parseInt(legacyRow.delivery_count, 10);
            if (isNaN(count) || count <= 0) {
                count = mode === 'EXAM' ? 50 : 30;
            }

            return {
                duration_minutes: legacyRow.duration_minutes || 45,
                is_active: legacyRow.is_active !== undefined ? legacyRow.is_active === 1 : true,
                assessment_mode: mode,
                preset_mode: mode === 'EXAM' ? 'terminal_exam' : 'ca_test',
                delivery_count: count,
                shuffle_questions: legacyRow.shuffle_questions !== undefined ? legacyRow.shuffle_questions !== 0 : true,
                shuffle_options: legacyRow.shuffle_options !== undefined ? legacyRow.shuffle_options !== 0 : true
            };
        }
    } catch (legacyErr) {}

    return {
        duration_minutes: 45,
        is_active: true,
        assessment_mode: 'TEST',
        preset_mode: 'ca_test',
        delivery_count: 30,
        shuffle_questions: true,
        shuffle_options: true
    };
}

async function getExamDurationMinutes(studentClass, subject, session, term, slot) {
    const cfg = await resolveExamConfig(studentClass, subject, session, term, slot);
    return cfg.duration_minutes;
}

/**
 * Checks whether an exam paper is active for a class, subject, session, term, and assessment slot scope.
 */
async function isExamActive(studentClass, subject, session, term, slot) {
    const cfg = await resolveExamConfig(studentClass, subject, session, term, slot);
    return cfg.is_active;
}

// --------------------------------------------------------------------------
// GET /api/exam/available-assessments
// Fetch all active assessment slots for candidate's class under current session & term
// --------------------------------------------------------------------------
router.get('/available-assessments', async (req, res, next) => {
    try {
        const studentId = req.query.student_id || req.query.studentId;
        let studentClass = req.query.class ? String(req.query.class).trim() : null;

        if (!studentClass && studentId) {
            const studentRec = await dbGet(`SELECT class FROM students WHERE id = ?`, [studentId]);
            if (studentRec && studentRec.class) {
                studentClass = studentRec.class.trim();
            }
        }

        const currentSession = req.query.session || '2026/2027';
        const currentTerm = req.query.term || '1st Term';

        const slots = [
            { slot: 'welcome_test', title: 'Welcome / Platform Mock Test' },
            { slot: 'midterm_ca', title: 'Mid-Term CA Test' },
            { slot: 'terminal_exam', title: 'Terminal Examination' },
            { slot: 'custom_exam', title: 'Custom Assessment Paper' }
        ];

        // Fetch active configs from DB
        const activeConfigs = await dbAll(
            `SELECT * FROM assessment_configs WHERE session = ? AND term = ? AND (LOWER(class) = LOWER(?) OR class IS NULL) AND is_active = 1`,
            [currentSession, currentTerm, studentClass || '']
        );

        return res.status(200).json({
            success: true,
            session: currentSession,
            term: currentTerm,
            class: studentClass,
            slots: slots,
            activeAssessments: activeConfigs
        });
    } catch (err) {
        next(err);
    }
});

// --------------------------------------------------------------------------
// 1. GET /api/exam/questions/:subject
// Fetch randomized test paper tailored per student session with persistence & pool sampling
// --------------------------------------------------------------------------
router.get('/questions/:subject', async (req, res, next) => {
    try {
        const { subject } = req.params;
        const studentId = req.query.student_id || req.query.studentId || null;
        const sessionIdParam = req.query.session_id || req.query.sessionId || null;
        const classScope = req.query.class ? req.query.class.trim() : null;
        const academicSession = req.query.session || '2026/2027';
        const academicTerm = req.query.term || '1st Term';
        const assessmentSlot = (req.query.assessment_slot || req.query.assessmentSlot || req.query.slot) ? String(req.query.assessment_slot || req.query.assessmentSlot || req.query.slot).trim() : 'midterm_ca';

        if (!subject) {
            return res.status(400).json({
                success: false,
                message: "Subject parameter is required."
            });
        }

        const normalizedSubject = subject.trim();

        // Look up student class dynamically if student_id is provided
        let targetClass = classScope;
        if (!targetClass && studentId) {
            const studentRec = await dbGet(`SELECT class FROM students WHERE id = ?`, [studentId]);
            if (studentRec && studentRec.class) {
                targetClass = studentRec.class.trim();
            }
        }

        const examConfig = await resolveExamConfig(targetClass, normalizedSubject, academicSession, academicTerm, assessmentSlot);

        // Check if candidate already submitted this specific subject & slot
        const targetStudentIdCheck = studentId || req.query.student_id;
        if (targetStudentIdCheck) {
            const submittedSession = await dbGet(
                `SELECT session_id as id FROM student_exam_sessions WHERE student_id = ? AND LOWER(subject_name) = LOWER(?) AND status = 'SUBMITTED'
                 UNION
                 SELECT id FROM exam_sessions WHERE student_id = ? AND LOWER(subject) = LOWER(?) AND (assessment_slot IS NULL OR assessment_slot = ?) AND (status = 'submitted' OR is_locked = 1)`,
                [targetStudentIdCheck, normalizedSubject.toLowerCase(), targetStudentIdCheck, normalizedSubject.toLowerCase(), assessmentSlot]
            );

            if (submittedSession) {
                return res.status(403).json({
                    success: false,
                    message: `You have already submitted the examination for this specific subject (${normalizedSubject}) [${assessmentSlot}].`
                });
            }
        }

        // Check if subject is active for this class scope
        if (!examConfig.is_active) {
            return res.status(403).json({
                success: false,
                message: `The examination paper for "${normalizedSubject}" [${assessmentSlot}] is currently inactive / disabled by administrator.`,
                questions: []
            });
        }

        // 1. Check if an active exam session exists for this student
        let activeSession = null;
        if (sessionIdParam) {
            activeSession = await dbGet(
                `SELECT id, student_id, question_order, option_mapping, status, is_locked, duration_minutes FROM exam_sessions WHERE id = ? AND status = 'active' AND is_locked = 0`,
                [sessionIdParam]
            );
        } else if (studentId) {
            activeSession = await dbGet(
                `SELECT id, student_id, question_order, option_mapping, status, is_locked, duration_minutes FROM exam_sessions 
                 WHERE student_id = ? AND LOWER(subject) = LOWER(?) AND (assessment_slot IS NULL OR assessment_slot = ?) AND status = 'active' AND is_locked = 0
                 ORDER BY id DESC LIMIT 1`,
                [studentId, normalizedSubject, assessmentSlot]
            );
        }

        const targetStudentId = studentId || (activeSession ? activeSession.student_id : null);
        if (!targetClass && targetStudentId) {
            const studentRec = await dbGet(`SELECT class FROM students WHERE id = ?`, [targetStudentId]);
            if (studentRec && studentRec.class) {
                targetClass = studentRec.class.trim();
            }
        }

        const durationMinutes = activeSession?.duration_minutes || examConfig.duration_minutes;

        // 2. If active session has a persisted question_order, fetch and preserve that exact order
        if (activeSession && activeSession.question_order) {
            try {
                const questionIds = JSON.parse(activeSession.question_order);
                let optionMap = {};
                if (activeSession.option_mapping) {
                    try { optionMap = JSON.parse(activeSession.option_mapping); } catch (_) {}
                }

                if (Array.isArray(questionIds) && questionIds.length > 0) {
                    const placeholders = questionIds.map(() => '?').join(',');
                    const fetchSql = `
                        SELECT id, class, subject, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, diagram_image_url
                        FROM questions
                        WHERE id IN (${placeholders})
                    `;
                    const rows = await dbAll(fetchSql, questionIds);
                    const rowMap = new Map(rows.map(q => [q.id, q]));

                    const orderedQuestions = questionIds
                        .map(id => {
                            const q = rowMap.get(id);
                            if (!q) return null;
                            const copy = { ...q };
                            const qIdStr = String(q.id);
                            if (optionMap[qIdStr] && Array.isArray(optionMap[qIdStr].shuffledOptions)) {
                                const opts = optionMap[qIdStr].shuffledOptions;
                                copy.option_a = opts[0] || copy.option_a;
                                copy.option_b = opts[1] || copy.option_b;
                                copy.option_c = opts[2] || copy.option_c;
                                copy.option_d = opts[3] || copy.option_d;
                            }
                            return copy;
                        })
                        .filter(Boolean);

                    if (orderedQuestions.length > 0) {
                        return res.status(200).json({
                            success: true,
                            subject: normalizedSubject.toLowerCase(),
                            session_id: activeSession.id,
                            student_id: activeSession.student_id,
                            is_persisted: true,
                            assessment_mode: examConfig.assessment_mode,
                            preset_mode: examConfig.preset_mode,
                            delivery_count: examConfig.delivery_count,
                            duration_minutes: durationMinutes,
                            duration_seconds: durationMinutes * 60,
                            count: orderedQuestions.length,
                            questions: sanitizeQuestionsForClient(orderedQuestions)
                        });
                    }
                }
            } catch (jsonErr) {
                console.warn('⚠️ [Question Order JSON Parse Error]:', jsonErr.message);
            }
        }

        // 3. Query eligible question pool matching session, term, assessment slot, subject and class
        const classVars = getClassVariations(targetClass);
        let classFilter = '';
        let classParams = [];
        if (classVars.length > 0) {
            const placeholders = classVars.map(() => 'LOWER(class) = LOWER(?)').join(' OR ');
            classFilter = ` AND (${placeholders} OR class IS NULL OR TRIM(class) = '')`;
            classParams = [...classVars];
        }

        const fetchQuestionsSql = `
            SELECT id, session, term, class, subject, assessment_slot, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, diagram_image_url
            FROM questions
            WHERE LOWER(subject) = LOWER(?)
              ${classFilter}
              AND session = ?
              AND term = ?
              AND (LOWER(assessment_slot) = LOWER(?) OR (LOWER(assessment_slot) = 'terminal_exam' AND ? = 'examination') OR (LOWER(assessment_slot) = 'custom_exam' AND ? = 'custom_assessment'))
            ORDER BY id ASC
        `;
        const params = [normalizedSubject, ...classParams, academicSession, academicTerm, assessmentSlot, assessmentSlot, assessmentSlot];

        let rawQuestions = await dbAll(fetchQuestionsSql, params);

        if (rawQuestions.length === 0) {
            return res.status(200).json({
                success: true,
                subject: normalizedSubject.toLowerCase(),
                assessment_mode: examConfig.assessment_mode,
                preset_mode: examConfig.preset_mode,
                delivery_count: examConfig.delivery_count,
                duration_minutes: durationMinutes,
                duration_seconds: durationMinutes * 60,
                count: 0,
                questions: []
            });
        }

        // 4. Question Shuffling & Pool Sampling
        let sampledQuestions = examConfig.shuffle_questions ? fisherYatesShuffle(rawQuestions) : [...rawQuestions];
        const targetN = Math.min(examConfig.delivery_count, sampledQuestions.length);
        sampledQuestions = sampledQuestions.slice(0, targetN);

        // 5. Option Shuffling per Question & Option Key Mapping
        const optionMappingObj = {};

        sampledQuestions.forEach(q => {
            const rawOpts = [
                { key: 'A', text: q.option_a },
                { key: 'B', text: q.option_b },
                { key: 'C', text: q.option_c },
                { key: 'D', text: q.option_d }
            ];

            const shuffledOpts = examConfig.shuffle_options ? fisherYatesShuffle(rawOpts) : rawOpts;
            q.option_a = shuffledOpts[0].text;
            q.option_b = shuffledOpts[1].text;
            q.option_c = shuffledOpts[2].text;
            q.option_d = shuffledOpts[3].text;

            // Determine which shuffled position holds the original correct answer
            const correctIdx = shuffledOpts.findIndex(o => o.key.toUpperCase() === String(q.correct_answer).toUpperCase());
            const newCorrectKey = ['A', 'B', 'C', 'D'][correctIdx >= 0 ? correctIdx : 0];

            optionMappingObj[String(q.id)] = {
                shuffledOptions: [q.option_a, q.option_b, q.option_c, q.option_d],
                correctKey: newCorrectKey
            };
        });

        const shuffledIds = sampledQuestions.map(q => q.id);

        // 6. Securely persist sampled question order & option mapping to active student session
        if (activeSession) {
            await dbRun(
                `UPDATE exam_sessions SET question_order = ?, option_mapping = ?, duration_minutes = ? WHERE id = ?`,
                [JSON.stringify(shuffledIds), JSON.stringify(optionMappingObj), durationMinutes, activeSession.id]
            );
        }

        return res.status(200).json({
            success: true,
            subject: normalizedSubject.toLowerCase(),
            session_id: activeSession ? activeSession.id : null,
            is_persisted: Boolean(activeSession),
            assessment_mode: examConfig.assessment_mode,
            delivery_count: targetN,
            duration_minutes: durationMinutes,
            duration_seconds: durationMinutes * 60,
            count: sampledQuestions.length,
            questions: sanitizeQuestionsForClient(sampledQuestions)
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
// 3. POST /api/exam/submit & POST /api/student/exam/submit
// Final submission, automatic grading with option_mapping evaluation, and session locking
// --------------------------------------------------------------------------
const handleExamSubmit = async (req, res, next) => {
    try {
        const student_id = req.body.student_id || req.body.studentId;
        const session_id = req.body.session_id || req.body.sessionId;
        const user_answers = req.body.user_answers || req.body.answers || {};

        if (!student_id || !session_id) {
            return res.status(400).json({
                success: false,
                message: "student_id and session_id are required."
            });
        }

        // Fetch target exam session & option_mapping
        const sessionSql = `
            SELECT id, status, is_locked, option_mapping, subject
            FROM exam_sessions 
            WHERE id = ? AND student_id = ?
        `;
        let session = await dbGet(sessionSql, [session_id, student_id]);

        if (!session) {
            const sesBackup = await dbGet(`SELECT session_id as id, status, subject_name as subject FROM student_exam_sessions WHERE session_id = ? AND student_id = ?`, [session_id, student_id]);
            if (sesBackup) {
                session = { id: sesBackup.id, status: sesBackup.status === 'SUBMITTED' ? 'submitted' : 'active', is_locked: sesBackup.status === 'SUBMITTED' ? 1 : 0, subject: sesBackup.subject };
            }
        }

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

        let optionMap = {};
        if (session.option_mapping) {
            try { optionMap = JSON.parse(session.option_mapping); } catch (_) {}
        }

        // Save any submitted answers to answers table
        if (user_answers && typeof user_answers === 'object') {
            for (const [qId, optKey] of Object.entries(user_answers)) {
                if (optKey) {
                    await dbRun(
                        `INSERT INTO answers (student_id, question_id, selected_option, session_id, updated_at)
                         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                         ON CONFLICT(student_id, question_id) DO UPDATE SET
                         selected_option = excluded.selected_option,
                         updated_at = CURRENT_TIMESTAMP`,
                        [student_id, parseInt(qId), String(optKey).trim().toUpperCase(), session_id]
                    );
                }
            }
        }

        // Fetch student's answers & join with questions for auto-grading
        const gradingSql = `
            SELECT a.question_id, a.selected_option, q.correct_answer 
            FROM answers a 
            JOIN questions q ON a.question_id = q.id 
            WHERE a.student_id = ?
        `;
        const studentAnswers = await dbAll(gradingSql, [student_id]);

        let calculatedScore = 0;
        studentAnswers.forEach(record => {
            const qIdStr = String(record.question_id);
            const expectedKey = (optionMap[qIdStr] && optionMap[qIdStr].correctKey)
                ? optionMap[qIdStr].correctKey
                : record.correct_answer;

            if (record.selected_option && expectedKey && 
                record.selected_option.trim().toUpperCase() === expectedKey.trim().toUpperCase()) {
                calculatedScore += 1;
            }
        });

        let targetSubjectName = req.body.subject || req.body.subject_name || (session && session.subject) || null;
        if (!targetSubjectName) {
            const sesRec = await dbGet(`SELECT subject_name FROM student_exam_sessions WHERE session_id = ?`, [session_id]);
            if (sesRec && sesRec.subject_name) {
                targetSubjectName = sesRec.subject_name;
            }
        }
        if (!targetSubjectName && user_answers && Object.keys(user_answers).length > 0) {
            const firstQId = Object.keys(user_answers)[0];
            const qRec = await dbGet(`SELECT subject FROM questions WHERE id = ?`, [firstQId]);
            if (qRec && qRec.subject) {
                targetSubjectName = qRec.subject;
            }
        }

        // Update session status = 'SUBMITTED' in both tables
        await dbRun(
            `UPDATE student_exam_sessions SET status = 'SUBMITTED', score = ?, selected_answers_json = ?, subject_name = COALESCE(?, subject_name) WHERE session_id = ? AND student_id = ?`,
            [calculatedScore, JSON.stringify(user_answers || {}), targetSubjectName, session_id, student_id]
        );

        const lockSessionSql = `
            UPDATE exam_sessions 
            SET status = 'submitted', is_locked = 1, score = ?, subject = COALESCE(?, subject)
            WHERE id = ? AND student_id = ?
        `;
        await dbRun(lockSessionSql, [calculatedScore, targetSubjectName, session_id, student_id]);

        console.log(`🏁 [Exam Submitted] Student ID ${student_id} (Session #${session_id}) completed exam. Score recorded: ${calculatedScore}`);

        return res.status(200).json({
            success: true,
            message: "Exam submitted successfully.",
            score: calculatedScore
        });

    } catch (error) {
        console.error('❌ [Exam Submit Error]:', error);
        next(error);
    }
};

router.post('/submit', handleExamSubmit);
router.post('/student/exam/submit', handleExamSubmit);

// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// 4. GET /api/student/active-session
// Returns active unexpired exam session for auto-resume upon login / refresh
// --------------------------------------------------------------------------
router.get('/student/active-session', async (req, res, next) => {
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

        const activeSes = await dbGet(
            `SELECT * FROM student_exam_sessions WHERE student_id = ? AND status = 'IN_PROGRESS' ORDER BY session_id DESC LIMIT 1`,
            [student.id]
        );

        if (!activeSes) {
            return res.status(200).json({
                success: true,
                hasActiveSession: false,
                has_active_session: false,
                session: null,
                active_session: null
            });
        }

        const now = new Date();
        const expiresAt = new Date(activeSes.expires_at || (new Date(activeSes.started_at).getTime() + (activeSes.duration_minutes || 45) * 60 * 1000));

        if (expiresAt.getTime() <= now.getTime()) {
            await dbRun(`UPDATE student_exam_sessions SET status = 'EXPIRED' WHERE session_id = ?`, [activeSes.session_id]);
            return res.status(200).json({
                success: true,
                hasActiveSession: false,
                has_active_session: false,
                session: null,
                active_session: null
            });
        }

        const remainingSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
        let deliveredQuestions = [];
        try { deliveredQuestions = JSON.parse(activeSes.delivered_questions_json || '[]'); } catch (_) {}

        let selectedAnswers = {};
        try { selectedAnswers = JSON.parse(activeSes.selected_answers_json || '{}'); } catch (_) {}

        const subjRec = await dbGet(`SELECT id FROM subjects WHERE LOWER(name) = LOWER(?)`, [activeSes.subject_name]);

        const sessionData = {
            id: activeSes.session_id,
            session_id: activeSes.session_id,
            student_id: student.id,
            subject_id: activeSes.subject_id || (subjRec ? subjRec.id : null),
            subject_name: activeSes.subject_name,
            subject: activeSes.subject_name,
            class: activeSes.class_name || student.class,
            status: 'IN_PROGRESS',
            current_question_index: activeSes.current_question_index || 0,
            started_at: activeSes.started_at,
            expires_at: activeSes.expires_at,
            duration_minutes: activeSes.duration_minutes || 45,
            duration_seconds: remainingSeconds,
            delivered_questions: deliveredQuestions,
            selected_answers: selectedAnswers
        };

        return res.status(200).json({
            success: true,
            hasActiveSession: true,
            has_active_session: true,
            session: sessionData,
            active_session: sessionData
        });
    } catch (error) {
        console.error('❌ [Active Session Check Error]:', error);
        next(error);
    }
});

// --------------------------------------------------------------------------
// 5. POST /api/student/exam/save-progress
// Real-time debounced answer saving for crash recovery & power loss protection
// --------------------------------------------------------------------------
router.post('/student/exam/save-progress', async (req, res, next) => {
    try {
        const { session_id, student_id, selected_answers, question_id, selected_option, current_question_index } = req.body;

        if (!session_id || !student_id) {
            return res.status(400).json({ success: false, message: "session_id and student_id are required." });
        }

        const activeSes = await dbGet(
            `SELECT * FROM student_exam_sessions WHERE session_id = ? AND student_id = ?`,
            [session_id, student_id]
        );

        if (!activeSes) {
            return res.status(404).json({ success: false, message: "Active exam session not found." });
        }

        if (activeSes.status === 'SUBMITTED') {
            return res.status(403).json({ success: false, message: "Exam session has already been submitted." });
        }

        let updatedAnswers = {};
        try { updatedAnswers = JSON.parse(activeSes.selected_answers_json || '{}'); } catch (_) {}

        if (selected_answers && typeof selected_answers === 'object') {
            Object.assign(updatedAnswers, selected_answers);
        } else if (question_id && selected_option) {
            updatedAnswers[String(question_id)] = String(selected_option).trim().toUpperCase();
        }

        await dbRun(
            `UPDATE student_exam_sessions SET selected_answers_json = ? WHERE session_id = ?`,
            [JSON.stringify(updatedAnswers), session_id]
        );

        if (current_question_index !== undefined && current_question_index !== null) {
            const idx = parseInt(current_question_index, 10);
            if (!isNaN(idx) && idx >= 0) {
                await dbRun(
                    `UPDATE student_exam_sessions SET current_question_index = ? WHERE session_id = ?`,
                    [idx, session_id]
                );
            }
        }

        if (question_id && selected_option) {
            await dbRun(
                `INSERT INTO answers (student_id, question_id, selected_option, session_id, updated_at)
                 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(student_id, question_id) DO UPDATE SET
                 selected_option = excluded.selected_option,
                 updated_at = CURRENT_TIMESTAMP`,
                [student_id, parseInt(question_id), String(selected_option).trim().toUpperCase(), session_id]
            );
        }

        return res.status(200).json({ success: true, timestamp: new Date().toISOString() });
    } catch (error) {
        console.error('❌ [Save Progress Error]:', error);
        next(error);
    }
});

// --------------------------------------------------------------------------
// 6. POST /api/student/exam/start & POST /api/exam/start-session
// Initializes or resumes an active exam session with pool sampling
// --------------------------------------------------------------------------
const handleStartExamSession = async (req, res, next) => {
    try {
        const { student_id, subject, class: reqClass, workstation_ip } = req.body;

        if (!student_id || !subject) {
            return res.status(400).json({
                success: false,
                message: "student_id and subject are required."
            });
        }

        const clientIp = workstation_ip || req.ip || '127.0.0.1';
        const normalizedSubject = String(subject).trim();

        // Look up student record
        const studentRec = await dbGet(`SELECT id, class FROM students WHERE id = ?`, [student_id]);
        const studentClass = reqClass || (studentRec ? studentRec.class : null);

        const examConfig = await resolveExamConfig(studentClass, normalizedSubject);

        // Check if subject is active for this class scope
        if (!examConfig.is_active) {
            return res.status(403).json({
                success: false,
                message: "This subject examination is currently inactive for your class."
            });
        }

        // Check if student already submitted this specific subject
        const checkSubmittedSql = `
            SELECT session_id FROM student_exam_sessions 
            WHERE student_id = ? AND LOWER(subject_name) = LOWER(?) AND status = 'SUBMITTED'
        `;
        const alreadySubmitted = await dbGet(checkSubmittedSql, [student_id, normalizedSubject]);

        if (alreadySubmitted) {
            return res.status(403).json({
                success: false,
                message: `You have already completed the exam paper for ${normalizedSubject}.`
            });
        }

        // Check for an ongoing active unexpired session in student_exam_sessions
        const checkActiveSesSql = `
            SELECT * FROM student_exam_sessions 
            WHERE student_id = ? AND LOWER(subject_name) = LOWER(?) AND status = 'IN_PROGRESS'
            ORDER BY session_id DESC LIMIT 1
        `;
        const activeSes = await dbGet(checkActiveSesSql, [student_id, normalizedSubject]);

        const now = new Date();
        const durationMinutes = examConfig.duration_minutes || 45;

        if (activeSes) {
            const expiresAt = new Date(activeSes.expires_at || (new Date(activeSes.started_at).getTime() + durationMinutes * 60 * 1000));

            // Check if expired
            if (expiresAt.getTime() <= now.getTime()) {
                await dbRun(`UPDATE student_exam_sessions SET status = 'EXPIRED' WHERE session_id = ?`, [activeSes.session_id]);
                return res.status(403).json({
                    success: false,
                    message: `Your examination session for ${normalizedSubject} has expired.`
                });
            }

            const remainingSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
            let deliveredQuestions = [];
            try { deliveredQuestions = JSON.parse(activeSes.delivered_questions_json || '[]'); } catch (_) {}

            let selectedAnswers = {};
            try { selectedAnswers = JSON.parse(activeSes.selected_answers_json || '{}'); } catch (_) {}

            return res.status(200).json({
                success: true,
                is_resumed: true,
                session_id: activeSes.session_id,
                subject: normalizedSubject,
                class: studentClass,
                assessment_mode: examConfig.assessment_mode,
                delivery_count: deliveredQuestions.length,
                duration_minutes: durationMinutes,
                duration_seconds: remainingSeconds,
                expires_at: activeSes.expires_at,
                current_question_index: activeSes.current_question_index || 0,
                questions: deliveredQuestions,
                question_order: deliveredQuestions.map(q => q.id),
                selected_answers: selectedAnswers
            });
        }

        // If no active session, sample questions
        let querySql = `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_answer, diagram_image_url FROM questions WHERE LOWER(subject) = LOWER(?)`;
        const queryParams = [normalizedSubject];

        if (studentClass) {
            const baseTier = studentClass.replace(/\s+(Science|Art|Commercial|Gold|Silver|Diamond)$/i, '').trim();
            querySql += ` AND (class IS NULL OR TRIM(class) = '' OR LOWER(class) = LOWER(?) OR LOWER(class) = LOWER(?))`;
            queryParams.push(studentClass, baseTier);
        }

        let rawQuestions = await dbAll(querySql, queryParams);
        if (rawQuestions.length === 0 && studentClass) {
            rawQuestions = await dbAll(
                `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_answer, diagram_image_url FROM questions WHERE LOWER(subject) = LOWER(?)`,
                [normalizedSubject]
            );
        }

        let sampled = examConfig.shuffle_questions ? fisherYatesShuffle(rawQuestions) : [...rawQuestions];
        const targetN = Math.min(examConfig.delivery_count, sampled.length);
        sampled = sampled.slice(0, targetN);

        const optionMappingObj = {};
        const deliveredQuestions = sampled.map(q => {
            const rawOpts = [
                { key: 'A', text: q.option_a },
                { key: 'B', text: q.option_b },
                { key: 'C', text: q.option_c },
                { key: 'D', text: q.option_d }
            ];

            const shuffledOpts = examConfig.shuffle_options ? fisherYatesShuffle(rawOpts) : rawOpts;
            const correctIdx = shuffledOpts.findIndex(o => o.key.toUpperCase() === String(q.correct_answer).toUpperCase());
            const newCorrectKey = ['A', 'B', 'C', 'D'][correctIdx >= 0 ? correctIdx : 0];

            optionMappingObj[String(q.id)] = {
                shuffledOptions: [shuffledOpts[0].text, shuffledOpts[1].text, shuffledOpts[2].text, shuffledOpts[3].text],
                correctKey: newCorrectKey
            };

            return {
                id: q.id,
                question_text: q.question_text,
                option_a: shuffledOpts[0].text,
                option_b: shuffledOpts[1].text,
                option_c: shuffledOpts[2].text,
                option_d: shuffledOpts[3].text,
                diagram_filename: q.diagram_image_url || null,
                diagram_url: q.diagram_image_url || null
            };
        });

        const startedAtStr = now.toISOString();
        const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
        const expiresAtStr = expiresAt.toISOString();

        const insertSes = await dbRun(
            `INSERT INTO student_exam_sessions (student_id, subject_name, class_name, status, started_at, expires_at, duration_minutes, delivered_questions_json, selected_answers_json, workstation_ip) VALUES (?, ?, ?, 'IN_PROGRESS', ?, ?, ?, ?, '{}', ?)`,
            [student_id, normalizedSubject, studentClass, startedAtStr, expiresAtStr, durationMinutes, JSON.stringify(deliveredQuestions), clientIp]
        );
        const newSessionId = insertSes.lastID;

        // Also insert into legacy exam_sessions for backward compatibility
        await dbRun(
            `INSERT INTO exam_sessions (student_id, workstation_ip, login_time, status, is_locked, subject, duration_minutes, question_order, option_mapping) VALUES (?, ?, ?, 'active', 0, ?, ?, ?, ?)`,
            [student_id, clientIp, startedAtStr, normalizedSubject, durationMinutes, JSON.stringify(deliveredQuestions.map(q => q.id)), JSON.stringify(optionMappingObj)]
        );

        return res.status(200).json({
            success: true,
            is_resumed: false,
            session_id: newSessionId,
            subject: normalizedSubject,
            class: studentClass,
            assessment_mode: examConfig.assessment_mode,
            delivery_count: deliveredQuestions.length,
            duration_minutes: durationMinutes,
            duration_seconds: durationMinutes * 60,
            questions: deliveredQuestions,
            question_order: deliveredQuestions.map(q => q.id),
            selected_answers: {}
        });

    } catch (error) {
        console.error('❌ [Start Session Error]:', error);
        next(error);
    }
};

router.post('/start-session', handleStartExamSession);
router.post('/student/exam/start', handleStartExamSession);

module.exports = router;
module.exports.handleStartExamSession = handleStartExamSession;

