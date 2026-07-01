import test from 'node:test';
import assert from 'node:assert/strict';
import { getSecretPatternSummaries, protectSecrets, scanSecrets, setCustomSecretPatterns } from './secret-protection.js';

test('protectSecrets redacts common API token patterns', () => {
  const input = 'Use ghp_123456789012345678901234567890123456 and sk-proj-ABCDEF1234567890abcdef1234567890 for debugging.';
  const result = protectSecrets(input);

  assert.equal(result.redacted, true);
  assert.ok(result.output.includes('[REDACTED_GITHUB_TOKEN]'));
  assert.ok(result.output.includes('[REDACTED_API_KEY]'));
  assert.ok(result.findings.some(item => item.id === 'github-token'));
  assert.ok(result.findings.some(item => item.id === 'openai-anthropic-key'));
});

test('protectSecrets redacts additional high-confidence provider tokens', () => {
  const cases = [
    ['AIza' + 'a'.repeat(35), '[REDACTED_GOOGLE_API_KEY]', 'google-api-key'],
    ['glpat-' + 'a'.repeat(20), '[REDACTED_GITLAB_TOKEN]', 'gitlab-token'],
    ['SG.' + 'a'.repeat(22) + '.' + 'b'.repeat(43), '[REDACTED_SENDGRID_KEY]', 'sendgrid-key'],
    ['SK' + 'a'.repeat(32), '[REDACTED_TWILIO_KEY]', 'twilio-api-key'],
    ['shpat_' + 'a'.repeat(32), '[REDACTED_SHOPIFY_TOKEN]', 'shopify-token'],
    ['dop_v1_' + 'a'.repeat(64), '[REDACTED_DIGITALOCEAN_TOKEN]', 'digitalocean-token'],
    ['sq0atp-' + 'a'.repeat(22), '[REDACTED_SQUARE_TOKEN]', 'square-token'],
    ['PMAK-' + 'a'.repeat(24) + '-' + 'b'.repeat(34), '[REDACTED_POSTMAN_KEY]', 'postman-key'],
  ];

  for (const [token, placeholder, id] of cases) {
    const result = protectSecrets(`api token = ${token} end`);
    assert.ok(result.output.includes(placeholder), `${id}: expected ${placeholder}`);
    assert.ok(!result.output.includes(token), `${id}: raw token must not survive`);
    assert.ok(result.findings.some(item => item.id === id), `${id}: finding recorded`);
  }
});

test('protectSecrets does not flag innocuous strings that resemble token prefixes', () => {
  // Guard against false positives from the new patterns.
  const input = 'SKULL and SGT and AIza (too short) and shpat_notlongenough';
  const result = protectSecrets(input);
  assert.equal(result.redacted, false);
  assert.equal(result.output, input);
});

