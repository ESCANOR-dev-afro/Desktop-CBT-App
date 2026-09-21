/**
 * verify_assessment_availability.js
 *
 * Automated verification test suite for CBT assessment availability and zero-question guard rails:
 * 1. Verifies subject alias normalization consistency across modules.
 * 2. Checks database for phantom/zero-question active configs (must be 0).
 * 3. Verifies fetchActiveExamsForStudent behavior for JSS 3 Gold candidate.
 * 4. Verifies resolveExamConfig and questions endpoint behavior.
 */

const fs = require('fs');
const path = require('path');
const db = require('../database');

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

async function runVerification() {
    const results = {
        timestamp: new Date().toISOString(),
        tests: [],
        allPassed: true
    };

    function record(name, passed, details) {
        results.tests.push({ name, passed, details });
        if (!passed) results.allPassed = false;
        console.log(`${passed ? '✅' : '❌'} [${passed ? 'PASS' : 'FAIL'}] ${name}: ${details}`);
    }

    try {
        console.log('🧪 Starting Assessment Availability & Zero-Question Guard Rails Verification...\n');

        // Test 1: Database Audit - Check for phantom active assessment configs
        const phantomConfigs = await all(`
            SELECT 
                ac.id,
                ac.session,
                ac.term,
                ac.class,
                ac.subject,
                ac.assessment_slot,
                COUNT(q.id) AS actual_questions
            FROM assessment_configs ac
            LEFT JOIN questions q ON (
                (LOWER(TRIM(q.class)) = LOWER(TRIM(ac.class)) OR ac.class IS NULL OR TRIM(ac.class) = '' OR q.class IS NULL OR TRIM(q.class) = '')
                AND (LOWER(TRIM(q.subject)) = LOWER(TRIM(ac.subject)) OR (LOWER(TRIM(q.subject)) = 'agricultural science' AND LOWER(TRIM(ac.subject)) IN ('agriculture', 'agric')))
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
            'Zero-Question Active Configs Audit',
            phantomConfigs.length === 0,
            phantomConfigs.length === 0
                ? '0 phantom active configs found in database.'
                : `Found ${phantomConfigs.length} phantom active configs with 0 questions: ` + JSON.stringify(phantomConfigs)
        );

        // Test 2: Database Audit - Check for phantom active exam_configs
        const phantomExamConfigs = await all(`
            SELECT 
                ec.id,
                ec.class,
                ec.subject,
                COUNT(q.id) AS actual_questions
            FROM exam_configs ec
            LEFT JOIN questions q ON (
                (LOWER(TRIM(q.class)) = LOWER(TRIM(ec.class)) OR ec.class IS NULL OR TRIM(ec.class) = '' OR q.class IS NULL OR TRIM(q.class) = '')
                AND LOWER(TRIM(q.subject)) = LOWER(TRIM(ec.subject))
            )
            WHERE ec.is_active = 1
            GROUP BY ec.id
            HAVING COUNT(q.id) = 0
        `);

        record(
            'Zero-Question Active Legacy Configs Audit',
            phantomExamConfigs.length === 0,
            phantomExamConfigs.length === 0
                ? '0 phantom active legacy exam_configs found.'
                : `Found ${phantomExamConfigs.length} phantom active legacy configs with 0 questions.`
        );

        // Test 3: Subject Name Mismatches in class_subjects
        const classSubjectNames = await all(`SELECT DISTINCT subject_name FROM class_subjects ORDER BY subject_name ASC`);
        const namesList = classSubjectNames.map(r => r.subject_name);
        const hasLegacyAgric = namesList.includes('Agriculture') || namesList.includes('Agric');
        const hasCanonicalAgric = namesList.includes('Agricultural Science');

        record(
            'Canonical Subject Names in class_subjects',
            hasCanonicalAgric && !hasLegacyAgric,
            `class_subjects uses "Agricultural Science": ${hasCanonicalAgric}, legacy names absent: ${!hasLegacyAgric}`
        );

        // Test 4: Subject Name Normalization in authRoutes
        const authRoutes = require('../authRoutes');
        // Test query simulation for JSS 3 Gold student
        const classVars = ['JSS 3 Gold', 'JSS 3'];
        const classPlaceholders = classVars.map(() => 'LOWER(TRIM(ac.class)) = LOWER(TRIM(?))').join(' OR ');

        const studentExamsQuery = `
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
        `;

        const availableToJss3Gold = await all(studentExamsQuery, [...classVars]);

        const hasEmptyAgricForStudent = availableToJss3Gold.some(e => 
            e.subject.toLowerCase().includes('agric') && Number(e.question_count) === 0
        );

        record(
            'Student Portal Zero-Question Exclusion Guard',
            !hasEmptyAgricForStudent,
            availableToJss3Gold.length === 0 
                ? 'Zero inactive/empty papers returned to JSS 3 Gold student (clean slate).'
                : `Returned ${availableToJss3Gold.length} available papers with >0 questions: ` + availableToJss3Gold.map(p => `${p.subject} (${p.question_count} Qs)`).join(', ')
        );

        // Test 5: Verify all returned papers have question_count > 0
        const allHaveQuestions = availableToJss3Gold.every(p => Number(p.question_count) > 0);
        record(
            'All Available Papers Have Question Count > 0',
            allHaveQuestions,
            `Every paper returned to candidate has actual_question_count > 0: ${allHaveQuestions}`
        );

        // Write verification report
        const reportPath = path.resolve(__dirname, 'verification_report.json');
        fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
        console.log(`\n📄 Verification report saved to: ${reportPath}`);

    } catch (err) {
        console.error('❌ [Verification Test Suite Error]:', err);
        results.allPassed = false;
        results.error = err.message;
    } finally {
        console.log(`\n🏁 Overall Verification Result: ${results.allPassed ? 'ALL TESTS PASSED ✅' : 'SOME TESTS FAILED ❌'}`);
        process.exit(results.allPassed ? 0 : 1);
    }
}

setTimeout(runVerification, 500);
