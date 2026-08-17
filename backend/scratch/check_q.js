const db = require('../database');

db.all(`SELECT id, subject, class, question_text FROM questions WHERE LOWER(subject) LIKE '%math%' OR LOWER(subject) LIKE '%bio%' OR LOWER(subject) LIKE '%general%'`, [], (err, rows) => {
    if (err) console.error(err);
    else console.log(rows);
    process.exit(0);
});