test('protectSecrets redacts auth headers, bearer token, and jwt', () => {
  const input = [
    'Authorization: Bearer abcdef1234567890ABCDE1234567890',
    'Api-Key: topsecretapikeyvalue',
    'JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSIsIm5hbWUiOiJKb2huIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  ].join('\n');
  const result = protectSecrets(input);

  assert.equal(result.redacted, true);
  assert.ok(result.output.includes('[REDACTED_HEADER_VALUE]'));
  assert.ok(result.output.includes('[REDACTED_BEARER_TOKEN]'));
  assert.ok(result.output.includes('[REDACTED_JWT]'));
});

test('protectSecrets redacts private key blocks and sensitive env assignments', () => {
  const input = [
    'export OPENAI_API_KEY=sk-proj-secretvalue1234567890',
    'GITHUB_TOKEN=ghp_123456789012345678901234567890123456',
    '-----BEGIN PRIVATE KEY-----',
    'abc123',
    '-----END PRIVATE KEY-----',
  ].join('\n');

  const result = protectSecrets(input);

  assert.equal(result.redacted, true);
  assert.ok(result.output.includes('[REDACTED_ENV_VALUE]'));
  assert.ok(result.output.includes('[REDACTED_PRIVATE_KEY_BLOCK]'));
});

test('protectSecrets leaves non-secret content unchanged', () => {
  const input = 'Fix the failing assertion in tests/auth.spec.ts and keep the API unchanged.';
  const result = protectSecrets(input);

  assert.equal(result.redacted, false);
  assert.equal(result.output, input);
  assert.equal(result.totalRedactions, 0);
});

test('protectSecrets counts masked regions, not overlapping pattern hits (no double-count)', () => {
  // Five secrets. The two KEY=value ones are matched by BOTH their specific
  // pattern AND the generic sensitive-env-assignment pattern, so summing per-
  // pattern hits used to over-count (reported 7 for 5). The honest number is how
  // many [REDACTED_*] spans a reader can actually see in the output.
  const input = [
    'GITHUB_TOKEN=ghp_1234567890abcdefABCDEF1234567890abcd',
    'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
    'OpenAI key: sk-proj-abc123DEF456ghi789JKL012mno345PQRstu',
    'Auth: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.dozjgNryP4J3jVmNHl0w5N',
    // Deliberately loose xoxb- shape: the kit's Slack pattern still redacts it, but
    // it does NOT match GitHub push protection's stricter Slack detector, so it can
    // ship to the public mirror. Do not tighten this to a canonical Slack format.
    'Slack: xoxb-1234567890-abcdefghijklmnop-qrstuvwxyz',
  ].join('\n');

  const result = protectSecrets(input);

  const visibleSpans = (result.output.match(/\[REDACTED_[A-Z_]+\]/g) || []).length;
  assert.equal(visibleSpans, 5, 'exactly five secrets are masked in the output');
  // The reported count must equal the masked regions actually present — the
  // number a Redact Clipboard toast / audit record surfaces to a reviewer.
  assert.equal(result.totalRedactions, visibleSpans);
  assert.equal(result.totalRedactions, 5);
});

test('protectSecrets does not count [REDACTED_*] placeholders already present in the input', () => {
  // A caller re-running redaction on already-scrubbed text must not inflate the
  // count with the placeholders that were there before we ran.
  const input = 'prev: [REDACTED_ENV_VALUE]\nGITHUB_TOKEN=ghp_1234567890abcdefABCDEF1234567890abcd';
  const result = protectSecrets(input);

  assert.equal(result.totalRedactions, 1, 'only the newly-masked secret is counted');
});

test('protectSecrets redacts Slack, npm, and Stripe live keys', () => {
  const input = [
    'slack token xoxb-1234567890-abcdefghijklmnop-qrstuvwxyz',
    'npm publish token npm_1234567890abcdef1234567890abcdef1234',
    'stripe secret sk_live_1234567890abcdefghijklmnop',
    'stripe publishable pk_live_1234567890abcdefghijklmnop',
  ].join('\n');

  const result = protectSecrets(input);

  assert.equal(result.redacted, true);
  assert.ok(result.output.includes('[REDACTED_SLACK_TOKEN]'));
  assert.ok(result.output.includes('[REDACTED_NPM_TOKEN]'));
  assert.ok(result.output.includes('[REDACTED_STRIPE_SECRET_KEY]'));
  assert.ok(result.output.includes('[REDACTED_STRIPE_PUBLISHABLE_KEY]'));
});

test('protectSecrets redacts Azure and GCP secret-bearing fields', () => {
  const input = [
    'Connection string: DefaultEndpointsProtocol=https;AccountName=storage;AccountKey=abc123SECRETKEY789;EndpointSuffix=core.windows.net',
    'Azure secret value seen in logs: super-secret-client-value',
    '{"type":"service_account","private_key_id":"abc123def456","private_key":"-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----\\n"}',
  ].join('\n');

  const result = protectSecrets(input);

  assert.equal(result.redacted, true);
  assert.ok(result.output.includes('AccountKey=[REDACTED_AZURE_SECRET]'));
  assert.ok(result.output.includes('EndpointSuffix=[REDACTED_AZURE_SECRET]'));
  assert.ok(result.output.includes('[REDACTED_GCP_PRIVATE_KEY_ID]'));
  assert.ok(result.output.includes('[REDACTED_GCP_PRIVATE_KEY]'));
});

test('protectSecrets redacts credentials inside database connection URIs', () => {
  const input = [
    'Database URL: postgresql://db_user:db_pass@db.example.com:5432/app',
    'Mongo URL: mongodb://mongoUser:mongoPass@localhost:27017/app',
  ].join('\n');

  const result = protectSecrets(input);

  assert.equal(result.redacted, true);
  assert.ok(result.output.includes('postgresql://[REDACTED_DB_USER]:[REDACTED_DB_PASSWORD]@'));
  assert.ok(result.output.includes('mongodb://[REDACTED_DB_USER]:[REDACTED_DB_PASSWORD]@'));
});

test('protectSecrets avoids redacting common non-secret Azure credential class names', () => {
  const input = 'Use DefaultAzureCredential for managed identity in production code.';
  const result = protectSecrets(input);

  assert.equal(result.redacted, false);
  assert.equal(result.output, input);
});

test('protectSecrets redacts dotenv assignments by filename while preserving comments and blank lines', () => {
  const input = [
    '# app environment',
    'API_URL=https://api.example.com',
    'EMPTY_VALUE=',
    'export TOKEN_FROM_ENV=super-secret-token',
    `QUOTED_JSON='{"a":1,"b":2}'`,
    '',
    '# end',
  ].join('\n');

  const result = protectSecrets(input, { filename: '.env' });

  assert.equal(result.redacted, true);
  assert.ok(result.output.includes('# app environment'));
  assert.ok(result.output.includes('API_URL=[REDACTED_ENV_VALUE]'));
  assert.ok(result.output.includes('EMPTY_VALUE='));
  assert.ok(result.output.includes('export TOKEN_FROM_ENV=[REDACTED_ENV_VALUE]'));
  assert.ok(result.output.includes('QUOTED_JSON=[REDACTED_ENV_VALUE]'));
  assert.ok(result.output.includes('\n\n# end'));
  assert.ok(result.findings.some(item => item.id === 'dotenv-assignment'));
});

test('protectSecrets redacts multiline escaped dotenv assignment values', () => {
  const input = [
    'PRIVATE_KEY=line_one\\',
    'line_two\\',
    'line_three',
    'NEXT_KEY=value',
  ].join('\n');

  const result = protectSecrets(input, { filename: '.env.local' });

  assert.equal(result.redacted, true);
  assert.ok(result.output.includes('PRIVATE_KEY=[REDACTED_ENV_VALUE]'));
  assert.ok(result.output.includes('[REDACTED_ENV_VALUE_CONTINUATION]'));
  assert.ok(result.output.includes('NEXT_KEY=[REDACTED_ENV_VALUE]'));
  assert.ok(result.findings.some(item => item.id === 'dotenv-assignment'));
});

test('protectSecrets does not blanket-redact env-shaped text without a .env filename', () => {
  const input = [
    'SERVICE_URL=https://service.example.com',
    'INTERNAL_FLAG=true',
    'APP_MODE=dev',
  ].join('\n');

  const result = protectSecrets(input, { filename: 'stdin.txt' });

  // Innocuous KEY=value context is preserved — only real .env* files get the
  // blanket value redaction. (Content-shape over-redaction was removed.)
  assert.equal(result.redacted, false);
  assert.equal(result.output, input);
});

test('protectSecrets still redacts secret-named keys in env-shaped text by key name', () => {
  const input = [
    'APP_MODE=dev',
    'API_TOKEN=supersecretvalue123',
    'DATABASE_PASSWORD=hunter2hunter2',
  ].join('\n');

  const result = protectSecrets(input, { filename: 'stdin.txt' });

  assert.equal(result.redacted, true);
  // Non-secret key preserved; secret-named keys scrubbed by the key-name pattern.
  assert.ok(result.output.includes('APP_MODE=dev'));
  assert.ok(result.output.includes('API_TOKEN=[REDACTED_ENV_VALUE]'));
  assert.ok(result.output.includes('DATABASE_PASSWORD=[REDACTED_ENV_VALUE]'));
  assert.ok(result.findings.some(item => item.id === 'sensitive-env-assignment'));
});

test('protectSecrets still redacts a recognized token under a non-secret key name in non-.env text', () => {
  // The worst case A2's scope-down must NOT regress: a real secret hidden under
  // an innocuous (non-secret-named) key, in pasted text that is not a .env* file.
  // The blanket dotenv stage no longer fires here, so this proves the value-pattern
  // layer — which is independent of the key name — still catches it.
  const input = [
    'APP_MODE=dev',
    'RANDOM_KEY=ghp_123456789012345678901234567890123456',
  ].join('\n');

  const result = protectSecrets(input, { filename: 'stdin.txt' });

  assert.equal(result.redacted, true);
  assert.ok(result.output.includes('APP_MODE=dev'), 'non-secret config is preserved');
  assert.ok(result.output.includes('[REDACTED_GITHUB_TOKEN]'), 'the token value is redacted by its value pattern, regardless of the key name');
  assert.ok(!result.output.includes('ghp_123456789012345678901234567890123456'), 'the raw token must not survive');
  assert.ok(result.findings.some(item => item.id === 'github-token'));
});

test('protectSecrets does not over-redact non-dotenv prose with equals signs', () => {
  const input = 'In docs, we describe A=B as a notation and keep it as prose.';
  const result = protectSecrets(input, { filename: 'README.md' });

  assert.equal(result.redacted, false);
  assert.equal(result.output, input);
});

test('setCustomSecretPatterns redacts org-specific token formats and is reversible', () => {
  // Register a fictional org token shape, then prove it redacts.
  const n = setCustomSecretPatterns([{ name: 'CORP_TOKEN', regex: 'corp-[A-Za-z0-9]{16}' }]);
  assert.equal(n, 1);

  const token = 'corp-ABCDEF0123456789';
  const result = protectSecrets(`internal key ${token} here`);
  assert.equal(result.redacted, true);
  assert.ok(result.output.includes('[REDACTED_CORP_TOKEN]'));
  assert.ok(!result.output.includes(token));
  assert.ok(result.findings.some(item => item.id === 'custom:corp_token'));

  // Clearing removes it — built-ins still work, the custom shape no longer fires.
  setCustomSecretPatterns([]);
  const after = protectSecrets(`internal key ${token} here and ghp_123456789012345678901234567890123456`);
  assert.ok(after.output.includes(token), 'custom pattern no longer applies after reset');
  assert.ok(after.output.includes('[REDACTED_GITHUB_TOKEN]'), 'built-ins still fire');
});

test('setCustomSecretPatterns skips invalid regexes without throwing', () => {
  // An unbalanced group must be ignored, not crash the redactor.
  const n = setCustomSecretPatterns([{ name: 'BAD', regex: '([unclosed' }, { name: 'OK', regex: 'zz-\\d{4}' }]);
  assert.equal(n, 1, 'only the valid pattern compiles');
  const result = protectSecrets('value zz-1234 end');
  assert.ok(result.output.includes('[REDACTED_OK]'));
  setCustomSecretPatterns([]); // reset so other tests are unaffected
});

test('protectSecrets redacts provider tokens that exceed the canonical length (lenient)', () => {
  // A secret must not slip through just for being a few chars longer than spec.
  const longGoogle = 'AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; // 42 chars, > the 39-char canonical
  const longGitlab = 'glpat-' + 'a'.repeat(28);
  const result = protectSecrets(`g=${longGoogle} l=${longGitlab}`);
  assert.equal(result.redacted, true);
  assert.ok(result.output.includes('[REDACTED_GOOGLE_API_KEY]'));
  assert.ok(result.output.includes('[REDACTED_GITLAB_TOKEN]'));
  assert.ok(!result.output.includes('AIzaSy'));
});

// --- scanSecrets (locating scanner) ---------------------------------------

test('scanSecrets locates a secret with line/column and never returns the value', () => {
  const token = 'ghp_' + 'a'.repeat(36);
  const text = `line one\nconst KEY = "${token}";\nline three`;
  const findings = scanSecrets(text);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, 'github-token');
  assert.equal(findings[0].line, 2, 'reports the 1-based line');
  assert.ok(findings[0].column > 1, 'reports a 1-based column');
  assert.equal(findings[0].label, '[REDACTED_GITHUB_TOKEN]', 'label is the masked placeholder');
  // The raw token must never appear in any finding field.
  assert.ok(!JSON.stringify(findings).includes(token), 'scan output leaks no secret material');
});

