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
const XLSX = require('xlsx');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const { logAuditAction } = require('./services/auditLogger');
const { performBackup, detectBackupDestination } = require('./services/backupService');
const { deriveSessionPrefix, getActiveSessionString, generateNextRegistrationNo } = require('./services/regNumberEngine');
const { handleQuestionBankUpload } = require('./questionRoutes');

// Configure Multer memory storage for uploaded documents
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB max file size
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
// Academic Terms Endpoints
// --------------------------------------------------------------------------

/**
 * GET /api/admin/academic-terms
 * Returns list of academic terms and current active term from database.
 */
router.get('/academic-terms', async (req, res, next) => {
    try {
        let terms = await dbAll(`SELECT id, name, session, is_current FROM academic_terms ORDER BY id ASC`);
        
        if (!terms || terms.length === 0) {
            // Seed defaults if empty
            await dbRun(`INSERT OR IGNORE INTO academic_terms (name, session, is_current) VALUES ('1st Term', '2025/2026', 0)`);
            await dbRun(`INSERT OR IGNORE INTO academic_terms (name, session, is_current) VALUES ('2nd Term', '2025/2026', 1)`);
            await dbRun(`INSERT OR IGNORE INTO academic_terms (name, session, is_current) VALUES ('3rd Term', '2025/2026', 0)`);
            terms = await dbAll(`SELECT id, name, session, is_current FROM academic_terms ORDER BY id ASC`);
        }

        const activeTerm = terms.find(t => t.is_current === 1) || terms[0] || { name: '2nd Term', session: '2025/2026' };

        return res.status(200).json({
            success: true,
            active_term: activeTerm.name,
            session: activeTerm.session,
            terms: terms
        });
    } catch (error) {
        console.error('❌ [Get Academic Terms Error]:', error);
        next(error);
    }
});

/**
 * POST /api/admin/academic-terms/active
 * Sets the active academic term in the database and records an audit log.
 */
router.post('/academic-terms/active', async (req, res, next) => {
    try {
        const { term, name, session } = req.body;
        const targetTerm = String(term || name || '').trim();
        const targetSession = String(session || '2025/2026').trim();

        if (!targetTerm) {
            return res.status(400).json({
                success: false,
                message: "Academic term name is required (e.g., '1st Term', '2nd Term', '3rd Term')."
            });
        }

        // Ensure term exists
        await dbRun(
            `INSERT INTO academic_terms (name, session, is_current) VALUES (?, ?, 0)
             ON CONFLICT(name, session) DO NOTHING`,
            [targetTerm, targetSession]
        );

        // Deactivate all terms and activate selected term
        await dbRun(`UPDATE academic_terms SET is_current = 0`);
        await dbRun(
            `UPDATE academic_terms SET is_current = 1 WHERE LOWER(name) = LOWER(?) AND session = ?`,
            [targetTerm, targetSession]
        );

        console.log(`📅 [Academic Term Updated] Active term set to "${targetTerm}" (${targetSession}).`);

        // Record Audit Log
        await logAuditAction({
            action: 'SWITCH_ACADEMIC_TERM',
            entity_type: 'academic_terms',
            entity_id: targetTerm,
            details: { term: targetTerm, session: targetSession },
            ip_address: req.ip || '127.0.0.1'
        });

        return res.status(200).json({
            success: true,
            message: `Active academic term updated to ${targetTerm} (${targetSession})`,
            active_term: targetTerm,
            session: targetSession
        });
    } catch (error) {
        console.error('❌ [Set Active Academic Term Error]:', error);
        next(error);
    }
});

/**
 * GET /api/admin/audit-logs
 * Retrieves administrative audit logs.
 */
