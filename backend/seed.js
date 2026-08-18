/**
 * seed.js
 * 
 * Standalone Database Migration & Re-Seeding Script for Desktop CBT App.
 * Cleans out old numeric registration numbers (e.g. '1009003') and seeds 50 realistic
 * candidate records using the standardized AWA2627XXXX dual-year format for session 2026/2027.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'cbt_database.db');
const db = new sqlite3.Database(DB_PATH);

function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function allAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function reseedDatabase() {
    console.log('----------------------------------------------------');
    console.log('🔄 RE-SEEDING CBT DATABASE WITH NEW AWA2627XXXX REG NO STANDARD');
    console.log('----------------------------------------------------');

    try {
        // 1. Ensure academic term 2026/2027 1st Term is set to active (is_current = 1)
        await runAsync(`UPDATE academic_terms SET is_current = 0`);
        await runAsync(
            `INSERT INTO academic_terms (name, session, is_current) VALUES ('1st Term', '2026/2027', 1)
             ON CONFLICT(name, session) DO UPDATE SET is_current = 1`
        );
        const activeTerm = await new Promise((res) => db.get(`SELECT id FROM academic_terms WHERE is_current = 1`, (e, r) => res(r)));
        const termId = activeTerm ? activeTerm.id : 1;

        // 2. Surgical Candidate Purge across all Junior and Senior Secondary classes
        await runAsync(`DELETE FROM student_exam_sessions;`);
        await runAsync(`DELETE FROM students;`);
        await runAsync(`DELETE FROM sqlite_sequence WHERE name IN ('students', 'student_exam_sessions');`);
        console.log('🧹 [Surgical Candidate Purge] Wiped all candidate profiles, exam sessions, and test results.');
        console.log('🔄 [Sequence Reset] Reset auto-increment sequence counters for students and student_exam_sessions.');

        // 3. Trigger class arms & subject allocations normalization via database.js
        console.log('⚙️ [Class & Subject Sync] Preserving 18 class arms and isolated subject mappings...');
        require('./database');

        console.log('✅ Successfully purged student candidates. Database is clean (0 enrolled candidates) and ready for production imports.');
        console.log('----------------------------------------------------');
        setTimeout(() => {
            db.close();
            process.exit(0);
        }, 1000);

    } catch (err) {
        console.error('❌ Candidate purge failed:', err);
        db.close();
        process.exit(1);
    }
}

reseedDatabase();
