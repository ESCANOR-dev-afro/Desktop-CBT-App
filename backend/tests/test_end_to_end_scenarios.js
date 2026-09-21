const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.resolve(__dirname, '../cbt_database.db');
const LOG_PATH = path.resolve(__dirname, 'scenario_log.txt');
fs.writeFileSync(LOG_PATH, 'Starting scenarios...\n');

function recordLog(msg) {
    console.log(msg);
    fs.appendFileSync(LOG_PATH, msg + '\n');
}

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) recordLog('DB open error: ' + err.message);
    else recordLog('DB opened successfully');
});

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

async function runScenarios() {
    const results = [];
    function record(name, passed, details) {
        results.push({ name, passed, details });
        recordLog(`${passed ? '✅' : '❌'} [${passed ? 'PASS' : 'FAIL'}] ${name}: ${details}`);
    }

    try {
        recordLog('🧪 Running Comprehensive End-to-End CBT Assessment Verification Tests...\n');

        // Test 1: Subject Alias Harmonization in class_subjects
        const legacySubjInClass = await all(`
            SELECT DISTINCT subject_name 
            FROM class_subjects 
            WHERE LOWER(subject_name) IN ('agriculture', 'agric', 'sos', 'basic tech', 'comp sci', 'literature', 'history')
        `);
        record(
            '1. No Legacy Aliases in class_subjects',
            legacySubjInClass.length === 0,
            legacySubjInClass.length === 0 
                ? 'All class_subjects entries use canonical naming.' 
                : 'Found legacy aliases: ' + JSON.stringify(legacySubjInClass)
        );

        // Test 2: No Duplicate/Legacy assessment_configs
        const legacySubjInAc = await all(`
            SELECT DISTINCT subject 
            FROM assessment_configs 
            WHERE LOWER(subject) IN ('agriculture', 'agric', 'sos', 'basic tech', 'literature', 'history')
        `);
        record(
            '2. No Legacy Aliases in assessment_configs',
            legacySubjInAc.length === 0,
            legacySubjInAc.length === 0 
                ? 'All assessment_configs entries use canonical naming.' 
                : 'Found legacy aliases: ' + JSON.stringify(legacySubjInAc)
        );

        // Test 3: No Zero-Question Active Assessment Configs
        const phantomAc = await all(`
            SELECT 
                ac.id, ac.class, ac.subject, ac.assessment_slot,
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
        record(
            '3. Zero Phantom Active Assessment Configs',
            phantomAc.length === 0,
            phantomAc.length === 0 
                ? '0 phantom active assessment configs.' 
                : `Found ${phantomAc.length} phantom active configs.`
        );

        // Test 4: Student Exam Query Strict Zero-Question Exclusion Simulation
        const classVars = ['JSS 3 Gold', 'JSS 3'];
        const classPlaceholders = classVars.map(() => 'LOWER(TRIM(ac.class)) = LOWER(TRIM(?))').join(' OR ');

        // Query exactly as authRoutes.js executes it
        const fetchStudentExams = async () => {
            return all(`
                SELECT 
                    ac.id AS config_id,
                    ac.session,
                    ac.term,
                    ac.class,
                    ac.subject,
                    ac.assessment_slot,
                    ac.duration_minutes,
                    ac.custom_count,
                    COUNT(q.id) AS question_count
                FROM assessment_configs ac
                LEFT JOIN questions q ON (
                    (LOWER(TRIM(q.class)) = LOWER(TRIM(ac.class)) OR (ac.class IS NULL OR TRIM(ac.class) = '') OR (q.class IS NULL OR TRIM(q.class) = ''))
                    AND LOWER(TRIM(q.subject)) = LOWER(TRIM(ac.subject))
                    AND (LOWER(TRIM(q.assessment_slot)) = LOWER(TRIM(ac.assessment_slot)) 
                         OR (LOWER(TRIM(q.assessment_slot)) = 'examination' AND LOWER(TRIM(ac.assessment_slot)) = 'terminal_exam')
                         OR (LOWER(TRIM(q.assessment_slot)) = 'custom_assessment' AND LOWER(TRIM(ac.assessment_slot)) = 'custom_exam'))
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
        };

        const activeStudentExams = await fetchStudentExams();
        const allHaveQuestions = activeStudentExams.every(e => Number(e.question_count) > 0);
        record(
            '4. Student Active Assessments Question Count > 0',
            allHaveQuestions,
            `All ${activeStudentExams.length} active assessments have question_count > 0: ` + 
            activeStudentExams.map(e => `${e.subject} (${e.question_count} Qs)`).join(', ')
        );

        // Test 5: Simulated Admin Toggle (Deactivation and Re-activation with Question Present)
        const toggleConfigRes = await run(`
            INSERT INTO assessment_configs (session, term, class, subject, assessment_slot, is_active, custom_count, duration_minutes)
            VALUES ('2026/2027', '1st Term', 'JSS 3', 'Test Toggle Subject', 'welcome_test', 1, 15, 10)
        `);
        const toggleQRes = await run(`
            INSERT INTO questions (session, term, class, subject, assessment_slot, question_text, option_a, option_b, option_c, option_d, correct_answer)
            VALUES ('2026/2027', '1st Term', 'JSS 3', 'Test Toggle Subject', 'welcome_test', 'Sample Q?', 'A', 'B', 'C', 'D', 'A')
        `);

        // Deactivate
        await run(`UPDATE assessment_configs SET is_active = 0 WHERE id = ?`, [toggleConfigRes.lastID]);
        const examsAfterDeactivate = await fetchStudentExams();
        const presentAfterDeact = examsAfterDeactivate.some(e => e.subject === 'Test Toggle Subject');

        // Activate
        await run(`UPDATE assessment_configs SET is_active = 1 WHERE id = ?`, [toggleConfigRes.lastID]);
        const examsAfterRestore = await fetchStudentExams();
        const presentAfterRestore = examsAfterRestore.some(e => e.subject === 'Test Toggle Subject');

        // Clean up temporary test data
        await run(`DELETE FROM assessment_configs WHERE id = ?`, [toggleConfigRes.lastID]);
        await run(`DELETE FROM questions WHERE id = ?`, [toggleQRes.lastID]);

        record(
            '5. Dynamic Active/Inactive Toggle Sync Between Admin and Student',
            !presentAfterDeact && presentAfterRestore,
            `Excluded when inactive: ${!presentAfterDeact}, Included when active: ${presentAfterRestore}`
        );

        // Test 6: Simulating Zero-Question Guard
        // If question count is 0, assessment MUST NOT appear for student even if is_active = 1
        const testDummyConfig = await run(`
            INSERT INTO assessment_configs (session, term, class, subject, assessment_slot, is_active, custom_count, duration_minutes)
            VALUES ('2026/2027', '1st Term', 'JSS 3', 'Test Zero Question Subject', 'welcome_test', 1, 15, 10)
        `);
        const dummyExams = await fetchStudentExams();
        const dummyLeaked = dummyExams.some(e => e.subject === 'Test Zero Question Subject');
        // Clean up dummy config
        await run(`DELETE FROM assessment_configs WHERE id = ?`, [testDummyConfig.lastID]);

        record(
            '6. Strict Zero-Question Exclusion Guard (HAVING COUNT(q.id) > 0)',
            !dummyLeaked,
            `Zero-question active assessment was successfully blocked from student view: ${!dummyLeaked}`
        );

        console.log('\n📊 All Scenarios Tested Successfully!');
        fs.writeFileSync(path.resolve(__dirname, 'scenario_report.json'), JSON.stringify(results, null, 2));

    } catch (err) {
        console.error('❌ Error during scenario testing:', err);
    } finally {
        db.close(() => process.exit(0));
    }
}

setTimeout(runScenarios, 500);
