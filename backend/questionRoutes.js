/**
 * questionRoutes.js
 * 
 * Express routes for Question Management, including Bulk Question Upload
 * via spreadsheet parsing (.xlsx, .xls, .csv), diagram image file binding,
 * option normalization, and SQLite transactions.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const { logAuditAction } = require('./services/auditLogger');

const AdmZip = require('adm-zip');

// Configure Multer storage for uploaded files and diagram images
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
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

/**
 * Core handler function for Bulk Question & Diagram Asset Upload Pipeline
 */
async function handleQuestionBankUpload(req, res, next) {
    try {
        const files = req.files || [];

        // Directories for diagrams: ensure both backend/public/uploads/diagrams and backend/uploads/diagrams exist
        const publicDiagramsDir = path.join(__dirname, 'public/uploads/diagrams');
        const backendDiagramsDir = path.join(__dirname, 'uploads/diagrams');

        [publicDiagramsDir, backendDiagramsDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });

        const imageFilesMap = new Map();
        let spreadsheetBuffer = null;
        let spreadsheetName = 'upload_package';
        let registeredImagesCount = 0;

        // 1. Process ZIP archives (can be diagram zip OR complete package containing spreadsheet + diagrams)
        const zipFiles = files.filter(f => {
            const name = (f.originalname || '').toLowerCase();
            return name.endsWith('.zip') || f.mimetype === 'application/zip' || f.mimetype === 'application/x-zip-compressed';
        });

        zipFiles.forEach(zipFile => {
            try {
                const zip = new AdmZip(zipFile.buffer);
                const zipEntries = zip.getEntries();
                zipEntries.forEach(entry => {
                    if (entry.isDirectory || entry.entryName.includes('__MACOSX')) return;

                    const baseName = path.basename(entry.entryName);
                    const ext = path.extname(baseName).toLowerCase();

                    // If zip contains a spreadsheet file and we haven't found one yet
                    if (['.xlsx', '.xls', '.csv'].includes(ext) && !spreadsheetBuffer) {
                        spreadsheetBuffer = entry.getData();
                        spreadsheetName = baseName;
                    } else if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext)) {
                        const safeName = baseName.replace(/[^a-zA-Z0-9_\.-]/g, '_');
                        const destPublic = path.join(publicDiagramsDir, safeName);
                        const destBackend = path.join(backendDiagramsDir, safeName);
                        const data = entry.getData();
                        fs.writeFileSync(destPublic, data);
                        fs.writeFileSync(destBackend, data);

                        const publicUrl = `/uploads/diagrams/${safeName}`;
                        imageFilesMap.set(baseName.toLowerCase(), publicUrl);
                        imageFilesMap.set(safeName.toLowerCase(), publicUrl);
                        imageFilesMap.set(cleanKey(baseName), publicUrl);
                        imageFilesMap.set(cleanKey(path.parse(baseName).name), publicUrl);
                        registeredImagesCount++;
                    }
                });
            } catch (zipErr) {
                console.warn('⚠️ [Zip Extraction Warning]:', zipErr.message);
            }
        });

        // 2. Check directly attached spreadsheet file if not extracted from zip package
        if (!spreadsheetBuffer) {
            const directSpreadsheet = files.find(f => {
                const name = (f.originalname || '').toLowerCase();
                return f.fieldname === 'file' || f.fieldname === 'spreadsheet' || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');
            });
            if (directSpreadsheet) {
                spreadsheetBuffer = directSpreadsheet.buffer;
                spreadsheetName = directSpreadsheet.originalname;
            }
        }

        // 3. Process directly attached image files
        const directImages = files.filter(f => {
            const name = (f.originalname || '').toLowerCase();
            return !zipFiles.includes(f) && (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp') || name.endsWith('.gif') || name.endsWith('.svg') || (f.mimetype && f.mimetype.startsWith('image/')));
        });

        directImages.forEach(f => {
            const baseName = path.basename(f.originalname);
            const ext = path.extname(baseName).toLowerCase();
            if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext) || (f.mimetype && f.mimetype.startsWith('image/'))) {
                const safeName = baseName.replace(/[^a-zA-Z0-9_\.-]/g, '_');
                const destPublic = path.join(publicDiagramsDir, safeName);
                const destBackend = path.join(backendDiagramsDir, safeName);
                fs.writeFileSync(destPublic, f.buffer);
                fs.writeFileSync(destBackend, f.buffer);

                const publicUrl = `/uploads/diagrams/${safeName}`;
                imageFilesMap.set(baseName.toLowerCase(), publicUrl);
                imageFilesMap.set(safeName.toLowerCase(), publicUrl);
                imageFilesMap.set(cleanKey(baseName), publicUrl);
                imageFilesMap.set(cleanKey(path.parse(baseName).name), publicUrl);
                registeredImagesCount++;
            }
        });

        if (!spreadsheetBuffer) {
            return res.status(400).json({
                success: false,
                message: "No spreadsheet file found. Please upload a .csv or .xlsx file, or a .zip package containing a spreadsheet file."
            });
        }

        // Parse buffer into XLSX workbook
        let workbook;
        try {
            workbook = XLSX.read(spreadsheetBuffer, { type: 'buffer' });
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
            let diagramRef = getRowValue(row, ['diagram_filename', 'diagramfilename', 'diagram_image_url', 'diagram_image', 'diagram', 'image_url', 'image', 'figure', 'img', 'diagram_file', 'diagram_path']);

            let rawAnswer = getRowValue(row, ['correct_answer', 'correct answer', 'answer', 'correct', 'ans', 'correctanswer']);
            let marksRaw = getRowValue(row, ['marks', 'mark', 'score', 'points']);
            let rowSubject = getRowValue(row, ['subject', 'subject_id', 'subject_name', 'subjectname']) || fallbackSubject;
            let rowClass = getRowValue(row, ['class', 'exam_id', 'class_id', 'grade']) || fallbackClass;

            // Resolve diagram URL if mapped from uploaded images or formatted path
            let diagramUrl = null;
            if (diagramRef) {
                const lowerRef = diagramRef.toLowerCase();
                const baseRef = path.basename(diagramRef).toLowerCase();
                const cleanedRef = cleanKey(diagramRef);

                if (imageFilesMap.has(lowerRef)) {
                    diagramUrl = imageFilesMap.get(lowerRef);
                } else if (imageFilesMap.has(baseRef)) {
                    diagramUrl = imageFilesMap.get(baseRef);
                } else if (imageFilesMap.has(cleanedRef)) {
                    diagramUrl = imageFilesMap.get(cleanedRef);
                } else if (diagramRef.startsWith('http://') || diagramRef.startsWith('https://') || diagramRef.startsWith('/')) {
                    diagramUrl = diagramRef;
                } else {
                    diagramUrl = `/uploads/diagrams/${path.basename(diagramRef)}`;
                }
            }

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
                    marks: marks,
                    diagram_image_url: diagramUrl
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
        // Option to purge/overwrite existing questions for this subject & class before insertion
        const shouldOverwrite = req.body.overwrite !== 'false' && req.body.overwrite !== false && req.query.overwrite !== 'false';
        if (shouldOverwrite && validQuestions.length > 0 && fallbackSubject) {
            const normSub = normalizeSubjectName(fallbackSubject);
            const targetCls = fallbackClass ? String(fallbackClass).trim() : null;
            try {
                if (targetCls) {
                    await new Promise((resP, rejP) => {
                        db.run(`DELETE FROM question_options WHERE question_id IN (SELECT id FROM questions WHERE LOWER(subject) = LOWER(?) AND (class IS NULL OR TRIM(class) = '' OR LOWER(class) = LOWER(?)))`, [normSub, targetCls], (err) => {
                            if (err) return rejP(err);
                            db.run(`DELETE FROM questions WHERE LOWER(subject) = LOWER(?) AND (class IS NULL OR TRIM(class) = '' OR LOWER(class) = LOWER(?))`, [normSub, targetCls], (err2) => {
                                if (err2) return rejP(err2);
                                resP();
                            });
                        });
                    });
                } else {
                    await new Promise((resP, rejP) => {
                        db.run(`DELETE FROM question_options WHERE question_id IN (SELECT id FROM questions WHERE LOWER(subject) = LOWER(?))`, [normSub], (err) => {
                            if (err) return rejP(err);
                            db.run(`DELETE FROM questions WHERE LOWER(subject) = LOWER(?)`, [normSub], (err2) => {
                                if (err2) return rejP(err2);
                                resP();
                            });
                        });
                    });
                }
            } catch (purgeErr) {
                console.warn('⚠️ [Question Bank Overwrite Notice]:', purgeErr.message);
            }
        }

        // Execute bulk insertion in SQLite transaction & populate `question_options`
        const insertedCount = await runTransaction(() => {
            return new Promise((resolve, reject) => {
                const insertSql = `
                    INSERT INTO questions (class, subject, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, diagram_image_url)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                `;
                const optionInsertSql = `
                    INSERT INTO question_options (question_id, option_key, option_text, is_correct)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(question_id, option_key) DO UPDATE SET option_text = excluded.option_text, is_correct = excluded.is_correct;
                `;
                const stmt = db.prepare(insertSql);
                const optStmt = db.prepare(optionInsertSql);

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
                        q.marks,
                        q.diagram_image_url
                    ], function (err) {
                        if (err) {
                            hasError = true;
                            stmt.finalize();
                            optStmt.finalize();
                            return reject(err);
                        }

                        const qId = this.lastID;
                        const opts = [
                            { key: 'A', text: q.option_a, is_correct: q.correct_answer === 'A' ? 1 : 0 },
                            { key: 'B', text: q.option_b, is_correct: q.correct_answer === 'B' ? 1 : 0 },
                            { key: 'C', text: q.option_c, is_correct: q.correct_answer === 'C' ? 1 : 0 },
                            { key: 'D', text: q.option_d, is_correct: q.correct_answer === 'D' ? 1 : 0 }
                        ];

                        opts.forEach(opt => {
                            optStmt.run([qId, opt.key, opt.text, opt.is_correct]);
                        });

                        count++;
                        if (count === validQuestions.length) {
                            stmt.finalize();
                            optStmt.finalize((finalizeErr) => {
                                if (finalizeErr) return reject(finalizeErr);
                                resolve(count);
                            });
                        }
                    });
                });
            });
        });

        console.log(`📦 [Bulk Upload Success] Transaction committed. Imported ${insertedCount} questions with options & diagram image URLs into SQLite.`);

        // Persist exam duration if provided
        const durationMinutes = parseInt(req.body.duration_minutes || req.body.duration, 10);
        if (!isNaN(durationMinutes) && durationMinutes > 0) {
            const targetClass = fallbackClass ? String(fallbackClass).trim() : null;
            const normSubject = normalizeSubjectName(fallbackSubject);
            db.run(
                `INSERT INTO exam_configs (class, subject, duration_minutes) VALUES (?, ?, ?)
                 ON CONFLICT(class, subject) DO UPDATE SET duration_minutes = excluded.duration_minutes`,
                [targetClass, normSubject, durationMinutes]
            );
        }

        // Record Audit Log
        await logAuditAction({
            action: 'UPLOAD_QUESTIONS',
            entity_type: 'questions',
            entity_id: `${insertedCount}_items`,
            details: {
                subject: normalizeSubjectName(fallbackSubject),
                class: fallbackClass,
                importedCount: insertedCount,
                imagesCount: registeredImagesCount,
                filename: spreadsheetName
            },
            ip_address: req.ip || '127.0.0.1'
        });

        const feedbackMsg = registeredImagesCount > 0
            ? `${insertedCount} Question(s) and ${registeredImagesCount} Diagram(s) imported successfully.`
            : `${insertedCount} Question(s) imported successfully.`;

        return res.status(201).json({
            success: true,
            message: feedbackMsg,
            importedCount: insertedCount,
            imagesCount: registeredImagesCount,
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
}

router.post('/upload-bank', upload.any(), handleQuestionBankUpload);
router.post('/upload', upload.any(), handleQuestionBankUpload);

module.exports = router;
module.exports.handleQuestionBankUpload = handleQuestionBankUpload;
module.exports.uploadMiddleware = upload;
