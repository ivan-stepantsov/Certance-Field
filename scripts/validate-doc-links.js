#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ROOTS = ['docs', '.github/skills', '.github/agents'];
const LINK_PATTERN = /\[[^\]]+\]\(([^)]+)\)/g;

function parseArgs(argv) {
  const roots = argv.slice(2);
  return roots.length > 0 ? roots : DEFAULT_ROOTS;
}

function listMarkdownFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryPath);
    }
  }

  return files;
}

function shouldSkipTarget(target) {
  return target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target);
}

function normalizeTarget(rawTarget) {
  const withoutTitle = rawTarget.trim().split(/\s+"/)[0];
  const withoutAnchor = withoutTitle.split('#')[0];
  return decodeURIComponent(withoutAnchor);
}

function validateFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const errors = [];
  let match;

  while ((match = LINK_PATTERN.exec(content)) !== null) {
    const rawTarget = match[1];
    if (shouldSkipTarget(rawTarget)) continue;

    const normalizedTarget = normalizeTarget(rawTarget);
    if (!normalizedTarget || !normalizedTarget.endsWith('.md')) continue;

    const resolvedTarget = path.resolve(path.dirname(filePath), normalizedTarget);
    if (!fs.existsSync(resolvedTarget)) {
      errors.push(`${filePath}: missing local Markdown link target '${rawTarget}'.`);
    }
  }

  return errors;
}

function main() {
  const roots = parseArgs(process.argv);
  const files = roots.flatMap(listMarkdownFiles);
  const errors = files.flatMap(validateFile);

  if (errors.length > 0) {
    process.stderr.write('Documentation link validation failed.\n');
    for (const error of errors) {
      process.stderr.write(`- ${error}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Documentation link validation passed: ${files.length} Markdown file(s).\n`);
}

main();