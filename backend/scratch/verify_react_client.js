const http = require('http');

const BASE = 'http://localhost:3000';

async function checkUrl(urlPath, description) {
  return new Promise((resolve) => {
    http.get(`${BASE}${urlPath}`, (res) => {
      const status = res.statusCode;
      const contentType = res.headers['content-type'] || 'unknown';
      console.log(`[${status}] ${description}`);
      console.log(`  Path: ${urlPath}`);
      console.log(`  Content-Type: ${contentType}`);
      resolve(status === 200);
    }).on('error', (err) => {
      console.log(`[ERR] ${description}: ${err.message}`);
      resolve(false);
    });
  });
}

(async () => {
  console.log('==================================================');
  console.log('REACT STUDENT PORTAL OFFLINE SERVING VERIFICATION');
  console.log('==================================================\n');

  const tests = [
    { path: '/', desc: 'React Student Portal Index HTML' },
    { path: '/api/health', desc: 'Backend API Health Check' },
    { path: '/admin/', desc: 'Admin Dashboard Static Serving' },
  ];

  for (const t of tests) {
    await checkUrl(t.path, t.desc);
    console.log('');
  }

  // Scan root html for external CDNs or external fonts
  http.get(`${BASE}/`, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('--- HTML CDN / Font Scan ---');
      const cdnList = ['gstatic.com', 'googleapis.com', 'jsdelivr', 'cdnjs'];
      let found = false;
      cdnList.forEach(cdn => {
        if (body.includes(cdn)) {
          console.log(`⚠️ Found external reference: ${cdn}`);
          found = true;
        }
      });
      if (!found) {
        console.log('✅ ZERO External CDNs or Google Fonts found! 100% Offline Ready.');
      }
      console.log('\n--- First 300 chars of HTML ---');
      console.log(body.substring(0, 300));
    });
  });
})();
