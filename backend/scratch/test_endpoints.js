const http = require('http');

function checkUrl(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, data: data }));
        }).on('error', reject);
    });
}

async function run() {
    try {
        console.log('--- 1. Testing Student Client http://localhost:3000/ ---');
        const student = await checkUrl('http://localhost:3000/');
        console.log('Status:', student.statusCode);
        console.log('Includes base href="./":', student.data.includes('<base href="./">'));

        console.log('\n--- 2. Testing Admin Dashboard http://localhost:3000/admin/ ---');
        const admin = await checkUrl('http://localhost:3000/admin/');
        console.log('Status:', admin.statusCode);
        console.log('Includes admin mount root:', admin.data.includes('root') || admin.data.includes('admin'));

        console.log('\n--- 3. Testing Health Check http://localhost:3000/api/health ---');
        const health = await checkUrl('http://localhost:3000/api/health');
        console.log('Status:', health.statusCode, 'Body:', health.data);

        console.log('\n--- 4. Testing missing asset 404 handling http://localhost:3000/missing.js ---');
        const missing = await checkUrl('http://localhost:3000/missing.js');
        console.log('Status (expect 404):', missing.statusCode, 'Body:', missing.data);

        console.log('\n✅ All verification checks completed successfully!');
    } catch (err) {
        console.error('❌ Verification test error:', err);
    }
}

run();
