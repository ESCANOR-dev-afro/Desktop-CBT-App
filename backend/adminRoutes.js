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

// --------------------------------------------------------------------------
// 0. GET /api/admin/subjects
// Returns dynamic list of subjects from questions, student roster & defaults
// --------------------------------------------------------------------------
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

        const questionSubjects = await dbAll(`SELECT DISTINCT subject FROM questions WHERE subject IS NOT NULL AND TRIM(subject) != ''`);
        const studentSubjects = await dbAll(`SELECT DISTINCT assigned_subject AS subject FROM students WHERE assigned_subject IS NOT NULL AND TRIM(assigned_subject) != ''`);

        const subjectMap = new Map();

        defaultSubjects.forEach(s => {
            const norm = normalizeSubjectName(s);
            if (norm) subjectMap.set(norm.toLowerCase(), norm);
        });

        questionSubjects.forEach(row => {
            const norm = normalizeSubjectName(row.subject);
            if (norm) subjectMap.set(norm.toLowerCase(), norm);
        });

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
        console.error('❌ [Admin Subjects Error]:', error);
        next(error);
    }
});

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
// POST /api/admin/students (Alias: /api/admin/candidates)
// Add a single candidate / student to SQLite database
// --------------------------------------------------------------------------
const handleAddCandidate = async (req, res, next) => {
    try {
        const { reg_number, regNo, surname, first_name, firstName, class: studentClass, assigned_subject, assignedSubjects } = req.body;

        const targetRegNo = String(reg_number || regNo || '').trim();
        const targetSurname = String(surname || '').trim().toUpperCase();
        const targetFirstName = String(first_name || firstName || '').trim();
        const targetClass = String(studentClass || 'SS 3').trim();
        
        let targetSubject = assigned_subject;
        if (!targetSubject && Array.isArray(assignedSubjects)) {
            targetSubject = assignedSubjects.join(', ');
        }
        if (!targetSubject) {
            targetSubject = 'Mathematics';
        }

        if (!targetRegNo || !targetSurname) {
            return res.status(400).json({
                success: false,
                message: "Registration number and surname are required."
            });
        }

        const normalizedSubject = normalizeSubjectName(String(targetSubject));

        const insertSql = `
            INSERT INTO students (reg_number, surname, first_name, class, assigned_subject)
            VALUES (?, ?, ?, ?, ?)
        `;
        const result = await dbRun(insertSql, [
            targetRegNo,
            targetSurname,
            targetFirstName,
            targetClass,
            normalizedSubject || 'Mathematics'
        ]);

        return res.status(201).json({
            success: true,
            message: "Student candidate registered successfully in database",
            student_id: result.lastID,
            student: {
                id: result.lastID,
                reg_number: targetRegNo,
                surname: targetSurname,
                first_name: targetFirstName,
                class: targetClass,
                assigned_subject: normalizedSubject || 'Mathematics'
            }
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
};

router.post('/students', handleAddCandidate);
router.post('/candidates', handleAddCandidate);

// --------------------------------------------------------------------------
// 3. GET /api/admin/questions
// Fetch question bank questions filtered by class and/or subject
// --------------------------------------------------------------------------
router.get('/questions', async (req, res, next) => {
    try {
        const { subject, class: classScope } = req.query;
        let sql = `SELECT * FROM questions WHERE 1=1`;
        let params = [];

        if (subject && subject !== 'all') {
            sql += ` AND LOWER(subject) = LOWER(?)`;
            params.push(subject.trim());
        }

        if (classScope && classScope !== 'all') {
            sql += ` AND (class IS NULL OR LOWER(class) = LOWER(?))`;
            params.push(classScope.trim());
        }

        sql += ` ORDER BY id DESC`;
        const questions = await dbAll(sql, params);

        return res.status(200).json({
            success: true,
            count: questions.length,
            questions: questions
        });
    } catch (error) {
        console.error('❌ [Admin Questions Error]:', error);
        next(error);
    }
});

// --------------------------------------------------------------------------
// POST /api/admin/questions
// Add a single question manually to the question bank
// --------------------------------------------------------------------------
router.post('/questions', async (req, res, next) => {
    try {
        const { class: questionClass, subject, question_text, option_a, option_b, option_c, option_d, correct_answer } = req.body;

        if (!subject || !question_text || !option_a || !option_b || !option_c || !option_d || !correct_answer) {
            return res.status(400).json({
                success: false,
                message: "subject, question_text, option_a, option_b, option_c, option_d, and correct_answer are required."
            });
        }

        const normalizedSubject = normalizeSubjectName(subject);
        const normalizedAnswer = String(correct_answer).trim().toUpperCase();

        if (!['A', 'B', 'C', 'D'].includes(normalizedAnswer)) {
            return res.status(400).json({
                success: false,
                message: "correct_answer must be 'A', 'B', 'C', or 'D'."
            });
        }

        const insertSql = `
            INSERT INTO questions (class, subject, question_text, option_a, option_b, option_c, option_d, correct_answer)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const result = await dbRun(insertSql, [
            questionClass ? String(questionClass).trim() : null,
            normalizedSubject,
            String(question_text).trim(),
            String(option_a).trim(),
            String(option_b).trim(),
            String(option_c).trim(),
            String(option_d).trim(),
            normalizedAnswer
        ]);

        return res.status(201).json({
            success: true,
            message: "Question added successfully",
            question_id: result.lastID
        });
    } catch (error) {
        console.error('❌ [Add Question Error]:', error);
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
                assigned_subject: row.assigned_subject ? normalizeSubjectName(row.assigned_subject) : '',
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
function parseDocxText(rawText, defaultSubject = 'Mathematics') {
    const lines = rawText
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);

    const questions = [];
    let currentSubject = normalizeSubjectName(defaultSubject);
    let currentQuestion = null;

    lines.forEach(line => {
        // Detect Subject header line e.g., "Subject: Mathematics"
        const subjectMatch = line.match(/^(?:SUBJECT|Subject)[:\s]+(.+)/i);
        if (subjectMatch) {
            currentSubject = normalizeSubjectName(subjectMatch[1]);
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
// 6. POST /api/admin/upload-questions
// Upload and parse document (.docx, .xlsx, .csv) into SQLite questions table
// Isolated strictly per class and subject
// --------------------------------------------------------------------------
router.post('/upload-questions', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No document file uploaded."
            });
        }

        const rawTargetSubject = req.body.subject || 'Mathematics';
        const targetClass = req.body.class || 'SS 3';
        const normalizedSubject = normalizeSubjectName(rawTargetSubject);
        const fileName = (req.file.originalname || '').toLowerCase();

        let parsedQuestions = [];

        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            // Parse Excel Question File using ExcelJS
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(req.file.buffer);
            const worksheet = workbook.worksheets[0];

            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Skip Header row
                const qText = row.getCell(1).value ? String(row.getCell(1).value).trim() : '';
                const optA = row.getCell(2).value ? String(row.getCell(2).value).trim() : '';
                const optB = row.getCell(3).value ? String(row.getCell(3).value).trim() : '';
                const optC = row.getCell(4).value ? String(row.getCell(4).value).trim() : '';
                const optD = row.getCell(5).value ? String(row.getCell(5).value).trim() : '';
                let ans = row.getCell(6).value ? String(row.getCell(6).value).trim().toUpperCase() : 'A';
                if (ans.startsWith('OPTION')) ans = ans.replace('OPTION', '').trim();
                if (ans.length > 1) ans = ans[0];

                if (qText && optA && optB && optC && optD) {
                    parsedQuestions.push({
                        class: targetClass,
                        subject: normalizedSubject,
                        question_text: qText,
                        option_a: optA,
                        option_b: optB,
                        option_c: optC,
                        option_d: optD,
                        correct_answer: ['A', 'B', 'C', 'D'].includes(ans) ? ans : 'A'
                    });
                }
            });
        } else {
            // Parse Word Document (.docx) or Text using Mammoth
            let rawText = '';
            if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
                const result = await mammoth.extractRawText({ buffer: req.file.buffer });
                rawText = result.value || '';
            } else {
                rawText = req.file.buffer.toString('utf8');
            }

            parsedQuestions = parseDocxText(rawText, normalizedSubject, targetClass);
        }

        if (parsedQuestions.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Could not parse any valid questions from the uploaded file. Ensure standard formatting (Question text, Options A-D, Answer: X)."
            });
        }

        // Insert parsed questions into SQLite database
        const insertSql = `
            INSERT INTO questions (class, subject, question_text, option_a, option_b, option_c, option_d, correct_answer)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        let insertedCount = 0;
        for (const q of parsedQuestions) {
            await dbRun(insertSql, [
                q.class || targetClass,
                normalizeSubjectName(q.subject || normalizedSubject),
                q.question_text,
                q.option_a,
                q.option_b,
                q.option_c,
                q.option_d,
                q.correct_answer
            ]);
            insertedCount++;
        }

        console.log(`📄 [Question Bank Upload] Successfully parsed & inserted ${insertedCount} questions into SQLite for class "${targetClass}" and subject "${normalizedSubject}".`);

        return res.status(200).json({
            success: true,
            message: `Questions uploaded and parsed successfully for ${targetClass} - ${normalizedSubject}`,
            count: insertedCount,
            questions: parsedQuestions
        });

    } catch (error) {
        console.error('❌ [Question Bank Upload Error]:', error);
        next(error);
    }
});

// --------------------------------------------------------------------------
// 7. POST /api/admin/upload-roster
// Bulk upload class student roster using MS Excel (.xlsx / .csv)
// Standardizes Surname strictly to UPPERCASE
// --------------------------------------------------------------------------
router.post('/upload-roster', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No Excel or CSV file uploaded."
            });
        }

        const targetClass = req.body.class || 'SS 3';
        const defaultSubject = req.body.assigned_subject || 'Mathematics';
        const fileName = (req.file.originalname || '').toLowerCase();

        const parsedStudents = [];

        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(req.file.buffer);
            const worksheet = workbook.worksheets[0];

            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Skip Header row

                // Columns: Surname | First Name | Reg Number | Class (optional) | Allocated Subjects (optional)
                const surname = row.getCell(1).value ? String(row.getCell(1).value).trim() : '';
                const firstName = row.getCell(2).value ? String(row.getCell(2).value).trim() : '';
                const regNo = row.getCell(3).value ? String(row.getCell(3).value).trim() : '';
                const studentClass = row.getCell(4).value ? String(row.getCell(4).value).trim() : targetClass;
                const subjects = row.getCell(5).value ? String(row.getCell(5).value).trim() : defaultSubject;

                if (surname && regNo) {
                    parsedStudents.push({
                        surname: surname.toUpperCase(),
                        first_name: firstName,
                        reg_number: regNo,
                        class: studentClass || targetClass,
                        assigned_subject: subjects || defaultSubject
                    });
                }
            });
        } else {
            // Parse CSV text
            const csvText = req.file.buffer.toString('utf8');
            const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

            lines.forEach((line, idx) => {
                if (idx === 0 && line.toLowerCase().includes('surname')) return; // Skip header
                const parts = line.split(',').map(p => p.trim());
                if (parts.length >= 2) {
                    const surname = parts[0];
                    const firstName = parts[1] || '';
                    const regNo = parts[2] || `REG-${Date.now()}-${idx}`;
                    const studentClass = parts[3] || targetClass;
                    const subjects = parts[4] || defaultSubject;

                    if (surname && regNo) {
                        parsedStudents.push({
                            surname: surname.toUpperCase(),
                            first_name: firstName,
                            reg_number: regNo,
                            class: studentClass || targetClass,
                            assigned_subject: subjects || defaultSubject
                        });
                    }
                }
            });
        }

        if (parsedStudents.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Could not parse any student records. Ensure columns: Surname, First Name, Reg Number, Class, Subjects."
            });
        }

        const insertSql = `
            INSERT INTO students (reg_number, surname, first_name, class, assigned_subject)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(reg_number) DO UPDATE SET
                surname = excluded.surname,
                first_name = excluded.first_name,
                class = excluded.class,
                assigned_subject = excluded.assigned_subject
        `;

        let insertedCount = 0;
        for (const s of parsedStudents) {
            await dbRun(insertSql, [
                s.reg_number,
                s.surname,
                s.first_name,
                s.class,
                s.assigned_subject
            ]);
            insertedCount++;
        }

        console.log(`📊 [Roster Bulk Upload] Successfully uploaded & updated ${insertedCount} students for class "${targetClass}".`);

        return res.status(200).json({
            success: true,
            message: `Successfully populated roster for ${targetClass} with ${insertedCount} student records.`,
            count: insertedCount,
            students: parsedStudents
        });

    } catch (error) {
        console.error('❌ [Roster Bulk Upload Error]:', error);
        next(error);
    }
});

module.exports = router;
