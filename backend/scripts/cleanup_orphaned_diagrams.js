/**
 * cleanup_orphaned_diagrams.js
 *
 * Maintenance & Disk Cleanup Utility for Desktop CBT App.
 * Compares all image files in backend/uploads/diagrams/ against active
 * diagram_image_url references in the SQLite questions database table.
 *
 * Purges all orphaned diagram files that are no longer referenced by any question.
 *
 * Usage:
 *   node backend/scripts/cleanup_orphaned_diagrams.js
 *
 * 100% Offline — Node.js native (fs, path, sqlite3).
 */

const fs = require('fs');
const path = require('path');
const db = require('../database');

const DIAGRAMS_DIR = path.resolve(__dirname, '../uploads/diagrams');

async function runCleanup() {
    console.log('======================================================================');
    console.log('🧹 RUNNING MAINTENANCE: ORPHANED DIAGRAM DISK PURGE');
    console.log('======================================================================\n');
    console.log(`📁 Diagrams Directory: ${DIAGRAMS_DIR}`);

    if (!fs.existsSync(DIAGRAMS_DIR)) {
        console.log('⚠️ Diagrams directory does not exist. Nothing to clean.');
        process.exit(0);
    }

    try {
        // 1. Fetch all active diagram_image_url references from SQLite questions table
        const rows = await new Promise((resolve, reject) => {
            db.all(
                `SELECT diagram_image_url FROM questions WHERE diagram_image_url IS NOT NULL AND TRIM(diagram_image_url) != ''`,
                [],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results || []);
                }
            );
        });

        const referencedBasenames = new Set(
            rows
                .map(r => r.diagram_image_url)
                .filter(Boolean)
                .map(url => path.basename(String(url).split('?')[0]).trim())
                .filter(Boolean)
        );

        console.log(`📊 Active Question Diagram References in Database: ${referencedBasenames.size}`);

        // 2. Read all files currently residing on disk in uploads/diagrams
        const diskFiles = fs.readdirSync(DIAGRAMS_DIR);
        console.log(`💾 Total Files on Disk in uploads/diagrams: ${diskFiles.length}\n`);

        let deletedCount = 0;
        let preservedCount = 0;

        for (const file of diskFiles) {
            const filePath = path.join(DIAGRAMS_DIR, file);

            // Skip directories if any
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) continue;

            // Check if file is referenced in SQLite
            if (referencedBasenames.has(file)) {
                preservedCount++;
                console.log(`  🔒 [PRESERVED] ${file} (Active in DB)`);
            } else {
                try {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                    console.log(`  🗑️  [PURGED]   ${file} (Orphaned file removed)`);
                } catch (unlinkErr) {
                    console.error(`  ❌ [ERROR]    Failed to delete ${file}: ${unlinkErr.message}`);
                }
            }
        }

        console.log('\n----------------------------------------------------------------------');
        console.log(`SUMMARY: ${deletedCount} Orphaned File(s) Purged | ${preservedCount} Active File(s) Preserved`);
        console.log('======================================================================\n');

        process.exit(0);
    } catch (err) {
        console.error('❌ [Fatal Cleanup Error]:', err);
        process.exit(1);
    }
}

runCleanup();
