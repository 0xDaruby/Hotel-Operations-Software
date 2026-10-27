import test from 'node:test';
import assert from 'node:assert/strict';
import { safeNextPath } from './safe-next-path';

test('post-login redirects reject external, backslash, encoded-control and unknown targets', () => {
  for (const value of [undefined, null, ['//outside.test'], '//outside.test', '/\\outside.test', '\\outside.test',
    'https://outside.test', '/%5coutside.test', '/%2f%2foutside.test', '/overview\n', '/overview?x=%0a',
    '/overview?x=%5c', '/unknown-page', '/overview/' + 'a'.repeat(2049)]) {
    assert.equal(safeNextPath(value), '/overview');
  }
});

test('post-login redirects retain known app paths and safe query strings', () => {
  for (const path of ['/', '/rooms', '/staff', '/set-password', '/payments?date=2026-10-27', '/stays#active']) {
    assert.equal(safeNextPath(path), path);
  }
});
