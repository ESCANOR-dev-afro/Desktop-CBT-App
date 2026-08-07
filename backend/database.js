/**
 * database.js
 * 
 * Local SQLite Database Initialization Module for Desktop CBT App Backend.
 * Handles database connection, foreign key pragmas, table creation,
 * and initial mock data seeding.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Path to the local SQLite database file
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
 * Initializes schema and seeds default data within a sequential transaction block.
 */
function initDatabase() {
    db.serialize(() => {
        // High-Concurrency Optimization for 90+ Workstations
        db.run('PRAGMA journal_mode = WAL;', (err) => {
            if (err) {
                console.error('❌ [Database Error] Failed to enable WAL mode:', err.message);
            } else {
                console.log('⚡ [Database Performance] SQLite WAL (Write-Ahead Logging) mode enabled for high-concurrency.');
            }
        });

        db.run('PRAGMA busy_timeout = 10000;', (err) => {
            if (err) {
                console.error('❌ [Database Error] Failed to set busy timeout:', err.message);
            } else {
                console.log('⏱️ [Database Performance] 10,000ms busy timeout configured to prevent lock contention.');
            }
        });

        // 1. Enable Foreign Key Constraints
        db.run('PRAGMA foreign_keys = ON;', (err) => {
            if (err) {
                console.error('❌ [Database Error] Failed to enable foreign keys:', err.message);
            } else {
                console.log('⚙️ [Database Config] Foreign key constraints enabled.');
            }
        });

        // 2. Create `students` table
        const createStudentsTable = `
            CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reg_number TEXT UNIQUE NOT NULL,
                surname TEXT NOT NULL,
                first_name TEXT NOT NULL DEFAULT '',
                class TEXT NOT NULL,
                assigned_subject TEXT NOT NULL
            );
        `;
        db.run(createStudentsTable, (err) => {
            if (err) {
                console.error('❌ [Database Error] Error creating "students" table:', err.message);
            } else {
                console.log('📋 [Table Created] "students" table is ready.');
                db.run(`ALTER TABLE students ADD COLUMN first_name TEXT DEFAULT '';`, () => {});
            }
        });

        // 3. Create `questions` table
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
                correct_answer TEXT NOT NULL CHECK(correct_answer IN ('A', 'B', 'C', 'D'))
            );
        `;
        db.run(createQuestionsTable, (err) => {
            if (err) {
                console.error('❌ [Database Error] Error creating "questions" table:', err.message);
            } else {
                console.log('📋 [Table Created] "questions" table is ready.');
                db.run(`ALTER TABLE questions ADD COLUMN class TEXT;`, () => {});
            }
        });

        // 4. Create `exam_sessions` table
        const createExamSessionsTable = `
            CREATE TABLE IF NOT EXISTS exam_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                workstation_ip TEXT NOT NULL,
                login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                status TEXT NOT NULL CHECK(status IN ('active', 'submitted')) DEFAULT 'active',
                is_locked INTEGER NOT NULL CHECK(is_locked IN (0, 1)) DEFAULT 0,
                score INTEGER DEFAULT NULL,
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
            );
        `;
        db.run(createExamSessionsTable, (err) => {
            if (err) {
                console.error('❌ [Database Error] Error creating "exam_sessions" table:', err.message);
            } else {
                console.log('📋 [Table Created] "exam_sessions" table is ready.');
                // Add score and subject columns if they don't exist in existing database schema
                db.run(`ALTER TABLE exam_sessions ADD COLUMN score INTEGER DEFAULT NULL;`, () => {});
                db.run(`ALTER TABLE exam_sessions ADD COLUMN subject TEXT DEFAULT NULL;`, () => {});
            }
        });

        // 5. Create `answers` table
        const createAnswersTable = `
            CREATE TABLE IF NOT EXISTS answers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                question_id INTEGER NOT NULL,
                selected_option TEXT NOT NULL CHECK(selected_option IN ('A', 'B', 'C', 'D')),
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
                FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
            );
        `;
        db.run(createAnswersTable, (err) => {
            if (err) {
                console.error('❌ [Database Error] Error creating "answers" table:', err.message);
            } else {
                console.log('📋 [Table Created] "answers" table is ready.');
            }
        });

        // Seed data once tables are ready
        seedDatabase();
    });
}

/**
 * Helper function to seed mock students and questions.
 * Ensures surnames are stored strictly in UPPERCASE and seeding is idempotent.
 */
function seedDatabase() {
    // Seed Mock Students
    const mockStudents = [
        { reg_number: '1009001', surname: 'okonkwo', first_name: 'Chidi', class: 'SS3', assigned_subject: 'mathematics' },
        { reg_number: '1009002', surname: 'adebayo', first_name: 'Amina', class: 'SS3', assigned_subject: 'mathematics' }
    ];

    const studentInsertSql = `
        INSERT OR IGNORE INTO students (reg_number, surname, first_name, class, assigned_subject)
        VALUES (?, ?, ?, ?, ?);
    `;

    const studentStmt = db.prepare(studentInsertSql);
    mockStudents.forEach(student => {
        // Enforce UPPERCASE surname strictly before persisting
        const formattedSurname = student.surname.trim().toUpperCase();
        studentStmt.run([student.reg_number, formattedSurname, student.first_name.trim(), student.class, student.assigned_subject], function(err) {
            if (err) {
                console.error(`❌ [Seed Error] Failed to insert student ${student.reg_number}:`, err.message);
            } else if (this.changes > 0) {
                console.log(`🌱 [Seed Data] Inserted mock student: Reg #${student.reg_number} (${formattedSurname}, ${student.first_name})`);
            }
        });
    });
    studentStmt.finalize();

    // Seed Mock Objective Questions (Mathematics)
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

    // Check if questions table is already populated to avoid duplicate questions on re-runs
    db.get('SELECT COUNT(*) AS count FROM questions WHERE subject = ?', ['mathematics'], (err, row) => {
        if (err) {
            console.error('❌ [Seed Error] Failed to check questions count:', err.message);
            return;
        }

        if (row.count === 0) {
            const questionInsertSql = `
                INSERT INTO questions (class, subject, question_text, option_a, option_b, option_c, option_d, correct_answer)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            `;
            const questionStmt = db.prepare(questionInsertSql);
            mockQuestions.forEach(q => {
                questionStmt.run([q.class, q.subject, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer], function(err) {
                    if (err) {
                        console.error('❌ [Seed Error] Failed to insert question:', err.message);
                    } else if (this.changes > 0) {
                        console.log(`🌱 [Seed Data] Inserted mock math question ID: ${this.lastID}`);
                    }
                });
            });
            questionStmt.finalize(() => {
                console.log('🎉 [Database Init Complete] Schema created and seed data verified successfully!');
            });
        } else {
            console.log(`ℹ️ [Seed Data] Questions table already contains ${row.count} questions for "mathematics". Skipping question insertion.`);
            console.log('🎉 [Database Init Complete] Schema created and seed data verified successfully!');
        }
    });
}

// Trigger initial setup
initDatabase();

module.exports = db;
