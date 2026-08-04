/**
 * adminRoutes.js
 * 
 * Admin Dashboard Management Routes for Desktop CBT Platform.
 * Provides endpoints for overview analytics, question bank management,
 * student roster management, and live result tracking/export.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const mammoth = require('mammoth');
const ExcelJS = require('exceljs');
const db = require('./database');

// Configure Multer memory storage for uploaded Word documents
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 } // 15MB max file size
});

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

// --------------------------------------------------------------------------
// 1. GET /api/admin/overview
// Returns summary statistics for admin overview cards
// --------------------------------------------------------------------------
router.get('/overview', async (req, res, next) => {
    try {
        const studentCount = await dbGet(`SELECT COUNT(*) AS total FROM students`);
        const activeExams = await dbGet(`SELECT COUNT(*) AS total FROM exam_sessions WHERE status = 'active' AND is_locked = 0`);
        const submittedExams = await dbGet(`SELECT COUNT(*) AS total FROM exam_sessions WHERE status = 'submitted'`);
        const totalQuestions = await dbGet(`SELECT COUNT(*) AS total FROM questions`);

        return res.status(200).json({
            success: true,
            stats: {
                total_students: studentCount.total || 0,
                active_exams: activeExams.total || 0,
                submitted_exams: submittedExams.total || 0,
                total_questions: totalQuestions.total || 0
            }
        });
    } catch (error) {
        console.error('❌ [Admin Overview Error]:', error);
        next(error);
    }
});

// --------------------------------------------------------------------------
// 2. GET /api/admin/students
// Fetch list of registered students
// --------------------------------------------------------------------------
router.get('/students', async (req, res, next) => {
    try {
        const students = await dbAll(`SELECT * FROM students ORDER BY id DESC`);
        return res.status(200).json({
            success: true,
            students: students
        });
    } catch (error) {
        console.error('❌ [Admin Students Error]:', error);
        next(error);
    }
});

// --------------------------------------------------------------------------
// POST /api/admin/students
// Add a single student or batch of students
// --------------------------------------------------------------------------
router.post('/students', async (req, res, next) => {
    try {
        const { reg_number, surname, class: studentClass, assigned_subject } = req.body;

        if (!reg_number || !surname || !studentClass || !assigned_subject) {
            return res.status(400).json({
                success: false,
                message: "reg_number, surname, class, and assigned_subject are required."
            });
        }

        const formattedSurname = String(surname).trim().toUpperCase();
        const insertSql = `
            INSERT INTO students (reg_number, surname, class, assigned_subject)
            VALUES (?, ?, ?, ?)
        `;
        const result = await dbRun(insertSql, [String(reg_number).trim(), formattedSurname, studentClass.trim(), assigned_subject.trim()]);

        return res.status(201).json({
            success: true,
            message: "Student added successfully",
            student_id: result.lastID
        });
    } catch (error) {
        if (error.message && error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({
                success: false,
                message: "Registration number already exists."
            });
        }
        console.error('❌ [Add Student Error]:', error);
        next(error);
    }
});

// --------------------------------------------------------------------------
// 3. GET /api/admin/questions
// Fetch question bank questions
// --------------------------------------------------------------------------
router.get('/questions', async (req, res, next) => {
    try {
        const subject = req.query.subject;
        let sql = `SELECT * FROM questions`;
        let params = [];

        if (subject && subject !== 'all') {
            sql += ` WHERE LOWER(subject) = LOWER(?)`;
            params.push(subject);
        }

        sql += ` ORDER BY id DESC`;
        const questions = await dbAll(sql, params);

        return res.status(200).json({
            success: true,
            questions: questions
        });
    } catch (error) {
        console.error('❌ [Admin Questions Error]:', error);
        next(error);
    }
});

// --------------------------------------------------------------------------
// 4. GET /api/admin/results
// Fetch all student results for dashboard with computed/saved scores
// --------------------------------------------------------------------------
router.get('/results', async (req, res, next) => {
    try {
        const sql = `
            SELECT 
                es.id AS session_id,
                es.student_id,
                s.reg_number,
                s.surname,
                s.class,
                s.assigned_subject,
                es.workstation_ip,
                es.login_time,
                es.status,
                es.is_locked,
                es.score
            FROM exam_sessions es
            JOIN students s ON es.student_id = s.id
            ORDER BY es.id DESC
        `;
        const results = await dbAll(sql);

        return res.status(200).json({
            success: true,
            count: results.length,
            results: results
        });
    } catch (error) {
        console.error('❌ [Admin Results Error]:', error);
        next(error);
    }
});

// --------------------------------------------------------------------------
// 5. GET /api/admin/export-excel
// Generate and stream MS Excel (.xlsx) spreadsheet of all student results
// --------------------------------------------------------------------------
router.get('/export-excel', async (req, res, next) => {
    try {
        const sql = `
            SELECT 
                es.id AS session_id,
                es.student_id,
                s.reg_number,
                s.surname,
                s.class,
                s.assigned_subject,
                es.workstation_ip,
                es.login_time,
                es.status,
                es.score
            FROM exam_sessions es
            JOIN students s ON es.student_id = s.id
            ORDER BY es.id DESC
        `;
        const results = await dbAll(sql);

        // Create ExcelJS Workbook and Worksheet
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'School CBT Admin Control Center';
        workbook.created = new Date();

        const worksheet = workbook.addWorksheet('CBT Exam Results');

        // Define Columns
        worksheet.columns = [
            { header: 'Session ID', key: 'session_id', width: 12 },
            { header: 'Student Name', key: 'surname', width: 22 },
            { header: 'Reg Number', key: 'reg_number', width: 16 },
            { header: 'Class', key: 'class', width: 10 },
            { header: 'Assigned Subject', key: 'assigned_subject', width: 22 },
            { header: 'Workstation IP', key: 'workstation_ip', width: 18 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Score (/50)', key: 'score', width: 15 },
            { header: 'Submission Time', key: 'login_time', width: 26 }
        ];

        // Format & Style Header Row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '1E293B' } // Dark Slate
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 28;

        // Populate Data Rows
        results.forEach(row => {
            const addedRow = worksheet.addRow({
                session_id: row.session_id,
                surname: row.surname,
                reg_number: row.reg_number,
                class: row.class,
                assigned_subject: row.assigned_subject ? row.assigned_subject.toUpperCase() : '',
                workstation_ip: row.workstation_ip,
                status: row.status ? row.status.toUpperCase() : 'ACTIVE',
                score: row.score !== null ? row.score : 'In Progress',
                login_time: new Date(row.login_time).toLocaleString()
            });

            addedRow.alignment = { vertical: 'middle', horizontal: 'left' };
        });

        // Set response HTTP headers for file download streaming
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="cbt_exam_results.xlsx"'
        );

        // Stream workbook directly back to Express response
        await workbook.xlsx.write(res);
        res.end();

        console.log('📊 [Excel Export] Generated and streamed cbt_exam_results.xlsx to admin client.');

    } catch (error) {
        console.error('❌ [Excel Export Error]:', error);
        next(error);
    }
});

/**
 * Parses raw text extracted from a Word document (.docx) to extract
 * questions, options A-D, and correct answers.
 */
