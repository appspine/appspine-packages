const assert = require('node:assert/strict');
const test = require('node:test');

test('CommonJS can load the packed backend public contract', () => {
  const api = require('@appspine/plugin-api');

  assert.equal(typeof api.definePlugin, 'function');
});
