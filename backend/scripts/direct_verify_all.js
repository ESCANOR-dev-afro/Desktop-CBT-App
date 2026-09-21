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

async function verify() {
    const logLines = [];
    function log(msg) {
        console.log(msg);
        logLines.push(msg);
    }

    try {
        log('======================================================================');
        log('🧪 [DIRECT DATABASE & CURRICULUM AUDIT]');
        log('======================================================================\n');

        // 1. Check for legacy subject aliases across class_subjects
        const legacyClassSubjects = await all(`
            SELECT class_name, subject_name 
            FROM class_subjects 
            WHERE LOWER(TRIM(subject_name)) IN ('agric', 'agriculture', 'basic tech')
        `);
        const test1Pass = legacyClassSubjects.length === 0;
        log(`1. Legacy aliases ('agric', 'agriculture', 'basic tech') in class_subjects: ${test1Pass ? '0 (PASS ✅)' : legacyClassSubjects.length + ' (FAIL ❌)'}`);
        if (!test1Pass) {
            legacyClassSubjects.forEach(r => log(`   - Found: ${r.class_name} -> ${r.subject_name}`));
        }

        // 2. Check for Agricultural Science in Art / Commercial
        const agricInArtCom = await all(`
            SELECT class_name, subject_name 
            FROM class_subjects 
            WHERE LOWER(subject_name) LIKE '%agric%' 
              AND (class_name LIKE '%Art%' OR class_name LIKE '%Commercial%')
        `);
        const test2Pass = agricInArtCom.length === 0;
        log(`2. Agricultural Science in Art/Commercial class_subjects: ${test2Pass ? '0 (PASS ✅)' : agricInArtCom.length + ' (FAIL ❌)'}`);
        if (!test2Pass) {
            agricInArtCom.forEach(r => log(`   - Found: ${r.class_name} -> ${r.subject_name}`));
        }

        // 3. Check for ICT in Junior classes
        const juniorClasses = [
            'JSS 1', 'JSS 1 Gold', 'JSS 1 Silver', 'JSS 1 Diamond',
            'JSS 2', 'JSS 2 Gold', 'JSS 2 Silver', 'JSS 2 Diamond',
            'JSS 3', 'JSS 3 Gold', 'JSS 3 Silver', 'JSS 3 Diamond'
        ];
        let juniorIctMissing = [];
        for (const jc of juniorClasses) {
            const rows = await all(`
                SELECT * FROM class_subjects 
                WHERE LOWER(TRIM(class_name)) = LOWER(TRIM(?)) 
                  AND LOWER(TRIM(subject_name)) = 'ict'
            `, [jc]);
            if (rows.length === 0) juniorIctMissing.push(jc);
        }
        const test3Pass = juniorIctMissing.length === 0;
        log(`3. ICT present across all Junior classes & arms: ${test3Pass ? '100% Present (PASS ✅)' : 'Missing in ' + juniorIctMissing.join(', ') + ' (FAIL ❌)'}`);

        // 4. Check for Agricultural Science in Junior and Science classes
        const scienceClasses = [
            'SS 1 Science', 'SS 2 Science', 'SS 3 Science'
        ];
        let scienceAgricMissing = [];
        for (const sc of scienceClasses) {
            const rows = await all(`
                SELECT * FROM class_subjects 
                WHERE LOWER(TRIM(class_name)) = LOWER(TRIM(?)) 
                  AND subject_name = 'Agricultural Science'
            `, [sc]);
            if (rows.length !== 1) scienceAgricMissing.push(`${sc} (count: ${rows.length})`);
        }
        const test4Pass = scienceAgricMissing.length === 0;
        log(`4. Agricultural Science in Science streams (exactly 1 each): ${test4Pass ? 'All Present (PASS ✅)' : 'Issue in ' + scienceAgricMissing.join(', ') + ' (FAIL ❌)'}`);

        // 5. Check duplicate mappings in class_subjects
        const dupClassSubjects = await all(`
            SELECT class_name, subject_name, COUNT(*) as cnt 
            FROM class_subjects 
            GROUP BY LOWER(TRIM(class_name)), LOWER(TRIM(subject_name))
            HAVING COUNT(*) > 1
        `);
        const test5Pass = dupClassSubjects.length === 0;
        log(`5. Duplicate (class_name, subject_name) rows in class_subjects: ${test5Pass ? '0 (PASS ✅)' : dupClassSubjects.length + ' duplicates (FAIL ❌)'}`);
        if (!test5Pass) {
            dupClassSubjects.forEach(r => log(`   - Duplicate: ${r.class_name} -> ${r.subject_name} (${r.cnt} times)`));
        }

        // 6. Check subjects master table
        const legacyInSubjects = await all(`
            SELECT name FROM subjects 
            WHERE LOWER(TRIM(name)) IN ('agric', 'agriculture', 'basic tech')
        `);
        const test6Pass = legacyInSubjects.length === 0;
        log(`6. Legacy strings in \`subjects\` master table: ${test6Pass ? '0 (PASS ✅)' : legacyInSubjects.map(s => s.name).join(', ') + ' (FAIL ❌)'}`);

        // 7. Check assessment_configs for legacy strings or Agric in Art/Commercial
        const legacyInConfigs = await all(`
            SELECT class, subject FROM assessment_configs 
            WHERE LOWER(TRIM(subject)) IN ('agric', 'agriculture', 'basic tech')
               OR (LOWER(subject) LIKE '%agric%' AND (class LIKE '%Art%' OR class LIKE '%Commercial%'))
        `);
        const test7Pass = legacyInConfigs.length === 0;
        log(`7. Legacy/Invalid configs in assessment_configs: ${test7Pass ? '0 (PASS ✅)' : legacyInConfigs.length + ' (FAIL ❌)'}`);

        // Write summary report
        const allPassed = test1Pass && test2Pass && test3Pass && test4Pass && test5Pass && test6Pass && test7Pass;
        log(`\n======================================================================`);
        log(`OVERALL AUDIT RESULT: ${allPassed ? 'ALL CHECKS PASSED ✅' : 'FAILURES DETECTED ❌'}`);
        log(`======================================================================`);

        fs.writeFileSync(path.resolve(__dirname, 'verification_output.txt'), logLines.join('\n'));
        setTimeout(() => process.exit(allPassed ? 0 : 1), 200);
    } catch (err) {
        console.error('Audit Error:', err);
        process.exit(1);
    }
}

setTimeout(verify, 1500);
