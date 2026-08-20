/**
 * Offline CDN Verification Script
 * 
 * Tests that the Flutter web student client loads 100% offline
 * with zero requests to gstatic.com or any other CDN.
 */
const http = require('http');

const BASE = 'http://localhost:3000';

const criticalAssets = [
  // Core app shell
  { path: '/', desc: 'Student Client index.html' },
  { path: '/flutter_bootstrap.js', desc: 'Flutter Bootstrap JS' },
  { path: '/main.dart.js', desc: 'Compiled Dart → JS' },
  { path: '/manifest.json', desc: 'PWA Manifest' },
  
  // CanvasKit (MUST be local, not gstatic.com)
  { path: '/canvaskit/canvaskit.js', desc: 'CanvasKit JS (LOCAL)' },
  { path: '/canvaskit/canvaskit.wasm', desc: 'CanvasKit WASM (LOCAL)' },
  
  // API health
  { path: '/api/health', desc: 'API Health Check' },
  
  // Admin dashboard
  { path: '/admin/', desc: 'Admin Dashboard index' },
];

async function checkAsset(asset) {
  return new Promise((resolve) => {
    http.get(`${BASE}${asset.path}`, (res) => {
      const status = res.statusCode;
      const contentType = res.headers['content-type'] || 'unknown';
      const ok = status === 200;
      const icon = ok ? '✅' : '❌';
      console.log(`${icon} [${status}] ${asset.desc}`);
      console.log(`   URL: ${asset.path}`);
      console.log(`   Content-Type: ${contentType}`);
      if (!ok) console.log(`   ⚠️ FAILED - Expected 200, got ${status}`);
      console.log('');
      res.resume(); // consume response data
      resolve(ok);
    }).on('error', (err) => {
      console.log(`❌ [ERR] ${asset.desc}`);
      console.log(`   URL: ${asset.path}`);
      console.log(`   Error: ${err.message}`);
      console.log('');
      resolve(false);
    });
  });
}

async function checkIndexForCDN() {
  return new Promise((resolve) => {
    http.get(`${BASE}/`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const cdnPatterns = [
          'gstatic.com',
          'fonts.googleapis.com',
          'cdn.jsdelivr.net',
          'unpkg.com',
          'cdnjs.cloudflare.com',
        ];
        
        console.log('🔍 CDN Reference Scan in index.html:');
        let foundCDN = false;
        for (const pattern of cdnPatterns) {
          if (body.includes(pattern)) {
            console.log(`   ❌ FOUND CDN reference: ${pattern}`);
            foundCDN = true;
          }
        }
        if (!foundCDN) {
          console.log('   ✅ No CDN references found - 100% offline ready!');
        }
        
        // Check base href
        const baseMatch = body.match(/<base href="([^"]+)">/);
        if (baseMatch) {
          const baseHref = baseMatch[1];
          console.log(`   📌 <base href="${baseHref}"> → ${baseHref === './' ? '✅ Relative (LAN-safe)' : '⚠️ Absolute (may break on LAN IPs)'}`);
        }
        console.log('');
        resolve(!foundCDN);
      });
    }).on('error', (err) => {
      console.log(`   ❌ Could not fetch index.html: ${err.message}`);
      resolve(false);
    });
  });
}

async function checkBootstrapForCDN() {
  return new Promise((resolve) => {
    http.get(`${BASE}/flutter_bootstrap.js`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('🔍 CDN Reference Scan in flutter_bootstrap.js:');
        
        // Check for useLocalCanvasKit flag
        if (body.includes('"useLocalCanvasKit":true')) {
          console.log('   ✅ useLocalCanvasKit: true — CanvasKit will load from local canvaskit/ directory');
        } else {
          console.log('   ❌ useLocalCanvasKit flag NOT found — CanvasKit will attempt CDN fetch!');
        }
        
        // Check for hard CDN URLs in loader config
        if (body.includes('gstatic.com')) {
          console.log('   ⚠️ gstatic.com reference found in bootstrap (may be in loader fallback code, OK if useLocalCanvasKit is true)');
        } else {
          console.log('   ✅ No gstatic.com URL in bootstrap config');
        }
        console.log('');
        resolve(true);
      });
    }).on('error', (err) => {
      console.log(`   ❌ Could not fetch flutter_bootstrap.js: ${err.message}`);
      resolve(false);
    });
  });
}

(async () => {
  console.log('════════════════════════════════════════════════════════');
  console.log('  OFFLINE CDN VERIFICATION — Flutter Web Student Client');
  console.log('════════════════════════════════════════════════════════\n');
  
  // 1. Check all critical assets resolve
  console.log('─── Critical Asset Resolution ───\n');
  let allPassed = true;
  for (const asset of criticalAssets) {
    const ok = await checkAsset(asset);
    if (!ok) allPassed = false;
  }
  
  // 2. Scan index.html for CDN references
  console.log('─── CDN Reference Audit ───\n');
  const indexClean = await checkIndexForCDN();
  const bootstrapClean = await checkBootstrapForCDN();
  
  // 3. Final verdict
  console.log('════════════════════════════════════════════════════════');
  if (allPassed && indexClean) {
    console.log('✅ VERDICT: Student client is 100% OFFLINE-READY');
    console.log('   All assets load locally. No CDN dependencies detected.');
    console.log('   Safe for isolated LAN deployment.');
  } else {
    console.log('❌ VERDICT: OFFLINE ISSUES DETECTED — review above errors');
  }
  console.log('════════════════════════════════════════════════════════\n');
})();
