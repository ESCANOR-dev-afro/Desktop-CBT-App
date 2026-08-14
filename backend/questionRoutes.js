/**
 * questionRoutes.js
 * 
 * Express routes for Question Management, including Bulk Question Upload
 * via spreadsheet parsing (.xlsx, .xls, .csv) and SQLite transactions.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('./database');

// Configure Multer in-memory storage for uploaded spreadsheets
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit
});

/**
 * Normalizes subject names to consistent Title Case format.
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
 * Normalizes key string for flexible spreadsheet header matching.
 */
function cleanKey(key) {
    if (!key) return '';
    return String(key).trim().toLowerCase().replace(/[\s\-_]+/g, '');
}

/**
 * Helper to extract value from row object matching candidate header variations.
 */
function getRowValue(row, possibleKeys) {
    const rowKeys = Object.keys(row);
    for (const key of rowKeys) {
        const cleaned = cleanKey(key);
        for (const target of possibleKeys) {
            if (cleaned === cleanKey(target)) {
                return row[key] !== undefined && row[key] !== null ? String(row[key]).trim() : '';
            }
        }
    }
    return '';
}

/**
 * Executes a callback within an atomic SQLite database transaction.
 */
function runTransaction(callback) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION;', (beginErr) => {
                if (beginErr) return reject(beginErr);

                callback()
                    .then((res) => {
                        db.run('COMMIT;', (commitErr) => {
                            if (commitErr) return reject(commitErr);
                            resolve(res);
                        });
                    })
                    .catch((err) => {
                        db.run('ROLLBACK;', () => {
                            reject(err);
                        });
                    });
            });
        });
    });
}

