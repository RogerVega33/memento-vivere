import { cp, mkdir, mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// Next automatically reads .env files. Validate only an explicit source copy,
// outside the user's checkout, without copying or opening any environment file.
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const needsDatabase = ['dev', 'start'].includes(process.argv[2]);
// Browser tests require an explicitly authorized isolated database. Never
// inherit the application's connection settings or load local environment files.
const testKeys = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const testDatabase = {};
if (needsDatabase) {
  if (process.env.MEMENTO_ALLOW_ISOLATED_DATABASE_TESTS !== '1') throw new Error('Las pruebas de navegador requieren MEMENTO_ALLOW_ISOLATED_DATABASE_TESTS=1 y una base aislada preparada.');
  for (const key of testKeys) {
    const value = process.env[`MEMENTO_TEST_${key}`];
    if (!value) throw new Error(`Configura MEMENTO_TEST_${key} para la base aislada de pruebas.`);
    testDatabase[key] = value;
  }
}
const directory = await mkdtemp(join(tmpdir(), 'memento-validation-'));
const extensions = new Set(['.ts', '.tsx', '.mjs', '.css', '.json', '.svg', '.png', '.jpg', '.gif', '.webp', '.ico']);
async function copySources(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (/(^|\.)env($|\.)/.test(entry.name) || entry.name === 'node_modules' || entry.name === '.git') continue;
    if (entry.isDirectory()) await copySources(join(source, entry.name), join(destination, entry.name));
    else if (entry.isFile() && extensions.has(extname(entry.name))) await cp(join(source, entry.name), join(destination, entry.name));
  }
}
let child;
try {
  for (const file of ['package.json', 'tsconfig.json', 'next-env.d.ts', 'next.config.mjs', 'server.mjs']) await cp(join(project, file), join(directory, file));
  await mkdir(join(directory, 'db'), { recursive: true });
  await cp(join(project, 'db/001_initial.sql'), join(directory, 'db/001_initial.sql'));
  for (const name of ['src', 'public']) await copySources(join(project, name), join(directory, name));
  await symlink(join(project, 'node_modules'), join(directory, 'node_modules'), 'dir');
  const command = needsDatabase ? [join(directory, 'server.mjs'), ...(process.argv[2] === 'dev' ? ['--dev'] : []), ...process.argv.slice(3)]
    : [join(project, 'node_modules/next/dist/bin/next'), ...process.argv.slice(2)];
  child = spawn(process.execPath, command, {
    cwd: directory, stdio: 'inherit',
    // Build runs without database configuration. Browser tests receive only
    // explicit MEMENTO_TEST_PG* values and a local trusted proxy for fake IPs.
    env: { PATH: '/usr/bin:/bin', ...testDatabase, TRUSTED_PROXY_IP: '127.0.0.1', NEXT_TELEMETRY_DISABLED: '1', TZ: 'America/Guayaquil' },
  });
  const stop = () => child?.kill('SIGTERM');
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  const code = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolveExit(code ?? 1));
  });
  process.exitCode = code;
} finally { await rm(directory, { recursive: true, force: true }); }
