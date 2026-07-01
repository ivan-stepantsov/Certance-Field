import test from 'node:test';
import assert from 'node:assert/strict';
import { protectResultOutput } from './safe-output.js';

test('protectResultOutput redacts the output and attaches a protection report', () => {
  const result = {
    kind: 'output',
    output: 'token ghp_123456789012345678901234567890123456 end',
    beforeTokens: 9,
    afterTokens: 9,
    warnings: [],
  };
  const safe = protectResultOutput(result);

  assert.ok(safe.output.includes('[REDACTED_GITHUB_TOKEN]'));
  assert.ok(!safe.output.includes('ghp_123456789012345678901234567890123456'));
  assert.equal(safe.protection.redacted, true);
  assert.equal(safe.protection.totalRedactions, 1);
  // The rest of the compression result is preserved unchanged.
  assert.equal(safe.kind, 'output');
  assert.equal(safe.beforeTokens, 9);
  assert.deepEqual(safe.warnings, []);
});

test('protectResultOutput leaves clean output unchanged and reports no redactions', () => {
  const safe = protectResultOutput({ output: 'const x = 1;', beforeTokens: 4, afterTokens: 4 });

  assert.equal(safe.output, 'const x = 1;');
  assert.equal(safe.protection.redacted, false);
  assert.equal(safe.protection.totalRedactions, 0);
});

test('protectResultOutput forwards options (filename) to the redactor', () => {
  // A .env filename triggers the dotenv-assignment stage even for a bare value.
  const safe = protectResultOutput({ output: 'API_URL=https://api.example.com' }, { filename: '.env' });

  assert.ok(safe.output.includes('[REDACTED_ENV_VALUE]'));
  assert.equal(safe.protection.redacted, true);
});
