const db = require('../database');

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function testQuery() {
    const studentClass = 'JSS 1 Gold';
    const normalizedSubject = 'Biology';
    const baseTier = studentClass.replace(/\s+(Science|Art|Commercial|Gold|Silver|Diamond)$/i, '').trim();

    let querySql = `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_answer, diagram_image_url FROM questions WHERE LOWER(subject) = LOWER(?)`;
    const queryParams = [normalizedSubject];

    if (studentClass) {
        querySql += ` AND (class IS NULL OR TRIM(class) = '' OR LOWER(class) = LOWER(?) OR LOWER(class) = LOWER(?))`;
        queryParams.push(studentClass, baseTier);
    }

    console.log("SQL:", querySql);
    console.log("Params:", queryParams);

    const rows = await dbAll(querySql, queryParams);
    console.log("Rows count:", rows ? rows.length : 0);
    process.exit(0);
}

testQuery();
