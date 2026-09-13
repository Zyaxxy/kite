const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require.resolve('../src/lib/endpoints.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const context = { exports: {}, URL, Error };
vm.runInNewContext(code, context);
const { resolvePublicOrigin } = context.exports;
test('release mobile requests require HTTPS and reject accidentally pasted credentials', () => {
  for (const value of ['http://127.0.0.1:3000', 'http://192.168.0.8:3000', 'https://secret@example.com', 'https://example.com?api_key=secret', 'https://example.com/api/markets', 'javascript:alert(1)']) {
    assert.equal(resolvePublicOrigin(value, false).origin, '', value);
    assert.ok(resolvePublicOrigin(value, false).error);
  }
});
test('development supports private LAN and loopback, not public cleartext origins', () => {
  assert.equal(resolvePublicOrigin('http://192.168.0.8:3000', true).origin, 'http://192.168.0.8:3000');
  assert.equal(resolvePublicOrigin('http://127.0.0.1:3000', true).origin, 'http://127.0.0.1:3000');
  assert.equal(resolvePublicOrigin('http://example.com', true).origin, '');
});
test('HTTPS tunnels normalize to a public origin and missing configuration is actionable', () => {
  assert.equal(resolvePublicOrigin(' https://kite-tunnel.example.com/ ', false).origin, 'https://kite-tunnel.example.com');
  assert.match(resolvePublicOrigin(undefined, false).error, /EXPO_PUBLIC_API_BASE_URL/);
});
