const { performBackup, detectBackupDestination } = require('../services/backupService');
const fs = require('fs');
const path = require('path');

async function testBackupService() {
    console.log('=== 🔍 TESTING BACKUP SERVICE & DRIVE DETECTION ===\n');

    const dest = detectBackupDestination();
    console.log(`📌 Detected Destination Path: ${dest.path}`);
    console.log(`📌 Is External Drive: ${dest.isExternal}`);

    console.log('\n🚀 Executing Backup Snapshot...');
    const result = await performBackup({ ipAddress: '127.0.0.1' });

    console.log('\n✅ Backup Execution Result:');
    console.log(JSON.stringify(result, null, 2));

    if (result.success && fs.existsSync(result.dbFilePath)) {
        const stats = fs.statSync(result.dbFilePath);
        console.log(`\n🎉 Verified Snapshot File Exists: ${result.dbFilePath} (${stats.size} bytes)`);
    } else {
        console.error('\n❌ Backup snapshot file verification failed.');
        process.exit(1);
    }

    process.exit(0);
}

testBackupService();
