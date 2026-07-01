import test from 'node:test';
import assert from 'node:assert/strict';
import { compressOutline } from './outline.js';

test('outline keeps signatures/types/imports and drops function bodies (TS)', () => {
  const ts = [
    "import { Order } from './types';",
    'export const TAX = 0.2;',
    '/** doc */',
    'export class PaymentService {',
    '  private gateway: Gateway;',
    '  async charge(order: Order): Promise<Receipt> {',
    '    const total = order.items.reduce((s, i) => s + i.price, 0);',
    '    if (total <= 0) {',
    "      throw new Error('empty');",
    '    }',
    '    return this.gateway.submit(total);',
    '  }',
    '}',
    'function helper(x: number) {',
    '  return x * 2;',
    '}',
  ].join('\n');

  const r = compressOutline(ts, 'PaymentService.ts');

  // Kept: imports, top-level const, doc, class header, field, signatures.
  assert.match(r.output, /import \{ Order \}/);
  assert.match(r.output, /export const TAX/);
  assert.match(r.output, /\/\*\* doc \*\//);
  assert.match(r.output, /export class PaymentService \{/);
  assert.match(r.output, /private gateway: Gateway;/);
  assert.match(r.output, /async charge\(order: Order\): Promise<Receipt> \{ \/\* … \*\/ \}/);
  assert.match(r.output, /function helper\(x: number\) \{ \/\* … \*\/ \}/);

  // Dropped: body statements (incl. control flow inside the body).
  assert.doesNotMatch(r.output, /order\.items\.reduce/);
  assert.doesNotMatch(r.output, /throw new Error/);
  assert.doesNotMatch(r.output, /return x \* 2/);

  assert.ok(r.afterTokens < r.beforeTokens);
  assert.equal(r.language, 'ts');
});

test('outline does not collapse control-flow or class/interface blocks', () => {
  const ts = [
    'interface Config {',
    '  retries: number;',
    '}',
    'export function run() {',
    '  for (const x of items) {',
    '    doThing(x);',
    '  }',
    '}',
  ].join('\n');

  const r = compressOutline(ts, 'config.ts');
  // interface body (a member list) is kept, not collapsed
  assert.match(r.output, /interface Config \{/);
  assert.match(r.output, /retries: number;/);
  // the function body (and the for-loop inside it) is collapsed away
  assert.match(r.output, /export function run\(\) \{ \/\* … \*\/ \}/);
  assert.doesNotMatch(r.output, /doThing/);
});

test('outline does not leak braces from regex char classes or strings in bodies', () => {
  const code = [
    'function stripTrailingCommas(text) {',
    "  return text.replace(/,(\\s*[}\\]])/g, '$1');",
    '}',
    'function next() {',
    '  return 1;',
    '}',
  ].join('\n');

  const r = compressOutline(code, 'x.js');

  // Both functions collapse cleanly; the `}` inside the regex char class must not
  // close the body early and leak a stray brace.
  assert.match(r.output, /function stripTrailingCommas\(text\) \{ \/\* … \*\/ \}/);
  assert.match(r.output, /function next\(\) \{ \/\* … \*\/ \}/);
  assert.doesNotMatch(r.output, /^\}$/m);
});

test('outline handles Python defs and classes by indentation', () => {
  const py = [
    'import os',
    'API = "v1"',
    'class Service:',
    '    def charge(self, order):',
    '        total = sum(i.price for i in order.items)',
    '        return total',
    '    def refund(self, id):',
    '        return self._gateway.reverse(id)',
    'def helper(x):',
    '    return x * 2',
  ].join('\n');

  const r = compressOutline(py, 'service.py');
  assert.match(r.output, /import os/);
  assert.match(r.output, /API = "v1"/);
  assert.match(r.output, /class Service:/);
  assert.match(r.output, /def charge\(self, order\): \.\.\./);
  assert.match(r.output, /def refund\(self, id\): \.\.\./);
  assert.match(r.output, /def helper\(x\): \.\.\./);
  assert.doesNotMatch(r.output, /sum\(i\.price/);
  assert.doesNotMatch(r.output, /return x \* 2/);
});

test('outline falls back to code compression for unsupported languages', () => {
  const text = 'SELECT *\n-- a comment\nFROM users;\n';
  const r = compressOutline(text, 'query.sql');
  // Should not throw and should return something (delegated to the code compressor).
  assert.equal(typeof r.output, 'string');
  assert.ok(r.beforeTokens > 0);
});