router.get('/audit-logs', async (req, res, next) => {
    try {
        const logs = await dbAll(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100`);
        return res.status(200).json({
            success: true,
            count: logs.length,
            logs: logs
        });
    } catch (error) {
        console.error('❌ [Get Audit Logs Error]:', error);
        next(error);
    }
});

// --------------------------------------------------------------------------
// 0. GET /api/admin/subjects
// --------------------------------------------------------------------------
// GET /api/admin/class-subjects
// Returns dynamic class-isolated subject lists grouped by class name
// --------------------------------------------------------------------------
router.get('/class-subjects', async (req, res, next) => {
    try {
        const rows = await dbAll(`SELECT class_name, subject_name FROM class_subjects ORDER BY id ASC`);
        const map = {};
        for (const r of rows) {
            if (!map[r.class_name]) map[r.class_name] = [];
            map[r.class_name].push({ id: `cs-${r.class_name}-${r.subject_name}`, name: r.subject_name, category: 'Curriculum' });
        }
        return res.status(200).json({
            success: true,
            classSubjects: map
        });
    } catch (error) {
        console.error('❌ [Admin Class-Subjects Error]:', error);
        next(error);
    }
});

// Returns dynamic list of subjects from database with is_active activation status
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

        // Ensure default subjects exist in subjects table
        for (const sub of defaultSubjects) {
            const norm = normalizeSubjectName(sub);
            if (norm) {
                await dbRun(`INSERT OR IGNORE INTO subjects (name, is_active) VALUES (?, 1)`, [norm]);
            }
        }

        // Merge any additional subjects from questions or student rosters into subjects table
        const questionSubjects = await dbAll(`SELECT DISTINCT subject FROM questions WHERE subject IS NOT NULL AND TRIM(subject) != ''`);
        for (const row of questionSubjects) {
            const norm = normalizeSubjectName(row.subject);
            if (norm) {
                await dbRun(`INSERT OR IGNORE INTO subjects (name, is_active) VALUES (?, 1)`, [norm]);
            }
        }

        const studentSubjects = await dbAll(`SELECT DISTINCT assigned_subject AS subject FROM students WHERE assigned_subject IS NOT NULL AND TRIM(assigned_subject) != ''`);
        for (const row of studentSubjects) {
            const norm = normalizeSubjectName(row.subject);
            if (norm) {
                await dbRun(`INSERT OR IGNORE INTO subjects (name, is_active) VALUES (?, 1)`, [norm]);
            }
        }

        const dbSubjects = await dbAll(`SELECT id, name, code, is_active FROM subjects ORDER BY name ASC`);
        const subjectsList = dbSubjects.map(s => s.name);

        return res.status(200).json({
            success: true,
            count: dbSubjects.length,
            subjects: subjectsList,
            detailedSubjects: dbSubjects
        });
    } catch (error) {
        console.error('❌ [Admin Subjects Error]:', error);
        next(error);
    }
});

// --------------------------------------------------------------------------
// POST /api/admin/subjects/toggle
// Admin endpoint to toggle subject is_active active/inactive state
// --------------------------------------------------------------------------
router.post('/subjects/toggle', async (req, res, next) => {
    try {
        const { id, name, subject, class: reqClass, is_active } = req.body;
        let targetName = String(subject || name || '').trim();
        let targetClass = reqClass ? String(reqClass).trim() : null;
        let activeFlag = (is_active === 1 || is_active === true || is_active === '1' || is_active === 'true') ? 1 : 0;

        if (!targetName && !id) {
            return res.status(400).json({
                success: false,
                message: "Subject name or ID is required."
            });
        }

        if (id && !targetName) {
            const subRow = await dbGet(`SELECT name FROM subjects WHERE id = ?`, [id]);
            if (subRow) targetName = subRow.name;
        }

        const normSubject = normalizeSubjectName(targetName) || targetName;

        await dbRun(
            `INSERT INTO exam_configs (class, subject, duration_minutes, is_active, assessment_mode, delivery_count)
             VALUES (?, ?, 45, ?, 'TEST', 30)
             ON CONFLICT(class, subject) DO UPDATE SET is_active = excluded.is_active`,
            [targetClass, normSubject, activeFlag]
        );

        if (!targetClass) {
            await dbRun(
                `INSERT INTO subjects (name, is_active) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET is_active = excluded.is_active`,
                [normSubject, activeFlag]
            );
        }

        console.log(`⚙️ [Subject Activation Toggled] ${targetClass ? targetClass + ' - ' : ''}"${normSubject}" active status updated to ${activeFlag}.`);

        return res.status(200).json({
            success: true,
            message: `Subject ${normSubject} activation status set to ${activeFlag} for ${targetClass || 'ALL'}`,
            class: targetClass,
            subject: normSubject,
            is_active: activeFlag
        });
    } catch (error) {
        console.error('❌ [Toggle Subject Error]:', error);
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
        const { class: classScope } = req.query;
        let sql = `SELECT * FROM students`;
        let params = [];
        if (classScope && classScope !== 'all') {
            const trimmedClass = classScope.trim();
            sql += ` WHERE LOWER(class) = LOWER(?) OR LOWER(class) LIKE LOWER(?)`;
            params.push(trimmedClass, `${trimmedClass} %`);
        }
        sql += ` ORDER BY id DESC`;
        const students = await dbAll(sql, params);
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
        const { reg_number, regNo, registration_no, surname, first_name, firstName, class: studentClass, assigned_subject, assignedSubjects } = req.body;

        let targetRegNo = String(reg_number || regNo || registration_no || '').trim().toUpperCase();
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

        if (!targetSurname) {
            return res.status(400).json({
                success: false,
                message: "Surname is required."
            });
        }

        // Auto-generate Registration Number if omitted using dual-year engine
        if (!targetRegNo) {
            targetRegNo = await generateNextRegistrationNo(db);
        }

        // Resolve active term & class_id
        const activeTerm = await dbGet(`SELECT id FROM academic_terms WHERE is_current = 1 ORDER BY id DESC LIMIT 1`);
        const activeTermId = activeTerm ? activeTerm.id : null;
        let classRow = await dbGet(`SELECT id FROM classes WHERE LOWER(name) = LOWER(?)`, [targetClass]);
        if (!classRow) {
            const level = targetClass.startsWith('JSS') ? 'JSS' : 'SS';
            const insCls = await dbRun(`INSERT OR IGNORE INTO classes (name, level) VALUES (?, ?)`, [targetClass, level]);
            classRow = { id: insCls.lastID };
        }

        const normalizedSubject = normalizeSubjectName(String(targetSubject));
        const hashedPassword = crypto.createHash('sha256').update(targetSurname).digest('hex');

        const insertSql = `
            INSERT INTO students (reg_number, registration_no, surname, first_name, class, assigned_subject, class_id, academic_term_id, password)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const result = await dbRun(insertSql, [
            targetRegNo,
            targetRegNo,
            targetSurname,
            targetFirstName,
            targetClass,
            normalizedSubject || 'Mathematics',
            classRow ? classRow.id : null,
            activeTermId,
            hashedPassword
        ]);

        return res.status(201).json({
            success: true,
            message: "Student candidate registered successfully in database",
            student_id: result.lastID,
            student: {
                id: result.lastID,
                reg_number: targetRegNo,
                registration_no: targetRegNo,
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
// Class Roster Spreadsheet Upload Pipeline
// POST /api/admin/upload-roster & POST /api/admin/classes/upload-roster
// --------------------------------------------------------------------------
const handleUploadRosterPipeline = async (req, res, next) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({
                success: false,
                message: "No spreadsheet file uploaded. Please upload a valid .xlsx or .csv roster file."
            });
        }

        const selectedClass = String(req.body.class || req.body.class_id || req.body.currentClass || req.body.selectedClass || req.body.class_name || 'JSS 1 Gold').trim();
        
        // Resolve active academic term & class_id
        let activeTerm = await dbGet(`SELECT id, session, name FROM academic_terms WHERE is_current = 1 ORDER BY id DESC LIMIT 1`);
        if (!activeTerm) {
            activeTerm = { id: 1, session: '2026/2027', name: '1st Term' };
        }

        let classRow = await dbGet(`SELECT id FROM classes WHERE LOWER(name) = LOWER(?)`, [selectedClass]);
        if (!classRow) {
            const level = selectedClass.startsWith('JSS') ? 'JSS' : 'SS';
            const insClass = await dbRun(`INSERT OR IGNORE INTO classes (name, level) VALUES (?, ?)`, [selectedClass, level]);
            classRow = { id: insClass.lastID };
        }

        // Parse workbook using XLSX library
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!rawRows || rawRows.length < 2) {
            return res.status(400).json({
                success: false,
                message: "Uploaded spreadsheet is empty or contains no data rows."
            });
        }

        // Identify column header indices
        const headerRow = rawRows[0].map(cell => String(cell || '').trim().toLowerCase());
        let surnameIdx = headerRow.findIndex(h => /surname|last.*name|family.*name/i.test(h));
        let firstNameIdx = headerRow.findIndex(h => /first.*name|given.*name/i.test(h));
        let otherNamesIdx = headerRow.findIndex(h => /other.*name|middle.*name/i.test(h));
        let fullNameIdx = headerRow.findIndex(h => /full.*name|candidate.*name|student.*name|^name$/i.test(h));
        let regNoIdx = headerRow.findIndex(h => /reg.*no|registration.*no|reg.*number|^id$/i.test(h));

        // Default indices fallback if headers weren't found by string match
        if (surnameIdx === -1 && fullNameIdx === -1) {
            surnameIdx = 0;
            firstNameIdx = 1;
            otherNamesIdx = 2;
            regNoIdx = 3;
        }

        // Allocate default subjects according to stream/class or class_subjects registration
        let classSubjectsList = [];
        if (classRow && classRow.id) {
            const registeredRows = await dbAll(
                `SELECT s.name FROM class_subjects cs JOIN subjects s ON cs.subject_id = s.id WHERE cs.class_id = ?`,
                [classRow.id]
            );
            if (registeredRows && registeredRows.length > 0) {
                classSubjectsList = registeredRows.map(r => r.name);
            }
        }

        let defaultSubjects = classSubjectsList.length > 0
            ? classSubjectsList.join(', ')
            : "Mathematics, English Language, Basic Science";

        if (classSubjectsList.length === 0) {
            const clsUpper = selectedClass.toUpperCase();
            if (clsUpper.startsWith('JSS')) {
                defaultSubjects = "English Language, Mathematics, Basic Science, Social Studies, Basic Technology";
            } else if (clsUpper.includes('COMMERCIAL')) {
                defaultSubjects = "Mathematics, English Language, Economics, Commerce, Financial Accounting";
            } else if (clsUpper.includes('ART')) {
                defaultSubjects = "Mathematics, English Language, Government, CRS / IRS, Literature in English";
            } else {
                defaultSubjects = "Mathematics, English Language, Biology, Chemistry, Physics";
            }
        }

        const insertedStudents = [];

        for (let i = 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || row.length === 0) continue;

            let surname = surnameIdx !== -1 && row[surnameIdx] ? String(row[surnameIdx]).trim() : '';
            let firstName = firstNameIdx !== -1 && row[firstNameIdx] ? String(row[firstNameIdx]).trim() : '';
            let otherNames = otherNamesIdx !== -1 && row[otherNamesIdx] ? String(row[otherNamesIdx]).trim() : '';
            let fullName = fullNameIdx !== -1 && row[fullNameIdx] ? String(row[fullNameIdx]).trim() : '';
            let regNo = regNoIdx !== -1 && row[regNoIdx] ? String(row[regNoIdx]).trim().toUpperCase() : '';

            // Handle full_name splitting if surname wasn't provided separately
            if (!surname && fullName) {
                const parts = fullName.split(/\s+/);
                surname = parts[0] || '';
                firstName = parts.slice(1).join(' ') || '';
            }

            if (!surname) continue; // Skip blank candidate rows

            surname = surname.toUpperCase();
            if (otherNames) {
                firstName = firstName ? `${firstName} ${otherNames}` : otherNames;
            }

            // Auto-assign sequential registration number if omitted
            if (!regNo) {
                regNo = await generateNextRegistrationNo(db, activeTerm.session);
            }

            const hashedPassword = crypto.createHash('sha256').update(surname).digest('hex');

            const sql = `
                INSERT INTO students (reg_number, registration_no, surname, first_name, class, assigned_subject, class_id, academic_term_id, password)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(reg_number) DO UPDATE SET
                    registration_no = excluded.registration_no,
                    surname = excluded.surname,
                    first_name = excluded.first_name,
                    class = excluded.class,
                    class_id = excluded.class_id,
                    academic_term_id = excluded.academic_term_id,
                    password = excluded.password
            `;

            const resRun = await dbRun(sql, [
                regNo,
                regNo,
                surname,
                firstName,
                selectedClass,
                defaultSubjects,
                classRow ? classRow.id : null,
                activeTerm.id,
                hashedPassword
            ]);

            insertedStudents.push({
                id: resRun.lastID || `STU-${Date.now()}-${i}`,
                reg_number: regNo,
                registration_no: regNo,
                regNo: regNo,
                surname: surname,
                first_name: firstName,
                firstName: firstName,
                name: firstName ? `${surname}, ${firstName}` : surname,
                class: selectedClass,
                assigned_subject: defaultSubjects,
                assignedSubjects: defaultSubjects.split(', '),
                status: 'Exam Ready'
            });
        }

        console.log(`📋 [Roster Upload Pipeline] Imported ${insertedStudents.length} candidate records for "${selectedClass}" (${activeTerm.session}).`);

        // Record Audit Log
        await logAuditAction({
            action: 'UPLOAD_CLASS_ROSTER',
            entity_type: 'students',
            entity_id: selectedClass,
            details: { class: selectedClass, count: insertedStudents.length, term: activeTerm.name, session: activeTerm.session },
            ip_address: req.ip || '127.0.0.1'
        });

        return res.status(200).json({
            success: true,
            message: `${insertedStudents.length} Students successfully enrolled into ${selectedClass}.`,
            class: selectedClass,
            count: insertedStudents.length,
            students: insertedStudents
        });

    } catch (error) {
        console.error('❌ [Upload Roster Pipeline Error]:', error);
        next(error);
    }
};

router.post('/upload-roster', upload.single('file'), handleUploadRosterPipeline);
router.post('/classes/upload-roster', upload.single('file'), handleUploadRosterPipeline);

// --------------------------------------------------------------------------
// End-of-Exam Score Aggregator & Isolated Report View
// GET /api/admin/reports/class-subject-summary
// --------------------------------------------------------------------------
router.get('/reports/class-subject-summary', async (req, res, next) => {
    try {
        const { class_id, class: classParam, subject_id, subject: subjectParam, academic_term_id, term: termParam } = req.query;

        // Resolve active term & session
        let activeTerm = null;
        if (academic_term_id) {
            activeTerm = await dbGet(`SELECT id, name, session FROM academic_terms WHERE id = ?`, [academic_term_id]);
        } else if (termParam) {
            activeTerm = await dbGet(`SELECT id, name, session FROM academic_terms WHERE LOWER(name) = LOWER(?)`, [termParam.trim()]);
        }
        if (!activeTerm) {
            activeTerm = await dbGet(`SELECT id, name, session FROM academic_terms WHERE is_current = 1 ORDER BY id DESC LIMIT 1`);
        }
        if (!activeTerm) {
            activeTerm = { id: 1, name: '2nd Term', session: '2026/2027' };
        }

        // Resolve target class
        let targetClassRow = null;
        if (class_id) {
            targetClassRow = await dbGet(`SELECT id, name FROM classes WHERE id = ?`, [class_id]);
        } else if (classParam && classParam !== 'ALL') {
            targetClassRow = await dbGet(`SELECT id, name FROM classes WHERE LOWER(name) = LOWER(?)`, [classParam.trim()]);
        }
        const className = targetClassRow ? targetClassRow.name : (classParam && classParam !== 'ALL' ? classParam.trim() : 'SS 3 Science');
        const resolvedClassId = targetClassRow ? targetClassRow.id : null;

        // Resolve target subject
        let targetSubjectRow = null;
        if (subject_id) {
            targetSubjectRow = await dbGet(`SELECT id, name FROM subjects WHERE id = ?`, [subject_id]);
        } else if (subjectParam && subjectParam !== 'ALL') {
            targetSubjectRow = await dbGet(`SELECT id, name FROM subjects WHERE LOWER(name) = LOWER(?)`, [subjectParam.trim()]);
        }
        const subjectName = targetSubjectRow ? targetSubjectRow.name : (subjectParam && subjectParam !== 'ALL' ? subjectParam.trim() : 'Mathematics');
        const resolvedSubjectId = targetSubjectRow ? targetSubjectRow.id : null;

        // Fetch candidate roster & latest session score for class and subject
        const querySql = `
            SELECT 
                s.id,
                COALESCE(s.registration_no, s.reg_number) AS reg_number,
                s.surname,
                s.first_name,
                s.class,
                s.assigned_subject,
                es.id AS session_id,
                es.score,
                es.status AS session_status
            FROM students s
            LEFT JOIN exam_sessions es ON s.id = es.student_id AND LOWER(es.subject) = LOWER(?)
            WHERE (LOWER(s.class) = LOWER(?) OR s.class_id = ?)
            ORDER BY UPPER(s.surname) ASC, UPPER(s.first_name) ASC
        `;

        const candidatesRaw = await dbAll(querySql, [subjectName, className, resolvedClassId]);

        let submissionsCount = 0;
        const formattedCandidates = candidatesRaw.map((c, idx) => {
            const hasSubmitted = c.session_status === 'submitted' || (c.score !== null && c.score !== undefined);
            if (hasSubmitted) submissionsCount++;

            const rawScore = c.score !== null && c.score !== undefined ? c.score : null;
            const pct = rawScore !== null ? Number(((rawScore / 50) * 100).toFixed(1)) : null;
            let statusStr = 'Not Taken';
            if (c.session_status === 'submitted' || rawScore !== null) {
                statusStr = 'Submitted';
            } else if (c.session_status === 'active') {
                statusStr = 'Active Session';
            }

            const surnameUpper = String(c.surname || '').toUpperCase();
            const firstNameTrim = String(c.first_name || '').trim();

            return {
                sn: idx + 1,
                id: c.id,
                reg_number: c.reg_number,
                registration_no: c.reg_number,
                surname: surnameUpper,
                first_name: firstNameTrim,
                full_name: firstNameTrim ? `${surnameUpper}, ${firstNameTrim}` : surnameUpper,
                raw_score: rawScore,
                total_marks: 50,
                percentage: pct !== null ? `${pct}%` : 'N/A',
                pct_value: pct,
                status: statusStr
            };
        });

        return res.status(200).json({
            success: true,
            metadata: {
                class_name: className,
                class_id: resolvedClassId,
                subject_name: subjectName,
                subject_id: resolvedSubjectId,
                academic_session: activeTerm.session,
                academic_term: activeTerm.name,
                academic_term_id: activeTerm.id,
                total_candidates: formattedCandidates.length,
                submissions_count: submissionsCount
            },
            candidates: formattedCandidates
        });

    } catch (error) {
        console.error('❌ [Class Subject Summary Report Error]:', error);
        next(error);
    }
});

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
// --------------------------------------------------------------------------
// 4. GET /api/admin/results
// Fetch all student results & complete class rosters dynamically for all classes & subjects
// --------------------------------------------------------------------------
router.get('/results', async (req, res, next) => {
    try {
        const { class: targetClass, subject: targetSubject } = req.query;

        let sql = `
            SELECT 
                es.id AS session_id,
                es.student_id,
                s.reg_number,
                s.surname,
                s.first_name,
                s.class,
                COALESCE(es.subject, s.assigned_subject) AS subject,
                s.assigned_subject,
                es.workstation_ip,
                es.login_time,
                es.status,
                es.is_locked,
                es.score,
                COALESCE(es.duration_minutes, 45) AS duration_minutes
            FROM exam_sessions es
            JOIN students s ON es.student_id = s.id
            WHERE 1=1
        `;
        const params = [];
        if (targetClass && targetClass !== 'ALL') {
            sql += ` AND (LOWER(s.class) = LOWER(?) OR LOWER(s.class) LIKE LOWER(?))`;
            params.push(targetClass.trim(), `${targetClass.trim()} %`);
        }
        if (targetSubject && targetSubject !== 'ALL') {
            sql += ` AND (LOWER(COALESCE(es.subject, s.assigned_subject)) = LOWER(?) OR LOWER(s.assigned_subject) LIKE LOWER(?))`;
            params.push(targetSubject.trim(), `%${targetSubject.trim()}%`);
        }
        sql += ` ORDER BY es.id DESC`;

        const results = await dbAll(sql, params);

        // Fetch dynamic list of all distinct classes in student roster
        const distinctClassesRows = await dbAll(`SELECT DISTINCT class FROM students WHERE class IS NOT NULL AND TRIM(class) != '' ORDER BY class ASC`);
        const allClasses = distinctClassesRows.map(r => r.class);

        // Fetch dynamic list of all distinct subjects
        const distinctSubjectsRows = await dbAll(`SELECT DISTINCT name FROM subjects WHERE name IS NOT NULL AND TRIM(name) != '' ORDER BY name ASC`);
        const allSubjects = distinctSubjectsRows.map(r => r.name);

        // Fetch complete student roster with latest session scores mapped
        let studentRosterSql = `SELECT id, reg_number, surname, first_name, class, assigned_subject FROM students WHERE 1=1`;
        let rosterParams = [];
        if (targetClass && targetClass !== 'ALL') {
            studentRosterSql += ` AND (LOWER(class) = LOWER(?) OR LOWER(class) LIKE LOWER(?))`;
            rosterParams.push(targetClass.trim(), `${targetClass.trim()} %`);
        }
        if (targetSubject && targetSubject !== 'ALL') {
            studentRosterSql += ` AND (LOWER(assigned_subject) LIKE LOWER(?) OR id IN (SELECT student_id FROM exam_sessions WHERE LOWER(subject) = LOWER(?)))`;
            rosterParams.push(`%${targetSubject.trim()}%`, targetSubject.trim());
        }
        studentRosterSql += ` ORDER BY surname ASC, first_name ASC`;
        const allStudents = await dbAll(studentRosterSql, rosterParams);
        
        // Map student ID to latest session
        const latestSessionMap = new Map();
        results.forEach(resRow => {
            if (!latestSessionMap.has(resRow.student_id)) {
                latestSessionMap.set(resRow.student_id, resRow);
            }
        });

        const studentRosterWithScores = allStudents.map(s => {
            const sess = latestSessionMap.get(s.id);
            return {
                id: s.id,
                reg_number: s.reg_number,
                regNo: s.reg_number,
                surname: String(s.surname).toUpperCase(),
                first_name: s.first_name || '',
                firstName: s.first_name || '',
                name: s.first_name ? `${String(s.surname).toUpperCase()}, ${s.first_name}` : String(s.surname).toUpperCase(),
                class: s.class,
                assigned_subject: s.assigned_subject,
                subject: sess ? sess.subject : s.assigned_subject,
                status: sess ? sess.status : 'not_taken',
                score: sess ? sess.score : null,
                session_id: sess ? sess.session_id : null,
                duration_minutes: sess ? sess.duration_minutes : 45,
                login_time: sess ? sess.login_time : null
            };
        });

        return res.status(200).json({
            success: true,
            count: results.length,
            results: results,
            classes: allClasses,
            subjects: allSubjects,
            studentRoster: studentRosterWithScores
        });
    } catch (error) {
        console.error('❌ [Admin Results Error]:', error);
        next(error);
    }
});

// --------------------------------------------------------------------------
// 5. GET /api/admin/export-csv (and /api/admin/results/export-csv)
// Streams clean RFC-4180 standard CSV file filtered strictly by class and subject
// --------------------------------------------------------------------------
const handleExportCsv = async (req, res, next) => {
    try {
        const { class: targetClass, subject: targetSubject } = req.query;

        let sql = `
            SELECT 
                es.id AS session_id,
                es.student_id,
                s.reg_number,
                s.surname,
                s.first_name,
                s.class,
                COALESCE(es.subject, s.assigned_subject) AS subject,
                es.workstation_ip,
                es.login_time,
                es.status,
                es.score,
                COALESCE(es.duration_minutes, 45) AS duration_minutes
            FROM exam_sessions es
            JOIN students s ON es.student_id = s.id
            WHERE 1=1
        `;
        const params = [];
        if (targetClass && targetClass !== 'ALL') {
            sql += ` AND (LOWER(s.class) = LOWER(?) OR LOWER(s.class) LIKE LOWER(?))`;
            params.push(targetClass.trim(), `${targetClass.trim()} %`);
        }
        if (targetSubject && targetSubject !== 'ALL') {
            sql += ` AND LOWER(COALESCE(es.subject, s.assigned_subject)) = LOWER(?)`;
            params.push(targetSubject.trim());
        }
        sql += ` ORDER BY s.class ASC, s.surname ASC, s.first_name ASC`;

        const results = await dbAll(sql, params);

        // Helper to escape CSV cell value according to RFC-4180
        const escapeCsv = (val) => {
            if (val === null || val === undefined) return '""';
            const str = String(val).trim();
            if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return `"${str}"`;
        };

        // CSV Headers
        const headers = [
            'Session ID',
            'Registration Number',
            'Surname',
            'First Name',
            'Full Candidate Name',
            'Class',
            'Subject',
            'Workstation IP',
            'Status',
            'Score (/50)',
            'Percentage (%)',
            'Duration (Minutes)',
            'Examination Date & Time'
        ];

        const csvLines = [headers.join(',')];

        results.forEach(row => {
            const surnameUpper = String(row.surname || '').toUpperCase();
            const firstName = row.first_name || '';
            const fullName = firstName ? `${surnameUpper}, ${firstName}` : surnameUpper;
            const scoreVal = row.score !== null && row.score !== undefined ? row.score : '';
            const percentage = scoreVal !== '' ? `${Math.round((Number(scoreVal) / 50) * 100)}%` : '';
            const statusUpper = row.status ? row.status.toUpperCase() : 'ACTIVE';
            const dateStr = row.login_time ? new Date(row.login_time).toLocaleString() : '';

            const line = [
                escapeCsv(row.session_id),
                escapeCsv(row.reg_number),
                escapeCsv(surnameUpper),
                escapeCsv(firstName),
                escapeCsv(fullName),
                escapeCsv(row.class),
                escapeCsv(normalizeSubjectName(row.subject)),
                escapeCsv(row.workstation_ip),
                escapeCsv(statusUpper),
                escapeCsv(scoreVal),
                escapeCsv(percentage),
                escapeCsv(row.duration_minutes || 45),
                escapeCsv(dateStr)
            ];

            csvLines.push(line.join(','));
        });

        const csvContent = '\uFEFF' + csvLines.join('\r\n'); // Add UTF-8 BOM for Excel compatibility

        const classLabel = (targetClass && targetClass !== 'ALL') ? targetClass.replace(/[^a-zA-Z0-9_\-]/g, '_') : 'All_Classes';
        const subjectLabel = (targetSubject && targetSubject !== 'ALL') ? targetSubject.replace(/[^a-zA-Z0-9_\-]/g, '_') : 'All_Subjects';
        const filename = `cbt_score_report_${classLabel}_${subjectLabel}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.status(200).send(csvContent);

        console.log(`📊 [CSV Export] Generated and streamed clean CSV report "${filename}" (${results.length} rows).`);

    } catch (error) {
        console.error('❌ [CSV Export Error]:', error);
        next(error);
    }
};

router.get('/export-csv', handleExportCsv);
router.get('/results/export-csv', handleExportCsv);

// --------------------------------------------------------------------------
// 6. GET & POST /api/admin/exam-config
// Manage exam duration scheduling and timing configurations per class and subject
// --------------------------------------------------------------------------
router.get('/exam-config', async (req, res, next) => {
    try {
        const { class: examClass, subject } = req.query;
        let sql = `SELECT * FROM exam_configs WHERE 1=1`;
        const params = [];
        if (examClass && examClass !== 'ALL') {
            sql += ` AND (LOWER(class) = LOWER(?) OR class IS NULL)`;
            params.push(examClass.trim());
        }
        if (subject && subject !== 'ALL') {
            sql += ` AND LOWER(subject) = LOWER(?)`;
            params.push(subject.trim());
        }
        sql += ` ORDER BY subject ASC, class ASC`;
        const configs = await dbAll(sql, params);
        return res.status(200).json({ success: true, configs });
    } catch (error) {
        console.error('❌ [Get Exam Config Error]:', error);
        next(error);
    }
});

router.post('/exam-config', async (req, res, next) => {
    try {
        const { class: examClass, subject, duration_minutes, duration, is_active, assessment_mode, delivery_count, shuffle_questions, shuffle_options } = req.body;
        if (!subject) {
            return res.status(400).json({ success: false, message: "Subject is required." });
        }

        const normSubject = normalizeSubjectName(subject);
        const targetClass = examClass && examClass !== 'ALL' ? String(examClass).trim() : null;
        const durationMinutes = parseInt(duration_minutes !== undefined ? duration_minutes : duration, 10) || 45;
        const isActiveVal = (is_active === 0 || is_active === false || is_active === '0') ? 0 : 1;

        const modeVal = (assessment_mode && ['TEST', 'EXAM', 'CUSTOM'].includes(String(assessment_mode).toUpperCase()))
            ? String(assessment_mode).toUpperCase()
            : 'TEST';
        
        let countVal = parseInt(delivery_count, 10);
        if (isNaN(countVal) || countVal <= 0) {
            countVal = modeVal === 'EXAM' ? 50 : 30;
        }

        const shuffleQsVal = (shuffle_questions === 0 || shuffle_questions === false || shuffle_questions === '0') ? 0 : 1;
        const shuffleOptsVal = (shuffle_options === 0 || shuffle_options === false || shuffle_options === '0') ? 0 : 1;

        // Upsert into exam_configs table
        await dbRun(
            `INSERT INTO exam_configs (class, subject, duration_minutes, is_active, assessment_mode, delivery_count, shuffle_questions, shuffle_options)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(class, subject) DO UPDATE SET
                duration_minutes = excluded.duration_minutes,
                is_active = excluded.is_active,
                assessment_mode = excluded.assessment_mode,
                delivery_count = excluded.delivery_count,
                shuffle_questions = excluded.shuffle_questions,
                shuffle_options = excluded.shuffle_options`,
            [targetClass, normSubject, durationMinutes, isActiveVal, modeVal, countVal, shuffleQsVal, shuffleOptsVal]
        );

        // Only update global subjects table if no specific class scope was specified
        if (!targetClass) {
            await dbRun(`UPDATE subjects SET duration_minutes = ?, is_active = ? WHERE LOWER(name) = LOWER(?)`, [durationMinutes, isActiveVal, normSubject]);
        }

        console.log(`⏱️ [Exam Config Updated] ${targetClass || 'All Classes'} - ${normSubject}: ${durationMinutes} mins | Mode: ${modeVal} (${countVal} Qs) | Shuffle Qs: ${shuffleQsVal}, Opts: ${shuffleOptsVal}.`);

        return res.status(200).json({
            success: true,
            message: `Exam config updated for ${targetClass || 'All Classes'} - ${normSubject} (${modeVal} mode, ${countVal} Qs).`,
            class: targetClass,
            subject: normSubject,
            duration_minutes: durationMinutes,
            is_active: isActiveVal,
            assessment_mode: modeVal,
            delivery_count: countVal,
            shuffle_questions: shuffleQsVal,
            shuffle_options: shuffleOptsVal
        });
    } catch (error) {
        console.error('❌ [Post Exam Config Error]:', error);
        next(error);
    }
});

// --------------------------------------------------------------------------
// 7. POST /api/admin/subjects/toggle & PATCH /api/admin/subject-config/status
// Toggle exam activation status (ACTIVE = 1, INACTIVE = 0) strictly per class and subject
// --------------------------------------------------------------------------
const handleToggleSubjectStatus = async (req, res, next) => {
    try {
        const { class: examClass, class_id, name, subject, subject_id, is_active } = req.body;
        const targetSubject = normalizeSubjectName(name || subject || subject_id);
        const targetClass = (examClass || class_id) && String(examClass || class_id).trim() !== 'ALL' 
            ? String(examClass || class_id).trim() 
            : null;

        if (!targetSubject) {
            return res.status(400).json({ success: false, message: "Subject name is required." });
        }

        let nextActive = is_active;
        if (nextActive === undefined || nextActive === null) {
            const existing = await dbGet(`SELECT is_active FROM exam_configs WHERE LOWER(class) = LOWER(?) AND LOWER(subject) = LOWER(?)`, [targetClass, targetSubject]) ||
                             await dbGet(`SELECT is_active FROM subjects WHERE LOWER(name) = LOWER(?)`, [targetSubject]);
            const currentActive = (existing && existing.is_active !== undefined) ? existing.is_active : 1;
            nextActive = currentActive === 1 ? 0 : 1;
        } else {
            nextActive = (nextActive === 1 || nextActive === true || nextActive === '1') ? 1 : 0;
        }

        if (targetClass) {
            await dbRun(
                `INSERT INTO exam_configs (class, subject, duration_minutes, is_active) VALUES (?, ?, 45, ?)
                 ON CONFLICT(class, subject) DO UPDATE SET is_active = excluded.is_active`,
                [targetClass, targetSubject, nextActive]
            );
        } else {
            await dbRun(`UPDATE subjects SET is_active = ? WHERE LOWER(name) = LOWER(?)`, [nextActive, targetSubject]);
            await dbRun(`UPDATE exam_configs SET is_active = ? WHERE LOWER(subject) = LOWER(?)`, [nextActive, targetSubject]);
        }

        console.log(`🔘 [Subject Toggle] ${targetClass || 'All Classes'} - ${targetSubject}: is_active = ${nextActive}`);

        return res.status(200).json({
            success: true,
            message: `Subject "${targetSubject}" exam session status set to ${nextActive === 1 ? 'ACTIVE' : 'INACTIVE'}.`,
            class: targetClass,
            subject: targetSubject,
            is_active: nextActive
        });
    } catch (error) {
        console.error('❌ [Subject Toggle Error]:', error);
        next(error);
    }
};

router.post('/subjects/toggle', handleToggleSubjectStatus);
router.patch('/subject-config/status', handleToggleSubjectStatus);

// --------------------------------------------------------------------------
// 7. GET /api/admin/export-excel
// Generate and stream MS Excel (.xlsx) spreadsheet of all student results
// --------------------------------------------------------------------------
router.get('/export-excel', async (req, res, next) => {
    try {
        const { class: targetClass, subject: targetSubject } = req.query;

        let sql = `
            SELECT 
                es.id AS session_id,
                es.student_id,
                s.reg_number,
                s.surname,
                s.class,
                COALESCE(es.subject, s.assigned_subject) AS assigned_subject,
                es.workstation_ip,
                es.login_time,
                es.status,
                es.score,
                COALESCE(es.duration_minutes, 45) AS duration_minutes
            FROM exam_sessions es
            JOIN students s ON es.student_id = s.id
            WHERE 1=1
        `;
        const params = [];
        if (targetClass && targetClass !== 'ALL') {
            sql += ` AND (LOWER(s.class) = LOWER(?) OR LOWER(s.class) LIKE LOWER(?))`;
            params.push(targetClass.trim(), `${targetClass.trim()} %`);
        }
        if (targetSubject && targetSubject !== 'ALL') {
            sql += ` AND LOWER(COALESCE(es.subject, s.assigned_subject)) = LOWER(?)`;
            params.push(targetSubject.trim());
        }
        sql += ` ORDER BY s.class ASC, es.id DESC`;

        const results = await dbAll(sql, params);

        // Create ExcelJS Workbook and Worksheet
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Anthony Whitebridge Academy CBT Control Center';
        workbook.created = new Date();

        const worksheet = workbook.addWorksheet('CBT Exam Results');

        // Define Columns
        worksheet.columns = [
            { header: 'Session ID', key: 'session_id', width: 12 },
            { header: 'Student Name', key: 'surname', width: 22 },
            { header: 'Reg Number', key: 'reg_number', width: 16 },
            { header: 'Class', key: 'class', width: 14 },
            { header: 'Subject', key: 'assigned_subject', width: 22 },
            { header: 'Workstation IP', key: 'workstation_ip', width: 18 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Score (/50)', key: 'score', width: 15 },
            { header: 'Duration (Mins)', key: 'duration_minutes', width: 16 },
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
                duration_minutes: row.duration_minutes || 45,
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
// POST /api/admin/backup
// Triggers safe SQLite database snapshot (VACUUM INTO) and mirrors diagram assets to USB / external storage
// --------------------------------------------------------------------------
router.post('/backup', async (req, res, next) => {
    try {
        const clientIp = req.ip || '127.0.0.1';
        const backupResult = await performBackup({ ipAddress: clientIp });
        if (backupResult.success) {
            return res.status(200).json(backupResult);
        } else {
            return res.status(400).json({
                success: false,
                message: backupResult.message || "External USB drive not found or inaccessible. Please verify USB is plugged in."
            });
        }
    } catch (error) {
        console.error('❌ [Backup Execution Error]:', error);
        return res.status(500).json({
            success: false,
            message: "External USB drive not found or inaccessible. Please verify USB is plugged in."
        });
    }
});

// --------------------------------------------------------------------------
// 6. POST /api/admin/questions/upload-bank & POST /api/admin/upload-bank
// Bulk Question & Diagram Asset Upload Handler (.xlsx, .csv + image files or .zip)
// --------------------------------------------------------------------------
router.post('/questions/upload-bank', upload.any(), handleQuestionBankUpload);
router.post('/upload-bank', upload.any(), handleQuestionBankUpload);
router.post('/upload-questions', upload.any(), handleQuestionBankUpload);

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

// --------------------------------------------------------------------------
// 8. GET /api/admin/questions
// Fetch all questions for Question Bank Hub with class & subject filters (No LIMIT)
// --------------------------------------------------------------------------
router.get('/questions', async (req, res, next) => {
    try {
        const { class: reqClass, subject: reqSubject } = req.query;
        let sql = `
            SELECT id, class, subject, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, diagram_image_url
            FROM questions
            WHERE 1=1
        `;
        const params = [];

        if (reqSubject) {
            sql += ` AND LOWER(subject) = LOWER(?)`;
            params.push(reqSubject.trim());
        }

        if (reqClass) {
            const cls = reqClass.trim();
            const baseTier = cls.replace(/\s+(Science|Art|Commercial|Gold|Silver|Diamond)$/i, '').trim();
            sql += ` AND (class IS NULL OR TRIM(class) = '' OR LOWER(class) = LOWER(?) OR LOWER(class) = LOWER(?))`;
            params.push(cls, baseTier);
        }

        sql += ` ORDER BY id ASC`;

        const questions = await dbAll(sql, params);
        return res.json({
            success: true,
            count: questions.length,
            questions: questions
        });
    } catch (err) {
        next(err);
    }
});

// --------------------------------------------------------------------------
// 9. POST /api/admin/questions (Create Single Question)
// --------------------------------------------------------------------------
router.post('/questions', async (req, res, next) => {
    try {
        const { class: targetClass, subject, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, diagram_image_url } = req.body;

        if (!question_text || !option_a || !option_b || !option_c || !option_d || !correct_answer) {
            return res.status(400).json({
                success: false,
                message: "Missing required question fields (question_text, option_a..d, correct_answer)."
            });
        }

        const normSubject = normalizeSubjectName(subject || 'Mathematics');
        const normAns = String(correct_answer).toUpperCase().trim();
        const validAns = ['A', 'B', 'C', 'D'].includes(normAns) ? normAns : 'A';
        const validMarks = parseInt(marks, 10) || 1;

        const insertSql = `
            INSERT INTO questions (class, subject, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, diagram_image_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const result = await dbRun(insertSql, [
            targetClass || null,
            normSubject,
            question_text,
            option_a,
            option_b,
            option_c,
            option_d,
            validAns,
            validMarks,
            diagram_image_url || null
        ]);

        const qId = result.lastID;
        if (qId) {
            const optionInsertSql = `
                INSERT INTO question_options (question_id, option_key, option_text, is_correct)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(question_id, option_key) DO UPDATE SET option_text = excluded.option_text, is_correct = excluded.is_correct;
            `;
            const opts = [
                { key: 'A', text: option_a, is_correct: validAns === 'A' ? 1 : 0 },
                { key: 'B', text: option_b, is_correct: validAns === 'B' ? 1 : 0 },
                { key: 'C', text: option_c, is_correct: validAns === 'C' ? 1 : 0 },
                { key: 'D', text: option_d, is_correct: validAns === 'D' ? 1 : 0 }
            ];
            for (const opt of opts) {
                await dbRun(optionInsertSql, [qId, opt.key, opt.text, opt.is_correct]);
            }
        }

        return res.status(201).json({
            success: true,
            message: "Question created successfully.",
            question_id: qId
        });
    } catch (err) {
        next(err);
    }
});

// --------------------------------------------------------------------------
// 10. DELETE /api/admin/questions/:id (Delete Single Question)
// --------------------------------------------------------------------------
router.delete('/questions/:id', async (req, res, next) => {
    try {
        const qId = req.params.id;
        await dbRun(`DELETE FROM question_options WHERE question_id = ?`, [qId]);
        await dbRun(`DELETE FROM questions WHERE id = ?`, [qId]);
        return res.json({
            success: true,
            message: `Question #${qId} deleted successfully.`
        });
    } catch (err) {
        next(err);
    }
});

// --------------------------------------------------------------------------
// 11. POST / DELETE /api/admin/questions/clear-subject
// Clears all questions and diagram assets for a given class & subject scope
// --------------------------------------------------------------------------
const handleClearSubjectQuestions = async (req, res, next) => {
    try {
        const reqClass = req.body.class || req.query.class || req.body.class_id || req.query.class_id;
        const reqSubject = req.body.subject || req.query.subject || req.body.subject_id || req.query.subject_id;

        if (!reqClass || !reqSubject) {
            return res.status(400).json({
                success: false,
                message: "class and subject parameters are required."
            });
        }

        const normalizedSubject = normalizeSubjectName(reqSubject);
        const trimmedClass = String(reqClass).trim();

        // 1. Fetch diagram files before deleting questions to clean disk assets
        const findDiagramsSql = `
            SELECT diagram_image_url FROM questions 
            WHERE LOWER(subject) = LOWER(?) 
            AND LOWER(class) = LOWER(?)
        `;
        const questionRows = await dbAll(findDiagramsSql, [normalizedSubject, trimmedClass]);

        let removedDiagramsCount = 0;
        for (const row of questionRows) {
            if (row.diagram_image_url) {
                const basename = path.basename(row.diagram_image_url);
                const filePaths = [
                    path.join(__dirname, 'public/uploads/diagrams', basename),
                    path.join(__dirname, 'uploads/diagrams', basename)
                ];
                filePaths.forEach(fp => {
                    if (fs.existsSync(fp)) {
                        try {
                            fs.unlinkSync(fp);
                            removedDiagramsCount++;
                        } catch (_) {}
                    }
                });
            }
        }

        // 2. Delete question options and questions strictly matching class AND subject
        const fetchQuestionIdsSql = `
            SELECT id FROM questions 
            WHERE LOWER(subject) = LOWER(?) 
            AND LOWER(class) = LOWER(?)
        `;
        const qIdsRows = await dbAll(fetchQuestionIdsSql, [normalizedSubject, trimmedClass]);
        const qIds = qIdsRows.map(r => r.id);

        if (qIds.length > 0) {
            const placeholders = qIds.map(() => '?').join(',');
            await dbRun(`DELETE FROM question_options WHERE question_id IN (${placeholders})`, qIds);
            await dbRun(`DELETE FROM questions WHERE id IN (${placeholders})`, qIds);
        }

        // Clean orphaned question options
        await dbRun(`DELETE FROM question_options WHERE question_id NOT IN (SELECT id FROM questions)`);

        // 3. Log audit action
        await logAuditAction(
            'ADMIN',
            'CLEAR_SUBJECT_QUESTIONS',
            `Cleared ${qIds.length} questions for ${trimmedClass} - ${normalizedSubject}`
        );

        return res.status(200).json({
            success: true,
            message: `Question bank for ${trimmedClass} - ${normalizedSubject} successfully cleared.`,
            deletedCount: qIds.length,
            removedDiagramsCount: removedDiagramsCount
        });
    } catch (err) {
        console.error('❌ [Clear Subject Questions Error]:', err);
        next(err);
    }
};

router.post('/questions/clear-subject', handleClearSubjectQuestions);
router.delete('/questions/clear-subject', handleClearSubjectQuestions);

// --------------------------------------------------------------------------
// 12. POST / DELETE /api/admin/classes/reset-roster & /api/admin/classes/:classId/roster
// Clears student records, assigned papers, and exam sessions strictly for target class
// --------------------------------------------------------------------------
const handleResetClassRoster = async (req, res, next) => {
    try {
        const targetClass = req.body.class || req.query.class || req.params.classId || req.body.class_id || req.body.classId;

        if (!targetClass) {
            return res.status(400).json({
                success: false,
                message: "class parameter is required."
            });
        }

        const trimmedClass = String(targetClass).trim();

        // Find candidate IDs matching strictly this target class
        const students = await dbAll(
            `SELECT id FROM students WHERE LOWER(class) = LOWER(?)`,
            [trimmedClass]
        );
        const studentIds = students.map(s => s.id);

        let deletedCount = studentIds.length;
        if (studentIds.length > 0) {
            const placeholders = studentIds.map(() => '?').join(',');
            await dbRun(`DELETE FROM answers WHERE student_id IN (${placeholders})`, studentIds);
            await dbRun(`DELETE FROM exam_sessions WHERE student_id IN (${placeholders})`, studentIds);
            await dbRun(`DELETE FROM student_exam_sessions WHERE student_id IN (${placeholders})`, studentIds);
            await dbRun(`DELETE FROM students WHERE id IN (${placeholders})`, studentIds);
        }

        await logAuditAction(
            'ADMIN',
            'RESET_CLASS_ROSTER',
            `Reset student roster for ${trimmedClass} (${deletedCount} candidate profiles removed)`
        );

        return res.status(200).json({
            success: true,
            message: `Student roster for ${trimmedClass} successfully cleared.`,
            deletedCount: deletedCount
        });
    } catch (err) {
        console.error('❌ [Reset Class Roster Error]:', err);
        next(err);
    }
};

router.post('/classes/reset-roster', handleResetClassRoster);
router.delete('/classes/reset-roster', handleResetClassRoster);
router.delete('/classes/:classId/roster', handleResetClassRoster);
router.post('/classes/:classId/roster', handleResetClassRoster);

// --------------------------------------------------------------------------
// 13. POST /api/admin/system/purge-test-results
// Purges active/trial exam session results (per-class or all classes)
// --------------------------------------------------------------------------
router.post('/system/purge-test-results', async (req, res, next) => {
    try {
        const { scope, target_class } = req.body;
        const purgeScope = scope === 'CLASS' ? 'CLASS' : 'ALL';

        let purgedCount = 0;

        if (purgeScope === 'CLASS' && target_class && target_class !== 'ALL') {
            const trimmedClass = target_class.trim();
            const students = await dbAll(
                `SELECT id FROM students WHERE LOWER(class) = LOWER(?)`,
                [trimmedClass]
            );
            const studentIds = students.map(s => s.id);

            if (studentIds.length > 0) {
                const placeholders = studentIds.map(() => '?').join(',');
                const run1 = await dbRun(`DELETE FROM answers WHERE student_id IN (${placeholders})`, studentIds);
                const run2 = await dbRun(`DELETE FROM exam_sessions WHERE student_id IN (${placeholders})`, studentIds);
                const run3 = await dbRun(`DELETE FROM student_exam_sessions WHERE student_id IN (${placeholders})`, studentIds);
                purgedCount = (run2.changes || 0) + (run3.changes || 0);
            }
        } else {
            const run1 = await dbRun(`DELETE FROM answers`);
            const run2 = await dbRun(`DELETE FROM exam_sessions`);
            const run3 = await dbRun(`DELETE FROM student_exam_sessions`);
            purgedCount = (run2.changes || 0) + (run3.changes || 0);
        }

        await logAuditAction(
            'ADMIN',
            'PURGE_TEST_RESULTS',
            `Purged ${purgeScope} trial exam submissions (${purgedCount} sessions cleared)`
        );

        return res.status(200).json({
            success: true,
            message: purgeScope === 'CLASS'
                ? `Trial exam submissions for ${target_class} successfully purged.`
                : `All trial exam submissions across all classes successfully purged.`,
            purgedCount: purgedCount
        });
    } catch (err) {
        console.error('❌ [Purge Test Results Error]:', err);
        next(err);
    }
});

// --------------------------------------------------------------------------
// 14. Real-Time Class Workstation & Exam Monitor Endpoint
// GET /api/admin/live-monitor?class=...
// --------------------------------------------------------------------------
router.get('/live-monitor', async (req, res, next) => {
    try {
        const targetClass = String(req.query.class || req.query.class_name || req.query.currentClass || 'SS 1 Science').trim();
        const baseTier = targetClass.replace(/\s+(Science|Art|Commercial|Gold|Silver|Diamond)$/i, '').trim();

        // 1. Enrolled students for this class
        const enrolledStudents = await dbAll(
            `SELECT id, reg_number, registration_no, surname, first_name, class, assigned_subject 
             FROM students 
             WHERE LOWER(class) = LOWER(?) OR LOWER(class) = LOWER(?) OR LOWER(class) LIKE LOWER(?)`,
            [targetClass, baseTier, `${baseTier} %`]
        );
        const enrolledCount = enrolledStudents.length;

        // 2. Active student exam sessions for this class
        const studentIds = enrolledStudents.map(s => s.id);
        let activeSessions = [];
        if (studentIds.length > 0) {
            const placeholders = studentIds.map(() => '?').join(',');
            activeSessions = await dbAll(
                `SELECT ses.*, st.reg_number, st.surname, st.first_name, st.class as student_class
                 FROM student_exam_sessions ses
                 JOIN students st ON ses.student_id = st.id
                 WHERE ses.student_id IN (${placeholders})
                 ORDER BY ses.session_id DESC`,
                studentIds
            );
        }

        // Format metrics and session cards
        let activeCount = 0;
        let lockoutCount = 0;
        let submittedCount = 0;

        const sessionCards = activeSessions.map(ses => {
            const isSubmitted = ses.status === 'SUBMITTED';
            const isExpired = ses.status === 'EXPIRED';
            const isLockout = ses.status === 'LOCKOUT_ALERT';
            const isActive = ses.status === 'IN_PROGRESS';

            if (isActive) activeCount++;
            if (isLockout) lockoutCount++;
            if (isSubmitted || isExpired) submittedCount++;

            let deliveredCount = 0;
            try {
                const del = JSON.parse(ses.delivered_questions_json || '[]');
                deliveredCount = Array.isArray(del) ? del.length : 0;
            } catch (e) {}

            let answeredCount = 0;
            try {
                const ans = JSON.parse(ses.selected_answers_json || '{}');
                answeredCount = Object.keys(ans || {}).length;
            } catch (e) {}

            const sName = ses.first_name ? `${String(ses.surname).toUpperCase()}, ${ses.first_name}` : String(ses.surname).toUpperCase();

            return {
                id: ses.session_id,
                session_id: ses.session_id,
                student_id: ses.student_id,
                studentName: sName,
                regNo: ses.reg_number || ses.registration_no,
                subject: ses.subject_name,
                status: ses.status,
                isLockout: isLockout,
                lockoutReason: 'Focus Lost / Tab Switch Detected',
                currentQuestion: answeredCount,
                totalQuestions: deliveredCount || 30,
                expiresAt: ses.expires_at,
                startedAt: ses.started_at,
                nodeName: `NODE-${String(ses.session_id).padStart(2, '0')}`
            };
        });

        const idleCount = Math.max(0, enrolledCount - (activeCount + lockoutCount + submittedCount));

        return res.status(200).json({
            success: true,
            class: targetClass,
            metrics: {
                enrolledCandidates: enrolledCount,
                activeWorkstations: activeCount,
                lockoutAlerts: lockoutCount,
                submittedExams: submittedCount,
                idleNodes: idleCount
            },
            sessions: sessionCards
        });
    } catch (err) {
        console.error('❌ [Live Monitor API Error]:', err);
        next(err);
    }
});

// --------------------------------------------------------------------------
// Live Workstation Admin Control Actions
// --------------------------------------------------------------------------
router.post('/live-monitor/extend-time', async (req, res, next) => {
    try {
        const { session_id, minutes = 5 } = req.body;
        if (!session_id) {
            return res.status(400).json({ success: false, message: 'session_id is required' });
        }
        await dbRun(
            `UPDATE student_exam_sessions SET expires_at = datetime(expires_at, '+' || ? || ' minutes') WHERE session_id = ?`,
            [minutes, session_id]
        );
        return res.status(200).json({ success: true, message: `Granted +${minutes}m extension to Session #${session_id}` });
    } catch (err) {
        next(err);
    }
});

router.post('/live-monitor/force-submit', async (req, res, next) => {
    try {
        const { session_id } = req.body;
        if (!session_id) {
            return res.status(400).json({ success: false, message: 'session_id is required' });
        }
        await dbRun(
            `UPDATE student_exam_sessions SET status = 'SUBMITTED' WHERE session_id = ?`,
            [session_id]
        );
        return res.status(200).json({ success: true, message: `Exam session #${session_id} force submitted.` });
    } catch (err) {
        next(err);
    }
});

router.post('/live-monitor/unlock', async (req, res, next) => {
    try {
        const { session_id } = req.body;
        if (!session_id) {
            return res.status(400).json({ success: false, message: 'session_id is required' });
        }
        await dbRun(
            `UPDATE student_exam_sessions SET status = 'IN_PROGRESS' WHERE session_id = ?`,
            [session_id]
        );
        return res.status(200).json({ success: true, message: `Security lockout reset for Session #${session_id}` });
    } catch (err) {
        next(err);
    }
});

// --------------------------------------------------------------------------
// 15. Assessment Mode & Activation Toggle Endpoints
// GET /api/admin/exam-config
// POST /api/admin/exam-config
// POST /api/admin/subjects/toggle
// --------------------------------------------------------------------------
router.get('/exam-config', async (req, res, next) => {
    try {
        const targetClass = req.query.class ? String(req.query.class).trim() : null;
        const targetSubject = req.query.subject ? String(req.query.subject).trim() : null;

        let sql = `SELECT * FROM exam_configs WHERE 1=1`;
        const params = [];

        if (targetSubject) {
            sql += ` AND LOWER(subject) = LOWER(?)`;
            params.push(targetSubject);
        }
        if (targetClass) {
            const baseTier = targetClass.replace(/\s+(Science|Art|Commercial|Gold|Silver|Diamond)$/i, '').trim();
            sql += ` AND (LOWER(class) = LOWER(?) OR LOWER(class) = LOWER(?) OR class IS NULL)`;
            params.push(targetClass, baseTier);
        }

        sql += ` ORDER BY class DESC, id DESC`;

        const configs = await dbAll(sql, params);
        return res.json({
            success: true,
            configs: configs
        });
    } catch (err) {
        next(err);
    }
});

router.post('/exam-config', async (req, res, next) => {
    try {
        const { class: reqClass, subject, duration_minutes, is_active, assessment_mode, delivery_count, shuffle_questions, shuffle_options } = req.body;

        if (!subject) {
            return res.status(400).json({ success: false, message: "subject is required." });
        }

        const targetClass = reqClass ? String(reqClass).trim() : null;
        const targetSubject = String(subject).trim();
        const duration = parseInt(duration_minutes, 10) || 45;
        const activeFlag = is_active !== undefined ? (is_active ? 1 : 0) : 1;
        const mode = (assessment_mode && ['TEST', 'EXAM', 'CUSTOM'].includes(String(assessment_mode).toUpperCase())) ? String(assessment_mode).toUpperCase() : 'TEST';
        const delivery = parseInt(delivery_count, 10) || (mode === 'EXAM' ? 50 : 30);
        const shuffleQ = shuffle_questions !== undefined ? (shuffle_questions ? 1 : 0) : 1;
        const shuffleOpt = shuffle_options !== undefined ? (shuffle_options ? 1 : 0) : 1;

        await dbRun(
            `INSERT INTO exam_configs (class, subject, duration_minutes, is_active, assessment_mode, delivery_count, shuffle_questions, shuffle_options)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(class, subject) DO UPDATE SET
                duration_minutes = excluded.duration_minutes,
                is_active = excluded.is_active,
                assessment_mode = excluded.assessment_mode,
                delivery_count = excluded.delivery_count,
                shuffle_questions = excluded.shuffle_questions,
                shuffle_options = excluded.shuffle_options`,
            [targetClass, targetSubject, duration, activeFlag, mode, delivery, shuffleQ, shuffleOpt]
        );

        return res.json({
            success: true,
            message: `Exam config saved for ${targetClass || 'ALL'} - ${targetSubject}`,
            class: targetClass,
            subject: targetSubject,
            is_active: activeFlag,
            assessment_mode: mode
        });
    } catch (err) {
        console.error('❌ [Save Exam Config Error]:', err);
        next(err);
    }
});



// --------------------------------------------------------------------------
// 16. POST /api/admin/system/purge-production-data
// Triggers full production database wipe (mock students, sessions, questions)
// --------------------------------------------------------------------------
const { purgeDatabase } = require('./scripts/purge_production_db');

router.post('/system/purge-production-data', async (req, res, next) => {
    try {
        await purgeDatabase();
        return res.status(200).json({
            success: true,
            message: "Production database successfully purged. 0 mock records remain."
        });
    } catch (err) {
        console.error('❌ [Purge Production Data Error]:', err);
        next(err);
    }
});

module.exports = router;
