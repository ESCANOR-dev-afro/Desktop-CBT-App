const db = require('../database');

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

async function debug() {
    const studentClass = 'SS 1 Science';
    const subject = 'Physics';
    const normSub = String(subject || '').trim();
    const normClass = String(studentClass).trim();

    const classCfg = await dbGet(
        `SELECT is_active FROM exam_configs WHERE LOWER(class) = LOWER(?) AND LOWER(subject) = LOWER(?)`,
        [normClass, normSub]
    );

    console.log("CLASS CFG QUERY RESULT:", classCfg);
}

debug().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
