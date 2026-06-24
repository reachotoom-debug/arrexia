#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Lint check: Prevent usage of outstanding_amount
 * 
 * This script checks that "outstanding_amount" does not appear in:
 * - app/
 * - lib/
 * - components/
 * - actions/
 * - types/
 * 
 * Run: node scripts/check-outstanding-amount.js
 */

const fs = require('fs');
const path = require('path');

const DIRS_TO_CHECK = ['app', 'lib', 'components', 'actions', 'types'];
const FORBIDDEN_STRING = 'outstanding_amount';
const IGNORE_PATTERNS = [
  /node_modules/,
  /\.next/,
  /\.git/,
  /out/,
  /build/,
  /scripts\/check-outstanding-amount\.js$/, // Ignore this script itself
  /\.md$/, // Allow in markdown files (documentation)
  /\.sql$/, // Allow in SQL files (migrations may reference old schema)
];

const ALLOWED_COMMENTS = [
  /NOTE:.*outstanding_amount.*dropped/i,
  /REMOVED:.*outstanding_amount/i,
  /outstanding_amount.*was dropped/i,
  /outstanding_amount.*deprecated/i,
  /DEPRECATED.*outstanding_amount/i,
  /Legacy field name/i,
  /maps from invoices_view/i,
  /for backward compatibility/i,
  /Canonical field.*never use outstanding_amount/i,
];

const ALLOWED_PATTERNS = [
  /outstanding_amount:.*Number\(.*\.outstanding/i, // Mapping from outstanding to outstanding_amount
  /outstanding_amount:.*inv\.outstanding/i, // Mapping from outstanding
  /outstanding_amount:.*invoice\.outstanding/i, // Mapping from outstanding
  /outstanding_amount:.*outstanding[,;)]/i, // Mapping pattern: outstanding_amount: outstanding,
  /invoice\.outstanding_amount/i, // Reading from mapped invoice object (UI compatibility)
  /inv\.outstanding_amount/i, // Reading from mapped invoice object
  /:.*outstanding_amount.*number/i, // Type definitions for legacy compatibility
  /\?.*outstanding_amount/i, // Optional type definitions
  /COALESCE\(outstanding_amount/i, // SQL comments in code comments
  /^\s*\*\s/i, // JSDoc comments
  /^\s*\/\//, // Single-line comments (but not all comments are allowed - checked separately)
];

function shouldIgnoreFile(filePath) {
  return IGNORE_PATTERNS.some(pattern => pattern.test(filePath));
}

function isAllowedComment(line) {
  return ALLOWED_COMMENTS.some(pattern => pattern.test(line));
}

function isAllowedPattern(line) {
  return ALLOWED_PATTERNS.some(pattern => pattern.test(line));
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const issues = [];

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    
    // Skip empty lines
    if (!trimmedLine) {
      return;
    }

    // Skip if line is a comment (single-line or JSDoc) and contains allowed comment patterns
    if ((trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('/**')) && isAllowedComment(line)) {
      return;
    }

    // Skip JSDoc-style comments that mention outstanding_amount in documentation context
    if (trimmedLine.startsWith('*') && /outstanding_amount/.test(line)) {
      return;
    }

    // Skip type definitions with legacy comments on the same line
    if (/outstanding_amount.*:.*number/i.test(line) && /legacy|backward/i.test(line)) {
      return;
    }

    // Skip optional type definitions (interface properties)
    if (/\?.*:.*outstanding_amount/i.test(line) || /outstanding_amount\?.*:/i.test(line)) {
      return;
    }

    // Skip template variable mappings (outstanding_amount: ... for template rendering)
    if (/outstanding_amount:\s*$/i.test(line) || /outstanding_amount:\s*invoice/i.test(line)) {
      return;
    }

    // Skip comment lines about canonical field
    if (/canonical field.*never use outstanding_amount/i.test(line) || /never use outstanding_amount/i.test(line)) {
      return;
    }

    // Skip simple type definitions in interface/type (outstanding_amount: number;)
    if (/^\s*outstanding_amount\s*:\s*number\s*;?\s*$/i.test(trimmedLine)) {
      return;
    }

    // Skip if line matches allowed patterns (mappings, type definitions, etc.)
    if (isAllowedPattern(line)) {
      return;
    }

    const lowerLine = line.toLowerCase();
    if (lowerLine.includes(FORBIDDEN_STRING.toLowerCase())) {
      issues.push({
        file: filePath,
        line: index + 1,
        content: trimmedLine,
      });
    }
  });

  return issues;
}

function findFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) {
    return fileList;
  }

  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (shouldIgnoreFile(filePath)) {
      return;
    }

    if (stat.isDirectory()) {
      findFiles(filePath, fileList);
    } else if (
      file.endsWith('.ts') ||
      file.endsWith('.tsx') ||
      file.endsWith('.js') ||
      file.endsWith('.jsx')
    ) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

function main() {
  const allIssues = [];

  DIRS_TO_CHECK.forEach(dir => {
    if (!fs.existsSync(dir)) {
      console.warn(`Warning: Directory ${dir} does not exist`);
      return;
    }

    const files = findFiles(dir);
    files.forEach(file => {
      const issues = checkFile(file);
      if (issues.length > 0) {
        allIssues.push(...issues);
      }
    });
  });

  if (allIssues.length > 0) {
    console.error('\n❌ Found forbidden usage of "outstanding_amount":\n');
    allIssues.forEach(issue => {
      console.error(`  ${issue.file}:${issue.line}`);
      console.error(`    ${issue.content}\n`);
    });
    console.error(
      `\nError: Found ${allIssues.length} issue(s). ` +
      `Use "outstanding" from invoices_view instead of "outstanding_amount".\n` +
      `See lib/invoices/view-fields.ts for the canonical invoice field helper.\n`
    );
    process.exit(1);
  }

  console.log('✅ No usage of "outstanding_amount" found in checked directories.');
  process.exit(0);
}

main();

