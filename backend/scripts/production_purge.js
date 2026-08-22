// backend/scripts/production_purge.js
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../cbt_database.db');
const db = new sqlite3.Database(dbPath);

console.log('====================================================');
console.log('🧹 --- STARTING COMPLETE PRODUCTION PURGE ---');
console.log('====================================================\n');

// 1. Remove temporary test diagram images from uploads directory
const diagramDirs = [
  path.resolve(__dirname, '../public/uploads/diagrams'),
  path.resolve(__dirname, '../uploads/diagrams')
];

diagramDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      if (file !== '.gitkeep') {
        const filePath = path.join(dir, file);
        if (fs.lstatSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
          console.log(`[FILE REMOVED] Purged diagram: ${file}`);
        }
      }
    });
    console.log(`[SUCCESS] Diagram upload directory cleaned: ${dir}`);
  } else {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[SUCCESS] Diagram directory initialized: ${dir}`);
  }
});

db.serialize(() => {
  // 1. Wipe all test questions
  db.run(`DELETE FROM questions`, (err) => {
    if (err) console.error('Error clearing questions:', err.message);
    else console.log('✅ [SUCCESS] All dummy/mock questions deleted.');
  });

  // 2. Wipe question options if normalized table exists
  db.run(`DELETE FROM question_options`, (err) => {
    if (!err) console.log('✅ [SUCCESS] question_options table cleared.');
  });

  // 3. Wipe all test students and registrations
  db.run(`DELETE FROM students`, (err) => {
    if (err) console.error('Error clearing students:', err.message);
    else console.log('✅ [SUCCESS] All test student records deleted.');
  });

  // 4. Wipe active student exam sessions and test submissions
  db.run(`DELETE FROM student_exam_sessions`, (err) => {
    if (err) console.error('Error clearing student exam sessions:', err.message);
    else console.log('✅ [SUCCESS] All student exam sessions cleared.');
  });

  // 5. Wipe legacy exam sessions, student answers, and test results
  db.run(`DELETE FROM exam_sessions`, (err) => {
    if (!err) console.log('✅ [SUCCESS] All legacy exam sessions cleared.');
  });

  db.run(`DELETE FROM answers`, (err) => {
    if (!err) console.log('✅ [SUCCESS] All student answers cleared.');
  });

  db.run(`DELETE FROM test_results`, (err) => {
    if (!err) console.log('✅ [SUCCESS] All test results cleared.');
  });

  db.run(`DELETE FROM subject_selection_locks`, (err) => {
    if (!err) console.log('✅ [SUCCESS] Subject selection locks cleared.');
  });

  // 6. Reset assessment configs & exam configs
  db.run(`DELETE FROM assessment_configs`, (err) => {
    if (err) console.error('Error clearing assessment configs:', err.message);
    else console.log('✅ [SUCCESS] All assessment configs reset to clean state.');
  });

  db.run(`DELETE FROM exam_configs`, (err) => {
    if (!err) console.log('✅ [SUCCESS] All legacy exam configs reset.');
  });

  db.run(`DELETE FROM audit_logs`, (err) => {
    if (!err) console.log('✅ [SUCCESS] All audit logs cleared.');
  });

  // 7. Reset autoincrement sequence counters
  db.run(`DELETE FROM sqlite_sequence WHERE name IN ('questions', 'question_options', 'students', 'student_exam_sessions', 'exam_sessions', 'answers', 'test_results', 'assessment_configs', 'exam_configs', 'audit_logs')`, (err) => {
    if (!err) console.log('✅ [SUCCESS] SQLite autoincrement counters reset.');
  });

  // 8. Ensure current academic term is set to 2026/2027 1st Term
  db.run(`UPDATE academic_terms SET is_current = 0`, () => {
    db.run(
      `INSERT INTO academic_terms (name, session, is_current) VALUES ('1st Term', '2026/2027', 1)
       ON CONFLICT(name, session) DO UPDATE SET is_current = 1`,
      () => {
        console.log('✅ [SUCCESS] Academic terms set to active default (2026/2027 • 1st Term).');
      }
    );
  });

  // 9. Vacuum database to reclaim unused storage
  db.run(`VACUUM`, (err) => {
    if (!err) console.log('✅ [SUCCESS] Database vacuumed and optimized.');
  });
});

db.close(() => {
  console.log('\n====================================================');
  console.log('🎉 --- PRODUCTION PURGE COMPLETED SUCCESSFULLY ---');
  console.log('====================================================\n');
});
