// Modern Node.js provides DOMException natively on globalThis.
// This shim replaces the deprecated node-domexception library with the native platform implementation.
module.exports = globalThis.DOMException;