test('scanSecrets finds multiple secrets across lines and sorts by position', () => {
  const text = [
    'AKIA' + 'A'.repeat(16),
    '',
    'Authorization: Bearer ' + 'x'.repeat(40),
  ].join('\n');
  const findings = scanSecrets(text);

  assert.ok(findings.length >= 2);
  assert.ok(findings.some(f => f.id === 'aws-access-key-id' && f.line === 1));
  assert.ok(findings.some(f => f.line === 3), 'locates the secret on line 3');
  // Sorted by line ascending.
  assert.deepEqual([...findings].map(f => f.line).sort((a, b) => a - b), findings.map(f => f.line));
});

test('scanSecrets collapses overlapping matches to one finding per secret', () => {
  // A JWT-shaped value following "Bearer " matches both bearer-token (whose span
  // starts at "Bearer" and covers the value) and jwt-token (whose span sits
  // inside it); the overlap must collapse to one finding, not two.
  const jwt = 'eyJ' + 'a'.repeat(12) + '.' + 'b'.repeat(12) + '.' + 'c'.repeat(12);
  const findings = scanSecrets(`Bearer ${jwt}`);
  assert.equal(findings.length, 1, 'overlapping matches dedupe to a single finding');
  assert.equal(findings[0].id, 'bearer-token', 'the enclosing span wins');
});

