const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'admin-dashboard', 'dist');
const destDir = path.join(__dirname, 'public', 'admin');

console.log('Syncing from:', srcDir);
console.log('Syncing to:  ', destDir);

if (!fs.existsSync(srcDir)) {
  console.error('Error: Source directory does not exist:', srcDir);
  process.exit(1);
}

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

fs.cpSync(srcDir, destDir, { recursive: true, force: true });
console.log('✅ Admin dashboard dist files synced to backend/public/admin successfully!');
process.exit(0);
