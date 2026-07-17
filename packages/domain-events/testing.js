// Compatibility shim for consumers whose TypeScript config uses "classic"/"node10"
// moduleResolution, which resolves `@appspine/domain-events/testing` by looking for a real
// file at the package root — it does not consult package.json's "exports" map at all (that's
// a "bundler"/"node16"/"nodenext" moduleResolution feature). This file exists purely so that
// resolution strategy finds something here; "exports" still points modern resolvers straight
// at ./dist/testing.js.
module.exports = require('./dist/testing');