test('scanSecrets treats every assignment in a .env file as a finding', () => {
  const env = 'PORT=3000\nDB_HOST=localhost\n# comment\nPLAIN=hello';
  const findings = scanSecrets(env, { filename: '.env' });
  // Every non-empty, non-comment assignment line is flagged (dotenv convention).
  assert.equal(findings.filter(f => f.id === 'dotenv-assignment').length, 3);
  assert.ok(findings.every(f => f.label === '[REDACTED_ENV_VALUE]'));
});

test('scanSecrets treats .env.example / .sample / .template as placeholder catalogs, not real .env', () => {
  const env = 'BASE_URL=https://staging.your-app.com/\nTEST_USER_EMAIL=qa-robot@your-domain.com';
  // A real .env: every assignment is a finding. An example file: none of these
  // (they are placeholders meant to be committed).
  assert.equal(scanSecrets(env, { filename: '.env' }).length, 2);
  assert.deepEqual(scanSecrets(env, { filename: '.env.example' }), []);
  assert.deepEqual(scanSecrets(env, { filename: 'template/.env.sample' }), []);
  assert.deepEqual(scanSecrets(env, { filename: '.env.template' }), []);
});

test('scanSecrets suppresses placeholder values (variables, angle-brackets, schemes, OBF:, replace-with)', () => {
  const clean = [
    ['--header "Authorization: Bearer $GH_TOKEN"', 'cli.sh'],           // shell variable
    ['  -H "Authorization: Bearer YOUR-TOKEN"', 'SETUP.md'],            // bare scheme word captured
    ['TEST_USER_PASSWORD=<secret-from-password-manager>', 'doc.md'],    // angle-bracket
    ['TEST_USER_PASSWORD=OBF:bXktc2VjcmV0LXBhc3N3b3Jk', 'doc.md'],      // obfuscation marker
    ['API_TOKEN=replace-with-your-token', 'doc.md'],                    // replace-with
    ['CLIENT_SECRET=changeme', 'doc.md'],                              // dummy word
  ];
  for (const [text, filename] of clean) {
    assert.deepEqual(scanSecrets(text, { filename }), [], `should be clean: ${text}`);
  }
});

