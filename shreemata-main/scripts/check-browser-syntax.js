#!/usr/bin/env node
/**
 * scripts/check-browser-syntax.js
 *
 * Syntax gate for frontend code:
 * 1. Checks every public/js/*.js file using `new vm.Script(source)`.
 * 2. Extracts and checks every inline <script> block (without src attribute) from every public/*.html file.
 *
 * Output:
 * Prints "BROKEN: <file>" for each failure with error details.
 * Exits with code 1 if any file is broken; exits with code 0 if all pass.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const JS_DIR = path.join(PUBLIC_DIR, 'js');

let totalChecked = 0;
let totalPassed = 0;
const brokenFiles = [];

console.log('=== Checking Browser JavaScript Syntax ===');

// 1. Check all JS files in public/js/
if (fs.existsSync(JS_DIR)) {
  const jsFiles = fs.readdirSync(JS_DIR).filter(file => file.endsWith('.js'));
  console.log(`Checking ${jsFiles.length} files in public/js/...`);

  for (const file of jsFiles) {
    totalChecked++;
    const fullPath = path.join(JS_DIR, file);
    const relPath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
    const source = fs.readFileSync(fullPath, 'utf8');

    try {
      new vm.Script(source, { filename: relPath });
      totalPassed++;
    } catch (err) {
      brokenFiles.push({ file: relPath, error: err.message, stack: err.stack });
      console.error(`BROKEN: ${relPath}`);
      console.error(`   ${err.message}`);
    }
  }
}

// 2. Check inline <script> blocks in all public/*.html files
if (fs.existsSync(PUBLIC_DIR)) {
  const htmlFiles = fs.readdirSync(PUBLIC_DIR).filter(file => file.endsWith('.html'));
  console.log(`Checking inline scripts in ${htmlFiles.length} HTML files in public/...`);

  const scriptRegex = /<script\b(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;

  for (const file of htmlFiles) {
    const fullPath = path.join(PUBLIC_DIR, file);
    const relPath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
    const content = fs.readFileSync(fullPath, 'utf8');

    let match;
    let scriptIndex = 0;
    scriptRegex.lastIndex = 0;

    while ((match = scriptRegex.exec(content)) !== null) {
      scriptIndex++;
      const inlineCode = match[1].trim();
      if (!inlineCode) continue; // Skip empty script tags

      totalChecked++;
      const scriptLabel = `${relPath} (inline script #${scriptIndex})`;

      try {
        new vm.Script(inlineCode, { filename: scriptLabel });
        totalPassed++;
      } catch (err) {
        brokenFiles.push({ file: scriptLabel, error: err.message, stack: err.stack });
        console.error(`BROKEN: ${scriptLabel}`);
        console.error(`   ${err.message}`);
      }
    }
  }
}

console.log('\n=== Summary ===');
console.log(`Total checks: ${totalChecked}`);
console.log(`Passed:       ${totalPassed}`);
console.log(`Broken:       ${brokenFiles.length}`);

if (brokenFiles.length > 0) {
  console.error('\nFAIL: One or more browser scripts contain syntax errors:');
  for (const item of brokenFiles) {
    console.error(` - ${item.file}: ${item.error}`);
  }
  process.exit(1);
} else {
  console.log('\nSUCCESS: All browser scripts and inline blocks passed syntax verification.');
  process.exit(0);
}
