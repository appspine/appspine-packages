const assert = require('node:assert/strict');
const test = require('node:test');

test('CommonJS can load the packed public contract', () => {
  const api = require('@appspine/plugin-api');
  const identityFrontend = require('@appspine/identity-core/frontend');
  const oidcFrontend = require('@appspine/oidc-auth/frontend');

  assert.equal(typeof api.definePlugin, 'function');
  assert.equal(typeof identityFrontend, 'object');
  assert.equal(typeof oidcFrontend, 'object');
});
