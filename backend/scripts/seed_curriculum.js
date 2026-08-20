/**
 * seed_curriculum.js
 * Automated SQLite Migration & Seeding Script for School Curriculum Streams.
 *
 * Stream Allocations:
 * 1. JSS 1, JSS 2, JSS 3 (All Arms: Gold, Silver, Diamond): 16 Subjects
 * 2. SS 1-3 Science Stream: 11 Subjects (includes Agricultural Science & Geography)
 * 3. SS 1-3 Arts Stream: 8 Subjects
 * 4. SS 1-3 Commercial Stream: 9 Subjects
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '../cbt_database.db');
const db = new sqlite3.Database(dbPath);

const juniorSubjects = [
  "English Language", "Mathematics", "Yoruba", "French", "Fine Art", "Music",
  "Basic Science", "Basic Technology", "PHE", "Digital Technology", "Social Studies",
  "Civic Education", "Home Economics", "Agricultural Science", "Business Studies", "History"
];

const scienceSubjects = [
  "Mathematics", "English Language", "Biology", "Chemistry", "Physics",
  "Civic Education", "Further Mathematics", "Economics", "Digital Technology"
];

const artsSubjects = [
  "Mathematics", "English Language", "Civic Education", "Economics",
  "Digital Technology", "Government", "CRS", "Literature in English"
];

const commercialSubjects = [
  "Mathematics", "English Language", "Civic Education", "Further Mathematics",
  "Economics", "Digital Technology", "Account", "Commerce", "Government"
];

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

async function seedCurriculum() {
  console.log('🚀 [Seed Curriculum Script Started]');

  // 1. Register all unique subjects in master subjects table
  const allStreamSubjects = Array.from(new Set([
    ...juniorSubjects,
    ...scienceSubjects,
    ...artsSubjects,
    ...commercialSubjects
  ]));

  console.log(`📌 Inserting ${allStreamSubjects.length} master subjects into subjects table...`);
  for (const sName of allStreamSubjects) {
    await runAsync(`INSERT OR IGNORE INTO subjects (name, is_active) VALUES (?, 1)`, [sName]);
  }

  // 2. Clear old class_subjects mappings
  console.log('🧹 Clearing old class_subjects table...');
  await runAsync(`DELETE FROM class_subjects`);

  // 3. Fetch all classes
  const classesRows = await allAsync(`SELECT id, name FROM classes`);
  console.log(`📚 Mapping subjects for ${classesRows.length} classes...`);

  const subjectRows = await allAsync(`SELECT id, name FROM subjects`);
  const subjMap = new Map(subjectRows.map(s => [s.name.toLowerCase(), s.id]));

  for (const cls of classesRows) {
    const nameUpper = (cls.name || '').toUpperCase();
    let allocated = [];

    if (nameUpper.startsWith('JSS')) {
      allocated = juniorSubjects;
    } else if (nameUpper.includes('SCIENCE')) {
      allocated = scienceSubjects;
    } else if (nameUpper.includes('COMMERCIAL')) {
      allocated = commercialSubjects;
    } else if (nameUpper.includes('ART')) {
      allocated = artsSubjects;
    } else {
      allocated = scienceSubjects;
    }

    for (const subName of allocated) {
      const subId = subjMap.get(subName.toLowerCase()) || null;
      await runAsync(
        `INSERT INTO class_subjects (class_id, subject_id, class_name, subject_name)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(class_name, subject_name) DO UPDATE SET
            class_id = excluded.class_id,
            subject_id = excluded.subject_id`,
        [cls.id, subId, cls.name, subName]
      );
    }
  }

  // 4. Synchronize assigned_subject string on students table
  console.log('🧑‍🎓 Updating student assigned_subject strings to match enrolled class streams...');
  const students = await allAsync(`SELECT id, class FROM students`);
  for (const st of students) {
    const clsUpper = (st.class || '').toUpperCase();
    let allocated = [];
    if (clsUpper.startsWith('JSS')) {
      allocated = juniorSubjects;
    } else if (clsUpper.includes('SCIENCE')) {
      allocated = scienceSubjects;
    } else if (clsUpper.includes('COMMERCIAL')) {
      allocated = commercialSubjects;
    } else if (clsUpper.includes('ART')) {
      allocated = artsSubjects;
    } else {
      allocated = scienceSubjects;
    }
    const assignedStr = allocated.join(', ');
    await runAsync(`UPDATE students SET assigned_subject = ? WHERE id = ?`, [assignedStr, st.id]);
  }

  console.log('✅ [Curriculum Seeding Complete] Database successfully populated and synchronized!');
  db.close();
}

seedCurriculum().catch((err) => {
  console.error('❌ Error seeding curriculum:', err);
  db.close();
  process.exit(1);
});
