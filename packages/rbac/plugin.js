// Compatibility shim for consumers whose TypeScript config uses "classic"/"node10"
// moduleResolution, which resolves `@appspine/rbac/plugin` by looking for a real file at
// the package root — it does not consult package.json's "exports" map at all.
module.exports = require('./dist/plugin');
