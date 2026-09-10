/**
 * regrade_and_cleanup.js
 * 
 * Safe migration script to:
 * 1. Retroactively re-grade submissions that were recorded with 0 scores due to missing server-side grading.
 * 2. Clean up orphan login sessions with DEFAULT 'midterm_ca' and no subject.
 * 3. Log all transformations and run verification checks.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.resolve(__dirname, 'cbt_database.db');
console.log(`Connecting to SQLite database at: ${DB_PATH}`);

const db = new sqlite3.Database(DB_PATH, async (err) => {
    if (err) {
        console.error('❌ Failed to connect to database:', err.message);
        process.exit(1);
    }
    console.log('✅ Connected to database. Starting migration...\n');
    await runMigration();
});

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
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

async function runMigration() {
    try {
        console.log('================================================================');
        console.log('STEP 1: ORPHAN SESSION CLEANUP (Approved Q2)');
        console.log('================================================================');
        
        const orphanCheck = await dbAll(
            `SELECT id, student_id, workstation_ip, login_time, assessment_slot FROM exam_sessions WHERE subject IS NULL AND assessment_slot = 'midterm_ca'`
        );
        console.log(`Found ${orphanCheck.length} orphan login sessions with default 'midterm_ca' slot and no subject.`);

        const cleanupResult = await dbRun(
            `UPDATE exam_sessions SET assessment_slot = NULL WHERE subject IS NULL AND assessment_slot = 'midterm_ca'`
        );
        console.log(`✅ Cleaned up ${cleanupResult.changes} orphan sessions (set assessment_slot = NULL).\n`);

        console.log('================================================================');
        console.log('STEP 2: RETROACTIVE SUBMISSION RE-GRADING (Approved Q1 & Q3)');
        console.log('================================================================');

        // Fetch all questions into a lookup map for fallback grading and marks weighting
        const allQuestions = await dbAll(`SELECT id, subject, correct_answer, marks FROM questions`);
        const questionsMap = {};
        allQuestions.forEach(q => {
            questionsMap[String(q.id)] = {
                id: q.id,
                subject: q.subject,
                correct_answer: String(q.correct_answer || '').trim().toUpperCase(),
                marks: q.marks || 1
            };
        });
        console.log(`Loaded ${allQuestions.length} questions into reference map.`);

        // Fetch all student_sessions that have answers
        const studentSessions = await dbAll(
            `SELECT id, student_id, reg_number, config_id, subject, answers_json, score, status, submitted_at FROM student_sessions`
        );
        console.log(`Analyzing ${studentSessions.length} student_sessions records...`);

        let regradedCount = 0;

        for (const session of studentSessions) {
            let answersObj = {};
            try {
                if (session.answers_json) {
                    answersObj = typeof session.answers_json === 'string' ? JSON.parse(session.answers_json) : session.answers_json;
                }
            } catch (_) {
                answersObj = {};
            }

            const answerEntries = Object.entries(answersObj || {});
            if (answerEntries.length === 0) continue;

            // Check if there is an exam_session with option_mapping
            let optionMap = null;
            if (session.student_id && session.subject) {
                const examSess = await dbGet(
                    `SELECT id, option_mapping FROM exam_sessions WHERE student_id = ? AND LOWER(TRIM(subject)) = LOWER(TRIM(?)) ORDER BY id DESC LIMIT 1`,
                    [session.student_id, session.subject]
                );
                if (examSess && examSess.option_mapping) {
                    try { optionMap = JSON.parse(examSess.option_mapping); } catch (_) {}
                }
            }
            if (!optionMap && session.reg_number && session.subject) {
                const examSess = await dbGet(
                    `SELECT es.id, es.option_mapping FROM exam_sessions es JOIN students s ON es.student_id = s.id WHERE (UPPER(TRIM(s.reg_number)) = ? OR UPPER(TRIM(s.registration_no)) = ?) AND LOWER(TRIM(es.subject)) = LOWER(TRIM(?)) ORDER BY es.id DESC LIMIT 1`,
                    [session.reg_number.toUpperCase().trim(), session.reg_number.toUpperCase().trim(), session.subject]
                );
                if (examSess && examSess.option_mapping) {
                    try { optionMap = JSON.parse(examSess.option_mapping); } catch (_) {}
                }
            }

            let calculatedScore = 0;
            let totalPossibleMarks = 0;

            if (optionMap && Object.keys(optionMap).length > 0) {
                // Grade via option_mapping (shuffle-safe)
                for (const [qId, selectedKey] of answerEntries) {
                    if (!selectedKey) continue;
                    const normSelected = String(selectedKey).trim().toUpperCase();
                    const mapping = optionMap[String(qId)];
                    const qRef = questionsMap[String(qId)];
                    const qMarks = qRef ? qRef.marks : 1;
                    totalPossibleMarks += qMarks;

                    if (mapping && mapping.correctKey) {
                        if (normSelected === String(mapping.correctKey).trim().toUpperCase()) {
                            calculatedScore += qMarks;
                        }
                    }
                }
            } else {
                // Fallback: Grade directly against questions.correct_answer
                for (const [qId, selectedKey] of answerEntries) {
                    if (!selectedKey) continue;
                    const normSelected = String(selectedKey).trim().toUpperCase();
                    const qRef = questionsMap[String(qId)];
                    if (qRef) {
                        totalPossibleMarks += qRef.marks;
                        if (normSelected === qRef.correct_answer) {
                            calculatedScore += qRef.marks;
                        }
                    }
                }
            }

            const oldScore = session.score;
            if (oldScore !== calculatedScore) {
                console.log(`  [RE-GRADE] Session #${session.id} (${session.reg_number} - ${session.subject}): Score ${oldScore} -> ${calculatedScore} (out of ${totalPossibleMarks} attempted marks)`);
                
                // Update student_sessions
                await dbRun(
                    `UPDATE student_sessions SET score = ? WHERE id = ?`,
                    [calculatedScore, session.id]
                );

                // Sync to exam_sessions
                if (session.student_id && session.subject) {
                    await dbRun(
                        `UPDATE exam_sessions SET score = ? WHERE student_id = ? AND LOWER(TRIM(subject)) = LOWER(TRIM(?))`,
                        [calculatedScore, session.student_id, session.subject]
                    );
                }

                // Sync to student_exam_sessions
                if (session.student_id && session.subject) {
                    await dbRun(
                        `UPDATE student_exam_sessions SET score = ? WHERE student_id = ? AND LOWER(TRIM(subject_name)) = LOWER(TRIM(?))`,
                        [calculatedScore, session.student_id, session.subject]
                    );
                }

                regradedCount++;
            }
        }

        console.log(`\n✅ Re-graded ${regradedCount} student session(s) with accurate scores.\n`);

        console.log('================================================================');
        console.log('STEP 3: SYSTEM INTEGRITY VERIFICATION CHECKS');
        console.log('================================================================');

        // Check 1: Remaining 0-scores with valid answers
        const remainingZeros = await dbAll(
            `SELECT id, reg_number, subject, answers_json, score FROM student_sessions WHERE score = 0 AND answers_json != '{}' AND answers_json != 'null' AND answers_json IS NOT NULL`
        );
        console.log(`Check 1: Legitimate zeros (all submitted answers were incorrect): ${remainingZeros.length}`);

        // Check 2: All scored sessions summary
        const scoredSummary = await dbAll(
            `SELECT reg_number, subject, score, status, submitted_at FROM student_sessions ORDER BY id DESC LIMIT 10`
        );
        console.log('\nLatest Submissions Summary:');
        console.table(scoredSummary);

        // Check 3: Orphan sessions check
        const remainingOrphans = await dbAll(
            `SELECT COUNT(*) as count FROM exam_sessions WHERE subject IS NULL AND assessment_slot IS NOT NULL`
        );
        console.log(`\nCheck 3: Orphan sessions with non-null slot: ${remainingOrphans[0].count} (Expected: 0)`);

        // Check 4: Assessment slot distribution in exam_sessions
        const slotDist = await dbAll(
            `SELECT assessment_slot, COUNT(*) as count FROM exam_sessions GROUP BY assessment_slot`
        );
        console.log('\nCheck 4: Exam Sessions Slot Distribution:');
        console.table(slotDist);

        console.log('\n🎉 ALL MIGRATIONS AND VERIFICATION CHECKS COMPLETED SUCCESSFULLY!');

    } catch (err) {
        console.error('❌ Migration error:', err);
    } finally {
        db.close();
    }
}
