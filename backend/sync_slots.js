const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('cbt_database.db');

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ changes: this.changes, lastID: this.lastID });
        });
    });
}

async function syncSlots() {
    try {
        console.log('=== Step 1: Current Sessions with midterm_ca ===');
        const examSessions = await dbAll(`
            SELECT es.id, es.student_id, s.class, es.subject, es.assessment_slot, es.score, es.status 
            FROM exam_sessions es 
            JOIN students s ON es.student_id = s.id 
            WHERE es.assessment_slot = 'midterm_ca'
        `);
        console.table(examSessions);

        const studentExamSessions = await dbAll(`
            SELECT ses.session_id, ses.student_id, s.class, ses.subject_name, ses.assessment_slot, ses.score, ses.status 
            FROM student_exam_sessions ses 
            JOIN students s ON ses.student_id = s.id 
            WHERE ses.assessment_slot = 'midterm_ca'
        `);
        console.table(studentExamSessions);

        // Subjects that only have questions in welcome_test for their class
        // e.g., SS 1 Science Physics, SS 1 Science Mathematics, SS 1 Commercial Mathematics
        console.log('\n=== Step 2: Updating sessions where subject only has questions in welcome_test ===');
        
        // Update exam_sessions
        const r1 = await dbRun(`
            UPDATE exam_sessions 
            SET assessment_slot = 'welcome_test' 
            WHERE assessment_slot = 'midterm_ca' 
              AND student_id IN (SELECT id FROM students WHERE LOWER(class) IN ('ss 1 science', 'ss 1 commercial'))
              AND LOWER(subject) IN ('physics', 'mathematics')
        `);
        console.log(`Updated ${r1.changes} rows in exam_sessions to 'welcome_test'.`);

        // Update student_exam_sessions
        const r2 = await dbRun(`
            UPDATE student_exam_sessions 
            SET assessment_slot = 'welcome_test' 
            WHERE assessment_slot = 'midterm_ca' 
              AND student_id IN (SELECT id FROM students WHERE LOWER(class) IN ('ss 1 science', 'ss 1 commercial'))
              AND LOWER(subject_name) IN ('physics', 'mathematics')
        `);
        console.log(`Updated ${r2.changes} rows in student_exam_sessions to 'welcome_test'.`);

        // Also if Biology was taken under welcome_test
        const r3 = await dbRun(`
            UPDATE exam_sessions 
            SET assessment_slot = 'custom_assessment' 
            WHERE assessment_slot = 'midterm_ca' 
              AND LOWER(subject) = 'biology'
        `);
        console.log(`Updated ${r3.changes} Biology rows in exam_sessions to 'custom_assessment'.`);

        const r4 = await dbRun(`
            UPDATE student_exam_sessions 
            SET assessment_slot = 'custom_assessment' 
            WHERE assessment_slot = 'midterm_ca' 
              AND LOWER(subject_name) = 'biology'
        `);
        console.log(`Updated ${r4.changes} Biology rows in student_exam_sessions to 'custom_assessment'.`);

        console.log('\n=== Step 3: Verification after sync ===');
        const check1 = await dbAll(`
            SELECT assessment_slot, COUNT(*) as count 
            FROM exam_sessions 
            WHERE status = 'submitted' 
            GROUP BY assessment_slot
        `);
        console.log('Submitted exam_sessions by slot:');
        console.table(check1);

        const check2 = await dbAll(`
            SELECT assessment_slot, COUNT(*) as count 
            FROM student_exam_sessions 
            WHERE status = 'SUBMITTED' 
            GROUP BY assessment_slot
        `);
        console.log('Submitted student_exam_sessions by slot:');
        console.table(check2);

    } catch (e) {
        console.error('Error syncing slots:', e);
    } finally {
        db.close();
    }
}

syncSlots();
