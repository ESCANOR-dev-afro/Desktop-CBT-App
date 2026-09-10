const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('cbt_database.db');

db.all(`SELECT id, subject, class, assessment_slot, question_text, option_a, option_b, option_c, option_d, correct_answer 
        FROM questions 
        WHERE question_text LIKE '%die%' 
           OR question_text LIKE '%probability%' 
           OR option_a GLOB '*[0-9].[0-9]*' 
           OR option_b GLOB '*[0-9].[0-9]*'
           OR option_c GLOB '*[0-9].[0-9]*'
           OR option_d GLOB '*[0-9].[0-9]*'`, (err, rows) => {
    if (err) {
        console.error('Error:', err);
    } else {
        console.log('Found rows:', JSON.stringify(rows, null, 2));
    }
    db.close();
});