test('scanSecrets still flags REAL secrets even next to placeholders (no over-suppression)', () => {
  // Real credentials must survive the placeholder guard.
  assert.ok(scanSecrets('token = ghp_1234567890abcdefghijklmnopqrstuvwxyzAB').some(f => f.id === 'github-token'));
  assert.ok(scanSecrets('DB_PASSWORD=Sup3rS3cretRealValue123', { filename: '.env' }).length > 0);
  assert.ok(scanSecrets('AKIA' + 'A'.repeat(16)).some(f => f.id === 'aws-access-key-id'));
  assert.ok(scanSecrets('Authorization: Bearer ' + 'x'.repeat(40)).some(f => f.id === 'bearer-token'));
});

test('scanSecrets returns nothing for clean text and empty input', () => {
  assert.deepEqual(scanSecrets('just some ordinary code with no secrets'), []);
  assert.deepEqual(scanSecrets(''), []);
  assert.deepEqual(scanSecrets(null), []);
});

// --- getSecretPatternSummaries (drives the generated pre-commit hook) ------

test('getSecretPatternSummaries returns serializable {id, source, flags} for every pattern', () => {
  const summaries = getSecretPatternSummaries();
  assert.ok(summaries.length >= 20, 'covers the built-in patterns');
  for (const s of summaries) {
    assert.equal(typeof s.id, 'string');
    assert.equal(typeof s.source, 'string');
    assert.equal(typeof s.flags, 'string');
    // Each summary must reconstitute into a working RegExp.
    assert.doesNotThrow(() => new RegExp(s.source, s.flags));
  }
  assert.ok(summaries.some(s => s.id === 'github-token'));
});

