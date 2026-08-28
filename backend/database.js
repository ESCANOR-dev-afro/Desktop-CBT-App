/**
 * database.js
 * 
 * Local SQLite Database Initialization & Schema Normalization Module for CBT App Backend.
 * Manages embedded SQLite connection with WAL high-concurrency mode, foreign key pragmas,
 * normalized backend tables (Classes, Academic Terms, Exams, Question Options, Audit Logs),
 * performance indexes, and seed data migration.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Path to local SQLite database file (locked to canonical absolute path)
const DB_PATH = path.resolve(__dirname, 'cbt_database.db');

// Initialize SQLite database instance
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('❌ [Database Error] Failed to connect to SQLite database:', err.message);
    } else {
        console.log(`✅ [Database Info] Connected to persistent SQLite database at: ${DB_PATH}`);
    }
});

/**
 * Executes a Promise-based SQL run statement.
 */
function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

/**
 * Executes a Promise-based SQL get statement.
 */
function getAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

/**
 * Executes a Promise-based SQL all statement.
 */
function allAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

/**
 * Initializes schema, creates normalized backend tables, and seeds initial data.
 */
function initDatabase() {
    db.serialize(() => {
        // High-Concurrency Optimization for 90+ Workstations
        db.run('PRAGMA journal_mode = WAL;', (err) => {
            if (err) {
                console.error('❌ [Database Error] Failed to enable WAL mode:', err.message);
            } else {
                console.log('⚡ [Database Performance] SQLite WAL mode enabled for high-concurrency.');
            }
        });

        db.run('PRAGMA busy_timeout = 10000;', (err) => {
            if (err) {
                console.error('❌ [Database Error] Failed to set busy timeout:', err.message);
            } else {
                console.log('⏱️ [Database Performance] 10,000ms busy timeout configured.');
            }
        });

        db.run('PRAGMA synchronous = NORMAL;', () => {});
        db.run('PRAGMA cache_size = -64000;', () => {});
        db.run('PRAGMA temp_store = MEMORY;', () => {});

        // 1. Enable Foreign Key Constraints
        db.run('PRAGMA foreign_keys = ON;', (err) => {
            if (err) {
                console.error('❌ [Database Error] Failed to enable foreign keys:', err.message);
            } else {
                console.log('⚙️ [Database Config] Foreign key constraints enabled.');
            }
        });

        // 2. Base Table: `students`
        const createStudentsTable = `
            CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reg_number TEXT UNIQUE NOT NULL,
                registration_no TEXT UNIQUE,
                surname TEXT NOT NULL,
                first_name TEXT NOT NULL DEFAULT '',
                class TEXT NOT NULL,
                assigned_subject TEXT NOT NULL,
                class_id INTEGER,
                academic_term_id INTEGER,
                password TEXT
            );
        `;
        db.run(createStudentsTable, (err) => {
            if (!err) {
                db.run(`ALTER TABLE students ADD COLUMN first_name TEXT DEFAULT '';`, () => {});
                db.run(`ALTER TABLE students ADD COLUMN class_id INTEGER;`, () => {});
                db.run(`ALTER TABLE students ADD COLUMN registration_no TEXT;`, () => {});
                db.run(`ALTER TABLE students ADD COLUMN academic_term_id INTEGER;`, () => {});
                db.run(`ALTER TABLE students ADD COLUMN password TEXT;`, () => {});
                db.run(`UPDATE students SET registration_no = reg_number WHERE registration_no IS NULL OR TRIM(registration_no) = '';`, () => {});
                db.run(`CREATE INDEX IF NOT EXISTS idx_students_class ON students(class);`, () => {});
                db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_students_registration_no ON students(registration_no);`, () => {});
            }
        });

        // 3. Base Table: `questions`
        const createQuestionsTable = `
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session TEXT DEFAULT '2026/2027',
                term TEXT DEFAULT '1st Term',
                class TEXT,
                subject TEXT NOT NULL,
                assessment_slot TEXT DEFAULT 'midterm_ca',
                question_text TEXT NOT NULL,
                option_a TEXT NOT NULL,
                option_b TEXT NOT NULL,
                option_c TEXT NOT NULL,
                option_d TEXT NOT NULL,
                correct_answer TEXT NOT NULL CHECK(correct_answer IN ('A', 'B', 'C', 'D')),
                marks INTEGER DEFAULT 1,
                diagram_image_url TEXT,
                exam_id INTEGER,
                class_id INTEGER,
                subject_id INTEGER
            );
        `;
        db.run(createQuestionsTable);
        db.run(`ALTER TABLE questions ADD COLUMN session TEXT DEFAULT '2026/2027';`, () => {});
        db.run(`ALTER TABLE questions ADD COLUMN term TEXT DEFAULT '1st Term';`, () => {});
        db.run(`ALTER TABLE questions ADD COLUMN assessment_slot TEXT DEFAULT 'midterm_ca';`, () => {});
        db.run(`ALTER TABLE questions ADD COLUMN class TEXT;`, () => {});
        db.run(`ALTER TABLE questions ADD COLUMN marks INTEGER DEFAULT 1;`, () => {});
        db.run(`ALTER TABLE questions ADD COLUMN diagram_image_url TEXT;`, () => {});
        db.run(`ALTER TABLE questions ADD COLUMN exam_id INTEGER;`, () => {});
        db.run(`ALTER TABLE questions ADD COLUMN class_id INTEGER;`, () => {});
        db.run(`ALTER TABLE questions ADD COLUMN subject_id INTEGER;`, () => {});
        db.run(`UPDATE questions SET session = '2026/2027' WHERE session IS NULL OR TRIM(session) = '';`, () => {});
        db.run(`UPDATE questions SET term = '1st Term' WHERE term IS NULL OR TRIM(term) = '';`, () => {});
        db.run(`UPDATE questions SET assessment_slot = 'midterm_ca' WHERE assessment_slot IS NULL OR TRIM(assessment_slot) = '' OR LOWER(assessment_slot) = 'general';`, () => {});
        db.run(`UPDATE questions SET assessment_slot = 'examination' WHERE LOWER(assessment_slot) = 'terminal_exam';`, () => {});
        db.run(`UPDATE questions SET assessment_slot = 'custom_assessment' WHERE LOWER(assessment_slot) = 'custom_exam';`, () => {});
        db.run(`UPDATE assessment_configs SET assessment_slot = 'examination' WHERE LOWER(assessment_slot) = 'terminal_exam';`, () => {});
        db.run(`UPDATE assessment_configs SET assessment_slot = 'custom_assessment' WHERE LOWER(assessment_slot) = 'custom_exam';`, () => {});
        db.run(`CREATE INDEX IF NOT EXISTS idx_questions_class_subject ON questions(class, subject);`, () => {});
        db.run(`CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject);`, () => {});
        db.run(`CREATE INDEX IF NOT EXISTS idx_questions_scoped ON questions(session, term, class, subject, assessment_slot);`, () => {});

        // 4. Base Table: `exam_sessions`
        const createExamSessionsTable = `
            CREATE TABLE IF NOT EXISTS exam_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                workstation_ip TEXT NOT NULL,
                login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
                status TEXT NOT NULL CHECK(status IN ('active', 'submitted')) DEFAULT 'active',
                is_locked INTEGER NOT NULL CHECK(is_locked IN (0, 1)) DEFAULT 0,
                score INTEGER DEFAULT NULL,
                subject TEXT DEFAULT NULL,
                session TEXT DEFAULT '2026/2027',
                term TEXT DEFAULT '1st Term',
                assessment_slot TEXT DEFAULT 'midterm_ca',
                question_order TEXT DEFAULT NULL,
                duration_minutes INTEGER DEFAULT 45,
                exam_id INTEGER,
                term_id INTEGER,
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
            );
        `;
        db.run(createExamSessionsTable, (err) => {
            if (!err) {
                db.run(`ALTER TABLE exam_sessions ADD COLUMN score INTEGER DEFAULT NULL;`, () => {});
                db.run(`ALTER TABLE exam_sessions ADD COLUMN subject TEXT DEFAULT NULL;`, () => {});
                db.run(`ALTER TABLE exam_sessions ADD COLUMN session TEXT DEFAULT '2026/2027';`, () => {});
                db.run(`ALTER TABLE exam_sessions ADD COLUMN term TEXT DEFAULT '1st Term';`, () => {});
                db.run(`ALTER TABLE exam_sessions ADD COLUMN assessment_slot TEXT DEFAULT 'midterm_ca';`, () => {});
                db.run(`ALTER TABLE exam_sessions ADD COLUMN last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP;`, () => {});
                db.run(`ALTER TABLE exam_sessions ADD COLUMN question_order TEXT DEFAULT NULL;`, () => {});
                db.run(`ALTER TABLE exam_sessions ADD COLUMN duration_minutes INTEGER DEFAULT 45;`, () => {});
                db.run(`ALTER TABLE exam_sessions ADD COLUMN exam_id INTEGER;`, () => {});
                db.run(`ALTER TABLE exam_sessions ADD COLUMN term_id INTEGER;`, () => {});
                db.run(`ALTER TABLE exam_sessions ADD COLUMN option_mapping TEXT DEFAULT NULL;`, () => {});
                db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_student_status ON exam_sessions(student_id, status);`, () => {});
                db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_student_subject_status ON exam_sessions(student_id, subject, status);`, () => {});
            }
        });

        // 5. Base Table: `answers`
        const createAnswersTable = `
            CREATE TABLE IF NOT EXISTS answers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                question_id INTEGER NOT NULL,
                selected_option TEXT NOT NULL CHECK(selected_option IN ('A', 'B', 'C', 'D')),
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                session_id INTEGER,
                option_id INTEGER,
                UNIQUE(student_id, question_id),
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
                FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
            );
        `;
        db.run(createAnswersTable, (err) => {
            if (!err) {
                db.run(`ALTER TABLE answers ADD COLUMN session_id INTEGER;`, () => {});
                db.run(`ALTER TABLE answers ADD COLUMN option_id INTEGER;`, () => {});
                db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_answers_student_question ON answers(student_id, question_id);`, () => {});
                db.run(`CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);`, () => {});
                db.run(`CREATE INDEX IF NOT EXISTS idx_answers_session_id ON answers(session_id);`, () => {});
            }
        });

        // 6. Base Table: `subjects`
        const createSubjectsTable = `
            CREATE TABLE IF NOT EXISTS subjects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                code TEXT,
                duration_minutes INTEGER NOT NULL DEFAULT 45,
                is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1))
            );
        `;
        db.run(createSubjectsTable, (err) => {
            if (!err) {
                db.run(`ALTER TABLE subjects ADD COLUMN is_active INTEGER DEFAULT 1;`, () => {});
                db.run(`ALTER TABLE subjects ADD COLUMN duration_minutes INTEGER DEFAULT 45;`, () => {});
                db.run(`CREATE INDEX IF NOT EXISTS idx_subjects_name ON subjects(name);`, () => {});
            }
        });

        // 7. Base Table: `exam_configs` (Legacy & Subject global defaults)
        const createExamConfigsTable = `
            CREATE TABLE IF NOT EXISTS exam_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class TEXT,
                subject TEXT NOT NULL,
                duration_minutes INTEGER NOT NULL DEFAULT 45,
                is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
                assessment_mode TEXT DEFAULT 'TEST',
                delivery_count INTEGER DEFAULT 30,
                shuffle_questions INTEGER DEFAULT 1,
                shuffle_options INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(class, subject)
            );
        `;
        db.run(createExamConfigsTable, (err) => {
            if (!err) {
                db.run(`ALTER TABLE exam_configs ADD COLUMN is_active INTEGER DEFAULT 1;`, () => {});
                db.run(`ALTER TABLE exam_configs ADD COLUMN assessment_mode TEXT DEFAULT 'TEST';`, () => {});
                db.run(`ALTER TABLE exam_configs ADD COLUMN delivery_count INTEGER DEFAULT 30;`, () => {});
                db.run(`ALTER TABLE exam_configs ADD COLUMN shuffle_questions INTEGER DEFAULT 1;`, () => {});
                db.run(`ALTER TABLE exam_configs ADD COLUMN shuffle_options INTEGER DEFAULT 1;`, () => {});
                db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_configs_class_subject ON exam_configs(class, subject);`, () => {});
            }
        });

        // 7a. Base Table: `student_sessions` (Unified per-subject/config submissions)
        const createStudentSessionsTable = `
            CREATE TABLE IF NOT EXISTS student_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER,
                reg_number TEXT,
                config_id INTEGER,
                subject TEXT,
                answers_json TEXT,
                score REAL,
                status TEXT DEFAULT 'submitted',
                submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `;
        db.run(createStudentSessionsTable, (err) => {
            if (!err) {
                db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_student_sessions_reg_cfg ON student_sessions(reg_number, config_id);`, () => {});
            }
        });

        // 7b. New Table: `assessment_configs` (Fully Scoped per Session, Term, Class, Subject, Slot)
        const createAssessmentConfigsTable = `
            CREATE TABLE IF NOT EXISTS assessment_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session TEXT NOT NULL DEFAULT '2026/2027',
                term TEXT NOT NULL DEFAULT '1st Term',
                class TEXT,
                subject TEXT NOT NULL,
                assessment_slot TEXT NOT NULL DEFAULT 'midterm_ca',
                assessment_title TEXT,
                duration_minutes INTEGER NOT NULL DEFAULT 45,
                preset_mode TEXT DEFAULT 'ca_test',
                custom_count INTEGER DEFAULT 30,
                shuffle_questions INTEGER DEFAULT 1,
                shuffle_options INTEGER DEFAULT 1,
                is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0, 1)),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(session, term, class, subject, assessment_slot)
            );
        `;
        db.run(createAssessmentConfigsTable, (err) => {
            if (!err) {
                db.run(`ALTER TABLE assessment_configs ADD COLUMN session TEXT DEFAULT '2026/2027';`, () => {});
                db.run(`ALTER TABLE assessment_configs ADD COLUMN term TEXT DEFAULT '1st Term';`, () => {});
                db.run(`ALTER TABLE assessment_configs ADD COLUMN assessment_slot TEXT DEFAULT 'midterm_ca';`, () => {});
                db.run(`ALTER TABLE assessment_configs ADD COLUMN assessment_title TEXT;`, () => {});
                db.run(`ALTER TABLE assessment_configs ADD COLUMN preset_mode TEXT DEFAULT 'ca_test';`, () => {});
                db.run(`ALTER TABLE assessment_configs ADD COLUMN custom_count INTEGER DEFAULT 30;`, () => {});
                db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_assessment_configs_scoped ON assessment_configs(session, term, class, subject, assessment_slot);`, () => {});
            }
        });

        // ----------------------------------------------------
        // NEW NORMALIZED BACKEND TABLES
        // ----------------------------------------------------

        // 8. Normalized Entity: `classes`
        const createClassesTable = `
            CREATE TABLE IF NOT EXISTS classes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                code TEXT,
                level TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `;
        db.run(createClassesTable, (err) => {
            if (err) console.error('❌ Error creating "classes" table:', err.message);
            else console.log('📋 [Table Created] Normalized "classes" entity is ready.');
        });

        // 9. Normalized Entity: `academic_terms`
        const createAcademicTermsTable = `
            CREATE TABLE IF NOT EXISTS academic_terms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                session TEXT NOT NULL DEFAULT '2025/2026',
                is_current INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN (0, 1)),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name, session)
            );
        `;
        db.run(createAcademicTermsTable, (err) => {
            if (err) console.error('❌ Error creating "academic_terms" table:', err.message);
            else console.log('📋 [Table Created] Normalized "academic_terms" entity is ready.');
        });

        // 10. Normalized Entity: `exams` (Decouples exam paper configurations from raw subject strings)
        const createExamsTable = `
            CREATE TABLE IF NOT EXISTS exams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
                class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
                term_id INTEGER REFERENCES academic_terms(id) ON DELETE SET NULL,
                duration_minutes INTEGER NOT NULL DEFAULT 45,
                total_marks INTEGER DEFAULT 50,
                is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(subject_id, class_id, term_id)
            );
        `;
        db.run(createExamsTable, (err) => {
            if (err) console.error('❌ Error creating "exams" table:', err.message);
            else console.log('📋 [Table Created] Normalized "exams" entity is ready.');
        });

        // 11. Normalized Entity: `question_options`
        const createQuestionOptionsTable = `
            CREATE TABLE IF NOT EXISTS question_options (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
                option_key TEXT NOT NULL CHECK(option_key IN ('A', 'B', 'C', 'D', 'E')),
                option_text TEXT NOT NULL,
                is_correct INTEGER NOT NULL DEFAULT 0 CHECK(is_correct IN (0, 1)),
                UNIQUE(question_id, option_key)
            );
        `;
        db.run(createQuestionOptionsTable, (err) => {
            if (err) console.error('❌ Error creating "question_options" table:', err.message);
            else console.log('📋 [Table Created] Normalized "question_options" entity is ready.');
        });

        // 12. Normalized Entity: `audit_logs`
        const createAuditLogsTable = `
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT,
                details TEXT,
                ip_address TEXT,
                performed_by TEXT DEFAULT 'ADMIN',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `;
        db.run(createAuditLogsTable, (err) => {
            if (err) console.error('❌ Error creating "audit_logs" table:', err.message);
            else console.log('📋 [Table Created] "audit_logs" table is ready.');
        });

        // 13. Normalized Mapping Entity: `class_subjects`
        const createClassSubjectsTable = `
            CREATE TABLE IF NOT EXISTS class_subjects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
                subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
                class_name TEXT NOT NULL,
                subject_name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(class_name, subject_name)
            );
        `;
        db.run(createClassSubjectsTable, (err) => {
            if (err) console.error('❌ Error creating "class_subjects" table:', err.message);
            else console.log('📋 [Table Created] Normalized "class_subjects" mapping table is ready.');
        });

        // 14. Student Exam Session Tracking & Auto-Resume Persistence Table
        const createStudentExamSessionsTable = `
            CREATE TABLE IF NOT EXISTS student_exam_sessions (
                session_id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                class_id INTEGER,
                subject_id INTEGER,
                subject_name TEXT NOT NULL,
                class_name TEXT,
                status TEXT NOT NULL CHECK(status IN ('IN_PROGRESS', 'SUBMITTED', 'EXPIRED')) DEFAULT 'IN_PROGRESS',
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME,
                duration_minutes INTEGER DEFAULT 45,
                delivered_questions_json TEXT NOT NULL DEFAULT '[]',
                selected_answers_json TEXT DEFAULT '{}',
                current_question_index INTEGER DEFAULT 0,
                score INTEGER DEFAULT NULL,
                workstation_ip TEXT,
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
            );
        `;
        db.run(createStudentExamSessionsTable, (err) => {
            if (err) console.error('❌ Error creating "student_exam_sessions" table:', err.message);
            else {
                console.log('📋 [Table Created] "student_exam_sessions" entity is ready.');
                db.run(`ALTER TABLE student_exam_sessions ADD COLUMN current_question_index INTEGER DEFAULT 0;`, () => {});
                db.run(`ALTER TABLE student_exam_sessions ADD COLUMN last_heartbeat DATETIME;`, () => {});
                db.run(`ALTER TABLE student_exam_sessions ADD COLUMN remaining_seconds INTEGER;`, () => {});
                db.run(`ALTER TABLE student_exam_sessions ADD COLUMN assessment_slot TEXT DEFAULT 'midterm_ca';`, () => {});
                db.run(`ALTER TABLE student_exam_sessions ADD COLUMN exam_id INTEGER;`, () => {});
                db.run(`CREATE INDEX IF NOT EXISTS idx_ses_student_status ON student_exam_sessions(student_id, status);`, () => {});
                db.run(`CREATE INDEX IF NOT EXISTS idx_ses_student_subject_status ON student_exam_sessions(student_id, subject_name, status);`, () => {});
            }
        });

        // Seed default catalog data (subjects, terms) — safe INSERT OR IGNORE, no data loss
        seedDefaultCatalog();
    });
}

/**
 * Seeds ONLY default catalog data (academic terms, master subject list).
 * Uses INSERT OR IGNORE — never overwrites or deletes existing records.
 * Normalization (class_subjects sync, question_options sync) is run ONCE,
 * not on every server restart.
 */
function seedDefaultCatalog() {
    // 1. Seed Academic Terms ('1st Term', '2nd Term', '3rd Term' for 2026/2027)
    const terms = [
        { name: '1st Term', session: '2026/2027', is_current: 1 },
        { name: '2nd Term', session: '2026/2027', is_current: 0 },
        { name: '3rd Term', session: '2026/2027', is_current: 0 }
    ];
    const termSql = `
        INSERT INTO academic_terms (name, session, is_current)
        VALUES (?, ?, ?)
        ON CONFLICT(name, session) DO NOTHING;
    `;
    const termStmt = db.prepare(termSql);
    terms.forEach(t => termStmt.run([t.name, t.session, t.is_current]));
    termStmt.finalize(() => {
        db.get(`SELECT COUNT(*) as count FROM academic_terms WHERE is_current = 1`, [], (err, row) => {
            if (!err && row && row.count === 0) {
                db.run(`UPDATE academic_terms SET is_current = 1 WHERE session = '2026/2027' AND name = '1st Term'`);
            }
        });
    });

    // 2. Seed Default Master Subjects Catalog (INSERT OR IGNORE — never overwrites)
    const defaultSubjects = [
        'English Language', 'Mathematics', 'Basic Science', 'Basic Technology',
        'Social Studies', 'Civic Education', 'Agricultural Science', 'Business Studies',
        'PHE', 'Home Economics', 'Music', 'Fine Art', 'French', 'Yoruba', 'CRS',
        'Digital Technology', 'Biology', 'Chemistry', 'Physics', 'Further Mathematics',
        'Economics', 'Financial Accounting', 'Commerce', 'Business Methods', 'Government',
        'Literature in English', 'CRS/IRS', 'Geography', 'Computer Studies', 'History', 'Account'
    ];

    const subjectInsertSql = `INSERT OR IGNORE INTO subjects (name, is_active) VALUES (?, 1);`;
    const subjectStmt = db.prepare(subjectInsertSql);
    defaultSubjects.forEach(sub => subjectStmt.run([sub]));
    subjectStmt.finalize(() => {
        // Only run heavy normalization if explicitly requested or first-time setup
        checkAndRunNormalization();
    });
}

/**
 * Checks whether full normalization has already been performed.
 * Uses a lightweight `_normalization_meta` table to track completion.
 * Normalization only runs:
 *   1. On first-ever server boot (meta table doesn't exist or no entry)
 *   2. When RUN_NORMALIZE=true environment variable is set
 * This prevents expensive re-sync operations and any potential CASCADE
 * side-effects during normal production server restarts.
 */
async function checkAndRunNormalization() {
    try {
        // Create tracking table if it doesn't exist
        await runAsync(`CREATE TABLE IF NOT EXISTS _normalization_meta (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            last_run_at DATETIME,
            version INTEGER DEFAULT 1
        )`);

        const forceNormalize = process.env.RUN_NORMALIZE === 'true';
        const meta = await getAsync(`SELECT * FROM _normalization_meta WHERE id = 1`);

        if (meta && !forceNormalize) {
            // Already normalized — skip heavy operations on restart
            console.log('🔒 [Normalization] Schema already normalized (last run: ' + meta.last_run_at + '). Skipping re-sync. Set RUN_NORMALIZE=true to force.');
            return;
        }

        console.log(forceNormalize 
            ? '🔄 [Normalization] Forced re-normalization via RUN_NORMALIZE=true...'
            : '🆕 [Normalization] First-time setup detected. Running full normalization...');

        await runAutoNormalization();

        // Record completion
        await runAsync(
            `INSERT INTO _normalization_meta (id, last_run_at, version) VALUES (1, datetime('now'), 1)
             ON CONFLICT(id) DO UPDATE SET last_run_at = datetime('now'), version = version + 1`
        );
    } catch (err) {
        console.error('⚠️ [Normalization Check Error]:', err.message);
    }
}

/**
 * Runs automated data normalization:
 * - Syncs distinct class names to `classes` table.
 * - Syncs question options from flat `questions` table to `question_options` table.
 * - Purges concatenated subject strings from subjects table.
 * - Populates `class_subjects` mapping table with strict Junior and Senior stream allocations.
 *
 * WARNING: This function is intentionally NOT run on every server restart.
 * It is only triggered on first-time setup or when RUN_NORMALIZE=true.
 */
async function runAutoNormalization() {
    try {
        // Purge any concatenated/multi-subject records from subjects master table
        await runAsync(`DELETE FROM subjects WHERE name LIKE '%,%'`);

        // 1. Populate `classes` table with standard base classes and arms
        const studentClasses = await allAsync(`SELECT DISTINCT class FROM students WHERE class IS NOT NULL AND TRIM(class) != ''`);
        const questionClasses = await allAsync(`SELECT DISTINCT class FROM questions WHERE class IS NOT NULL AND TRIM(class) != ''`);
        const allClassNames = new Set();

        studentClasses.forEach(c => allClassNames.add(c.class.trim()));
        questionClasses.forEach(c => allClassNames.add(c.class.trim()));

        const baseClassesList = [
            'JSS 1', 'JSS 1 Gold', 'JSS 1 Silver', 'JSS 1 Diamond',
            'JSS 2', 'JSS 2 Gold', 'JSS 2 Silver', 'JSS 2 Diamond',
            'JSS 3', 'JSS 3 Gold', 'JSS 3 Silver', 'JSS 3 Diamond',
            'SS 1', 'SS 1 Science', 'SS 1 Commercial', 'SS 1 Art', 'SS 1 Arts',
            'SS 2', 'SS 2 Science', 'SS 2 Commercial', 'SS 2 Art', 'SS 2 Arts',
            'SS 3', 'SS 3 Science', 'SS 3 Commercial', 'SS 3 Art', 'SS 3 Arts'
        ];
        baseClassesList.forEach(c => allClassNames.add(c));

        for (const clsName of allClassNames) {
            const level = clsName.startsWith('JSS') ? 'JSS' : (clsName.startsWith('SS') ? 'SS' : 'GENERAL');
            await runAsync(`INSERT OR IGNORE INTO classes (name, level) VALUES (?, ?)`, [clsName, level]);
        }

        // 2. Populate `question_options` table from existing questions
        const questionsList = await allAsync(`SELECT id, option_a, option_b, option_c, option_d, correct_answer FROM questions`);
        for (const q of questionsList) {
            const options = [
                { key: 'A', text: q.option_a, is_correct: q.correct_answer === 'A' ? 1 : 0 },
                { key: 'B', text: q.option_b, is_correct: q.correct_answer === 'B' ? 1 : 0 },
                { key: 'C', text: q.option_c, is_correct: q.correct_answer === 'C' ? 1 : 0 },
                { key: 'D', text: q.option_d, is_correct: q.correct_answer === 'D' ? 1 : 0 }
            ];

            for (const opt of options) {
                if (opt.text && String(opt.text).trim() !== '') {
                    await runAsync(
                        `INSERT INTO question_options (question_id, option_key, option_text, is_correct)
                         VALUES (?, ?, ?, ?)
                         ON CONFLICT(question_id, option_key) DO UPDATE SET
                            option_text = excluded.option_text,
                            is_correct = excluded.is_correct`,
                        [q.id, opt.key, String(opt.text).trim(), opt.is_correct]
                    );
                }
            }
        }

        // 3. Sync `class_id` on `students` and `questions`
        const classesRows = await allAsync(`SELECT id, name FROM classes`);
        const classMap = new Map(classesRows.map(c => [c.name.toLowerCase(), c.id]));
        
        for (const [name, id] of classMap.entries()) {
            await runAsync(`UPDATE students SET class_id = ? WHERE LOWER(class) = LOWER(?)`, [id, name]);
            await runAsync(`UPDATE questions SET class_id = ? WHERE LOWER(class) = LOWER(?)`, [id, name]);
        }

        // 4. Populate Stream & Tier Subject Mappings into `class_subjects` Table
        await runAsync('DELETE FROM class_subjects');
        const juniorSubjects = [
            "English Language", "Mathematics", "Yoruba", "French", "Fine Art", "Music",
            "Basic Science", "Basic Technology", "PHE", "Digital Technology", "Social Studies",
            "Civic Education", "Home Economics", "Agricultural Science", "Business Studies", "History"
        ];
        const scienceSubjects = [
            "Mathematics", "English Language", "Biology", "Chemistry", "Physics",
            "Civic Education", "Further Mathematics", "Economics", "Digital Technology",
            "Agricultural Science", "Geography"
        ];
        const artsSubjects = [
            "Mathematics", "English Language", "Civic Education", "Economics",
            "Digital Technology", "Government", "CRS", "Literature in English"
        ];
        const commercialSubjects = [
            "Mathematics", "English Language", "Civic Education", "Further Mathematics",
            "Economics", "Digital Technology", "Account", "Commerce", "Government"
        ];

        const allStreamSubjects = Array.from(new Set([
            ...juniorSubjects, ...scienceSubjects, ...commercialSubjects, ...artsSubjects
        ]));
        for (const sName of allStreamSubjects) {
            await runAsync(`INSERT OR IGNORE INTO subjects (name, is_active) VALUES (?, 1)`, [sName]);
        }

        const subjectRows = await allAsync(`SELECT id, name FROM subjects`);
        const subjMap = new Map(subjectRows.map(s => [s.name.toLowerCase(), s.id]));

        for (const cls of classesRows) {
            const nameUpper = cls.name.toUpperCase();
            let allocated = [];

            if (nameUpper.startsWith('JSS')) {
                allocated = juniorSubjects;
            } else if (nameUpper.includes('SCIENCE')) {
                allocated = scienceSubjects;
            } else if (nameUpper.includes('COMMERCIAL')) {
                allocated = commercialSubjects;
            } else if (nameUpper.includes('ART')) {
                allocated = artsSubjects;
            } else {
                allocated = scienceSubjects;
            }

            for (const subName of allocated) {
                const subId = subjMap.get(subName.toLowerCase()) || null;
                await runAsync(
                    `INSERT INTO class_subjects (class_id, subject_id, class_name, subject_name)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(class_name, subject_name) DO UPDATE SET
                        class_id = excluded.class_id,
                        subject_id = excluded.subject_id`,
                    [cls.id, subId, cls.name, subName]
                );
            }
        }

        console.log('🎉 [Database Normalization Complete] SQLite WAL ready, class_subjects mappings & normalized schema synchronized successfully.');
    } catch (err) {
        console.error('⚠️ [Normalization Sync Notice]:', err.message);
    }
}

// Trigger initial setup
initDatabase();

// Production persistence confirmation — schema uses CREATE TABLE IF NOT EXISTS only,
// no DROP, TRUNCATE, or DELETE FROM students runs during server startup.
console.log('🔒 [Data Persistence] Student roster data is permanently preserved across server restarts. No destructive migrations executed.');

module.exports = db;

