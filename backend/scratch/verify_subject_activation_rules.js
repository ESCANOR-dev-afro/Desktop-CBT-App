/**
 * verify_subject_activation_rules.js
 * 
 * Verifies Subject Exam Activation/Deactivation logic and Student Dashboard visibility:
 * 1. Purged SS 1 Science subjects (strictly 9 subjects: Ag Sci & Geography removed).
 * 2. Default state is INACTIVE unless admin toggles is_active = 1 AND questions > 0.
 * 3. Admin toggle endpoint POST /api/admin/toggle-subject-active persists is_active in SQLite.
 * 4. Candidate dashboard receives correct status: AVAILABLE only when active & questions present,
 *    NOT SCHEDULED YET when inactive.
 */

const http = require('http');
const assert = require('assert');

function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch (_) {}
                resolve({ statusCode: res.statusCode, data: parsed });
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runTest() {
    console.log('🧪 Starting Subject Activation & Dashboard Visibility Verification...\n');

    // 1. Authenticate Halima (AWA26271050, SS 1 Science)
    const loginRes = await makeRequest('POST', '/api/student/login', {
        registration_no: 'AWA26271050',
        surname: 'YAKUBU'
    });
    assert.strictEqual(loginRes.statusCode, 200, 'Student login should succeed');
    const student = loginRes.data.student;
    console.log(`[1] Halima Logged In: ${student.first_name} ${student.surname} (${student.class})`);

    // 2. Fetch assigned subjects -> Verify count is strictly 9
    const subRes = await makeRequest('GET', `/api/student/assigned-subjects?student_id=${student.id}`);
    assert.strictEqual(subRes.statusCode, 200, 'Assigned subjects should return 200 OK');
    const papers = subRes.data?.papers || [];
    console.log(`[2] SS 1 Science Assigned Subjects Count: ${papers.length} (Expected strictly 9)`);
    assert.strictEqual(papers.length, 9, 'SS 1 Science MUST have strictly 9 approved subjects');

    const subjectNames = papers.map(p => p.name || p.subject);
    console.log('    Current SS 1 Science Subjects:', subjectNames.join(', '));
    assert(!subjectNames.includes('Agricultural Science'), 'Agricultural Science MUST be purged from SS 1 Science');
    assert(!subjectNames.includes('Geography'), 'Geography MUST be purged from SS 1 Science');

    // 3. Verify Admin Toggle Endpoint POST /api/admin/toggle-subject-active
    console.log('\n[3] Testing Admin Toggle Endpoint POST /api/admin/toggle-subject-active...');
    const toggleBioActive = await makeRequest('POST', '/api/admin/toggle-subject-active', {
        class: 'SS 1 Science',
        subject: 'Biology',
        is_active: 1
    });
    console.log(`    Admin Toggle Biology ACTIVE -> Status: ${toggleBioActive.statusCode}, Msg: "${toggleBioActive.data?.message}"`);
    assert.strictEqual(toggleBioActive.statusCode, 200, 'Admin toggle should return 200 OK');

    const togglePhysicsInactive = await makeRequest('POST', '/api/admin/toggle-subject-active', {
        class: 'SS 1 Science',
        subject: 'Physics',
        is_active: 0
    });
    console.log(`    Admin Toggle Physics INACTIVE -> Status: ${togglePhysicsInactive.statusCode}, Msg: "${togglePhysicsInactive.data?.message}"`);
    assert.strictEqual(togglePhysicsInactive.statusCode, 200, 'Admin toggle should return 200 OK');

    // 4. Verify Student Dashboard visibility rules
    const subResAfterToggle = await makeRequest('GET', `/api/student/assigned-subjects?student_id=${student.id}`);
    const updatedPapers = subResAfterToggle.data?.papers || [];

    const bioPaper = updatedPapers.find(p => (p.name || p.subject) === 'Biology');
    const physPaper = updatedPapers.find(p => (p.name || p.subject) === 'Physics');
    const mathPaper = updatedPapers.find(p => (p.name || p.subject) === 'Mathematics');

    console.log('\n[4] Student Dashboard Visibility Evaluation:');
    console.log(`    - Biology: status = [${bioPaper?.status}], is_active = ${bioPaper?.is_active}`);
    console.log(`    - Physics: status = [${physPaper?.status}], is_active = ${physPaper?.is_active}`);
    console.log(`    - Mathematics: status = [${mathPaper?.status}], is_active = ${mathPaper?.is_active}`);

    assert.strictEqual(bioPaper?.status, 'available', 'Biology MUST be AVAILABLE when activated and questions exist');
    assert.strictEqual(physPaper?.status, 'unavailable', 'Physics MUST be UNAVAILABLE (NOT SCHEDULED YET) when is_active = 0');
    assert.strictEqual(mathPaper?.status, 'completed', 'Mathematics MUST show COMPLETED since candidate submitted it today');

    console.log('\n🎉 ALL SUBJECT ACTIVATION & DASHBOARD VISIBILITY TESTS PASSED PERFECTLY!');
}

runTest().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
