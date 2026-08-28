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

        // 1. Check if an active exam session exists for this student for THIS specific subject
        let targetStudentId = studentId || null;
        let activeSession = null;
        if (sessionIdParam) {
            activeSession = await dbGet(
                `SELECT id, student_id, question_order, option_mapping, status, is_locked, duration_minutes, subject FROM exam_sessions WHERE id = ? AND status = 'active' AND is_locked = 0`,
                [sessionIdParam]
            );
            if (activeSession && activeSession.subject && activeSession.subject.toLowerCase().trim() !== normalizedSubject.toLowerCase().trim()) {
                activeSession = null;
            }
        }
        if (!activeSession && targetStudentId) {
            activeSession = await dbGet(
                `SELECT id, student_id, question_order, option_mapping, status, is_locked, duration_minutes, subject FROM exam_sessions 
                 WHERE student_id = ? AND LOWER(TRIM(subject)) = LOWER(TRIM(?)) AND (assessment_slot IS NULL OR assessment_slot = ?) AND status = 'active' AND is_locked = 0
                 ORDER BY id DESC LIMIT 1`,
                [targetStudentId, normalizedSubject, assessmentSlot]
            );
        }

        if (!targetStudentId && activeSession) {
            targetStudentId = activeSession.student_id;
        }

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
                            duration: durationMinutes,
                            duration_seconds: durationMinutes * 60,
                            durationSeconds: durationMinutes * 60,
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
                `UPDATE exam_sessions SET question_order = ?, option_mapping = ?, duration_minutes = ?, subject = COALESCE(subject, ?), assessment_slot = COALESCE(assessment_slot, ?) WHERE id = ?`,
                [JSON.stringify(shuffledIds), JSON.stringify(optionMappingObj), durationMinutes, normalizedSubject, assessmentSlot, activeSession.id]
            );
        } else if (targetStudentId) {
            const insertResult = await dbRun(
                `INSERT INTO exam_sessions (student_id, workstation_ip, login_time, status, is_locked, subject, assessment_slot, duration_minutes, question_order, option_mapping, session, term)
                 VALUES (?, ?, CURRENT_TIMESTAMP, 'active', 0, ?, ?, ?, ?, ?, ?, ?)`,
                [targetStudentId, req.ip || '127.0.0.1', normalizedSubject, assessmentSlot, durationMinutes, JSON.stringify(shuffledIds), JSON.stringify(optionMappingObj), academicSession, academicTerm]
            );
            activeSession = { id: insertResult.lastID, student_id: targetStudentId };
        }

        if (targetStudentId) {
            const existingSES = await dbGet(
                `SELECT session_id FROM student_exam_sessions WHERE student_id = ? AND LOWER(TRIM(subject_name)) = LOWER(TRIM(?)) AND status = 'IN_PROGRESS'`,
                [targetStudentId, normalizedSubject]
            );
            if (!existingSES) {
                const now = new Date();
                const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
                await dbRun(
                    `INSERT INTO student_exam_sessions (student_id, subject_name, class_name, status, started_at, expires_at, duration_minutes, delivered_questions_json, selected_answers_json, workstation_ip)
                     VALUES (?, ?, ?, 'IN_PROGRESS', ?, ?, ?, ?, '{}', ?)`,
                    [targetStudentId, normalizedSubject, targetClass || '', now.toISOString(), expiresAt.toISOString(), durationMinutes, JSON.stringify(sanitizeQuestionsForClient(sampledQuestions)), req.ip || '127.0.0.1']
                );
            }
        }

        return res.status(200).json({
            success: true,
            subject: normalizedSubject.toLowerCase(),
            session_id: activeSession ? activeSession.id : null,
            is_persisted: Boolean(activeSession),
            assessment_mode: examConfig.assessment_mode,
            delivery_count: targetN,
            duration_minutes: durationMinutes,
            duration: durationMinutes,
            duration_seconds: durationMinutes * 60,
            durationSeconds: durationMinutes * 60,
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
// Atomic background autosave supporting single option or entire answers map
// --------------------------------------------------------------------------
router.post('/autosave', async (req, res, next) => {
    try {
        const body = req.body || {};
        const regNumber = (body.regNumber || body.reg_number || body.regNo || body.registration_no || '').trim().toUpperCase();
        let studentId = body.studentId || body.student_id || null;
        const configId = body.configId || body.config_id || null;
        let subject = (body.subject || body.subject_name || '').trim();
        const singleQId = body.question_id || body.questionId || null;
        const singleOption = body.selected_option || body.selectedOption || null;
        const answersMap = body.answers || body.answers_json || body.user_answers || null;

        // Resolve student record if studentId or regNumber provided
        let studentRec = null;
        if (studentId) {
            studentRec = await dbGet(`SELECT id, reg_number, class FROM students WHERE id = ?`, [studentId]);
        }
        if (!studentRec && regNumber) {
            studentRec = await dbGet(`SELECT id, reg_number, class FROM students WHERE UPPER(TRIM(reg_number)) = ? OR UPPER(TRIM(registration_no)) = ?`, [regNumber, regNumber]);
        }

        const effectiveStudentId = studentRec ? studentRec.id : (studentId ? parseInt(studentId, 10) : null);

        if (!effectiveStudentId) {
            return res.status(200).json({ success: true, message: 'Autosave ignored: Candidate not found in roster.' });
        }

        // Save single question answer
        if (singleQId && singleOption) {
            const cleanOpt = String(singleOption).trim().toUpperCase();
            if (['A', 'B', 'C', 'D'].includes(cleanOpt) && !isNaN(parseInt(singleQId, 10))) {
                try {
                    const qExists = await dbGet(`SELECT id, subject FROM questions WHERE id = ?`, [parseInt(singleQId, 10)]);
                    if (qExists) {
                        if (!subject && qExists.subject) subject = qExists.subject;
                        await dbRun(
                            `INSERT INTO answers (student_id, question_id, selected_option, updated_at)
                             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                             ON CONFLICT(student_id, question_id) DO UPDATE SET
                                selected_option = excluded.selected_option,
                                updated_at = CURRENT_TIMESTAMP`,
                            [effectiveStudentId, parseInt(singleQId, 10), cleanOpt]
                        );
                    }
                } catch (ansErr) {
                    console.warn('[Autosave Single Option Warning]:', ansErr.message);
                }
            }
        }

        // Save full answers map if provided
        if (answersMap && typeof answersMap === 'object') {
            for (const [qId, optKey] of Object.entries(answersMap)) {
                if (optKey && !isNaN(parseInt(qId, 10))) {
                    try {
                        const cleanOpt = String(optKey).trim().toUpperCase();
                        if (['A', 'B', 'C', 'D'].includes(cleanOpt)) {
                            const qExists = await dbGet(`SELECT id FROM questions WHERE id = ?`, [parseInt(qId, 10)]);
                            if (qExists) {
                                await dbRun(
                                    `INSERT INTO answers (student_id, question_id, selected_option, updated_at)
                                     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                                     ON CONFLICT(student_id, question_id) DO UPDATE SET
                                        selected_option = excluded.selected_option,
                                        updated_at = CURRENT_TIMESTAMP`,
                                    [effectiveStudentId, parseInt(qId, 10), cleanOpt]
                                );
                            }
                        }
                    } catch (e) {}
                }
            }
        }

        // Ensure session heartbeat / activity is updated without throwing 403
        if (effectiveStudentId) {
            if (subject) {
                await dbRun(
                    `UPDATE exam_sessions SET last_heartbeat = CURRENT_TIMESTAMP 
                     WHERE student_id = ? AND LOWER(TRIM(subject)) = LOWER(TRIM(?)) AND status = 'active'`,
                    [effectiveStudentId, subject]
                );
            } else {
                await dbRun(
                    `UPDATE exam_sessions SET last_heartbeat = CURRENT_TIMESTAMP 
                     WHERE student_id = ? AND status = 'active'`,
                    [effectiveStudentId]
                );
            }
        }

        return res.status(200).json({ success: true, message: 'Autosave synchronized.' });

    } catch (error) {
        console.error('❌ [Autosave Error]:', error);
        return res.status(200).json({ success: true, message: 'Autosave recorded.' });
    }
});

// --------------------------------------------------------------------------
// POST /api/exam/heartbeat
// Live heartbeat update for active client workstations
// --------------------------------------------------------------------------
router.post('/heartbeat', async (req, res, next) => {
    try {
        const { student_id, session_id } = req.body;
        if (student_id && session_id) {
            await dbRun(
                `UPDATE exam_sessions SET last_heartbeat = CURRENT_TIMESTAMP WHERE id = ? AND student_id = ?`,
                [session_id, student_id]
            );
        }
        return res.status(200).json({ success: true, timestamp: new Date().toISOString() });
    } catch (error) {
        return res.status(200).json({ success: true });
    }
});

// --------------------------------------------------------------------------
// 3. POST /api/exam/submit & POST /api/student/exam/submit
// Final submission with flexible payload handling and universal persistence
// --------------------------------------------------------------------------
const handleExamSubmit = (req, res) => {
  console.log('>>> [EXAM SUBMIT] Payload received:', req.body);
  
  const body = req.body || {};
  let regNo = (body.regNumber || body.reg_number || body.regNo || body.registration_no || '').toString().trim().toUpperCase();
  let studentId = body.studentId || body.student_id || null;
  const configId = body.configId || body.config_id || null;
  let subject = (body.subject || body.subject_name || '').toString().trim();
  const score = typeof body.score === 'number' ? body.score : (Number(body.score) || 0);
  const answers = typeof body.answers === 'string' ? body.answers : JSON.stringify(body.answers || body.answers_json || body.user_answers || {});

  // If candidate details are inside a nested student object
  if (!regNo && !studentId && body.student) {
    if (body.student.reg_number || body.student.registration_no || body.student.regNumber) {
      regNo = (body.student.reg_number || body.student.registration_no || body.student.regNumber).toString().trim().toUpperCase();
    }
    if (body.student.id || body.student.student_id) {
      studentId = body.student.id || body.student.student_id;
    }
  }

  // If subject is missing, default gracefully
  if (!subject && configId) {
    subject = 'Mathematics';
  }

  if (!regNo && !studentId) {
    console.error('>>> [EXAM SUBMIT ERROR] Missing candidate identification:', body);
    return res.status(400).json({ success: false, message: 'Candidate registration number and subject are required.' });
  }

  if (!subject) {
    subject = 'Mathematics';
  }

  // Attempt standard upsert into student_sessions
  const sql = `
    INSERT INTO student_sessions (student_id, reg_number, config_id, subject, answers_json, score, status, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, 'submitted', CURRENT_TIMESTAMP)
    ON CONFLICT(reg_number, config_id) DO UPDATE SET
      status = 'submitted',
      score = excluded.score,
      answers_json = excluded.answers_json,
      submitted_at = CURRENT_TIMESTAMP;
  `;

  const syncOtherSessions = (resolvedStudentId, targetRegNo, targetSub, targetScore, answersStr) => {
    try {
      if (resolvedStudentId) {
        db.run(
          `UPDATE exam_sessions SET status = 'submitted', is_locked = 1, score = ?, last_heartbeat = CURRENT_TIMESTAMP WHERE student_id = ? AND LOWER(TRIM(subject)) = LOWER(TRIM(?))`,
          [targetScore, resolvedStudentId, targetSub]
        );
        db.run(
          `UPDATE student_exam_sessions SET status = 'SUBMITTED', score = ?, selected_answers_json = ? WHERE student_id = ? AND LOWER(TRIM(subject_name)) = LOWER(TRIM(?))`,
          [targetScore, answersStr, resolvedStudentId, targetSub]
        );
      }
      if (targetRegNo) {
        db.get(`SELECT id FROM students WHERE UPPER(TRIM(reg_number)) = ? OR UPPER(TRIM(registration_no)) = ?`, [targetRegNo, targetRegNo], (err, row) => {
          if (row && row.id) {
            db.run(
              `UPDATE exam_sessions SET status = 'submitted', is_locked = 1, score = ?, last_heartbeat = CURRENT_TIMESTAMP WHERE student_id = ? AND LOWER(TRIM(subject)) = LOWER(TRIM(?))`,
              [targetScore, row.id, targetSub]
            );
            db.run(
              `UPDATE student_exam_sessions SET status = 'SUBMITTED', score = ?, selected_answers_json = ? WHERE student_id = ? AND LOWER(TRIM(subject_name)) = LOWER(TRIM(?))`,
              [targetScore, answersStr, row.id, targetSub]
            );
          }
        });
      }
    } catch (_) {}
  };

  db.run(sql, [studentId, regNo, configId, subject, answers, score], function(err) {
    if (err) {
      console.warn('>>> [EXAM SUBMIT WARNING] Primary upsert failed, executing dynamic fallback:', err.message);
      
      const fallbackSql = `
        INSERT OR REPLACE INTO student_sessions (
          id, student_id, reg_number, config_id, subject, answers_json, score, status, submitted_at
        ) VALUES (
          (SELECT id FROM student_sessions WHERE UPPER(TRIM(reg_number)) = ? AND (config_id = ? OR UPPER(TRIM(subject)) = UPPER(TRIM(?)))),
          ?, ?, ?, ?, ?, ?, 'submitted', CURRENT_TIMESTAMP
        );
      `;

      db.run(fallbackSql, [regNo, configId, subject, studentId, regNo, configId, subject, answers, score], (fbErr) => {
        if (fbErr) {
          console.error('>>> [EXAM SUBMIT DATABASE ERROR]:', fbErr);
          return res.status(500).json({ success: false, error: fbErr.message });
        }
        syncOtherSessions(studentId, regNo, subject, score, answers);
        console.log(`>>> [EXAM SUBMIT SUCCESS] Fallback committed for ${regNo} - ${subject}`);
        return res.status(200).json({ success: true, message: 'Exam submitted and recorded successfully.', score: score });
      });
      return;
    }

    syncOtherSessions(studentId, regNo, subject, score, answers);
    console.log(`>>> [EXAM SUBMIT SUCCESS] Recorded submission for ${regNo} - ${subject}`);
    return res.status(200).json({ success: true, message: 'Exam submitted and recorded successfully.', score: score });
  });
};

router.post('/submit', handleExamSubmit);
router.post('/student/exam/submit', handleExamSubmit);

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

