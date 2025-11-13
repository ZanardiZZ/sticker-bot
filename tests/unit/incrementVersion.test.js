#!/usr/bin/env node
/**
 * Test for version increment script
 */

const assert = require('assert');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('\n=== Testing Version Increment Script ===\n');

const rootDir = path.join(__dirname, '..', '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const dbPath = path.join(rootDir, 'stickers.db');

// Backup package.json
const packageBackup = fs.readFileSync(packageJsonPath, 'utf8');

function getPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return pkg.version;
}

function restorePackage() {
  fs.writeFileSync(packageJsonPath, packageBackup);
}

let testsPassed = 0;
let testsFailed = 0;

try {
  // Test 1: Set version to 0.5
  console.log('Test 1: Set version to 0.5');
  execSync('node scripts/increment-version.js --set 0.5', { cwd: rootDir, stdio: 'pipe' });
  let version = getPackageVersion();
  assert.strictEqual(version, '0.5.0', 'Version should be 0.5.0');
  console.log('✓ Version correctly set to 0.5.0\n');
  testsPassed++;
  
  // Test 2: Auto-increment to 0.6
  console.log('Test 2: Auto-increment to 0.6');
  execSync('node scripts/increment-version.js', { cwd: rootDir, stdio: 'pipe' });
  version = getPackageVersion();
  assert.strictEqual(version, '0.6.0', 'Version should be 0.6.0 after increment');
  console.log('✓ Version correctly incremented to 0.6.0\n');
  testsPassed++;
  
  // Test 3: Auto-increment to 0.7
  console.log('Test 3: Auto-increment to 0.7');
  execSync('node scripts/increment-version.js', { cwd: rootDir, stdio: 'pipe' });
  version = getPackageVersion();
  assert.strictEqual(version, '0.7.0', 'Version should be 0.7.0 after second increment');
  console.log('✓ Version correctly incremented to 0.7.0\n');
  testsPassed++;
  
  // Test 4: Manual version bump to 1.0
  console.log('Test 4: Manual version bump to 1.0');
  execSync('node scripts/increment-version.js --set 1.0', { cwd: rootDir, stdio: 'pipe' });
  version = getPackageVersion();
  assert.strictEqual(version, '1.0.0', 'Version should be 1.0.0 after manual set');
  console.log('✓ Version correctly set to 1.0.0\n');
  testsPassed++;
  
  // Test 5: Increment from 1.0 to 1.1
  console.log('Test 5: Increment from 1.0 to 1.1');
  execSync('node scripts/increment-version.js', { cwd: rootDir, stdio: 'pipe' });
  version = getPackageVersion();
  assert.strictEqual(version, '1.1.0', 'Version should be 1.1.0 after increment');
  console.log('✓ Version correctly incremented to 1.1.0\n');
  testsPassed++;
  
  // Restore to 0.5 for consistency
  console.log('Restoring version to 0.5.0...');
  execSync('node scripts/increment-version.js --set 0.5', { cwd: rootDir, stdio: 'pipe' });
  console.log('✓ Version restored to 0.5.0\n');
  
  console.log('============================================================');
  console.log(`✅ All ${testsPassed} version increment tests passed!`);
  console.log('============================================================\n');
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
  testsFailed++;
  restorePackage();
  process.exit(1);
}
