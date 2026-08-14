/**
 * test_bulk_and_shuffle.js
 * 
 * End-to-end verification script for:
 * 1. Bulk Question Upload Endpoint (/api/questions/upload) with CSV & XLSX
 * 2. Dynamic Question Shuffling Logic per student session with persistence across refreshes.
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';

async function runTests() {
    console.log('🚀 Starting Verification Tests for Bulk Question Upload & Shuffling...\n');

    // Step 1: Create sample XLSX file with 10 questions
    const sampleQuestions = [
        { Question: 'What is the capital of France?', Option_A: 'London', Option_B: 'Paris', Option_C: 'Berlin', Option_D: 'Madrid', Correct_Answer: 'B', Marks: 2, Subject: 'General Knowledge' },
        { Question: 'Which element has chemical symbol O?', Option_A: 'Gold', Option_B: 'Oxygen', Option_C: 'Silver', Option_D: 'Iron', Correct_Answer: 'B', Marks: 1, Subject: 'General Knowledge' },
        { Question: 'What is 5 + 7?', Option_A: '10', Option_B: '11', Option_C: '12', Option_D: '13', Correct_Answer: 'C', Marks: 1, Subject: 'General Knowledge' },
        { Question: 'Which planet is known as the Red Planet?', Option_A: 'Earth', Option_B: 'Venus', Option_C: 'Mars', Option_D: 'Jupiter', Correct_Answer: 'C', Marks: 1, Subject: 'General Knowledge' },
        { Question: 'What is the speed of light approx?', Option_A: '300,000 km/s', Option_B: '150,000 km/s', Option_C: '1,000,000 km/s', Option_D: '500,000 km/s', Correct_Answer: 'A', Marks: 2, Subject: 'General Knowledge' },
        { Question: 'Who painted the Mona Lisa?', Option_A: 'Picasso', Option_B: 'Da Vinci', Option_C: 'Van Gogh', Option_D: 'Rembrandt', Correct_Answer: 'B', Marks: 1, Subject: 'General Knowledge' },
        { Question: 'What is the boiling point of water in Celsius?', Option_A: '50°C', Option_B: '80°C', Option_C: '100°C', Option_D: '120°C', Correct_Answer: 'C', Marks: 1, Subject: 'General Knowledge' },
        { Question: 'How many sides does a hexagon have?', Option_A: '5', Option_B: '6', Option_C: '7', Option_D: '8', Correct_Answer: 'B', Marks: 1, Subject: 'General Knowledge' },
        { Question: 'What is the largest mammal on Earth?', Option_A: 'Elephant', Option_B: 'Blue Whale', Option_C: 'Giraffe', Option_D: 'Hippopotamus', Correct_Answer: 'B', Marks: 1, Subject: 'General Knowledge' },
        { Question: 'Which continent is the Sahara Desert located in?', Option_A: 'Asia', Option_B: 'South America', Option_C: 'Africa', Option_D: 'Australia', Correct_Answer: 'C', Marks: 1, Subject: 'General Knowledge' }
    ];

    const scratchDir = path.join(__dirname, 'scratch_files');
    if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
    }

    const xlsxPath = path.join(scratchDir, 'bulk_test_questions.xlsx');
    const worksheet = XLSX.utils.json_to_sheet(sampleQuestions);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Questions');
    XLSX.writeFile(workbook, xlsxPath);
    console.log(`📁 Generated sample Excel file at: ${xlsxPath}`);

    // Step 2: Upload Excel file to /api/questions/upload
    console.log('\n--- Test 1: Uploading XLSX file to /api/questions/upload ---');
    const xlsxBuffer = fs.readFileSync(xlsxPath);

    // Build multipart/form-data boundary
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    let bodyBuffer = Buffer.concat([
        Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="file"; filename="bulk_test_questions.xlsx"\r\n` +
            `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
        ),
        xlsxBuffer,
        Buffer.from(`\r\n--${boundary}\r\n` +
            `Content-Disposition: form-data; name="subject"\r\n\r\nGeneral Knowledge\r\n` +
            `--${boundary}--\r\n`
        )
    ]);

    const uploadRes = await fetch(`${BASE_URL}/api/questions/upload`, {
        method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body: bodyBuffer
    });

    const uploadData = await uploadRes.json();
    console.log('Upload Response:', uploadData);

    if (uploadRes.status === 201 && uploadData.success && uploadData.importedCount === 10) {
        console.log('✅ Bulk Question Upload Test PASSED!');
    } else {
        console.error('❌ Bulk Question Upload Test FAILED!');
        process.exit(1);
    }

    // Step 3: Test CSV upload as well
    console.log('\n--- Test 2: Uploading CSV file to /api/questions/upload ---');
    const csvContent = `question,option_a,option_b,option_c,option_d,correct_answer,marks,subject
"What is the capital of Nigeria?","Lagos","Abuja","Kano","Ibadan","B",2,"General Knowledge"
"What year did Nigeria gain independence?","1957","1960","1963","1970","B",2,"General Knowledge"`;

    const csvBoundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    let csvBodyBuffer = Buffer.concat([
        Buffer.from(
            `--${csvBoundary}\r\n` +
            `Content-Disposition: form-data; name="file"; filename="test.csv"\r\n` +
            `Content-Type: text/csv\r\n\r\n`
        ),
        Buffer.from(csvContent),
        Buffer.from(`\r\n--${csvBoundary}--\r\n`)
    ]);

    const csvRes = await fetch(`${BASE_URL}/api/questions/upload`, {
        method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${csvBoundary}`
        },
        body: csvBodyBuffer
    });

    const csvData = await csvRes.json();
    console.log('CSV Upload Response:', csvData);

    if (csvRes.status === 201 && csvData.success && csvData.importedCount === 2) {
        console.log('✅ CSV Question Upload Test PASSED!');
    } else {
        console.error('❌ CSV Question Upload Test FAILED!');
        process.exit(1);
    }

    // Step 4: Test Dynamic Shuffling & Session Persistence
    console.log('\n--- Test 3: Dynamic Question Shuffling & Session Persistence ---');
    
    // Start session for Student 1 (Student ID: 1)
    const session1Res = await fetch(`${BASE_URL}/api/exam/start-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: 1, subject: 'General Knowledge', workstation_ip: '192.168.1.101' })
    });
    const session1Data = await session1Res.json();
    console.log('Student 1 Session Start:', session1Data);

    // Fetch questions for Student 1
    const s1QuestionsRes = await fetch(`${BASE_URL}/api/exam/questions/General%20Knowledge?student_id=1&session_id=${session1Data.session_id}`);
    const s1QuestionsData = await s1QuestionsRes.json();
    const s1Ids = s1QuestionsData.questions.map(q => q.id);
    console.log(`Student 1 Question ID Sequence (Count ${s1Ids.length}):`, s1Ids);

    // Start session for Student 2 (Student ID: 2)
    const session2Res = await fetch(`${BASE_URL}/api/exam/start-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: 2, subject: 'General Knowledge', workstation_ip: '192.168.1.102' })
    });
    const session2Data = await session2Res.json();
    console.log('Student 2 Session Start:', session2Data);

    // Fetch questions for Student 2
    const s2QuestionsRes = await fetch(`${BASE_URL}/api/exam/questions/General%20Knowledge?student_id=2&session_id=${session2Data.session_id}`);
    const s2QuestionsData = await s2QuestionsRes.json();
    const s2Ids = s2QuestionsData.questions.map(q => q.id);
    console.log(`Student 2 Question ID Sequence (Count ${s2Ids.length}):`, s2Ids);

    // Verify Student 1 & Student 2 have different question orders
    const isDifferentOrder = JSON.stringify(s1Ids) !== JSON.stringify(s2Ids);
    console.log(`Are Student 1 and Student 2 question sequences distinct? ${isDifferentOrder ? 'YES ✅' : 'NO ❌'}`);

    // Simulate Page Refresh for Student 1
    console.log('\n--- Test 4: Page Refresh Session Sequence Persistence ---');
    const refreshRes = await fetch(`${BASE_URL}/api/exam/questions/General%20Knowledge?student_id=1&session_id=${session1Data.session_id}`);
    const refreshData = await refreshRes.json();
    const refreshedIds = refreshData.questions.map(q => q.id);
    console.log('Student 1 Question ID Sequence after Page Refresh:', refreshedIds);

    const isIdenticalOnRefresh = JSON.stringify(s1Ids) === JSON.stringify(refreshedIds);
    console.log(`Is Student 1 question sequence identical on page refresh? ${isIdenticalOnRefresh ? 'YES ✅' : 'NO ❌'}`);

    if (isDifferentOrder && isIdenticalOnRefresh) {
        console.log('\n🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
    } else {
        console.error('\n❌ Dynamic Shuffling or Persistence Test FAILED!');
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Fatal Test Error:', err);
    process.exit(1);
});
