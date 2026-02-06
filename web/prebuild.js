#!/usr/bin/env node
/**
 * Prebuild script for Vercel deployment
 * Copies shared source from parent directory into web/src/_shared
 * so Vercel can access it during build
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..', 'src');
const destDir = path.resolve(__dirname, 'src', '_shared');

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// Only copy if parent src exists (local dev or full repo checkout)
if (fs.existsSync(srcDir)) {
    console.log('Copying shared source from ../src to src/_shared...');
    copyDir(srcDir, destDir);
    console.log('Done!');
} else {
    console.log('Parent src/ not found, skipping copy (using existing _shared)');
}
