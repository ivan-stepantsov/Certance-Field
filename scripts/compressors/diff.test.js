import test from 'node:test';
import assert from 'node:assert/strict';
import { compressDiff } from './diff.js';

test('compressDiff keeps changed lines + headers and drops unchanged context', () => {
  const diff = [
    'diff --git a/src/auth.ts b/src/auth.ts',
    'index 1234567..89abcde 100644',
    '--- a/src/auth.ts',
    '+++ b/src/auth.ts',
    '@@ -10,7 +10,8 @@ export class Auth {',
    '   login(creds: Creds) {',
    '     const user = this.db.find(creds.email);',
    '-    if (user.password === creds.password) {',
    '+    if (bcrypt.compareSync(creds.password, user.hash)) {',
    "+      this.audit.log('login', user.id);",
    '       return this.token(user);',
    '     }',
  ].join('\n');

  const r = compressDiff(diff);

  // Changed lines + headers survive
  assert.match(r.output, /@@ -10,7 \+10,8 @@/);
  assert.match(r.output, /\+\+\+ b\/src\/auth\.ts/);
  assert.match(r.output, /-\s+if \(user\.password === creds\.password\)/);
  assert.match(r.output, /\+\s+if \(bcrypt\.compareSync/);
  assert.match(r.output, /\+\s+this\.audit\.log/);
  // Unchanged context lines are dropped
  assert.doesNotMatch(r.output, /const user = this\.db\.find/);
  assert.doesNotMatch(r.output, /return this\.token\(user\)/);
  assert.ok(r.afterTokens < r.beforeTokens);
});

test('compressDiff collapses lock/generated file diffs to a one-line note', () => {
  const diff = [
    'diff --git a/src/x.ts b/src/x.ts',
    '@@ -1,1 +1,1 @@',
    '-const a = 1;',
    '+const a = 2;',
    'diff --git a/package-lock.json b/package-lock.json',
    '--- a/package-lock.json',
    '+++ b/package-lock.json',
    '@@ -100,3 +100,4 @@',
    '-        "old": "1.0.0",',
    '+        "new": "2.0.0",',
    '+        "added": "3.0.0",',
  ].join('\n');

  const r = compressDiff(diff);

  // Real code change kept
  assert.match(r.output, /\+const a = 2;/);
  // Lockfile collapsed, its content gone
  assert.match(r.output, /package-lock\.json: 3 changed line\(s\) omitted/);
  assert.doesNotMatch(r.output, /"new": "2\.0\.0"/);
});
