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
// 1. GET /api/exam/questions/:subject
// Fetch randomized test paper (max 50 questions) excluding `correct_answer`
// --------------------------------------------------------------------------
router.get('/questions/:subject', async (req, res, next) => {
    try {
        const { subject } = req.params;

        if (!subject) {
            return res.status(400).json({
                success: false,
                message: "Subject parameter is required."
            });
        }

        // Query questions without exposing correct_answer to client side
        const fetchQuestionsSql = `
            SELECT id, subject, question_text, option_a, option_b, option_c, option_d
            FROM questions
            WHERE LOWER(subject) = LOWER(?)
            ORDER BY RANDOM()
            LIMIT 50;
        `;

        const questions = await dbAll(fetchQuestionsSql, [subject.trim()]);

        return res.status(200).json({
            success: true,
            subject: subject.toLowerCase(),
            count: questions.length,
            questions: questions
        });

    } catch (error) {
        console.error('❌ [Get Questions Error]:', error);
        next(error);
    }
});

// --------------------------------------------------------------------------
// 2. POST /api/exam/autosave
// Idempotent background save of a student's selected answer choice
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

        // Check if answer record already exists for this student & question
        const checkAnswerSql = `SELECT id FROM answers WHERE student_id = ? AND question_id = ?`;
        const existingAnswer = await dbGet(checkAnswerSql, [student_id, question_id]);

        if (existingAnswer) {
            // Update existing answer
            const updateSql = `
                UPDATE answers 
                SET selected_option = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE student_id = ? AND question_id = ?
            `;
            await dbRun(updateSql, [normalizedOption, student_id, question_id]);
        } else {
            // Insert new answer
            const insertSql = `
                INSERT INTO answers (student_id, question_id, selected_option, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `;
            await dbRun(insertSql, [student_id, question_id, normalizedOption]);
        }

        // Silent success response for real-time background saving
        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('❌ [Autosave Error]:', error);
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
            SELECT id FROM exam_sessions 
            WHERE student_id = ? AND LOWER(subject) = LOWER(?) AND status = 'active' AND is_locked = 0
            ORDER BY id DESC LIMIT 1
        `;
        const activeSession = await dbGet(checkActiveSql, [student_id, normalizedSubject]);

        let sessionId;
        if (activeSession) {
            sessionId = activeSession.id;
            await dbRun(
                `UPDATE exam_sessions SET workstation_ip = ?, login_time = CURRENT_TIMESTAMP WHERE id = ?`,
                [clientIp, sessionId]
            );
        } else {
            const insertResult = await dbRun(
                `INSERT INTO exam_sessions (student_id, workstation_ip, login_time, status, is_locked, subject) VALUES (?, ?, CURRENT_TIMESTAMP, 'active', 0, ?)`,
                [student_id, clientIp, normalizedSubject]
            );
            sessionId = insertResult.lastID;
        }

        return res.status(200).json({
            success: true,
            session_id: sessionId,
            subject: normalizedSubject
        });

    } catch (error) {
        console.error('❌ [Start Session Error]:', error);
        next(error);
    }
});

module.exports = router;
