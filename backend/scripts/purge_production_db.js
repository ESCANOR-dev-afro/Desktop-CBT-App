/**
 * purge_production_db.js
 * 
 * Standalone production database purge script for CBT Application backend.
 * Performs a complete cascade wipe of all mock/dummy student profiles, exam sessions,
 * answers, questions, options, test configurations, and uploaded diagram assets.
 * Resets SQLite primary key auto-increment sequences back to 1 while preserving
 * clean class structures, academic terms, master subjects catalog, and administrator account.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../cbt_database.db');
const PUBLIC_DIAGRAMS_DIR = path.join(__dirname, '../public/uploads/diagrams');
const BACKEND_DIAGRAMS_DIR = path.join(__dirname, '../uploads/diagrams');

function purgeDatabase() {
    return new Promise((resolve, reject) => {
        console.log("==================================================================");
        console.log("🧹 STARTING COMPLETE PRODUCTION DATABASE PURGE & RESET");
        console.log("==================================================================\n");

        if (!fs.existsSync(DB_PATH)) {
            console.log(`ℹ️ Database file at ${DB_PATH} does not exist yet. Nothing to purge.`);
            return resolve();
        }

        const db = new sqlite3.Database(DB_PATH, async (err) => {
            if (err) {
                console.error("❌ Failed to connect to SQLite database:", err.message);
                return reject(err);
            }

            db.serialize(() => {
                db.run('PRAGMA foreign_keys = OFF;');

                // 1. Delete rows from mock/dummy tables
                const tablesToWipe = [
                    'students',
                    'student_exam_sessions',
                    'exam_sessions',
                    'answers',
                    'questions',
                    'question_options',
                    'exam_configs',
                    'assessment_configs',
                    'class_subjects'
                ];

                tablesToWipe.forEach(tableName => {
                    db.run(`DELETE FROM ${tableName};`, (err) => {
                        if (err) {
                            console.warn(`  ⚠️ Could not wipe table "${tableName}":`, err.message);
                        } else {
                            console.log(`  ✅ Wiped all rows from table "${tableName}"`);
                        }
                    });
                });

                // Reset academic_terms to default 2026/2027 1st Term as current
                db.run(`UPDATE academic_terms SET is_current = 0;`, () => {
                    db.run(`UPDATE academic_terms SET is_current = 1 WHERE session = '2026/2027' AND name = '1st Term';`);
                });

                // 2. Reset auto-increment sequence counters to 1
                db.run(`DELETE FROM sqlite_sequence WHERE name IN (${tablesToWipe.map(t => `'${t}'`).join(', ')});`, (err) => {
                    if (err) {
                        console.warn(`  ⚠️ Could not reset sqlite_sequence:`, err.message);
                    } else {
                        console.log(`  ✅ Reset SQLite auto-increment primary key sequences to 1.`);
                    }
                });

                db.run('PRAGMA foreign_keys = ON;', () => {
                    db.close((closeErr) => {
                        if (closeErr) console.error("Error closing database:", closeErr);

                        // 3. Wipe diagram files in upload directories
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
                                console.log(`  ✅ Cleared mock diagram image files from ${path.basename(dir)}.`);
                            }
                        });

                        console.log("\n==================================================================");
                        console.log("🎉 PRODUCTION DATABASE PURGE COMPLETE: 0 MOCK DATA REMAINS.");
                        console.log("==================================================================\n");
                        resolve();
                    });
                });
            });
        });
    });
}

if (require.main === module) {
    purgeDatabase().catch(err => {
        console.error("❌ Purge exception:", err);
        process.exit(1);
    });
}

module.exports = { purgeDatabase };