test('getSecretPatternSummaries includes registered custom patterns', () => {
  setCustomSecretPatterns([{ name: 'CORP', regex: 'corp-[0-9]{6}' }]);
  const ids = getSecretPatternSummaries().map(s => s.id);
  assert.ok(ids.some(id => id.startsWith('custom:')), 'org patterns propagate to the hook');
  setCustomSecretPatterns([]); // reset for other tests
});

// --- SEC-04: scanner false-positive reduction (bidirectional) --------------
// Each block: FP forms the scanner must NO LONGER flag, paired with a real
// secret in the SAME shape it MUST still catch (the redaction-integrity guard).

// Bug 1 — key-substring: "token" is a substring of "max_tokens"; the value is a
// bare identifier / number / attribute reference, not a secret.
test('scanSecrets does not flag identifier/number/reference values under a token-substring key', () => {
  assert.deepEqual(scanSecrets('max_tokens=max_tokens'), []);
  assert.deepEqual(scanSecrets('    max_tokens=max_tokens,'), []);      // trailing comma (kwarg)
  assert.deepEqual(scanSecrets('max_tokens=512'), []);                 // number
  assert.deepEqual(scanSecrets('api_key=settings.api_key'), []);       // attribute reference
  assert.deepEqual(scanSecrets('access_token=access_token'), []);      // self-reference, real token word
});

test('scanSecrets STILL flags a real secret in the same env-assignment shape (no miss)', () => {
  // A recognized token under a sensitive key is still located (reported as the
  // enclosing sensitive-env-assignment span, which dedups over the inner token).
  const ghp = 'ghp_' + 'a'.repeat(36);
  const withKey = scanSecrets('API_KEY=' + ghp);
  assert.ok(withKey.length >= 1, 'a recognized token under a sensitive key is still flagged');
  assert.ok(!JSON.stringify(withKey).includes(ghp), 'the raw token never leaks into findings');
  // A high-entropy value only the env heuristic can catch still fires.
  assert.ok(scanSecrets('APP_SECRET=Xk9mP2qR7nL4vT8wZ3aQ6bY1cU5dE0f').some(f => f.id === 'sensitive-env-assignment'));
  assert.ok(scanSecrets('CLIENT_SECRET=Zt7Wq2Lp9Rx4Nv8Kc3Ba6Yd1Ue').some(f => f.id === 'sensitive-env-assignment'));
  // A bare alnum blob with no underscore is NOT treated as a mere identifier.
  assert.ok(scanSecrets('API_TOKEN=supersecretvalue123').some(f => f.id === 'sensitive-env-assignment'));
});

// Bug 2 — auth-header fired on the header NAME (a type/identifier), not a token.
test('scanSecrets does not flag a header name used as an identifier or documented in prose', () => {
  assert.deepEqual(
    scanSecrets('authorization: str | None = Header(default=None, alias="Authorization")', { filename: 'deps.py' }),
    []
  );
  assert.deepEqual(
    scanSecrets('- X-API-Key: machine clients (value must match settings.secret_key)', { filename: 'README.md' }),
    []
  );
});

test('scanSecrets STILL flags a real token after an auth header (no miss)', () => {
  // A high-entropy value straight after the header is still located.
  assert.ok(scanSecrets('X-API-Key: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6').some(f => f.id === 'auth-header'));
  // A Bearer JWT still fires (via bearer/jwt patterns), loose non-canonical shape.
  const jwt = 'eyJ' + 'a'.repeat(12) + '.' + 'b'.repeat(12) + '.' + 'c'.repeat(12);
  assert.ok(scanSecrets('Authorization: Bearer ' + jwt).some(f => f.id === 'bearer-token' || f.id === 'jwt-token'));
});

// Bug 3 — placeholder gaps: ellipsis forms and change-me on .env.example.
test('scanSecrets treats ellipsis and change-me placeholder values as non-secrets', () => {
  const example = [
    'ANTHROPIC_API_KEY=sk-ant-...',
    'VOYAGE_API_KEY=pa-...',
    'GITLAB_TOKEN=glpat-...',
    'GITLAB_WEBHOOK_SECRET=whsec_...',
    'JIRA_TOKEN=...',
    'JIRA_WEBHOOK_SECRET=change-me-jira-webhook-secret',
  ].join('\n');
  assert.deepEqual(scanSecrets(example, { filename: '.env.example' }), []);
  // The same placeholder shapes are also suppressed in ordinary pasted text.
  assert.deepEqual(scanSecrets('GITLAB_TOKEN=glpat-...'), []);
});

