const Module = require('node:module');
const origRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  if (id === 'typescript' || id.startsWith('typescript/')) {
    return origRequire.call(this, id.replace(/^typescript/, '@typescript/typescript6'));
  }
  return origRequire.apply(this, arguments);
};
