import test from 'node:test';
import assert from 'node:assert/strict';
import { compressCode, detectLanguage } from './code-context-compressor.js';

function expectIncludes(output, parts) {
  for (const part of parts) {
    assert.ok(output.includes(part), `Expected output to include: ${part}`);
  }
}

function expectExcludes(output, parts) {
  for (const part of parts) {
    assert.ok(!output.includes(part), `Expected output to exclude: ${part}`);
  }
}

test('detectLanguage maps supported extensions and falls back to unknown', () => {
  assert.equal(detectLanguage('LoginPage.ts'), 'ts');
  assert.equal(detectLanguage('script.mjs'), 'mjs');
  assert.equal(detectLanguage('run.bash'), 'bash');
  assert.equal(detectLanguage('README.md'), 'unknown');
});

test('compressCode strips comment-only TS lines and block comments, keeps inline comments', () => {
  const src = [
    '// banner',
    'const a = 1; // keep inline comment',
    '/* block start',
    'block middle',
    'block end */',
    '',
    'const b = 2;',
    '',
  ].join('\n');

  const out = compressCode(src, 'sample.ts');

  expectIncludes(out.output, ['const a = 1; // keep inline comment', 'const b = 2;']);
  expectExcludes(out.output, ['// banner', 'block middle', 'block end */']);
  assert.equal(out.language, 'ts');
  assert.ok(out.beforeTokens >= out.afterTokens);
});

test('compressCode with keepComments preserves comment-only and block comments', () => {
  const src = [
    '// banner',
    '/** why this exists',
    ' *  the upstream rate-limits under burst load */',
    'const a = 1;',
    '',
    '',
    'const b = 2;',
  ].join('\n');

  const out = compressCode(src, 'sample.ts', { keepComments: true });

  // Comments are the intent for /explain — keepComments must retain them…
  expectIncludes(out.output, ['// banner', 'why this exists', 'the upstream rate-limits', 'const a = 1;', 'const b = 2;']);
  // …while blank-line collapsing (the other half of the compressor) still runs.
  expectExcludes(out.output, ['\n\n\n']);
});

test('compressCode strips one-line block comments and JSDoc comment-only lines', () => {
  const src = [
    '/** This is docs */',
    '/* one-line block */',
    'export const ready = true;',
  ].join('\n');

  const out = compressCode(src, 'module.js');

  assert.equal(out.output, 'export const ready = true;');
});

test('compressCode preserves comment-like text inside strings and URLs', () => {
  const src = [
    "const url = 'https://example.test/path';",
    "const marker = '/* not a block comment */';",
    "const hash = '# not a comment marker in JS string';",
  ].join('\n');

  const out = compressCode(src, 'sample.ts');

  assert.equal(out.output, src);
});

test('compressCode collapses multiple blank lines and trims leading/trailing blanks', () => {
  const src = [
    '',
    '',
    'const a = 1;  ',
    '',
    '',
    '',
    'const b = 2;   ',
    '',
    '',
  ].join('\n');

  const out = compressCode(src, 'sample.js');

  assert.equal(out.output, 'const a = 1;\n\nconst b = 2;');
});

test('compressCode preserves shebang for python and strips other comment-only lines', () => {
  const src = [
    '#!/usr/bin/env python3',
    '# module comment',
    "print('ok')",
    '# tail comment',
  ].join('\n');

  const out = compressCode(src, 'tool.py');

  assert.equal(out.output, "#!/usr/bin/env python3\nprint('ok')");
});

test('compressCode preserves shebang for shell scripts', () => {
  const src = [
    '#!/usr/bin/env bash',
    '# setup comment',
    'echo ok',
  ].join('\n');

  const out = compressCode(src, 'script.sh');

  assert.equal(out.output, '#!/usr/bin/env bash\necho ok');
});

test('compressCode on unknown extension keeps comment-only lines but still trims trailing whitespace', () => {
  const src = [
    '// unknown comment style should remain',
    'content   ',
    '',
  ].join('\n');

  const out = compressCode(src, 'notes.md');

  assert.equal(out.language, 'unknown');
  expectIncludes(out.output, ['// unknown comment style should remain', 'content']);
  assert.ok(!out.output.includes('content   '));
});

test('compressCode returns stable token metadata fields', () => {
  const src = 'const x = 1;\n';
  const out = compressCode(src, 'x.ts');

  assert.equal(typeof out.beforeTokens, 'number');
  assert.equal(typeof out.afterTokens, 'number');
  assert.equal(typeof out.ratio, 'number');
  assert.ok(out.beforeTokens >= 0);
  assert.ok(out.afterTokens >= 0);
});
