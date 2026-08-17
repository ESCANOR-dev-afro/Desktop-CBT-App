const db = require('../database');

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

async function verifyCurriculumSeeding() {
    console.log('=== 🔍 CURRICULUM SEEDING & STREAM ISOLATION VERIFICATION ===\n');

    // Wait 500ms for database serialize/seed to finish
    await new Promise(r => setTimeout(r, 500));

    // 1. Total Subjects Count
    const subjects = await dbAll('SELECT name FROM subjects ORDER BY name ASC');
    console.log(`✅ Master Catalog Subjects Count: ${subjects.length}`);
    console.log('Subjects List:', subjects.map(s => s.name).join(', '));
    console.log('--------------------------------------------------');

    // 2. Class Subjects Mapping Verification
    const testClasses = [
        { name: 'JSS 1 Gold', expectedCount: 16 },
        { name: 'JSS 2 Silver', expectedCount: 16 },
        { name: 'JSS 3 Diamond', expectedCount: 16 },
        { name: 'SS 1 Science', expectedCount: 11 },
        { name: 'SS 2 Commercial', expectedCount: 8 },
        { name: 'SS 3 Art', expectedCount: 8 }
    ];

    for (const testCls of testClasses) {
        const rows = await dbAll('SELECT subject_name FROM class_subjects WHERE LOWER(class_name) = LOWER(?) ORDER BY id ASC', [testCls.name]);
        const names = rows.map(r => r.subject_name);
        console.log(`\n📌 Class: [${testCls.name}] (Total: ${names.length} / Expected: ${testCls.expectedCount})`);
        console.log(`Subjects: [${names.join(', ')}]`);

        if (names.length === testCls.expectedCount) {
            console.log(`✅ PASSED: Exact subject allocation confirmed for ${testCls.name}.`);
        } else {
            console.error(`❌ FAILED: Expected ${testCls.expectedCount} subjects, got ${names.length}.`);
        }
    }

    console.log('--------------------------------------------------');

    // 3. Cross-Stream Contamination Checks
    console.log('\n🔒 RUNNING CROSS-STREAM CONTAMINATION CHECKS:');
    
    // Science Check
    const sciRows = await dbAll('SELECT subject_name FROM class_subjects WHERE LOWER(class_name) = LOWER(?)', ['SS 1 Science']);
    const sciNames = new Set(sciRows.map(r => r.subject_name));
    const sciForbidden = ['Account', 'Commerce', 'Government', 'CRS', 'Literature in English'];
    const sciLeaks = sciForbidden.filter(f => sciNames.has(f));
    if (sciLeaks.length === 0) {
        console.log('✅ PASSED: Science Stream has 0 commercial/arts forbidden subjects.');
    } else {
        console.error('❌ FAILED: Science Stream contains forbidden subjects:', sciLeaks);
    }
    if (sciNames.has('Geography') && sciNames.has('Agricultural Science')) {
        console.log('✅ PASSED: Science Stream successfully includes Geography and Agricultural Science.');
    } else {
        console.error('❌ FAILED: Science Stream missing Geography or Agricultural Science.');
    }

    // Commercial Check
    const comRows = await dbAll('SELECT subject_name FROM class_subjects WHERE LOWER(class_name) = LOWER(?)', ['SS 1 Commercial']);
    const comNames = new Set(comRows.map(r => r.subject_name));
    const comForbidden = ['Biology', 'Chemistry', 'Physics', 'Government', 'CRS', 'Literature in English'];
    const comLeaks = comForbidden.filter(f => comNames.has(f));
    if (comLeaks.length === 0) {
        console.log('✅ PASSED: Commercial Stream has 0 science/arts forbidden subjects.');
    } else {
        console.error('❌ FAILED: Commercial Stream contains forbidden subjects:', comLeaks);
    }

    // Arts Check
    const artRows = await dbAll('SELECT subject_name FROM class_subjects WHERE LOWER(class_name) = LOWER(?)', ['SS 1 Art']);
    const artNames = new Set(artRows.map(r => r.subject_name));
    const artForbidden = ['Biology', 'Chemistry', 'Physics', 'Further Mathematics', 'Account', 'Commerce'];
    const artLeaks = artForbidden.filter(f => artNames.has(f));
    if (artLeaks.length === 0) {
        console.log('✅ PASSED: Arts Stream has 0 science/commercial forbidden subjects.');
    } else {
        console.error('❌ FAILED: Arts Stream contains forbidden subjects:', artLeaks);
    }

    console.log('\n==================================================');
    console.log('🎉 ALL CURRICULUM SEEDING & ISOLATION CHECKS COMPLETE');
    process.exit(0);
}

verifyCurriculumSeeding();
