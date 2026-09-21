const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.resolve(__dirname, '../cbt_database.db');
const OUT_FILE = path.resolve(__dirname, 'audit_output.txt');

const outputLines = [];
function out(str = '') {
    outputLines.push(str);
    console.log(str);
}

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        fs.writeFileSync(OUT_FILE, 'Failed to open db: ' + err.message);
        process.exit(1);
    }
});

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function runAudit() {
    try {
        out('=== CBT APP COMPREHENSIVE AUDIT ===\n');

        // 1. Assessment Configs
        out('1. ALL ASSESSMENT_CONFIGS:');
        const ac = await all(`SELECT id, session, term, class, subject, assessment_slot, is_active, custom_count, duration_minutes FROM assessment_configs ORDER BY class, subject, assessment_slot`);
        out(JSON.stringify(ac, null, 2));

        // 2. Questions summary by subject, class, slot
        out('\n2. QUESTIONS GROUPED BY SUBJECT, CLASS, SLOT:');
        const qSummary = await all(`
            SELECT subject, class, assessment_slot, session, term, COUNT(*) as count 
            FROM questions 
            GROUP BY subject, class, assessment_slot, session, term
            ORDER BY subject, class, assessment_slot
        `);
        out(JSON.stringify(qSummary, null, 2));

        // 3. Phantom Active Assessment Configs (Active but 0 questions)
        out('\n3. PHANTOM ACTIVE ASSESSMENT CONFIGS (WHERE COUNT(q.id) = 0):');
        const phantomAc = await all(`
            SELECT 
                ac.id,
                ac.session,
                ac.term,
                ac.class,
                ac.subject,
                ac.assessment_slot,
                ac.is_active,
                COUNT(q.id) AS actual_questions
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
        `);
        if (phantomAc.length === 0) {
            out('✅ NONE. All active assessment configs have questions > 0.');
        } else {
            out(JSON.stringify(phantomAc, null, 2));
        }

        // 4. JSS 3 Gold Student Assessment Availability Simulation
        out('\n4. SIMULATING STUDENT EXAM AVAILABILITY FOR "JSS 3 Gold" (Session: 2026/2027, Term: 1st Term):');
        const classVars = ['JSS 3 Gold', 'JSS 3'];
        const classPlaceholders = classVars.map(() => 'LOWER(TRIM(ac.class)) = LOWER(TRIM(?))').join(' OR ');

        const studentExams = await all(`
            SELECT 
                ac.id AS config_id,
                ac.session,
                ac.term,
                ac.class,
                ac.subject,
                ac.assessment_slot,
                ac.duration_minutes,
                ac.custom_count,
                COUNT(q.id) AS actual_bank_count
            FROM assessment_configs ac
            LEFT JOIN questions q ON (
                (LOWER(TRIM(q.class)) = LOWER(TRIM(ac.class)) OR (ac.class IS NULL OR TRIM(ac.class) = '') OR (q.class IS NULL OR TRIM(q.class) = ''))
                AND LOWER(TRIM(q.subject)) = LOWER(TRIM(ac.subject))
                AND (
                    LOWER(TRIM(q.assessment_slot)) = LOWER(TRIM(ac.assessment_slot)) 
                    OR (LOWER(TRIM(q.assessment_slot)) = 'examination' AND LOWER(TRIM(ac.assessment_slot)) = 'terminal_exam')
                    OR (LOWER(TRIM(q.assessment_slot)) = 'custom_assessment' AND LOWER(TRIM(ac.assessment_slot)) = 'custom_exam')
                )
                AND LOWER(TRIM(q.session)) = LOWER(TRIM(ac.session))
                AND LOWER(TRIM(q.term)) = LOWER(TRIM(ac.term))
            )
            WHERE (${classPlaceholders ? '(' + classPlaceholders + ' OR ac.class IS NULL OR TRIM(ac.class) = \'\')' : '(ac.class IS NULL OR TRIM(ac.class) = \'\')'})
              AND LOWER(TRIM(ac.session)) = LOWER(TRIM('2026/2027'))
              AND LOWER(TRIM(ac.term)) = LOWER(TRIM('1st Term'))
              AND ac.is_active = 1
            GROUP BY ac.id
            HAVING COUNT(q.id) > 0
            ORDER BY ac.subject ASC
        `, [...classVars]);

        if (studentExams.length === 0) {
            out('ℹ️ No active exams with >0 questions available for JSS 3 Gold (all empty/inactive papers properly excluded).');
        } else {
            out(`✅ Found ${studentExams.length} valid exam(s) for JSS 3 Gold (all have bank count > 0):`);
            out(JSON.stringify(studentExams, null, 2));
        }

        // 5. Subject naming consistency in class_subjects
        out('\n5. SUBJECT NAMES FOR JSS 3 IN CLASS_SUBJECTS:');
        const jss3Subjects = await all(`SELECT DISTINCT subject_name FROM class_subjects WHERE class_name LIKE '%JSS 3%' ORDER BY subject_name`);
        out(jss3Subjects.map(s => s.subject_name).join(', '));

        fs.writeFileSync(OUT_FILE, outputLines.join('\n'));
    } catch (err) {
        fs.writeFileSync(OUT_FILE, 'Audit error: ' + err.stack);
    } finally {
        db.close(() => process.exit(0));
    }
}

runAudit();
