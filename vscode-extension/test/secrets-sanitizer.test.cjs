const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function importModule(baseDir, fileName) {
  const filePath = path.resolve(baseDir, fileName);
  return import(pathToFileURL(filePath).href);
}

async function loadCoreAndShared(fileName) {
  const coreBase = path.resolve(__dirname, '..', '..', 'scripts', 'lib');
  const sharedBase = path.resolve(__dirname, '..', 'src', 'shared', 'lib');
  const core = await importModule(coreBase, fileName);
  const shared = await importModule(sharedBase, fileName);
  return { core, shared };
}

test('protectSecrets parity between core and shared', async () => {
  const { core, shared } = await loadCoreAndShared('secret-protection.js');
  const sample = [
    'Authorization: Bearer abcdef1234567890ABCDE1234567890',
    'OPENAI_API_KEY=sk-proj-ABCDEF1234567890abcdef1234567890',
    'github token ghp_123456789012345678901234567890123456',
    'SLACK_BOT_TOKEN=xoxb-1234567890-abcdefghijklmnop-qrstuvwxyz',
    'NPM_TOKEN=npm_1234567890abcdef1234567890abcdef1234',
    'STRIPE_SECRET=sk_live_1234567890abcdefghijklmnop',
    'STRIPE_PUBLIC=pk_live_1234567890abcdefghijklmnop',
    'DATABASE_URL=postgresql://db_user:db_pass@db.example.com:5432/app',
    'AZURE_CLIENT_SECRET=my-azure-secret-value',
    '{"private_key_id":"abc123def456","private_key":"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n"}',
  ].join('\n');

  const coreResult = core.protectSecrets(sample);
  const sharedResult = shared.protectSecrets(sample);

  assert.deepEqual(coreResult, sharedResult);
  assert.equal(coreResult.redacted, true);
});

test('protectSecrets dotenv parity between core and shared', async () => {
  const { core, shared } = await loadCoreAndShared('secret-protection.js');
  const sample = [
    '# env file',
    'API_URL=https://api.example.com',
    'export CLIENT_SECRET=super-secret',
    'PRIVATE_KEY=line_one\\',
    'line_two',
  ].join('\n');

  const coreResult = core.protectSecrets(sample, { filename: '.env.production' });
  const sharedResult = shared.protectSecrets(sample, { filename: '.env.production' });

  assert.deepEqual(coreResult, sharedResult);
  assert.equal(coreResult.redacted, true);
  assert.ok(coreResult.output.includes('API_URL=[REDACTED_ENV_VALUE]'));
  assert.ok(coreResult.findings.some(item => item.id === 'dotenv-assignment'));
});

test('optimizePrompt parity keeps secret redaction metadata in core and shared', async () => {
  const { core, shared } = await loadCoreAndShared('prompt-assemble.js');
  const prompt = 'Fix auth handling for token ghp_123456789012345678901234567890123456 quickly.';

  const coreResult = core.optimizePrompt(prompt, {});
  const sharedResult = shared.optimizePrompt(prompt, {});

  assert.deepEqual(coreResult, sharedResult);
  assert.equal(coreResult.protectionReport.redacted, true);
  assert.ok(
    coreResult.warnings.some(w => /secret patterns were redacted locally/i.test(w)),
    'Expected a warning when high-confidence secret patterns were redacted'
  );
});
