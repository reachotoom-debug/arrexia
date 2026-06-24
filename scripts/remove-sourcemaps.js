#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Post-build script to remove sourceMappingURL comments from Next.js build output
 * This fixes malformed sourceMappingURL references that cause issues
 */

const fs = require('fs');
const path = require('path');

const BUILD_DIR = path.join(__dirname, '..', '.next');

function removeSourceMapComments(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Remove sourceMappingURL comments (both //# and //@ formats)
    content = content.replace(/\/\/#\s*sourceMappingURL=[^\n]*/g, '');
    content = content.replace(/\/\/@\s*sourceMappingURL=[^\n]*/g, '');
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

function processDirectory(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      processDirectory(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      if (removeSourceMapComments(fullPath)) {
        console.log(`Removed sourceMappingURL from: ${fullPath}`);
      }
    }
  }
}

// Only run if .next directory exists
if (fs.existsSync(BUILD_DIR)) {
  console.log('Removing sourceMappingURL comments from build output...');
  processDirectory(BUILD_DIR);
  console.log('Done!');
} else {
  console.log('.next directory not found, skipping...');
}

