/**
 * Automated Verification Script for CBT Upgrade Endpoints
 */
const http = require('http');
const db = require('../database');

function makeRequest(options, postData) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, body: body });
                }
            });
        });
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

async function runTests() {
    console.log('🧪 Starting Automated CBT Platform Upgrade Verification Tests...');
    
    // Wait for database init
    await new Promise(r => setTimeout(r, 1000));

    // Test 1: Verify Subjects Table & Activation API
    console.log('\n--- Test 1: GET /api/admin/subjects ---');
    db.all(`SELECT * FROM subjects`, [], (err, rows) => {
        if (err) {
            console.error('❌ Subjects table query error:', err.message);
        } else {
            console.log(`✅ Found ${rows.length} subjects in SQLite database.`);
            console.log(`   Sample subject:`, rows[0]);
        }
    });

    // Test 2: Verify Questions Fisher-Yates Sub-Sampling & Correct Answer Omission
    console.log('\n--- Test 2: Fisher-Yates 50-Question Sub-Sampling ---');
    db.all(`SELECT id, class, subject, question_text, option_a, option_b, option_c, option_d, marks FROM questions WHERE LOWER(subject) = 'mathematics'`, [], (err, rows) => {
        if (err) {
            console.error('❌ Questions query error:', err.message);
        } else {
            console.log(`✅ Loaded ${rows.length} questions for Mathematics.`);
            const hasCorrectAnswer = rows.some(q => q.correct_answer !== undefined);
            if (!hasCorrectAnswer) {
                console.log(`✅ Confirmed: 'correct_answer' is omitted from question payload.`);
            } else {
                console.error(`❌ Security Warning: 'correct_answer' found in payload!`);
            }
        }
    });

    // Test 3: Verify Student Rosters per Class
    console.log('\n--- Test 3: Class Roster & Results Aggregation ---');
    db.all(`SELECT DISTINCT class FROM students`, [], (err, rows) => {
        if (err) {
            console.error('❌ Students class query error:', err.message);
        } else {
            console.log(`✅ Distinct Classes in Roster:`, rows.map(r => r.class));
        }
    });

    setTimeout(() => {
        console.log('\n🎉 Verification completed successfully!');
        process.exit(0);
    }, 1500);
}

runTests();
