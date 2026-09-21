const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../cbt_database.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
    db.all(`SELECT class_name, subject_name FROM class_subjects WHERE LOWER(subject_name) LIKE '%agric%' OR LOWER(subject_name) LIKE '%tech%' OR LOWER(subject_name) LIKE '%ict%' ORDER BY class_name, subject_name`, [], (err, rows) => {
        if (err) {
            console.error(err);
        } else {
            console.log('=== CLASS_SUBJECTS (Agric/Tech/ICT) ===');
            rows.forEach(r => console.log(`  ${r.class_name} -> ${r.subject_name}`));
        }

        db.all(`SELECT DISTINCT name FROM subjects WHERE LOWER(name) LIKE '%agric%' OR LOWER(name) LIKE '%tech%' OR LOWER(name) LIKE '%ict%' ORDER BY name`, [], (e2, rows2) => {
            if (e2) console.error(e2);
            else {
                console.log('\n=== SUBJECTS TABLE ===');
                rows2.forEach(r => console.log(`  ${r.name}`));
            }

            db.all(`SELECT class, subject, COUNT(*) as cnt FROM assessment_configs WHERE LOWER(subject) LIKE '%agric%' OR LOWER(subject) LIKE '%tech%' OR LOWER(subject) LIKE '%ict%' GROUP BY class, subject`, [], (e3, rows3) => {
                if (e3) console.error(e3);
                else {
                    console.log('\n=== ASSESSMENT_CONFIGS ===');
                    rows3.forEach(r => console.log(`  ${r.class || 'NULL'} -> ${r.subject} (${r.cnt})`));
                }
                db.close(() => process.exit(0));
            });
        });
    });
});
