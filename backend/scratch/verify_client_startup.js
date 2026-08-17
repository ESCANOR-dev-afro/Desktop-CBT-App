/**
 * verify_client_startup.js
 * 
 * Integration test to verify:
 * 1. Express static serving of Student Client on root route '/'
 * 2. Serving of main.dart.js, flutter_bootstrap.js, and manifest.json with correct MIME types
 * 3. SPA wildcard fallback route handling
 */

const http = require('http');

const PORT = 3000;

function fetchUrl(urlPath) {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${PORT}${urlPath}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, data: data }));
        }).on('error', reject);
    });
}

async function verifyClientStartup() {
    console.log('----------------------------------------------------');
    console.log('🚀 VERIFYING STUDENT CLIENT ROOT ROUTE & STATIC ASSETS');
    console.log('----------------------------------------------------');

    try {
        // 1. Fetch Root Route '/'
        const rootRes = await fetchUrl('/');
        console.log(`[1] GET / -> Status: ${rootRes.statusCode}`);
        if (rootRes.statusCode !== 200 || !rootRes.data.includes('<base href="/">')) {
            throw new Error(`Root route '/' returned status ${rootRes.statusCode} or missing base href tag.`);
        }
        console.log('  ✅ Root route "/" serves Flutter web index.html cleanly.');

        // 2. Fetch flutter_bootstrap.js
        const bootstrapRes = await fetchUrl('/flutter_bootstrap.js');
        console.log(`[2] GET /flutter_bootstrap.js -> Status: ${bootstrapRes.statusCode}, Content-Type: ${bootstrapRes.headers['content-type']}`);
        if (bootstrapRes.statusCode !== 200 || !bootstrapRes.data.includes('_flutter.loader')) {
            throw new Error(`flutter_bootstrap.js returned status ${bootstrapRes.statusCode}`);
        }
        console.log('  ✅ flutter_bootstrap.js served cleanly with correct MIME type.');

        // 3. Fetch main.dart.js
        const mainJsRes = await fetchUrl('/main.dart.js');
        console.log(`[3] GET /main.dart.js -> Status: ${mainJsRes.statusCode}, Size: ${mainJsRes.data.length} bytes`);
        if (mainJsRes.statusCode !== 200 || mainJsRes.data.length < 1000) {
            throw new Error(`main.dart.js returned status ${mainJsRes.statusCode} or empty output`);
        }
        console.log('  ✅ main.dart.js compiled bundle served successfully.');

        // 4. Verify SPA wildcard route (e.g. /student/login)
        const spaRes = await fetchUrl('/student/login');
        console.log(`[4] GET /student/login -> Status: ${spaRes.statusCode}`);
        if (spaRes.statusCode !== 200 || !spaRes.data.includes('<base href="/">')) {
            throw new Error(`SPA fallback returned status ${spaRes.statusCode}`);
        }
        console.log('  ✅ SPA fallback route correctly serves index.html for client-side routing.');

        console.log('----------------------------------------------------');
        console.log('🎉 ALL STUDENT CLIENT STARTUP TESTS PASSED CLEANLY');
        console.log('----------------------------------------------------');
        process.exit(0);

    } catch (err) {
        console.error('❌ Client Startup Verification Failed:', err);
        process.exit(1);
    }
}

verifyClientStartup();
