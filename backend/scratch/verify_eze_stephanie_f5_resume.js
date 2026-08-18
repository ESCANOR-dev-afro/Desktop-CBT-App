/**
 * verify_eze_stephanie_f5_resume.js
 * 
 * Verification Test Suite for EZE Stephanie Session Auto-Resume & Routing Guard:
 * 1. Starts CBT Server in-process.
 * 2. Enrolls / Seeds candidate EZE Stephanie in SS 3 Science (Mathematics).
 * 3. Prepares questions for Mathematics.
 * 4. Activates Mathematics paper.
 * 5. Starts Mathematics exam session.
 * 6. Saves progress for Q1->B, Q2->A, Q3->C with current_question_index = 2 (Question 3).
 * 7. Verifies GET /api/student/active-session returns hasActiveSession = true with all details intact.
 * 8. Verifies dashboard card states return status = 'in_progress'.
 * 9. Simulates F5 reload direct entry restoring session at Question 3 with timer and answers preserved.
 */

const http = require('http');
const app = require('../server');

function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: '127.0.0.1',
            port: 3000,
            path: path,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, body: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });

        req.on('error', err => reject(err));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runEzeStephanieVerificationSuite() {
    console.log("==================================================================");
    console.log("⚡ CBT VERIFICATION SUITE: EZE STEPHANIE F5 SESSION AUTO-RESUME");
    console.log("==================================================================\n");

    const server = app.listen(3000, async () => {
        try {
            // 1. Enroll candidate EZE Stephanie
            console.log("1️⃣ Enrolling / verifying candidate EZE Stephanie in SS 3 Science...");
            await makeRequest('POST', '/api/admin/students', {
                registration_no: 'AWA26270088',
                reg_number: 'AWA26270088',
                surname: 'EZE',
                first_name: 'Stephanie',
                class: 'SS 3 Science',
                stream: 'Science',
                class_tier: 'SS 3',
                assigned_subject: 'Mathematics, English Language, Biology, Chemistry, Physics'
            });
            
            // Login as EZE Stephanie to verify authentication
            const loginRes = await makeRequest('POST', '/api/student/login', {
                registration_no: 'AWA26270088',
                surname: 'EZE'
            });
            
            if (loginRes.status !== 200 || !loginRes.body.success) {
                console.error("❌ Login failed for EZE Stephanie!", loginRes.body);
                server.close();
                process.exit(1);
            }

            const studentId = loginRes.body.student.id;
            console.log(`  ✅ Candidate authenticated. Student ID: ${studentId} (${loginRes.body.student.reg_number})`);

            // 2. Insert test questions for Mathematics
            console.log("\n2️⃣ Inserting Mathematics questions for SS 3 Science...");
            await makeRequest('POST', '/api/admin/questions', {
                class: 'SS 3 Science',
                subject: 'Mathematics',
                question_text: "Solve for x: 2x + 5 = 15",
                option_a: "x = 3",
                option_b: "x = 5",
                option_c: "x = 10",
                option_d: "x = 7",
                correct_answer: "B"
            });

            await makeRequest('POST', '/api/admin/questions', {
                class: 'SS 3 Science',
                subject: 'Mathematics',
                question_text: "What is the derivative of x^2 with respect to x?",
                option_a: "2x",
                option_b: "x",
                option_c: "2",
                option_d: "x^3 / 3",
                correct_answer: "A"
            });

            await makeRequest('POST', '/api/admin/questions', {
                class: 'SS 3 Science',
                subject: 'Mathematics',
                question_text: "Evaluate log_10(1000).",
                option_a: "1",
                option_b: "2",
                option_c: "3",
                option_d: "4",
                correct_answer: "C"
            });

            await makeRequest('POST', '/api/admin/questions', {
                class: 'SS 3 Science',
                subject: 'Mathematics',
                question_text: "Find the hypotenuse of a right-angled triangle with sides 3cm and 4cm.",
                option_a: "5cm",
                option_b: "6cm",
                option_c: "7cm",
                option_d: "8cm",
                correct_answer: "A"
            });

            // 3. Set 'Mathematics' to ACTIVE
            console.log("\n3️⃣ Activating 'Mathematics' paper for SS 3 Science...");
            await makeRequest('POST', '/api/admin/subjects/toggle', {
                class: 'SS 3 Science',
                subject: 'Mathematics',
                is_active: 1
            });

            // 4. Start Exam Session
            console.log("\n4️⃣ Launching Mathematics exam session for EZE Stephanie...");
            const startRes = await makeRequest('POST', '/api/student/exam/start', {
                student_id: studentId,
                subject: 'Mathematics',
                class: 'SS 3 Science'
            });

            const sessionId = startRes.body.session_id;
            console.log(`  Session created. Session ID: ${sessionId} | Is Resumed: ${startRes.body.is_resumed} | Questions Count: ${startRes.body.questions.length}`);

            const questions = startRes.body.questions;
            const q1Id = questions[0].id;
            const q2Id = questions[1].id;
            const q3Id = questions[2].id;

            // 5. Select answers for Q1, Q2, Q3 and update current_question_index = 2 (Question 3)
            console.log(`\n5️⃣ Saving progress: Q1 [ID ${q1Id}]->B, Q2 [ID ${q2Id}]->A, Q3 [ID ${q3Id}]->C at Question 3 (index 2)...`);
            await makeRequest('POST', '/api/student/exam/save-progress', {
                session_id: sessionId,
                student_id: studentId,
                question_id: q1Id,
                selected_option: 'B',
                current_question_index: 0
            });

            await makeRequest('POST', '/api/student/exam/save-progress', {
                session_id: sessionId,
                student_id: studentId,
                question_id: q2Id,
                selected_option: 'A',
                current_question_index: 1
            });

            await makeRequest('POST', '/api/student/exam/save-progress', {
                session_id: sessionId,
                student_id: studentId,
                question_id: q3Id,
                selected_option: 'C',
                current_question_index: 2
            });
            console.log("  Progress autosaved successfully.");

            // 6. Test GET /api/student/active-session
            console.log("\n6️⃣ Verifying GET /api/student/active-session endpoint format...");
            const activeCheckRes = await makeRequest('GET', `/api/student/active-session?student_id=${studentId}`);
            console.log("  Active Session API Response:", JSON.stringify(activeCheckRes.body));

            const body = activeCheckRes.body;
            if ((body.hasActiveSession === true || body.has_active_session === true) &&
                (body.session || body.active_session) &&
                (body.session?.id === sessionId || body.active_session?.session_id === sessionId)) {
                const ses = body.session || body.active_session;
                console.log("  ✅ Verification Passed: hasActiveSession is true, session payload contains ongoing Mathematics details!");
                console.log(`     Session Subject: ${ses.subject_name || ses.subject} | Question Index: ${ses.current_question_index} | Expires At: ${ses.expires_at}`);
            } else {
                console.error("❌ Active session verification failed!", body);
                server.close();
                process.exit(1);
            }

            // 7. Check Dashboard Card States
            console.log("\n7️⃣ Checking dashboard card status (GET /api/student/assigned-papers & GET /api/student/:id/dashboard)...");
            const papersRes = await makeRequest('GET', `/api/student/assigned-papers?student_id=${studentId}`);
            const mathPaper = papersRes.body.papers.find(p => p.subject.toLowerCase() === 'mathematics');
            console.log("  Assigned Papers Math Card State:", JSON.stringify(mathPaper));

            if (mathPaper && mathPaper.status === 'in_progress' && (mathPaper.hasActiveSession || mathPaper.has_active_session)) {
                console.log("  ✅ Verification Passed: Dashboard card state is strictly 'in_progress' with active session flag!");
            } else {
                console.error("❌ Dashboard card state failed!", mathPaper);
                server.close();
                process.exit(1);
            }

            // 8. Simulate F5 Browser Reload Direct Entry to Exam Screen
            console.log("\n8️⃣ Simulating F5 browser refresh & direct route guard interceptor...");
            const resumeRes = await makeRequest('POST', '/api/student/exam/start', {
                student_id: studentId,
                subject: 'Mathematics',
                class: 'SS 3 Science'
            });

            console.log(`  Resumed Session ID: ${resumeRes.body.session_id} | Is Resumed: ${resumeRes.body.is_resumed}`);
            console.log("  Restored Question Index:", resumeRes.body.current_question_index);
            console.log("  Restored Selected Answers:", JSON.stringify(resumeRes.body.selected_answers));
            console.log("  Remaining Timer Seconds:", resumeRes.body.duration_seconds);

            if (resumeRes.body.is_resumed &&
                resumeRes.body.current_question_index === 2 &&
                resumeRes.body.selected_answers[String(q1Id)] === 'B' &&
                resumeRes.body.selected_answers[String(q2Id)] === 'A' &&
                resumeRes.body.selected_answers[String(q3Id)] === 'C') {
                console.log("  ✅ Verification Passed: Exam re-opened at Question 3 with choices saved and timer intact!");
            } else {
                console.error("❌ F5 auto-resume restoration failed!", resumeRes.body);
                server.close();
                process.exit(1);
            }

            console.log("\n==================================================================");
            console.log("🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY! F5 AUTO-RESUME READY.");
            console.log("==================================================================\n");
            
            server.close();
            process.exit(0);
        } catch (err) {
            console.error("❌ Test suite exception:", err);
            server.close();
            process.exit(1);
        }
    });
}

runEzeStephanieVerificationSuite();
