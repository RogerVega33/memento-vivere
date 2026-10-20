import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const cache = new Map();

// Compile local components for server rendering without starting Next.js,
// executing effects, reading environment files or calling an API.
export function loadComponent(file) {
  const absolute = resolve(project, file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const module = { exports: {} };
  cache.set(absolute, module);
  // Route tests use explicit method stubs and scripted SQL pools. Never consult
  // real storage configuration, load a PostgreSQL driver or open a socket.
  if (absolute === resolve(project, 'src/server/store.ts')) {
    const unexpected = async () => { throw new Error('Configure an explicit auth stub in this test.'); };
    module.exports = { auth: Object.fromEntries(['authenticate', 'register', 'login', 'recover', 'changePassword', 'logout'].map(name => [name, unexpected])),
      authLimits: { ip() {}, username() {} }, requestIdentity: () => 'fictional-client' };
    return module.exports;
  }
  const output = ts.transpileModule(readFileSync(absolute, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const localRequire = name => {
    if (name.endsWith('.json')) return require(resolve(dirname(absolute), name));
    if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
    const base = name.startsWith('@/') ? resolve(project, 'src', name.slice(2)) : resolve(dirname(absolute), name);
    const dependency = [base, base + '.tsx', base + '.ts', base + '.mjs'].find(existsSync);
    if (!dependency) throw new Error(`Missing local test dependency: ${name}`);
    return loadComponent(dependency);
  };
  new Function('module', 'exports', 'require', output)(module, module.exports, localRequire);
  return module.exports;
}