// --------------------------------------------------------------------------
// POST /api/questions/upload
// Bulk Question Upload Endpoint accepting .csv, .xlsx, .xls
// --------------------------------------------------------------------------
router.post('/upload', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No spreadsheet file uploaded. Please upload a .csv, .xlsx, or .xls file."
            });
        }

        const fileName = (req.file.originalname || '').toLowerCase();
        const isAllowedType = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv');
        if (!isAllowedType) {
            return res.status(400).json({
                success: false,
                message: "Invalid file format. Only .xlsx, .xls, and .csv files are allowed."
            });
        }

        // Parse buffer into XLSX workbook
        let workbook;
        try {
            workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        } catch (parseError) {
            return res.status(400).json({
                success: false,
                message: "Failed to parse spreadsheet file. Please check file integrity.",
                error: parseError.message
            });
        }

        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            return res.status(400).json({
                success: false,
                message: "Spreadsheet file contains no worksheets."
            });
        }

        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!Array.isArray(rawRows) || rawRows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Spreadsheet is empty or contains no data rows."
            });
        }

        const fallbackSubject = req.body.subject || req.body.subject_id || 'Mathematics';
        const fallbackClass = req.body.class || req.body.exam_id || null;

        const validQuestions = [];
        const invalidRows = [];

        // Validate each row
        rawRows.forEach((row, index) => {
            const rowIndex = index + 2; // 1-indexed row in sheet (header is row 1)

            const questionText = getRowValue(row, ['question', 'question_text', 'questiontext', 'qtext', 'q_text', 'question_name']);
            const optionA = getRowValue(row, ['option_a', 'option a', 'a', 'opta', 'opt_a', 'option1']);
            const optionB = getRowValue(row, ['option_b', 'option b', 'b', 'optb', 'opt_b', 'option2']);
            const optionC = getRowValue(row, ['option_c', 'option c', 'c', 'optc', 'opt_c', 'option3']);
            const optionD = getRowValue(row, ['option_d', 'option d', 'd', 'optd', 'opt_d', 'option4']);

            let rawAnswer = getRowValue(row, ['correct_answer', 'correct answer', 'answer', 'correct', 'ans', 'correctanswer']);
            let marksRaw = getRowValue(row, ['marks', 'mark', 'score', 'points']);
            let rowSubject = getRowValue(row, ['subject', 'subject_id', 'subject_name', 'subjectname']) || fallbackSubject;
            let rowClass = getRowValue(row, ['class', 'exam_id', 'class_id', 'grade']) || fallbackClass;

            // Normalize answer key (A, B, C, D)
            let correctAnswer = '';
            if (rawAnswer) {
                const upperAns = rawAnswer.toUpperCase().replace(/^OPTION\s*/i, '').trim();
                if (['A', 'B', 'C', 'D'].includes(upperAns)) {
                    correctAnswer = upperAns;
                } else if (upperAns.length > 0 && ['A', 'B', 'C', 'D'].includes(upperAns[0])) {
                    correctAnswer = upperAns[0];
                }
            }

            // Normalize marks
            let marks = parseInt(marksRaw, 10);
            if (isNaN(marks) || marks <= 0) {
                marks = 1;
            }

            // Missing field check
            const missingFields = [];
            if (!questionText) missingFields.push('question');
            if (!optionA) missingFields.push('option_a');
            if (!optionB) missingFields.push('option_b');
            if (!optionC) missingFields.push('option_c');
            if (!optionD) missingFields.push('option_d');
            if (!correctAnswer) missingFields.push('correct_answer');

            if (missingFields.length > 0) {
                invalidRows.push({
                    row: rowIndex,
                    reason: `Missing or invalid required fields: ${missingFields.join(', ')}`
                });
            } else {
                validQuestions.push({
                    class: rowClass ? String(rowClass).trim() : null,
                    subject: normalizeSubjectName(rowSubject),
                    question_text: questionText,
                    option_a: optionA,
                    option_b: optionB,
                    option_c: optionC,
                    option_d: optionD,
                    correct_answer: correctAnswer,
                    marks: marks
                });
            }
        });

        if (validQuestions.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid question rows found in uploaded file.",
                invalidRowsCount: invalidRows.length,
                invalidRowsDetails: invalidRows
            });
        }

        // Execute bulk insertion in SQLite transaction
        const insertedCount = await runTransaction(() => {
            return new Promise((resolve, reject) => {
                const insertSql = `
                    INSERT INTO questions (class, subject, question_text, option_a, option_b, option_c, option_d, correct_answer, marks)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                `;
                const stmt = db.prepare(insertSql);
                let count = 0;
                let hasError = false;

                validQuestions.forEach((q) => {
                    if (hasError) return;
                    stmt.run([
                        q.class,
                        q.subject,
                        q.question_text,
                        q.option_a,
                        q.option_b,
                        q.option_c,
                        q.option_d,
                        q.correct_answer,
                        q.marks
                    ], function (err) {
                        if (err) {
                            hasError = true;
                            stmt.finalize();
                            return reject(err);
                        }
                        count++;
                        if (count === validQuestions.length) {
                            stmt.finalize((finalizeErr) => {
                                if (finalizeErr) return reject(finalizeErr);
                                resolve(count);
                            });
                        }
                    });
                });
            });
        });

        console.log(`📦 [Bulk Upload Success] Transaction committed. Imported ${insertedCount} questions into SQLite database.`);

        // Persist exam duration if provided in request body
        const durationMinutes = parseInt(req.body.duration_minutes || req.body.duration, 10);
        if (!isNaN(durationMinutes) && durationMinutes > 0) {
            const targetClass = fallbackClass ? String(fallbackClass).trim() : null;
            const normSubject = normalizeSubjectName(fallbackSubject);
            db.run(
                `INSERT INTO exam_configs (class, subject, duration_minutes) VALUES (?, ?, ?)
                 ON CONFLICT(class, subject) DO UPDATE SET duration_minutes = excluded.duration_minutes`,
                [targetClass, normSubject, durationMinutes],
                (cfgErr) => {
                    if (cfgErr) console.warn('⚠️ [Exam Config Notice in questionRoutes]:', cfgErr.message);
                    else console.log(`⏱️ [Exam Config] Duration set to ${durationMinutes} mins for ${targetClass || 'All Classes'} - ${normSubject}.`);
                }
            );
        }

        return res.status(201).json({
            success: true,
            message: `Successfully imported ${insertedCount} question(s) into database.`,
            importedCount: insertedCount,
            totalRowsProcessed: rawRows.length,
            invalidRowsCount: invalidRows.length,
            invalidRowsDetails: invalidRows.length > 0 ? invalidRows : undefined
        });

    } catch (error) {
        console.error('❌ [Bulk Question Upload Error]:', error);
        return res.status(500).json({
            success: false,
            message: "An error occurred while bulk importing questions.",
            error: error.message
        });
    }
});

module.exports = router;
