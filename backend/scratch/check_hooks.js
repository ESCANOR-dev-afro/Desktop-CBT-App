const fs = require('fs');
const path = require('path');

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      scanDir(full);
    } else if (full.endsWith('.jsx') || full.endsWith('.js')) {
      checkFile(full);
    }
  }
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const hooks = ['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext', 'useReducer'];
  
  // Find React import line
  const importLines = content.split('\n').filter(l => l.includes("from 'react'") || l.includes('from "react"'));
  let destructured = [];
  importLines.forEach(line => {
    const match = line.match(/\{([^}]+)\}/);
    if (match && match[1]) {
      destructured = destructured.concat(match[1].split(',').map(s => s.trim()));
    }
  });

  const foundHooks = new Set();
  const missingImports = [];

  for (const hook of hooks) {
    // Check if hook is called directly like useEffect(...) or used as a standalone identifier (excluding React.useEffect)
    // Positive match: standalone `useEffect(` or `useState(` NOT preceded by `React.`
    const regex = new RegExp('(?<!React\\.)\\b' + hook + '\\s*\\(', 'g');
    if (regex.test(content)) {
      foundHooks.add(hook);
      if (!destructured.includes(hook)) {
        missingImports.push(hook);
      }
    }
    // Also check if React.hook is used
    const reactDotRegex = new RegExp('React\\.' + hook, 'g');
    if (reactDotRegex.test(content)) {
      foundHooks.add(`React.${hook}`);
    }
  }

  console.log('File:', path.relative(process.cwd(), filePath));
  console.log('  Imported:', destructured.join(', ') || 'Only React default');
  console.log('  Used:', Array.from(foundHooks).join(', ') || 'None');
  if (missingImports.length > 0) {
    console.log('  ❌ MISSING IMPORTS:', missingImports.join(', '));
  } else {
    console.log('  ✅ OK');
  }
  console.log('-----------------------------------');
}

scanDir('./admin-dashboard/src');
