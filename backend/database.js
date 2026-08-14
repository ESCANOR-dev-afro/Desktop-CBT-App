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

// Path to local SQLite database file
const DB_PATH = path.join(__dirname, 'cbt_database.db');

// Initialize SQLite database instance
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('❌ [Database Error] Failed to connect to SQLite database:', err.message);
    } else {
        console.log(`✅ [Database Info] Connected to SQLite database at: ${DB_PATH}`);
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
                surname TEXT NOT NULL,
                first_name TEXT NOT NULL DEFAULT '',
                class TEXT NOT NULL,
                assigned_subject TEXT NOT NULL,
                class_id INTEGER
            );
        `;
        db.run(createStudentsTable, (err) => {
            if (!err) {
                db.run(`ALTER TABLE students ADD COLUMN first_name TEXT DEFAULT '';`, () => {});
                db.run(`ALTER TABLE students ADD COLUMN class_id INTEGER;`, () => {});
                db.run(`CREATE INDEX IF NOT EXISTS idx_students_class ON students(class);`, () => {});
            }
        });

        // 3. Base Table: `questions`
        const createQuestionsTable = `
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class TEXT,
                subject TEXT NOT NULL,
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
        db.run(createQuestionsTable, (err) => {
            if (!err) {
                db.run(`ALTER TABLE questions ADD COLUMN class TEXT;`, () => {});
                db.run(`ALTER TABLE questions ADD COLUMN marks INTEGER DEFAULT 1;`, () => {});
                db.run(`ALTER TABLE questions ADD COLUMN diagram_image_url TEXT;`, () => {});
                db.run(`ALTER TABLE questions ADD COLUMN exam_id INTEGER;`, () => {});
                db.run(`ALTER TABLE questions ADD COLUMN class_id INTEGER;`, () => {});
                db.run(`ALTER TABLE questions ADD COLUMN subject_id INTEGER;`, () => {});
                db.run(`CREATE INDEX IF NOT EXISTS idx_questions_class_subject ON questions(class, subject);`, () => {});
                db.run(`CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject);`, () => {});
            }
        });

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
                db.run(`ALTER TABLE exam_sessions ADD COLUMN last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP;`, () => {});
                db.run(`ALTER TABLE exam_sessions ADD COLUMN question_order TEXT DEFAULT NULL;`, () => {});
                db.run(`ALTER TABLE exam_sessions ADD COLUMN duration_minutes INTEGER DEFAULT 45;`, () => {});
                db.run(`ALTER TABLE exam_sessions ADD COLUMN exam_id INTEGER;`, () => {});
                db.run(`ALTER TABLE exam_sessions ADD COLUMN term_id INTEGER;`, () => {});
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

        // 7. Base Table: `exam_configs`
        const createExamConfigsTable = `
            CREATE TABLE IF NOT EXISTS exam_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class TEXT,
                subject TEXT NOT NULL,
                duration_minutes INTEGER NOT NULL DEFAULT 45,
                is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(class, subject)
            );
        `;
        db.run(createExamConfigsTable, (err) => {
            if (!err) {
                db.run(`ALTER TABLE exam_configs ADD COLUMN is_active INTEGER DEFAULT 1;`, () => {});
                db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_configs_class_subject ON exam_configs(class, subject);`, () => {});
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

        // Seed data & run auto-normalization
        seedDatabase();
    });
}

/**
 * Seed database with initial default subjects, students, questions, academic terms, and classes.
 */
function seedDatabase() {
    // 1. Seed Academic Terms ('1st Term', '2nd Term', '3rd Term' for 2025/2026)
    const terms = [
        { name: '1st Term', session: '2025/2026', is_current: 0 },
        { name: '2nd Term', session: '2025/2026', is_current: 1 }, // Default Active Term
        { name: '3rd Term', session: '2025/2026', is_current: 0 }
    ];
    const termSql = `
        INSERT INTO academic_terms (name, session, is_current)
        VALUES (?, ?, ?)
        ON CONFLICT(name, session) DO NOTHING;
    `;
    const termStmt = db.prepare(termSql);
    terms.forEach(t => termStmt.run([t.name, t.session, t.is_current]));
    termStmt.finalize();

    // 2. Seed Default Subjects
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

    const subjectInsertSql = `INSERT OR IGNORE INTO subjects (name, is_active) VALUES (?, 1);`;
    const subjectStmt = db.prepare(subjectInsertSql);
    defaultSubjects.forEach(sub => subjectStmt.run([sub]));
    subjectStmt.finalize();

    // 3. Seed Mock Students
    const mockStudents = [
        { reg_number: '1009001', surname: 'OKONKWO', first_name: 'Chidi', class: 'SS 3 Science', assigned_subject: 'Mathematics' },
        { reg_number: '1009002', surname: 'ADEBAYO', first_name: 'Amina', class: 'SS 3 Science', assigned_subject: 'Mathematics' },
        { reg_number: '1009003', surname: 'USMAN', first_name: 'Babatunde', class: 'SS 3 Art', assigned_subject: 'Government' },
        { reg_number: '1009004', surname: 'EZE', first_name: 'Grace', class: 'SS 3 Commercial', assigned_subject: 'Economics' },
        { reg_number: '1009011', surname: 'KALU', first_name: 'David', class: 'JSS 1 Gold', assigned_subject: 'Mathematics' },
        { reg_number: '1009012', surname: 'OKON', first_name: 'Blessing', class: 'JSS 1 Diamond', assigned_subject: 'English Language' },
        { reg_number: '1009013', surname: 'KANU', first_name: 'Nnamdi', class: 'JSS 1 Silver', assigned_subject: 'Mathematics' },
        { reg_number: '1009021', surname: 'BELLO', first_name: 'Zainab', class: 'JSS 2 Gold', assigned_subject: 'Basic Science' },
        { reg_number: '1009022', surname: 'LAWAL', first_name: 'Farouk', class: 'JSS 2 Diamond', assigned_subject: 'Mathematics' },
        { reg_number: '1009023', surname: 'AJAYI', first_name: 'Oluwaseun', class: 'JSS 2 Silver', assigned_subject: 'English Language' },
        { reg_number: '1009031', surname: 'DANIELS', first_name: 'Joy', class: 'JSS 3 Gold', assigned_subject: 'Basic Technology' },
        { reg_number: '1009032', surname: 'AHMED', first_name: 'Mustapha', class: 'JSS 3 Diamond', assigned_subject: 'English Language' },
        { reg_number: '1009033', surname: 'WILLIAMS', first_name: 'Grace', class: 'JSS 3 Silver', assigned_subject: 'Basic Technology' },
        { reg_number: '1009041', surname: 'SANUSI', first_name: 'Kemi', class: 'SS 1 Science', assigned_subject: 'Physics' },
        { reg_number: '1009042', surname: 'OBASI', first_name: 'Emeka', class: 'SS 1 Art', assigned_subject: 'Literature in English' },
        { reg_number: '1009043', surname: 'BAKARE', first_name: 'Tayo', class: 'SS 1 Commercial', assigned_subject: 'Financial Accounting' },
        { reg_number: '1009051', surname: 'NWACHUKWU', first_name: 'Sandra', class: 'SS 2 Science', assigned_subject: 'Chemistry' },
        { reg_number: '1009052', surname: 'IBRAHIM', first_name: 'Halima', class: 'SS 2 Art', assigned_subject: 'Government' },
        { reg_number: '1009053', surname: 'ALABI', first_name: 'Gideon', class: 'SS 2 Commercial', assigned_subject: 'Commerce' }
    ];

    const studentInsertSql = `
        INSERT OR IGNORE INTO students (reg_number, surname, first_name, class, assigned_subject)
        VALUES (?, ?, ?, ?, ?);
    `;
    const studentStmt = db.prepare(studentInsertSql);
    mockStudents.forEach(student => {
        studentStmt.run([student.reg_number, student.surname.toUpperCase(), student.first_name, student.class, student.assigned_subject]);
    });
    studentStmt.finalize();

    // 4. Seed Mock Questions
    const mockQuestions = [
        {
            class: 'SS3',
            subject: 'mathematics',
            question_text: 'Solve for x: 2x + 5 = 15.',
            option_a: '3',
            option_b: '5',
            option_c: '10',
            option_d: '7',
            correct_answer: 'B'
        },
        {
            class: 'SS3',
            subject: 'mathematics',
            question_text: 'What is the square root of 144?',
            option_a: '10',
            option_b: '11',
            option_c: '12',
            option_d: '14',
            correct_answer: 'C'
        },
        {
            class: 'SS3',
            subject: 'mathematics',
            question_text: 'Calculate the area of a circle with radius 7 cm. (Use π = 22/7)',
            option_a: '154 cm²',
            option_b: '44 cm²',
            option_c: '49 cm²',
            option_d: '308 cm²',
            correct_answer: 'A'
        },
        {
            class: 'SS3',
            subject: 'mathematics',
            question_text: 'If a right-angled triangle has sides of length 3 cm and 4 cm, what is the length of the hypotenuse?',
            option_a: '6 cm',
            option_b: '5 cm',
            option_c: '7 cm',
            option_d: '8 cm',
            correct_answer: 'B'
        },
        {
            class: 'SS3',
            subject: 'mathematics',
            question_text: 'What is the value of 3^4 (3 to the 4th power)?',
            option_a: '12',
            option_b: '27',
            option_c: '81',
            option_d: '64',
            correct_answer: 'C'
        }
    ];

    db.get('SELECT COUNT(*) AS count FROM questions WHERE LOWER(subject) = ?', ['mathematics'], (err, row) => {
        if (!err && row && row.count === 0) {
            const questionInsertSql = `
                INSERT INTO questions (class, subject, question_text, option_a, option_b, option_c, option_d, correct_answer)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            `;
            const questionStmt = db.prepare(questionInsertSql);
            mockQuestions.forEach(q => {
                questionStmt.run([q.class, q.subject, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer]);
            });
            questionStmt.finalize(() => {
                runAutoNormalization();
            });
        } else {
            runAutoNormalization();
        }
    });
}

/**
 * Runs automated data normalization:
 * - Syncs distinct class names to `classes` table.
 * - Syncs question options from flat `questions` table to `question_options` table.
 * - Populates `exams` table.
 */
async function runAutoNormalization() {
    try {
        // 1. Populate `classes` table from `students` and `questions`
        const studentClasses = await allAsync(`SELECT DISTINCT class FROM students WHERE class IS NOT NULL AND TRIM(class) != ''`);
        const questionClasses = await allAsync(`SELECT DISTINCT class FROM questions WHERE class IS NOT NULL AND TRIM(class) != ''`);
        const allClassNames = new Set();

        studentClasses.forEach(c => allClassNames.add(c.class.trim()));
        questionClasses.forEach(c => allClassNames.add(c.class.trim()));

        // Also add standard base classes
        ['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'].forEach(c => allClassNames.add(c));

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

        // 3. Sync `class_id` on `students`
        const classesRows = await allAsync(`SELECT id, name FROM classes`);
        const classMap = new Map(classesRows.map(c => [c.name.toLowerCase(), c.id]));
        
        for (const [name, id] of classMap.entries()) {
            await runAsync(`UPDATE students SET class_id = ? WHERE LOWER(class) = LOWER(?)`, [id, name]);
            await runAsync(`UPDATE questions SET class_id = ? WHERE LOWER(class) = LOWER(?)`, [id, name]);
        }

        console.log('🎉 [Database Normalization Complete] SQLite WAL ready & normalized schema synchronized successfully.');
    } catch (err) {
        console.error('⚠️ [Normalization Sync Notice]:', err.message);
    }
}

// Trigger initial setup
initDatabase();

module.exports = db;
