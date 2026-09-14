/**
 * Comprehensive Stress Audit Benchmark
 * Simulates 92 concurrent workstation write/read cycles against SQLite WAL
 * Tests: autosave bursts, heartbeat storms, submission races, and read throughput
 * NON-DESTRUCTIVE: Uses a temporary test table, cleaned up on exit
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const db = require('../database');
const DB_PATH = db.DB_PATH || path.resolve(__dirname, '..', 'cbt_database.db');

const NODE_COUNT = 92;
const ITERATIONS = 3;

function dbRunAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function dbGetAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbAllAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function verifyPragmas() {
    console.log('\n=====================================================================');
    console.log('  PHASE 1: SQLite PRAGMA & Configuration Verification');
    console.log('=====================================================================');
    
    const pragmas = ['journal_mode', 'busy_timeout', 'synchronous', 'cache_size', 'temp_store', 'foreign_keys', 'wal_autocheckpoint'];
    for (const p of pragmas) {
        const row = await dbGetAsync(`PRAGMA ${p}`);
        const val = row ? Object.values(row)[0] : 'N/A';
        console.log(`  PRAGMA ${p.padEnd(22)} = ${val}`);
    }
    
    const stats = fs.statSync(DB_PATH);
    console.log(`  DB File Size               = ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    try {
        const walPath = DB_PATH + '-wal';
        if (fs.existsSync(walPath)) {
            const walStats = fs.statSync(walPath);
            console.log(`  WAL File Size              = ${(walStats.size / 1024 / 1024).toFixed(2)} MB`);
        }
    } catch (_) {}
    
    const tables = ['students', 'questions', 'answers', 'exam_sessions', 'student_exam_sessions', 'audit_logs', 'assessment_configs'];
    console.log('\n  Table Row Counts:');
    for (const t of tables) {
        try {
            const row = await dbGetAsync(`SELECT COUNT(*) as cnt FROM ${t}`);
            console.log(`    ${t.padEnd(26)} = ${row.cnt} rows`);
        } catch (_) {
            console.log(`    ${t.padEnd(26)} = (table not found)`);
        }
    }
}

async function benchConcurrentWrites() {
    console.log('\n=====================================================================');
    console.log('  PHASE 2: 92-Node Concurrent Write Burst Simulation');
    console.log('=====================================================================');
    
    await dbRunAsync(`CREATE TABLE IF NOT EXISTS _stress_test_temp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT NOT NULL,
        iteration INTEGER,
        payload TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    for (let iter = 1; iter <= ITERATIONS; iter++) {
        const startTime = Date.now();
        let successes = 0;
        let failures = 0;
        const errors = [];
        
        const promises = [];
        for (let n = 101; n <= 101 + NODE_COUNT - 1; n++) {
            const nodeId = `NODE-${n}`;
            const p = dbRunAsync(
                `INSERT INTO _stress_test_temp (node_id, iteration, payload) VALUES (?, ?, ?)`,
                [nodeId, iter, JSON.stringify({ heartbeat: Date.now(), question: Math.floor(Math.random() * 50) + 1, answer: ['A','B','C','D'][Math.floor(Math.random() * 4)] })]
            ).then(() => { successes++; })
             .catch(err => { failures++; errors.push(`${nodeId}: ${err.message}`); });
            promises.push(p);
        }
        
        await Promise.all(promises);
        const elapsed = Date.now() - startTime;
        const throughput = ((successes / (elapsed / 1000))).toFixed(0);
        
        console.log(`  Iteration ${iter}: ${successes}/${NODE_COUNT} writes in ${elapsed}ms (${throughput} writes/sec) | Failures: ${failures}`);
        if (errors.length > 0) {
            errors.slice(0, 3).forEach(e => console.log(`    WARNING: ${e}`));
        }
    }
}

async function benchConcurrentReads() {
    console.log('\n=====================================================================');
    console.log('  PHASE 3: 92-Node Concurrent Read Storm');
    console.log('=====================================================================');
    
    const startTime = Date.now();
    let successes = 0;
    let totalRows = 0;
    
    const promises = [];
    for (let n = 101; n <= 101 + NODE_COUNT - 1; n++) {
        const p = dbAllAsync(
            `SELECT id, question_text, option_a, option_b, option_c, option_d FROM questions LIMIT 30`
        ).then(rows => {
            successes++;
            totalRows += (rows ? rows.length : 0);
        }).catch(() => {});
        promises.push(p);
    }
    
    await Promise.all(promises);
    const elapsed = Date.now() - startTime;
    console.log(`  92 concurrent reads: ${successes}/${NODE_COUNT} succeeded in ${elapsed}ms`);
    console.log(`  Total rows fetched: ${totalRows} | Avg per node: ${(totalRows / NODE_COUNT).toFixed(1)}`);
}

async function benchMixedReadWrite() {
    console.log('\n=====================================================================');
    console.log('  PHASE 4: Mixed Read/Write (Autosave + Question Fetch)');
    console.log('=====================================================================');
    
    const startTime = Date.now();
    let readOk = 0, writeOk = 0, readFail = 0, writeFail = 0;
    
    const promises = [];
    for (let n = 101; n <= 101 + NODE_COUNT - 1; n++) {
        if (n % 2 === 0) {
            const p = dbAllAsync(`SELECT id, question_text, option_a, option_b, option_c, option_d, diagram_image_url FROM questions LIMIT 30`)
                .then(() => readOk++).catch(() => readFail++);
            promises.push(p);
        } else {
            const p = dbRunAsync(
                `INSERT INTO _stress_test_temp (node_id, iteration, payload) VALUES (?, ?, ?)`,
                [`NODE-${n}`, 99, JSON.stringify({ autosave: true, ts: Date.now() })]
            ).then(() => writeOk++).catch(() => writeFail++);
            promises.push(p);
        }
    }
    
    await Promise.all(promises);
    const elapsed = Date.now() - startTime;
    console.log(`  Reads:  ${readOk}/${Math.floor(NODE_COUNT/2)} OK | Failures: ${readFail}`);
    console.log(`  Writes: ${writeOk}/${Math.ceil(NODE_COUNT/2)} OK | Failures: ${writeFail}`);
    console.log(`  Total: ${elapsed}ms`);
}

async function benchSubmissionRace() {
    console.log('\n=====================================================================');
    console.log('  PHASE 5: Simultaneous Submission Race (20 Nodes)');
    console.log('=====================================================================');
    
    const RACE = 20;
    const startTime = Date.now();
    let ok = 0, fail = 0;
    const errs = [];
    
    const promises = [];
    for (let n = 101; n <= 101 + RACE - 1; n++) {
        const p = dbRunAsync(
            `INSERT INTO _stress_test_temp (node_id, iteration, payload) VALUES (?, ?, ?)`,
            [`NODE-${n}`, 100, JSON.stringify({ type: 'submission', score: Math.floor(Math.random() * 50), submitted_at: new Date().toISOString() })]
        ).then(() => ok++).catch(err => { fail++; errs.push(err.message); });
        promises.push(p);
    }
    
    await Promise.all(promises);
    const elapsed = Date.now() - startTime;
    console.log(`  ${ok}/${RACE} submissions committed in ${elapsed}ms | Failures: ${fail}`);
    if (errs.length > 0) {
        console.log(`  RACE CONDITION ERRORS:`);
        [...new Set(errs)].forEach(e => console.log(`    - ${e}`));
    } else {
        console.log(`  PASS: Zero race condition failures.`);
    }
}

async function benchEventLoop() {
    console.log('\n=====================================================================');
    console.log('  PHASE 6: Event Loop Latency Under DB Load');
    console.log('=====================================================================');
    
    const latencies = [];
    const probeCount = 20;
    
    const queryPromise = (async () => {
        for (let i = 0; i < 5; i++) {
            await dbAllAsync(`SELECT * FROM questions ORDER BY RANDOM() LIMIT 100`);
        }
    })();
    
    for (let i = 0; i < probeCount; i++) {
        const before = process.hrtime.bigint();
        await new Promise(resolve => setImmediate(resolve));
        const after = process.hrtime.bigint();
        latencies.push(Number(after - before) / 1e6);
    }
    
    await queryPromise;
    
    const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(3);
    const max = Math.max(...latencies).toFixed(3);
    const min = Math.min(...latencies).toFixed(3);
    const sorted = latencies.sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)].toFixed(3);
    
    console.log(`  Probes: ${probeCount} | Avg: ${avg}ms | Min: ${min}ms | Max: ${max}ms | P95: ${p95}ms`);
    if (parseFloat(max) > 100) {
        console.log(`  WARNING: Max event loop latency >100ms`);
    } else {
        console.log(`  PASS: Event loop responsive under load.`);
    }
}

async function cleanup() {
    console.log('\n=====================================================================');
    console.log('  CLEANUP');
    console.log('=====================================================================');
    try {
        const count = await dbGetAsync(`SELECT COUNT(*) as cnt FROM _stress_test_temp`);
        await dbRunAsync(`DROP TABLE IF EXISTS _stress_test_temp`);
        console.log(`  Dropped _stress_test_temp (${count.cnt} rows). Zero production data affected.`);
    } catch (err) {
        console.log(`  Cleanup: ${err.message}`);
    }
}

async function main() {
    console.log('================================================================');
    console.log('  DESKTOP CBT PLATFORM — ARCHITECTURAL STRESS AUDIT');
    console.log('  92-Node Concurrency Benchmark & System Integrity Check');
    console.log('================================================================');
    console.log(`  Timestamp: ${new Date().toISOString()}`);
    console.log(`  Target DB: ${DB_PATH}`);
    
    try {
        await verifyPragmas();
        await benchConcurrentWrites();
        await benchConcurrentReads();
        await benchMixedReadWrite();
        await benchSubmissionRace();
        await benchEventLoop();
    } catch (err) {
        console.error(`\n  CRITICAL FAILURE: ${err.message}`);
    } finally {
        await cleanup();
        db.close(() => {
            console.log('\n  Database connection closed. Benchmark complete.');
        });
    }
}

main();
