// Compatibility shim for consumers whose TypeScript config uses "classic"/"node10"
// moduleResolution, which resolves `@appspine/plugin-api/runtime` by looking for a real file at
// the package root — it does not consult package.json's "exports" map at all. Modern resolvers are
// still routed straight at ./dist/runtime by "exports".
module.exports = require('./dist/runtime');
