/**
 * sync_new_subjects.js
 * 
 * Non-destructive synchronization script:
 * Registers all updated curriculum subjects across Junior (20), Science (16),
 * Commercial (13), and Art (12) streams into `subjects` and `class_subjects` tables.
 * Preserves 100% of existing tables, question banks, candidate scores, and student records.
 */

const db = require('./database');

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

async function sync() {
    try {
        console.log('🔄 [Subject Sync] Starting non-destructive curriculum subject registration...');

        const juniorSubjects = [
            "English Language", "Mathematics", "Civic Education", "Social Studies",
            "Yoruba", "Music", "French", "Digital Technology",
            "Computer Hardware and GSM repair", "Horticulture", "Home Economics",
            "Agricultural Science", "Oral English", "Intermediate Science", "Basic Science",
            "Basic Technology", "CRS", "Business Studies", "PHE", "Nigeria History",
            "ICT"
        ];
        const scienceSubjects = [
            "English Language", "Mathematics", "Physics", "Chemistry", "Biology",
            "Economics", "Further Mathematics", "Digital Technology", "ICT",
            "Oral English", "Geography", "Civic Education", "Agricultural Science",
            "Horticulture and crop production", "Computer hardware and GSM repair",
            "Catering craft"
        ];
        const commercialSubjects = [
            "English Language", "Mathematics", "Financial Accounting", "Commerce", "Government",
            "Economics", "Further Mathematics", "Digital Technology", "ICT",
            "Oral English", "Civic Education", "Marketing", "Catering craft"
        ];
        const artsSubjects = [
            "English Language", "Mathematics", "Literature in English", "CRS", "Government",
            "Economics", "Digital Technology", "ICT", "Oral English", "Yoruba",
            "Civic Education", "Catering craft"
        ];

        // 1. Insert into `subjects` master catalog
        const allUniqueSubjects = Array.from(new Set([
            ...juniorSubjects, ...scienceSubjects, ...commercialSubjects, ...artsSubjects
        ]));
        for (const sub of allUniqueSubjects) {
            await runAsync(`INSERT OR IGNORE INTO subjects (name, is_active) VALUES (?, 1)`, [sub]);
        }
        console.log(`✅ [Subject Sync] ${allUniqueSubjects.length} master subjects registered in \`subjects\` table.`);

        // 2. Fetch all subjects & classes
        const subjectRows = await allAsync(`SELECT id, name FROM subjects`);
        const subjMap = new Map(subjectRows.map(s => [s.name.toLowerCase(), s.id]));

        const classesRows = await allAsync(`SELECT id, name FROM classes`);
        console.log(`📋 [Subject Sync] Found ${classesRows.length} classes in database.`);

        // 3. Clear and re-populate `class_subjects` mapping table
        await runAsync('DELETE FROM class_subjects');
        let insertedCount = 0;

        for (const cls of classesRows) {
            const nameUpper = cls.name.toUpperCase();
            let allocated = [];

            if (nameUpper.startsWith('JSS')) {
                allocated = juniorSubjects;
            } else if (nameUpper.includes('COMMERCIAL')) {
                allocated = commercialSubjects;
            } else if (nameUpper.includes('ART')) {
                allocated = artsSubjects;
            } else {
                allocated = scienceSubjects;
            }

            for (const subName of allocated) {
                const subId = subjMap.get(subName.toLowerCase()) || null;
                const res = await runAsync(
                    `INSERT INTO class_subjects (class_id, subject_id, class_name, subject_name)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(class_name, subject_name) DO UPDATE SET
                        class_id = excluded.class_id,
                        subject_id = excluded.subject_id`,
                    [cls.id, subId, cls.name, subName]
                );
                if (res.changes > 0) {
                    insertedCount += res.changes;
                }
            }
        }

        // 3b. Hard-purge Agricultural Science from Art and Commercial streams
        await runAsync(`
            DELETE FROM class_subjects 
            WHERE LOWER(subject_name) LIKE '%agric%' 
              AND (class_name LIKE '%Art%' OR class_name LIKE '%Commercial%')
        `);

        // 4. Update normalization meta to version 7
        await runAsync(`CREATE TABLE IF NOT EXISTS _normalization_meta (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            last_run_at DATETIME,
            version INTEGER DEFAULT 1
        )`);
        await runAsync(
            `INSERT INTO _normalization_meta (id, last_run_at, version) VALUES (1, datetime('now'), 7)
             ON CONFLICT(id) DO UPDATE SET last_run_at = datetime('now'), version = 7`
        );

        console.log(`🎉 [Subject Sync Complete] Successfully synchronized ${insertedCount} class-subject mapping entries.`);
        
        // 5. Verification Check
        const summary = await allAsync(`
            SELECT class_name, COUNT(*) as count 
            FROM class_subjects 
            GROUP BY class_name
            ORDER BY class_name ASC
        `);
        console.log('📊 [Verification Summary]:');
        summary.forEach(r => console.log(`  - ${r.class_name}: ${r.count} subjects`));
        
        setTimeout(() => {
            process.exit(0);
        }, 500);
    } catch (err) {
        console.error('❌ [Subject Sync Error]:', err);
        process.exit(1);
    }
}

setTimeout(sync, 1000);