function parseDocxText(rawText, defaultSubject = 'mathematics') {
    const lines = rawText
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);

    const questions = [];
    let currentSubject = defaultSubject;
    let currentQuestion = null;

    lines.forEach(line => {
        // Detect Subject header line e.g., "Subject: Mathematics"
        const subjectMatch = line.match(/^(?:SUBJECT|Subject)[:\s]+(.+)/i);
        if (subjectMatch) {
            currentSubject = subjectMatch[1].trim();
            return;
        }

        // Detect Answer line e.g., "Answer: A" or "ANS: B" or "Correct Answer: C"
        const answerMatch = line.match(/^(?:ANSWER|Answer|ANS|Ans|Correct Answer|Correct)[:\s\-]*([A-Da-d])/i);
        if (answerMatch && currentQuestion) {
            currentQuestion.correct_answer = answerMatch[1].toUpperCase();
            return;
        }

        // Detect Option A
        const optAMatch = line.match(/^[A|a][\.\)]\s*(.+)/);
        if (optAMatch && currentQuestion) {
            currentQuestion.option_a = optAMatch[1].trim();
            return;
        }

        // Detect Option B
        const optBMatch = line.match(/^[B|b][\.\)]\s*(.+)/);
        if (optBMatch && currentQuestion) {
            currentQuestion.option_b = optBMatch[1].trim();
            return;
        }

        // Detect Option C
        const optCMatch = line.match(/^[C|c][\.\)]\s*(.+)/);
        if (optCMatch && currentQuestion) {
            currentQuestion.option_c = optCMatch[1].trim();
            return;
        }

        // Detect Option D
        const optDMatch = line.match(/^[D|d][\.\)]\s*(.+)/);
        if (optDMatch && currentQuestion) {
            currentQuestion.option_d = optDMatch[1].trim();
            return;
        }

        // Detect Question line start e.g., "1. What is..." or "1) What is..."
        const qNumMatch = line.match(/^\d+[\.\)]\s*(.+)/);
        if (qNumMatch || (!line.match(/^[A-Da-d][\.\)]/) && !answerMatch)) {
            // Save previously accumulated question if valid
            if (currentQuestion && isQuestionValid(currentQuestion)) {
                questions.push({ ...currentQuestion });
            }

            const text = qNumMatch ? qNumMatch[1].trim() : line;
            currentQuestion = {
                subject: currentSubject,
                question_text: text,
                option_a: '',
                option_b: '',
                option_c: '',
                option_d: '',
                correct_answer: 'A' // default fallback if omitted in document
            };
        }
    });

    // Save final question if valid
    if (currentQuestion && isQuestionValid(currentQuestion)) {
        questions.push({ ...currentQuestion });
    }

    return questions;
}

