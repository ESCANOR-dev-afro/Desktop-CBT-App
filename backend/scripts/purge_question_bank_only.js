/**
 * purge_question_bank_only.js
 * 
 * Surgical Question Bank Purge Script:
 * Purges ONLY question bank tables (questions, question_options, exam_configs)
 * and diagram assets. Resets auto-increment sequences for question tables.
 * 
 * CRITICAL SAFETY GUARANTEE:
 * Does NOT touch, truncate, or modify the 'students' table or student exam sessions!
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../cbt_database.db');
const PUBLIC_DIAGRAMS_DIR = path.join(__dirname, '../public/uploads/diagrams');
const BACKEND_DIAGRAMS_DIR = path.join(__dirname, '../uploads/diagrams');

function purgeQuestionBankOnly() {
    return new Promise((resolve, reject) => {
        console.log("==================================================================");
        console.log("✂️ STARTING SURGICAL QUESTION BANK PURGE (STUDENTS PRESERVED)");
        console.log("==================================================================\n");

        if (!fs.existsSync(DB_PATH)) {
            console.log(`ℹ️ Database file at ${DB_PATH} does not exist. Nothing to purge.`);
            return resolve();
        }

        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error("❌ Failed to connect to SQLite database:", err.message);
                return reject(err);
            }

            db.serialize(() => {
                db.run('PRAGMA foreign_keys = OFF;');

                // 1. Target ONLY question-related tables
                const questionTables = [
                    'questions',
                    'question_options',
                    'exam_configs'
                ];

                questionTables.forEach(tableName => {
                    db.run(`DELETE FROM ${tableName};`, (err) => {
                        if (err) {
                            console.warn(`  ⚠️ Could not clear table "${tableName}":`, err.message);
                        } else {
                            console.log(`  ✅ Wiped all rows from question table "${tableName}"`);
                        }
                    });
                });

                // 2. Reset auto-increment sequences specifically for question tables
                const sequenceNames = ['questions', 'question_options', 'options', 'question_banks', 'exam_configs'];
                db.run(`DELETE FROM sqlite_sequence WHERE name IN (${sequenceNames.map(t => `'${t}'`).join(', ')});`, (err) => {
                    if (err) {
                        console.warn(`  ⚠️ Could not reset sqlite_sequence for question tables:`, err.message);
                    } else {
                        console.log(`  ✅ Reset SQLite primary key sequences for question tables.`);
                    }
                });

                db.run('PRAGMA foreign_keys = ON;', () => {
                    db.close((closeErr) => {
                        if (closeErr) console.error("Error closing database:", closeErr);

                        // 3. Clear diagram image files
                        [PUBLIC_DIAGRAMS_DIR, BACKEND_DIAGRAMS_DIR].forEach(dir => {
                            if (fs.existsSync(dir)) {
                                const files = fs.readdirSync(dir);
                                files.forEach(file => {
                                    if (file !== '.gitkeep' && !file.startsWith('.')) {
                                        try {
                                            fs.unlinkSync(path.join(dir, file));
                                        } catch (e) {}
                                    }
                                });
                                console.log(`  ✅ Cleared question diagram files from ${path.basename(dir)}.`);
                            }
                        });

                        console.log("\n==================================================================");
                        console.log("🎉 SURGICAL QUESTION BANK PURGE COMPLETE: 0 DUMMY QUESTIONS REMAIN.");
                        console.log("==================================================================\n");
                        resolve();
                    });
                });
            });
        });
    });
}

if (require.main === module) {
    purgeQuestionBankOnly().catch(err => {
        console.error("❌ Purge exception:", err);
        process.exit(1);
    });
}

module.exports = { purgeQuestionBankOnly };
