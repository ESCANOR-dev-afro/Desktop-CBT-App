/**
 * migrate_curriculum_subjects.js
 * 
 * Standalone, Idempotent, and Non-Destructive Database Migration Script:
 * 1. Registers 'Citizenship and Heritage Studies' into master `subjects` table and assigns it to all Junior Secondary (JSS 1-3) class arms.
 * 2. Registers 'Computer hardware and GSM repair' into master `subjects` table and assigns it to all Senior Secondary (SSS 1-3) Art and Commercial class arms.
 * 3. Preserves 100% of live student registrations, question banks, candidate answers, exam sessions, and scores.
 * 4. Provides automated audit and verification metrics upon completion.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.resolve(__dirname, '../cbt_database.db');
const LOG_FILE = path.resolve(__dirname, 'curriculum_migration_log.txt');

fs.writeFileSync(LOG_FILE, `=== CURRICULUM MIGRATION LOG - ${new Date().toISOString()} ===\n`);

function log(msg) {
    console.log(msg);
    try {
        fs.appendFileSync(LOG_FILE, msg + '\n');
    } catch (_) {}
}

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        log(`❌ [Database Error] Failed to open database at ${DB_PATH}: ${err.message}`);
        process.exit(1);
    }
});

// Configure robust concurrency pragmas
db.serialize(() => {
    db.run('PRAGMA journal_mode = WAL;');
    db.run('PRAGMA busy_timeout = 10000;');
    db.run('PRAGMA foreign_keys = ON;');
});

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

async function runMigration() {
    try {
        log('🚀 [Curriculum Migration] Connecting to persistent database at: ' + DB_PATH);

        // Pre-migration audit counts
        const preStudentCount = await getAsync('SELECT COUNT(*) as count FROM students');
        const preQuestionCount = await getAsync('SELECT COUNT(*) as count FROM questions');
        const preSessionCount = await getAsync('SELECT COUNT(*) as count FROM exam_sessions');
        const preMappingCount = await getAsync('SELECT COUNT(*) as count FROM class_subjects');

        log(`📊 [Pre-Flight Verification] Existing live records:`);
        log(`   - Students: ${preStudentCount?.count || 0}`);
        log(`   - Question Bank: ${preQuestionCount?.count || 0}`);
        log(`   - Exam Sessions: ${preSessionCount?.count || 0}`);
        log(`   - Class-Subject Mappings: ${preMappingCount?.count || 0}`);

        // --------------------------------------------------------------------
        // STEP 1: Register Master Subjects into `subjects` Table
        // --------------------------------------------------------------------
        log('\n🔄 [Step 1] Registering master subjects in `subjects` catalog...');
        
        const targetMasterSubjects = [
            'Citizenship and Heritage Studies',
            'Computer hardware and GSM repair',
            'Computer Hardware and GSM repair'
        ];

        let masterInserted = 0;
        for (const sub of targetMasterSubjects) {
            const res = await runAsync(`INSERT OR IGNORE INTO subjects (name, is_active) VALUES (?, 1)`, [sub]);
            if (res.changes > 0) {
                masterInserted += res.changes;
                log(`   + Registered master subject: "${sub}"`);
            } else {
                log(`   ✓ Master subject already registered: "${sub}"`);
            }
        }

        // Fetch refreshed subjects lookup map
        const allSubjects = await allAsync(`SELECT id, name FROM subjects`);
        const subjMap = new Map(allSubjects.map(s => [s.name.toLowerCase(), s.id]));

        const chsId = subjMap.get('citizenship and heritage studies') || null;
        const gsmId = subjMap.get('computer hardware and gsm repair') || subjMap.get('computer hardware and gsm repair') || null;

        // --------------------------------------------------------------------
        // STEP 2: Ensure all Standard Classes Exist in `classes` Table
        // --------------------------------------------------------------------
        log('\n🔄 [Step 2] Verifying standard class records in `classes` table...');
        const standardClasses = [
            { name: 'JSS 1', level: 'JSS' },
            { name: 'JSS 1 Gold', level: 'JSS' },
            { name: 'JSS 1 Silver', level: 'JSS' },
            { name: 'JSS 1 Diamond', level: 'JSS' },
            { name: 'JSS 2', level: 'JSS' },
            { name: 'JSS 2 Gold', level: 'JSS' },
            { name: 'JSS 2 Silver', level: 'JSS' },
            { name: 'JSS 2 Diamond', level: 'JSS' },
            { name: 'JSS 3', level: 'JSS' },
            { name: 'JSS 3 Gold', level: 'JSS' },
            { name: 'JSS 3 Silver', level: 'JSS' },
            { name: 'JSS 3 Diamond', level: 'JSS' },
            { name: 'SS 1', level: 'SS' },
            { name: 'SS 1 Science', level: 'SS' },
            { name: 'SS 1 Commercial', level: 'SS' },
            { name: 'SS 1 Art', level: 'SS' },
            { name: 'SS 1 Arts', level: 'SS' },
            { name: 'SS 2', level: 'SS' },
            { name: 'SS 2 Science', level: 'SS' },
            { name: 'SS 2 Commercial', level: 'SS' },
            { name: 'SS 2 Art', level: 'SS' },
            { name: 'SS 2 Arts', level: 'SS' },
            { name: 'SS 3', level: 'SS' },
            { name: 'SS 3 Science', level: 'SS' },
            { name: 'SS 3 Commercial', level: 'SS' },
            { name: 'SS 3 Art', level: 'SS' },
            { name: 'SS 3 Arts', level: 'SS' }
        ];

        for (const cls of standardClasses) {
            await runAsync(`INSERT OR IGNORE INTO classes (name, level) VALUES (?, ?)`, [cls.name, cls.level]);
        }

        const allClasses = await allAsync(`SELECT id, name, level FROM classes ORDER BY name ASC`);
        log(`   ✓ Found ${allClasses.length} class tiers/arms in database.`);

        // --------------------------------------------------------------------
        // STEP 3: Assign "Citizenship and Heritage Studies" across all JSS Classes
        // --------------------------------------------------------------------
        log('\n🔄 [Step 3] Assigning "Citizenship and Heritage Studies" to Junior Secondary classes...');
        const juniorClasses = allClasses.filter(c => 
            c.name.toUpperCase().startsWith('JSS') || (c.level && c.level.toUpperCase() === 'JSS')
        );

        let chsInserted = 0;
        for (const jCls of juniorClasses) {
            const existing = await getAsync(
                `SELECT id FROM class_subjects 
                 WHERE LOWER(TRIM(class_name)) = LOWER(TRIM(?)) 
                   AND LOWER(TRIM(subject_name)) = 'citizenship and heritage studies'`,
                [jCls.name]
            );

            if (!existing) {
                const res = await runAsync(
                    `INSERT INTO class_subjects (class_id, subject_id, class_name, subject_name)
                     VALUES (?, ?, ?, ?)`,
                    [jCls.id, chsId, jCls.name, 'Citizenship and Heritage Studies']
                );
                if (res.changes > 0) {
                    chsInserted++;
                    log(`   + [${jCls.name}] Mapped -> "Citizenship and Heritage Studies"`);
                }
            } else {
                log(`   ✓ [${jCls.name}] Already mapped to "Citizenship and Heritage Studies"`);
            }
        }

        // --------------------------------------------------------------------
        // STEP 4: Assign "Computer hardware and GSM repair" to SSS Art & Commercial Classes
        // --------------------------------------------------------------------
        log('\n🔄 [Step 4] Assigning "Computer hardware and GSM repair" to SSS Art and Commercial classes...');
        const seniorArtAndCommercialClasses = allClasses.filter(c => {
            const upper = c.name.toUpperCase();
            return upper.includes('COMMERCIAL') || upper.includes('ART') || upper === 'SS 1' || upper === 'SS 2' || upper === 'SS 3';
        });

        let gsmInserted = 0;
        for (const sCls of seniorArtAndCommercialClasses) {
            const existing = await getAsync(
                `SELECT id FROM class_subjects 
                 WHERE LOWER(TRIM(class_name)) = LOWER(TRIM(?)) 
                   AND (LOWER(TRIM(subject_name)) = 'computer hardware and gsm repair' OR LOWER(TRIM(subject_name)) = 'computer hardware and gsm repair')`,
                [sCls.name]
            );

            if (!existing) {
                const res = await runAsync(
                    `INSERT INTO class_subjects (class_id, subject_id, class_name, subject_name)
                     VALUES (?, ?, ?, ?)`,
                    [sCls.id, gsmId, sCls.name, 'Computer hardware and GSM repair']
                );
                if (res.changes > 0) {
                    gsmInserted++;
                    log(`   + [${sCls.name}] Mapped -> "Computer hardware and GSM repair"`);
                }
            } else {
                log(`   ✓ [${sCls.name}] Already mapped to "Computer hardware and GSM repair"`);
            }
        }

        // --------------------------------------------------------------------
        // STEP 5: Harmonize Subject Aliases across Tables
        // --------------------------------------------------------------------
        log('\n🔄 [Step 5] Harmonizing aliases and deduplicating records...');
        const aliasMappings = [
            ['Citizenship and Heritage Studies', ['citizenship and heritage studies', 'citizenship and heritage', 'citizenship & heritage studies', 'chs', 'citizenship studies']],
            ['Computer hardware and GSM repair', ['computer hardware and gsm repair', 'computer hardware and gsm', 'computer hardware', 'gsm repair', 'computer hardware & gsm repair']]
        ];

        for (const [canonical, variants] of aliasMappings) {
            const placeholders = variants.map(() => '?').join(',');
            const lowerVariants = variants.map(v => v.toLowerCase());

            await runAsync(
                `UPDATE questions SET subject = ? WHERE LOWER(TRIM(subject)) IN (${placeholders}) AND subject != ?`,
                [canonical, ...lowerVariants, canonical]
            );
            await runAsync(
                `UPDATE assessment_configs SET subject = ? WHERE LOWER(TRIM(subject)) IN (${placeholders}) AND subject != ?`,
                [canonical, ...lowerVariants, canonical]
            );
            await runAsync(
                `UPDATE exam_configs SET subject = ? WHERE LOWER(TRIM(subject)) IN (${placeholders}) AND subject != ?`,
                [canonical, ...lowerVariants, canonical]
            );
        }

        // Clean up any duplicates in class_subjects
        const dedupRes = await runAsync(`
            DELETE FROM class_subjects 
            WHERE rowid NOT IN (
                SELECT MIN(rowid) 
                FROM class_subjects 
                GROUP BY LOWER(TRIM(class_name)), LOWER(TRIM(subject_name))
            )
        `);
        if (dedupRes.changes > 0) {
            log(`   - Deduplicated ${dedupRes.changes} redundant mapping row(s) in class_subjects.`);
        }

        // --------------------------------------------------------------------
        // STEP 6: Bump Curriculum Normalization Version to 8
        // --------------------------------------------------------------------
        log('\n🔄 [Step 6] Updating schema normalization metadata version to 8...');
        await runAsync(`CREATE TABLE IF NOT EXISTS _normalization_meta (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            last_run_at DATETIME,
            version INTEGER DEFAULT 1
        )`);
        await runAsync(
            `INSERT INTO _normalization_meta (id, last_run_at, version) VALUES (1, datetime('now'), 8)
             ON CONFLICT(id) DO UPDATE SET last_run_at = datetime('now'), version = 8`
        );
        log('   ✓ _normalization_meta updated to version 8.');

        // --------------------------------------------------------------------
        // STEP 7: Final Post-Migration Verification & Audit Summary
        // --------------------------------------------------------------------
        const postStudentCount = await getAsync('SELECT COUNT(*) as count FROM students');
        const postQuestionCount = await getAsync('SELECT COUNT(*) as count FROM questions');
        const postSessionCount = await getAsync('SELECT COUNT(*) as count FROM exam_sessions');
        const postMappingCount = await getAsync('SELECT COUNT(*) as count FROM class_subjects');

        log('\n================================================================');
        log('🎉 [MIGRATION COMPLETE] POST-FLIGHT AUDIT & VERIFICATION REPORT');
        log('================================================================');
        log(`Data Persistence Check:`);
        log(`  - Students Count: ${postStudentCount?.count} (Unchanged: ${postStudentCount?.count === preStudentCount?.count ? '✅ YES' : '❌ NO'})`);
        log(`  - Questions Count: ${postQuestionCount?.count} (Unchanged: ${postQuestionCount?.count === preQuestionCount?.count ? '✅ YES' : '❌ NO'})`);
        log(`  - Exam Sessions: ${postSessionCount?.count} (Unchanged: ${postSessionCount?.count === preSessionCount?.count ? '✅ YES' : '❌ NO'})`);
        log(`  - Class Subjects: ${postMappingCount?.count} (Added: +${chsInserted + gsmInserted} mappings)`);

        log('\nCurriculum Subjects Breakdown per Class:');
        const summary = await allAsync(`
            SELECT class_name, COUNT(*) as count 
            FROM class_subjects 
            GROUP BY class_name
            ORDER BY class_name ASC
        `);
        summary.forEach(r => {
            log(`  - ${r.class_name.padEnd(20)}: ${r.count} subjects`);
        });

        log('\nSpecific Subject Verification:');
        const chsVerify = await allAsync(`SELECT class_name FROM class_subjects WHERE LOWER(subject_name) = 'citizenship and heritage studies' ORDER BY class_name ASC`);
        log(`  - "Citizenship and Heritage Studies" is present in ${chsVerify.length} class arms (${chsVerify.map(c => c.class_name).join(', ')})`);

        const gsmVerify = await allAsync(`SELECT class_name FROM class_subjects WHERE LOWER(subject_name) LIKE '%computer hardware%' OR LOWER(subject_name) LIKE '%gsm repair%' ORDER BY class_name ASC`);
        log(`  - "Computer Hardware and GSM repair" is present in ${gsmVerify.length} class arms (${gsmVerify.map(c => c.class_name).join(', ')})`);

        log('================================================================\n');

        setTimeout(() => {
            db.close(() => {
                log('🔒 Database connection cleanly closed.');
                process.exit(0);
            });
        }, 500);

    } catch (err) {
        log(`❌ [Migration Error]: ${err.message}`);
        console.error(err);
        process.exit(1);
    }
}

runMigration();
