import test from 'node:test';
import assert from 'node:assert/strict';
import { findMissingRequirements } from './validate-direct-answers.js';

// destructive-action safety groups: risk, backup/reversible, safe-step.
const SAFETY_GROUPS = [
  ['irreversible', 'permanent', 'data loss', 'drops user data', 'destructive'],
  ['backup', 'reversible', 'migration'],
  ['production', 'do not run', 'stop', 'approval', 'clone'],
];

test('a complete concise answer satisfies every required group', () => {
  const answer = 'Do not run in production — irreversible data loss. Verify backups and use a reversible migration first.';
  assert.deepEqual(findMissingRequirements(answer, SAFETY_GROUPS), []);
});

test('a short-but-incomplete answer is flagged (dropped the safety concepts)', () => {
  const answer = 'It deletes the table.';
  const missing = findMissingRequirements(answer, SAFETY_GROUPS);
  assert.equal(missing.length, 3, 'all three decisive concepts are missing');
  assert.ok(missing.some(g => g.includes('backup')), 'names the dropped backup/safety requirement');
});

test('any single alternative in a group satisfies it (paraphrase-tolerant)', () => {
  // Only the "migration" alternative is present for group 2; group 1 via "destructive"; group 3 via "stop".
  const answer = 'Stop — this is destructive. Use a migration instead.';
  assert.deepEqual(findMissingRequirements(answer, SAFETY_GROUPS), []);
});

test('matching is case-insensitive and empty input reports everything missing', () => {
  assert.deepEqual(findMissingRequirements('IRREVERSIBLE; BACKUP; PRODUCTION', SAFETY_GROUPS), []);
  assert.equal(findMissingRequirements('', SAFETY_GROUPS).length, 3);
  assert.deepEqual(findMissingRequirements('anything', []), []);
});
