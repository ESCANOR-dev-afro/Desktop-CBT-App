/**
 * backupService.js
 * 
 * Local-SSD Primary Storage Enforcement & USB / External Storage Automated Backup Service.
 * Detects mounted external drives (or BACKUP_STORAGE_DIR env variable), generates clean
 * timestamped SQLite snapshots via VACUUM INTO, and mirrors diagram media assets.
 */

const fs = require('fs');
const path = require('path');
const db = require('../database');
const { logAuditAction } = require('./auditLogger');

// Primary Local Storage Paths (Server SSD)
const PRIMARY_DB_PATH = path.join(__dirname, '../cbt_database.db');
const PRIMARY_DIAGRAMS_DIR = path.join(__dirname, '../uploads/diagrams');

/**
 * Detects external drive letters on Windows or checks BACKUP_STORAGE_DIR env variable.
 * 
 * @returns {Object} - { path: string, isExternal: boolean }
 */
function detectBackupDestination() {
    if (process.env.BACKUP_STORAGE_DIR && String(process.env.BACKUP_STORAGE_DIR).trim()) {
        const customPath = path.resolve(String(process.env.BACKUP_STORAGE_DIR).trim());
        const rootDrive = path.parse(customPath).root;
        
        // If an explicit drive letter like D:\ or E:\ is specified, verify root drive accessibility
        if (rootDrive && !fs.existsSync(rootDrive)) {
            throw new Error("External USB drive not found or inaccessible. Please verify USB is plugged in.");
        }
        
        if (!fs.existsSync(customPath)) {
            try {
                fs.mkdirSync(customPath, { recursive: true });
            } catch (err) {
                throw new Error("External USB drive not found or inaccessible. Please verify USB is plugged in.");
            }
        }
        return { path: customPath, isExternal: true };
    }

    // Windows External Drive Candidates (D:, E:, F:, G:, H:, I:, J:, K:)
    const driveCandidates = ['D:', 'E:', 'F:', 'G:', 'H:', 'I:', 'J:', 'K:'];
    for (const drive of driveCandidates) {
        try {
            const rootDrive = `${drive}\\`;
            if (fs.existsSync(rootDrive)) {
                const targetFolder = path.join(rootDrive, 'CBT_Backups');
                if (!fs.existsSync(targetFolder)) {
                    fs.mkdirSync(targetFolder, { recursive: true });
                }
                return { path: targetFolder, isExternal: true };
            }
        } catch (_) {
            // Drive letter not ready or optical drive
        }
    }

    // Fallback to local server backups directory if no external drive is mounted
    const localFallback = process.env.BACKUP_PATH || path.join(__dirname, '../backups');
    if (!fs.existsSync(localFallback)) {
        fs.mkdirSync(localFallback, { recursive: true });
    }
    return { path: localFallback, isExternal: false };
}

/**
 * Recursively copies directory contents.
 */
function copyDirRecursive(srcDir, destDir) {
    if (!fs.existsSync(srcDir)) return 0;
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    let fileCount = 0;
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);

        if (entry.isDirectory()) {
            fileCount += copyDirRecursive(srcPath, destPath);
        } else if (entry.isFile()) {
            fs.copyFileSync(srcPath, destPath);
            fileCount++;
        }
    }

    return fileCount;
}

/**
 * Performs full database snapshot and diagram asset mirror copy to USB / External drive.
 * 
 * @param {Object} [options]
 * @param {string} [options.ipAddress] - IP address of admin triggering backup
 * @returns {Promise<Object>} - Backup result summary
 */
async function performBackup(options = {}) {
    const ipAddress = options.ipAddress || '127.0.0.1';
    let destination;

    try {
        destination = detectBackupDestination();
    } catch (detectErr) {
        return {
            success: false,
            message: "External USB drive not found or inaccessible. Please verify USB is plugged in.",
            error: detectErr.message
        };
    }

    const backupDir = destination.path;

    if (!fs.existsSync(backupDir)) {
        try {
            fs.mkdirSync(backupDir, { recursive: true });
        } catch (mkdirErr) {
            return {
                success: false,
                message: "External USB drive not found or inaccessible. Please verify USB is plugged in.",
                error: mkdirErr.message
            };
        }
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '_');
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
    const dbFileName = `backup_cbt_${dateStr}_${timeStr}.sqlite`;
    const targetDbPath = path.join(backupDir, dbFileName);

    // 1. Snapshot SQLite Database via VACUUM INTO or atomic copy
    try {
        await new Promise((resolve, reject) => {
            db.run(`VACUUM INTO ?`, [targetDbPath], (vacuumErr) => {
                if (vacuumErr) {
                    console.warn('⚠️ SQLite VACUUM INTO failed, falling back to atomic file copy:', vacuumErr.message);
                    try {
                        fs.copyFileSync(PRIMARY_DB_PATH, targetDbPath);
                        resolve();
                    } catch (copyErr) {
                        return reject(copyErr);
                    }
                } else {
                    resolve();
                }
            });
        });
    } catch (dbErr) {
        return {
            success: false,
            message: "External USB drive not found or inaccessible. Please verify USB is plugged in.",
            error: dbErr.message
        };
    }

    // 2. Mirror Diagram Media Files into corresponding `diagrams` folder on backup path
    let copiedDiagramsCount = 0;
    try {
        const targetDiagramsDir = path.join(backupDir, 'diagrams');
        copiedDiagramsCount = copyDirRecursive(PRIMARY_DIAGRAMS_DIR, targetDiagramsDir);
    } catch (mediaErr) {
        console.warn('⚠️ Diagram media mirror notice:', mediaErr.message);
    }

    // 3. Log Audit Record
    await logAuditAction({
        action: 'EXECUTE_USB_BACKUP',
        entity_type: 'system_backup',
        entity_id: dbFileName,
        details: {
            destination_dir: backupDir,
            is_external_drive: destination.isExternal,
            db_snapshot: dbFileName,
            diagrams_copied: copiedDiagramsCount
        },
        ip_address: ipAddress
    });

    const targetPath = backupDir;

    return {
        success: true,
        message: `Backup successfully created at ${targetPath}`,
        timestamp: now.toISOString(),
        backupDirectory: targetPath,
        dbFileName: dbFileName,
        dbFilePath: targetDbPath,
        diagramsCopied: copiedDiagramsCount,
        isExternalDrive: destination.isExternal
    };
}

module.exports = {
    detectBackupDestination,
    performBackup
};
