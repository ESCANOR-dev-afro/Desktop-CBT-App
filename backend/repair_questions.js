/**
 * repair_questions.js
 * 
 * One-time data repair script for Mathematics question bank in cbt_database.db:
 * 1. "A fair die is rolled once. What is the probability of obtaining a prime number?":
 *    - Set Option A = '1/2'
 *    - Set Option B = '1/3'
 *    - Set Option C = '2/3'
 *    - Set Option D = '1/6'
 *    - Set correct_answer = 'A'
 * 
 * 2. Sanitize and repair all other questions containing Excel date serial floats (e.g., 36897.00040509259)
 *    across all classes (SS 1 Science, SS 1 Art, SS 1 Commercial, JSS classes).
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.resolve(__dirname, 'cbt_database.db');
const db = new sqlite3.Database(DB_PATH);

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

const serialMap = {
    '36897': '1/2',
    '36894': '1/3',
    '36893': '2/3',
    '36925': '1/6',
    '36955': '3/5',
    '36986': '4/5',
    '37014': '2/5',
    '36984': '1/5',
    '37023': '5/12',
    '37084': '7/12',
    '37018': '5/7',
    '37136': '9/2',
    '36952': '3/2',
    '37138': '9/4'
};

function sanitizeVal(val) {
    if (!val) return val;
    let str = String(val).trim();
    const intPart = str.split('.')[0];
    if (serialMap[intPart]) {
        return serialMap[intPart];
    }
    return str;
}

async function repair() {
    try {
        console.log('Starting Questions Database Repair...');

        // 1. Explicit repair for the Fair Die probability question across all classes
        const dieQuestions = await dbAll(
            `SELECT id, class, subject, question_text FROM questions WHERE question_text LIKE '%die%' OR question_text LIKE '%probability of obtaining a prime number%'`
        );
        console.log(`Found ${dieQuestions.length} "fair die" question(s). Repairing options to standard fractions:`);
        
        for (const q of dieQuestions) {
            await dbRun(
                `UPDATE questions 
                 SET option_a = '1/2',
                     option_b = '1/3',
                     option_c = '2/3',
                     option_d = '1/6',
                     correct_answer = 'A'
                 WHERE id = ?`,
                [q.id]
            );
            console.log(`  ✅ Repaired Question #${q.id} (${q.class} - ${q.subject}): A=1/2, B=1/3, C=2/3, D=1/6, Correct=A`);
        }

        // 2. Scan and repair all questions in database with date serial floats
        const allQuestions = await dbAll(`SELECT id, class, subject, question_text, option_a, option_b, option_c, option_d, correct_answer FROM questions`);
        let generalRepairedCount = 0;

        for (const q of allQuestions) {
            let changed = false;
            let optA = q.option_a;
            let optB = q.option_b;
            let optC = q.option_c;
            let optD = q.option_d;

            const cleanA = sanitizeVal(optA);
            const cleanB = sanitizeVal(optB);
            const cleanC = sanitizeVal(optC);
            const cleanD = sanitizeVal(optD);

            if (cleanA !== optA || cleanB !== optB || cleanC !== optC || cleanD !== optD) {
                await dbRun(
                    `UPDATE questions SET option_a = ?, option_b = ?, option_c = ?, option_d = ? WHERE id = ?`,
                    [cleanA, cleanB, cleanC, cleanD, q.id]
                );
                console.log(`  ✅ Sanitized Question #${q.id} (${q.class} - ${q.subject}):`);
                console.log(`     A: "${optA}" -> "${cleanA}"`);
                console.log(`     B: "${optB}" -> "${cleanB}"`);
                console.log(`     C: "${optC}" -> "${cleanC}"`);
                console.log(`     D: "${optD}" -> "${cleanD}"`);
                generalRepairedCount++;
            }
        }

        console.log(`\n🎉 Data repair complete. Total questions repaired: ${dieQuestions.length + generalRepairedCount}`);

    } catch (e) {
        console.error('Repair error:', e);
    } finally {
        db.close();
    }
}

repair();
