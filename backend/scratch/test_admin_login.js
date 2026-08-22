const http = require('http');
const app = require('../server');

let server;

async function testAdminLogin() {
    return new Promise((resolve, reject) => {
        server = app.listen(0, '127.0.0.1', async () => {
            const port = server.address().port;
            console.log(`Test server running on port ${port}`);

            const postLogin = (path, passcode) => new Promise((res, rej) => {
                const data = JSON.stringify({ passcode });
                const req = http.request({
                    hostname: '127.0.0.1',
                    port: port,
                    path: path,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(data)
                    }
                }, (response) => {
                    let body = '';
                    response.on('data', chunk => body += chunk);
                    response.on('end', () => res({ status: response.statusCode, body: JSON.parse(body) }));
                });
                req.on('error', rej);
                req.write(data);
                req.end();
            });

            try {
                // Test 1: Root route /api/admin/login
                const res1 = await postLogin('/api/admin/login', 'AWAADMIN');
                console.log('Test 1 (POST /api/admin/login):', res1.status === 200 && res1.body.success === true ? 'PASSED' : 'FAILED', res1.status, res1.body);

                // Test 2: Nested route /admin/api/admin/login
                const res2 = await postLogin('/admin/api/admin/login', 'AWAADMIN');
                console.log('Test 2 (POST /admin/api/admin/login):', res2.status === 200 && res2.body.success === true ? 'PASSED' : 'FAILED', res2.status, res2.body);

                // Test 3: Invalid passcode
                const res3 = await postLogin('/api/admin/login', 'wrongcode');
                console.log('Test 3 (Invalid passcode):', res3.status === 401 && res3.body.success === false ? 'PASSED' : 'FAILED', res3.status, res3.body);

                server.close(() => resolve());
            } catch (err) {
                if (server) server.close();
                reject(err);
            }
        });
    });
}

testAdminLogin().then(() => {
    console.log('All admin login tests complete.');
    process.exit(0);
}).catch((err) => {
    console.error('Test error:', err);
    process.exit(1);
});
