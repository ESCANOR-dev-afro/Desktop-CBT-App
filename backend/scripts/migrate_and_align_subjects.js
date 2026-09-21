/**
 * migrate_and_align_subjects.js
 *
 * Database migration and subject alignment script for CBT App:
 * 1. Standardizes subject names to canonical forms across all tables
 *    (assessment_configs, exam_configs, questions, class_subjects, subjects, students, answers, etc.)
 * 2. Deactivates orphan / zero-question configs (sets is_active = 0).
 * 3. Rebuilds/updates class_subjects mappings so Admin and Student portals use identical names.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.resolve(__dirname, '../cbt_database.db');
const LOG_FILE = path.resolve(__dirname, 'migration_log.txt');
fs.writeFileSync(LOG_FILE, 'Starting Migration...\n');

function log(msg) {
    console.log(msg);
    fs.appendFileSync(LOG_FILE, msg + '\n');
}

const db = new sqlite3.Database(DB_PATH);
db.run('PRAGMA journal_mode = WAL;');
db.run('PRAGMA busy_timeout = 10000;');

function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function getAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
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

async function migrate() {
    try {
        log('🚀 [Migration] Connecting to database at: ' + DB_PATH);

        // Subject alias mapping pairs: [targetCanonical, [variants]]
        const aliasMappings = [
            ['Agricultural Science', ['agriculture', 'agric', 'agricultural science']],
            ['Social Studies', ['sos', 'social studies']],
            ['Basic Technology', ['basic tech', 'basic technology']],
            ['PHE', ['phe', 'physical and health education', 'physical & health education']],
            ['Business Studies', ['bus studies', 'business studies']],
            ['Home Economics', ['home ec', 'home econ', 'home economics']],
            ['CRS', ['crs', 'crk', 'christian religious studies', 'crs/irs']],
            ['IRS', ['irs', 'irk', 'islamic religious studies']],
            ['Financial Accounting', ['account', 'accounting', 'financial accounting']],
            ['Literature in English', ['literature', 'literature in english']],
            ['Nigeria History', ['history', 'nigerian history', 'nigeria history']],
            ['English Language', ['english', 'eng', 'english language']],
            ['Mathematics', ['math', 'maths', 'mathematics']],
            ['Computer Studies', ['comp sci', 'computer', 'computer science', 'computer studies']],
            ['Civic Education', ['civics', 'civic education']]
        ];

        log('🔄 [Migration] Step 1: Aligning subject names across all database tables...');

        for (const [canonical, variants] of aliasMappings) {
            const placeholders = variants.map(() => '?').join(',');
            const lowerVariants = variants.map(v => v.toLowerCase());

            // 1. assessment_configs: merge duplicate alias records first to avoid UNIQUE constraint violations
            const legacyAcRows = await allAsync(
                `SELECT id, session, term, class, subject, assessment_slot, is_active, custom_count, duration_minutes 
                 FROM assessment_configs 
                 WHERE LOWER(TRIM(subject)) IN (${placeholders}) AND subject != ?`,
                [...lowerVariants, canonical]
            );

            for (const leg of legacyAcRows) {
                // Check if canonical record already exists
                const existingCanonical = await getAsync(
                    `SELECT id, is_active FROM assessment_configs 
                     WHERE LOWER(TRIM(session)) = LOWER(TRIM(?)) 
                       AND LOWER(TRIM(term)) = LOWER(TRIM(?)) 
                       AND (LOWER(TRIM(class)) = LOWER(TRIM(?)) OR (? IS NULL AND class IS NULL))
                       AND subject = ? 
                       AND LOWER(TRIM(assessment_slot)) = LOWER(TRIM(?))`,
                    [leg.session, leg.term, leg.class, leg.class, canonical, leg.assessment_slot]
                );

                if (existingCanonical) {
                    // Delete the legacy duplicate
                    await runAsync(`DELETE FROM assessment_configs WHERE id = ?`, [leg.id]);
                    log(`   - assessment_configs: removed legacy duplicate ID ${leg.id} ("${leg.subject}") in favor of canonical ID ${existingCanonical.id} ("${canonical}")`);
                } else {
                    // Update legacy record to canonical subject name
                    await runAsync(`UPDATE assessment_configs SET subject = ? WHERE id = ?`, [canonical, leg.id]);
                    log(`   - assessment_configs: updated ID ${leg.id} to "${canonical}"`);
                }
            }

            // 2. exam_configs: merge duplicate alias records
            const legacyEcRows = await allAsync(
                `SELECT id, class, subject, is_active FROM exam_configs 
                 WHERE LOWER(TRIM(subject)) IN (${placeholders}) AND subject != ?`,
                [...lowerVariants, canonical]
            );

            for (const leg of legacyEcRows) {
                const existingCanonical = await getAsync(
                    `SELECT id FROM exam_configs 
                     WHERE (LOWER(TRIM(class)) = LOWER(TRIM(?)) OR (? IS NULL AND class IS NULL)) 
                       AND subject = ?`,
                    [leg.class, leg.class, canonical]
                );

                if (existingCanonical) {
                    await runAsync(`DELETE FROM exam_configs WHERE id = ?`, [leg.id]);
                    log(`   - exam_configs: removed legacy duplicate ID ${leg.id} ("${leg.subject}")`);
                } else {
                    await runAsync(`UPDATE exam_configs SET subject = ? WHERE id = ?`, [canonical, leg.id]);
                    log(`   - exam_configs: updated ID ${leg.id} to "${canonical}"`);
                }
            }

            // 3. questions: safe to update directly
            const resQ = await runAsync(`UPDATE questions SET subject = ? WHERE LOWER(TRIM(subject)) IN (${placeholders})`, [canonical, ...lowerVariants]);
            if (resQ.changes > 0) log(`   - questions: updated ${resQ.changes} row(s) to "${canonical}"`);

            // 4. class_subjects: merge duplicate class_subjects mappings
            const legacyCsRows = await allAsync(
                `SELECT id, class_name, subject_name FROM class_subjects 
                 WHERE LOWER(TRIM(subject_name)) IN (${placeholders}) AND subject_name != ?`,
                [...lowerVariants, canonical]
            );

            for (const leg of legacyCsRows) {
                const existingCanonical = await getAsync(
                    `SELECT id FROM class_subjects 
                     WHERE LOWER(TRIM(class_name)) = LOWER(TRIM(?)) AND subject_name = ?`,
                    [leg.class_name, canonical]
                );

                if (existingCanonical) {
                    await runAsync(`DELETE FROM class_subjects WHERE id = ?`, [leg.id]);
                } else {
                    await runAsync(`UPDATE class_subjects SET subject_name = ? WHERE id = ?`, [canonical, leg.id]);
                }
            }

            // 5. student_exam_sessions
            try {
                const resSes = await runAsync(`UPDATE student_exam_sessions SET subject_name = ? WHERE LOWER(TRIM(subject_name)) IN (${placeholders})`, [canonical, ...lowerVariants]);
                if (resSes.changes > 0) log(`   - student_exam_sessions: updated ${resSes.changes} row(s) to "${canonical}"`);
            } catch (_) {}

            // 6. exam_sessions
            try {
                await runAsync(`UPDATE exam_sessions SET subject = ? WHERE LOWER(TRIM(subject)) IN (${placeholders})`, [canonical, ...lowerVariants]);
            } catch (_) {}
            try {
                await runAsync(`UPDATE exam_sessions SET subject_name = ? WHERE LOWER(TRIM(subject_name)) IN (${placeholders})`, [canonical, ...lowerVariants]);
            } catch (_) {}

            // 7. answers
            try {
                await runAsync(`UPDATE answers SET subject = ? WHERE LOWER(TRIM(subject)) IN (${placeholders})`, [canonical, ...lowerVariants]);
            } catch (_) {}

            // 8. subjects
            await runAsync(`INSERT OR IGNORE INTO subjects (name, is_active) VALUES (?, 1)`, [canonical]);
            await runAsync(`DELETE FROM subjects WHERE LOWER(TRIM(name)) IN (${placeholders}) AND name != ?`, [...lowerVariants, canonical]);

            // 9. students assigned_subject
            try {
                await runAsync(`UPDATE students SET assigned_subject = ? WHERE LOWER(TRIM(assigned_subject)) IN (${placeholders})`, [canonical, ...lowerVariants]);
            } catch (_) {}
        }

        // 10. Deduplicate class_subjects mapping table
        try {
            const resDedup = await runAsync(`
                DELETE FROM class_subjects 
                WHERE rowid NOT IN (
                    SELECT MIN(rowid) 
                    FROM class_subjects 
                    GROUP BY LOWER(TRIM(class_name)), LOWER(TRIM(subject_name))
                )
            `);
            if (resDedup.changes > 0) log(`   - class_subjects: purged ${resDedup.changes} duplicate mapping row(s).`);
        } catch (_) {}

        log('🔒 [Migration] Step 2: Deactivating phantom zero-question assessment configs...');

        const phantomResult = await runAsync(`
            UPDATE assessment_configs 
            SET is_active = 0 
            WHERE id IN (
                SELECT ac.id 
                FROM assessment_configs ac
                LEFT JOIN questions q ON (
                    (LOWER(TRIM(q.class)) = LOWER(TRIM(ac.class)) OR ac.class IS NULL OR TRIM(ac.class) = '' OR q.class IS NULL OR TRIM(q.class) = '')
                    AND LOWER(TRIM(q.subject)) = LOWER(TRIM(ac.subject))
                    AND (
                        LOWER(TRIM(q.assessment_slot)) = LOWER(TRIM(ac.assessment_slot))
                        OR (LOWER(TRIM(q.assessment_slot)) = 'examination' AND LOWER(TRIM(ac.assessment_slot)) = 'terminal_exam')
                        OR (LOWER(TRIM(q.assessment_slot)) = 'custom_assessment' AND LOWER(TRIM(ac.assessment_slot)) = 'custom_exam')
                    )
                    AND LOWER(TRIM(q.session)) = LOWER(TRIM(ac.session))
                    AND LOWER(TRIM(q.term)) = LOWER(TRIM(ac.term))
                )
                WHERE ac.is_active = 1
                GROUP BY ac.id
                HAVING COUNT(q.id) = 0
            )
        `);
        log(`   - assessment_configs: deactivated ${phantomResult.changes} phantom config(s) having 0 questions.`);

        const phantomEc = await runAsync(`
            UPDATE exam_configs
            SET is_active = 0
            WHERE id IN (
                SELECT ec.id
                FROM exam_configs ec
                LEFT JOIN questions q ON (
                    (LOWER(TRIM(q.class)) = LOWER(TRIM(ec.class)) OR ec.class IS NULL OR TRIM(ec.class) = '' OR q.class IS NULL OR TRIM(q.class) = '')
                    AND LOWER(TRIM(q.subject)) = LOWER(TRIM(ec.subject))
                )
                WHERE ec.is_active = 1
                GROUP BY ec.id
                HAVING COUNT(q.id) = 0
            )
        `);
        log(`   - exam_configs: deactivated ${phantomEc.changes} phantom config(s) having 0 questions.`);

        log('📋 [Migration] Step 3: Verifying active assessment configurations...');
        const activeRows = await allAsync(`
            SELECT 
                ac.id,
                ac.session,
                ac.term,
                ac.class,
                ac.subject,
                ac.assessment_slot,
                ac.is_active,
                COUNT(q.id) AS questions_count
            FROM assessment_configs ac
            LEFT JOIN questions q ON (
                (LOWER(TRIM(q.class)) = LOWER(TRIM(ac.class)) OR ac.class IS NULL OR TRIM(ac.class) = '' OR q.class IS NULL OR TRIM(q.class) = '')
                AND LOWER(TRIM(q.subject)) = LOWER(TRIM(ac.subject))
                AND (
                    LOWER(TRIM(q.assessment_slot)) = LOWER(TRIM(ac.assessment_slot))
                    OR (LOWER(TRIM(q.assessment_slot)) = 'examination' AND LOWER(TRIM(ac.assessment_slot)) = 'terminal_exam')
                    OR (LOWER(TRIM(q.assessment_slot)) = 'custom_assessment' AND LOWER(TRIM(ac.assessment_slot)) = 'custom_exam')
                )
                AND LOWER(TRIM(q.session)) = LOWER(TRIM(ac.session))
                AND LOWER(TRIM(q.term)) = LOWER(TRIM(ac.term))
            )
            WHERE ac.is_active = 1
            GROUP BY ac.id
            ORDER BY ac.class, ac.subject, ac.assessment_slot
        `);

        log(`   - Active configs count: ${activeRows.length}`);
        activeRows.forEach(r => {
            log(`     * [${r.class || 'ALL'}] ${r.subject} [${r.assessment_slot}]: ${r.questions_count} questions`);
        });

        log('✅ [Migration] Migration and subject alignment completed successfully.');
    } catch (err) {
        console.error('❌ [Migration Error]:', err);
        process.exit(1);
    } finally {
        db.close(() => {
            process.exit(0);
        });
    }
}

migrate();