test('scanSecrets STILL flags a REAL key accidentally committed to .env.example (no blanket-ignore)', () => {
  const example = [
    'ANTHROPIC_API_KEY=sk-ant-...',        // line 1: placeholder -> suppressed
    'GITHUB_TOKEN=ghp_' + 'a'.repeat(36),  // line 2: real key mistakenly committed
  ].join('\n');
  const findings = scanSecrets(example, { filename: '.env.example' });
  assert.ok(findings.length >= 1, 'a real committed key must still flag, even in an example file');
  assert.ok(findings.every(f => f.line === 2), 'only the real key flags — not the placeholder on line 1');
});

// --- SEC-04 round 2: three residual FP patterns (bidirectional) ------------

// Pattern A — a placeholder followed by an inline comment (the comment became the
// "end" of the value, so the ellipsis check missed it).
test('scanSecrets suppresses placeholder values that carry a trailing inline comment', () => {
  const example = [
    'VOYAGE_API_KEY=pa-...        # For voyage-code-3 embeddings',
    'GITLAB_TOKEN=glpat-...       # Personal access token, read_api scope',
    'JIRA_TOKEN=...               # API token from id.atlassian.com',
  ].join('\n');
  assert.deepEqual(scanSecrets(example, { filename: '.env.example' }), []);
});

test('scanSecrets STILL flags a real value that happens to have a trailing comment (no miss)', () => {
  // Underscore keeps it off the canonical glpat- pattern; the real high-entropy
  // value must still fire via the env heuristic — the comment strip must not hide it.
  const findings = scanSecrets('GITLAB_TOKEN=glpat_realHIGHentropyValue1234  # note');
  assert.ok(findings.some(f => f.id === 'sensitive-env-assignment'), 'a real value with a comment must still flag');
});

// Pattern B — code-expression values (method call, string concatenation).
test('scanSecrets does not flag a code-expression value (call / concatenation)', () => {
  assert.deepEqual(scanSecrets('next_page_token = data.get("nextPageToken")', { filename: 'jira_connector.py' }), []);
  assert.deepEqual(
    scanSecrets('signing_token = "whsec_" + base64.b64encode(b"gitlab-signing-key")', { filename: 'test_webhooks.py' }),
    []
  );
});

test('scanSecrets STILL flags a real secret written as a quoted string literal (carve-out, no miss)', () => {
  // The rule is "expression/call -> suppress", NOT "anything quoted -> suppress":
  // a real secret in a plain string literal must still fire.
  assert.ok(scanSecrets('SERVICE_API_KEY="Xk9mP2realHighEntropyValue1234"').some(f => f.id === 'sensitive-env-assignment'));
  assert.ok(scanSecrets("APP_SECRET='Zt7Wq2realHighEntropyValue56'").some(f => f.id === 'sensitive-env-assignment'));
  // A base64 value (inline +, no spaces) is a literal, not a concatenation.
  assert.ok(scanSecrets('APP_SECRET="Xk9+mP2/realBase64Value1234=="').some(f => f.id === 'sensitive-env-assignment'));
});

// Pattern C — a backtick-wrapped angle-bracket placeholder in Markdown docs.
test('scanSecrets suppresses a backtick-wrapped <placeholder> auth header in docs', () => {
  assert.deepEqual(scanSecrets('- `X-API-Key: <key>` for machine clients', { filename: 'SKILL.md' }), []);
  assert.deepEqual(scanSecrets('Send `Authorization: <token>` on every request.', { filename: 'agent.md' }), []);
});

test('scanSecrets STILL flags a real token, even inside backticks (no miss)', () => {
  // A high-entropy value after the header still fires...
  assert.ok(scanSecrets('X-API-Key: a1b2c3d4e5f6a7b8c9d0e1f2').some(f => f.id === 'auth-header'));
  // ...and a real (loose, non-canonical) JWT in backticks still fires via bearer/jwt.
  const jwt = 'eyJ' + 'a'.repeat(12) + '.' + 'b'.repeat(12) + '.' + 'c'.repeat(12);
  const findings = scanSecrets('`Authorization: Bearer ' + jwt + '`', { filename: 'SKILL.md' });
  assert.ok(findings.some(f => f.id === 'bearer-token' || f.id === 'jwt-token'), 'a real token in backticks must still flag');
});