function isQuestionValid(q) {
    return Boolean(q && q.question_text && q.option_a && q.option_b && q.option_c && q.option_d);
}

// --------------------------------------------------------------------------
// 5. POST /api/admin/upload-questions
// Upload and parse Word document (.docx) into the SQLite questions table
// --------------------------------------------------------------------------
router.post('/upload-questions', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No Word document (.docx) file uploaded."
            });
        }

        const defaultSubject = req.body.subject || 'mathematics';

        // Extract raw text from uploaded .docx buffer using Mammoth
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        const rawText = result.value || '';

        // Parse extracted text into structured question objects
        const parsedQuestions = parseDocxText(rawText, defaultSubject);

        if (parsedQuestions.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Could not parse any valid questions from the uploaded Word document. Ensure standard formatting (Question text, Options A-D, Answer: X)."
            });
        }

        // Insert parsed questions into SQLite database
        const insertSql = `
            INSERT INTO questions (subject, question_text, option_a, option_b, option_c, option_d, correct_answer)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        let insertedCount = 0;
        for (const q of parsedQuestions) {
            await dbRun(insertSql, [
                q.subject,
                q.question_text,
                q.option_a,
                q.option_b,
                q.option_c,
                q.option_d,
                q.correct_answer
            ]);
            insertedCount++;
        }

        console.log(`📄 [Word Doc Upload] Successfully parsed and inserted ${insertedCount} questions into SQLite question bank.`);

        return res.status(200).json({
            success: true,
            message: "Questions uploaded and parsed successfully",
            count: insertedCount
        });

    } catch (error) {
        console.error('❌ [Docx Upload Error]:', error);
        next(error);
    }
});

module.exports = router;
