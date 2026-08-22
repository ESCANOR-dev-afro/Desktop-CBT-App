const express = require('express');
const http = require('http');
const app = require('../server');

let server;

async function testRoutes() {
    return new Promise((resolve, reject) => {
        server = app.listen(0, '127.0.0.1', async () => {
            const port = server.address().port;
            console.log(`Test server running on port ${port}`);

            const fetchUrl = (path) => new Promise((res, rej) => {
                http.get(`http://127.0.0.1:${port}${path}`, (response) => {
                    let data = '';
                    response.on('data', chunk => data += chunk);
                    response.on('end', () => res({ status: response.statusCode, headers: response.headers, body: data }));
                }).on('error', rej);
            });

            try {
                // Test 1: Health endpoint
                const health = await fetchUrl('/api/health');
                console.log('Test 1 (Health API):', health.status === 200 && health.body.includes('smoothly') ? 'PASSED' : 'FAILED', health.status);

                // Test 2a: GET /admin (returns 301 redirect to /admin/)
                const adminRedirect = await fetchUrl('/admin');
                console.log('Test 2a (GET /admin redirect):', adminRedirect.status === 301 || adminRedirect.status === 200 ? 'PASSED' : 'FAILED', adminRedirect.status);

                // Test 2b: GET /admin/
                const adminSlash = await fetchUrl('/admin/');
                console.log('Test 2b (GET /admin/):', adminSlash.status === 200 ? 'PASSED' : 'FAILED', adminSlash.status);

                // Test 3: Admin deep route
                const adminDeep = await fetchUrl('/admin/dashboard');
                console.log('Test 3 (GET /admin/dashboard):', adminDeep.status === 200 ? 'PASSED' : 'FAILED', adminDeep.status);

                // Test 4: Missing Admin Asset
                const missingAsset = await fetchUrl('/admin/assets/nonexistent_file_12345.js');
                console.log('Test 4 (Missing admin asset):', missingAsset.status === 404 ? 'PASSED' : 'FAILED', missingAsset.status);

                // Test 5: Missing API route
                const missingApi = await fetchUrl('/api/nonexistent_route');
                console.log('Test 5 (Missing API route):', missingApi.status === 404 ? 'PASSED' : 'FAILED', missingApi.status);

                // Test 6: Root Student client
                const studentRoot = await fetchUrl('/');
                console.log('Test 6 (GET /):', studentRoot.status === 200 ? 'PASSED' : 'FAILED', studentRoot.status);

                server.close(() => resolve());
            } catch (err) {
                if (server) server.close();
                reject(err);
            }
        });
    });
}

testRoutes().then(() => {
    console.log('All route tests complete.');
    process.exit(0);
}).catch((err) => {
    console.error('Test error:', err);
    process.exit(1);
});
