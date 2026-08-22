/**
 * purge_dummy_data.js
 * 
 * One-Time Database Purge Script for Desktop CBT App Backend.
 * Deletes all seeded/dummy question records and options from cbt_database.db,
 * leaving a clean, empty multi-level partitioned question store.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../cbt_database.db');
const db = new sqlite3.Database(DB_PATH);

console.log('====================================================');
console.log('🧹 [PURGE SCRIPT] Wiping all seeded/dummy question pools...');
console.log('====================================================');

db.serialize(() => {
    db.run(`DELETE FROM questions;`, function(err) {
        if (err) {
            console.error('❌ Error purging questions:', err.message);
        } else {
            console.log(`✅ [Questions Purged] Wiped all question records (${this.changes} questions deleted).`);
        }
    });

    db.run(`DELETE FROM question_options;`, function(err) {
        if (err) {
            console.error('❌ Error purging question options:', err.message);
        } else {
            console.log(`✅ [Options Purged] Wiped all question options records (${this.changes} options deleted).`);
        }
    });

    db.run(`DELETE FROM sqlite_sequence WHERE name IN ('questions', 'question_options');`, function(err) {
        if (err) {
            console.error('❌ Error resetting sequences:', err.message);
        } else {
            console.log(`✨ [Sequence Reset] Reset auto-increment ID counters for questions.`);
        }
    });

    db.all(`SELECT COUNT(*) as count FROM questions;`, (err, rows) => {
        if (!err && rows.length > 0) {
            console.log(`📊 Current Questions Bank Total: ${rows[0].count} Questions.`);
        }
        console.log('====================================================');
        console.log('🎉 Database is clean and ready for real question paper uploads!');
        console.log('====================================================');
        db.close();
    });
});
