#!/usr/bin/env node

/**
 * WawApp MCP Debug Server - Setup Validation Script
 * Run this to verify your setup before using with Claude Desktop
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const checks = [];
let allPassed = true;

function check(name, condition, message) {
  const passed = condition();
  checks.push({ name, passed, message: passed ? '✅ Pass' : `❌ ${message}` });
  if (!passed) allPassed = false;
}

console.log('🔍 WawApp MCP Debug Server - Setup Validation\n');

// Check 1: Node version
check(
  'Node.js version',
  () => {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0]);
    return major >= 20;
  },
  'Node.js 20+ required. Current: ' + process.version
);

// Check 2: Dependencies installed
check(
  'Dependencies installed',
  () => fs.existsSync(path.join(__dirname, 'node_modules')),
  'Run: npm install'
);

// Check 3: TypeScript compiled
check(
  'TypeScript compiled',
  () => fs.existsSync(path.join(__dirname, 'dist', 'index.js')),
  'Run: npm run build'
);

// Check 4: .env file exists
check(
  '.env file exists',
  () => fs.existsSync(path.join(__dirname, '.env')),
  'Copy .env.example to .env'
);

// Check 5: environments.json exists
check(
  'environments.json exists',
  () => fs.existsSync(path.join(__dirname, 'config', 'environments.json')),
  'File missing: config/environments.json'
);

// Check 6: Service account exists
const env = process.env.ENVIRONMENT || 'dev';
const serviceAccountPath = path.join(__dirname, 'config', `${env}-service-account.json`);
check(
  `Service account for ${env}`,
  () => fs.existsSync(serviceAccountPath),
  `Missing: ${serviceAccountPath}\nDownload from Firebase Console → Project Settings → Service Accounts`
);

// Check 7: Service account is valid JSON
if (fs.existsSync(serviceAccountPath)) {
  check(
    'Service account valid JSON',
    () => {
      try {
        const content = fs.readFileSync(serviceAccountPath, 'utf-8');
        const json = JSON.parse(content);
        return json.type === 'service_account' && json.project_id;
      } catch {
        return false;
      }
    },
    'Service account JSON is malformed'
  );
}

// Check 8: Logs directory exists
check(
  'Logs directory',
  () => fs.existsSync(path.join(__dirname, 'logs')),
  'Directory missing (will be created automatically)'
);

// Print results
console.log('Validation Results:\n');
checks.forEach(({ name, passed, message }) => {
  console.log(`${passed ? '✅' : '❌'} ${name}: ${message}`);
});

console.log('\n' + '='.repeat(60) + '\n');

if (allPassed) {
  console.log('✅ All checks passed! Your setup is ready.\n');
  console.log('Next steps:');
  console.log('1. Update config/environments.json with your Firebase project ID');
  console.log('2. Run: npm start');
  console.log('3. Configure Claude Desktop (see SETUP_GUIDE.md)');
  console.log('4. Restart Claude Desktop');
} else {
  console.log('❌ Some checks failed. Please fix the issues above.\n');
  console.log('See SETUP_GUIDE.md for detailed instructions.');
  process.exit(1);
}
