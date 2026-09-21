const db = require('../database');

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function run() {
    try {
        console.log('=== 1. ALL ASSESSMENT_CONFIGS ===');
        const configs = await all('SELECT * FROM assessment_configs');
        console.log(JSON.stringify(configs, null, 2));

        console.log('=== 2. QUESTIONS SUMMARY ===');
        const qSummary = await all(`
            SELECT subject, class, assessment_slot, session, term, COUNT(*) as question_count 
            FROM questions 
            GROUP BY subject, class, assessment_slot, session, term
        `);
        console.log(JSON.stringify(qSummary, null, 2));

        console.log('=== 3. SUBJECTS IN SUBJECTS TABLE ===');
        const subjects = await all('SELECT id, name, is_active FROM subjects ORDER BY name ASC');
        console.log(JSON.stringify(subjects, null, 2));

        console.log('=== 4. CLASS_SUBJECTS (Agric or JSS 3) ===');
        const cs = await all(`
            SELECT * FROM class_subjects 
            WHERE LOWER(subject_name) LIKE '%agric%' OR LOWER(class_name) LIKE '%jss 3%'
            ORDER BY class_name, subject_name
        `);
        console.log(JSON.stringify(cs, null, 2));

        console.log('=== 5. EXAM_CONFIGS ===');
        const ec = await all('SELECT * FROM exam_configs');
        console.log(JSON.stringify(ec, null, 2));

        console.log('=== 6. JSS 3 STUDENTS ===');
        const students = await all(`SELECT id, reg_number, surname, first_name, class FROM students WHERE LOWER(class) LIKE '%jss 3%'`);
        console.log(JSON.stringify(students, null, 2));

    } catch (e) {
        console.error('Audit error:', e);
    } finally {
        process.exit(0);
    }
}

setTimeout(run, 1000);
