const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../cbt_database.db');
const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function purgeAgric() {
    try {
        console.log('🚀 [Purge Agric] Starting one-time purge and consolidation...');

        // 1. Update class_subjects
        const r1 = await run(`UPDATE class_subjects SET subject_name = 'Agricultural Science' WHERE LOWER(TRIM(subject_name)) IN ('agric', 'agriculture')`);
        console.log(`- class_subjects updated: ${r1.changes} row(s)`);

        // 2. Update assessment_configs (delete duplicates first to avoid UNIQUE conflict)
        const legacyAc = await all(`SELECT id FROM assessment_configs WHERE LOWER(TRIM(subject)) IN ('agric', 'agriculture')`);
        for (const leg of legacyAc) {
            const canonicalRow = await all(`
                SELECT id FROM assessment_configs 
                WHERE subject = 'Agricultural Science' 
                  AND session = (SELECT session FROM assessment_configs WHERE id = ?)
                  AND term = (SELECT term FROM assessment_configs WHERE id = ?)
                  AND (class = (SELECT class FROM assessment_configs WHERE id = ?) OR (class IS NULL AND (SELECT class FROM assessment_configs WHERE id = ?) IS NULL))
                  AND assessment_slot = (SELECT assessment_slot FROM assessment_configs WHERE id = ?)
            `, [leg.id, leg.id, leg.id, leg.id, leg.id]);

            if (canonicalRow.length > 0) {
                await run(`DELETE FROM assessment_configs WHERE id = ?`, [leg.id]);
                console.log(`- Deleted duplicate assessment_config ID ${leg.id}`);
            } else {
                await run(`UPDATE assessment_configs SET subject = 'Agricultural Science' WHERE id = ?`, [leg.id]);
                console.log(`- Updated assessment_config ID ${leg.id} to "Agricultural Science"`);
            }
        }

        // 3. Update questions
        const r3 = await run(`UPDATE questions SET subject = 'Agricultural Science' WHERE LOWER(TRIM(subject)) IN ('agric', 'agriculture')`);
        console.log(`- questions updated: ${r3.changes} row(s)`);

        // 4. Update student_exam_sessions
        try {
            const r4 = await run(`UPDATE student_exam_sessions SET subject_name = 'Agricultural Science' WHERE LOWER(TRIM(subject_name)) IN ('agric', 'agriculture')`);
            console.log(`- student_exam_sessions updated: ${r4.changes} row(s)`);
        } catch (_) {}

        // 5. Update exam_sessions
        try {
            const r5 = await run(`UPDATE exam_sessions SET subject = 'Agricultural Science' WHERE LOWER(TRIM(subject)) IN ('agric', 'agriculture')`);
            console.log(`- exam_sessions updated: ${r5.changes} row(s)`);
        } catch (_) {}

        // 6. Update answers
        try {
            const r6 = await run(`UPDATE answers SET subject = 'Agricultural Science' WHERE LOWER(TRIM(subject)) IN ('agric', 'agriculture')`);
            console.log(`- answers updated: ${r6.changes} row(s)`);
        } catch (_) {}

        // 7. Delete duplicates in class_subjects
        const r7 = await run(`
            DELETE FROM class_subjects 
            WHERE rowid NOT IN (
                SELECT MIN(rowid) 
                FROM class_subjects 
                GROUP BY LOWER(TRIM(class_name)), LOWER(TRIM(subject_name))
            )
        `);
        console.log(`- class_subjects duplicate purge: ${r7.changes} row(s) deleted`);

        // 8. Delete 'Agric' or 'Agriculture' from subjects table
        await run(`DELETE FROM subjects WHERE LOWER(TRIM(name)) IN ('agric', 'agriculture') AND name != 'Agricultural Science'`);
        await run(`INSERT OR IGNORE INTO subjects (name, is_active) VALUES ('Agricultural Science', 1)`);

        // 9. Verify SS 1 Science subjects
        const ss1ScienceSubjects = await all(`SELECT class_name, subject_name FROM class_subjects WHERE LOWER(class_name) = 'ss 1 science' ORDER BY subject_name ASC`);
        console.log('\n📋 SS 1 Science Subjects in class_subjects:');
        ss1ScienceSubjects.forEach(s => console.log(`  - ${s.subject_name}`));

        console.log('\n✅ [Purge Agric Complete] Finished successfully.');
    } catch (err) {
        console.error('❌ Error during purge:', err);
    } finally {
        db.close(() => process.exit(0));
    }
}

purgeAgric();
