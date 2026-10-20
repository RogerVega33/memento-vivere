import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { errorDetails, log } from './logger.mjs';

/** Next.js invokes instrumentation once for each server process. */
export async function registerServerLogging() {
  const scope = /** @type {typeof globalThis & {mementoLoggingReady?: boolean}} */ (globalThis);
  if (scope.mementoLoggingReady) return;
  scope.mementoLoggingReady = true;
  log('info', 'server.started', { node: process.version, heicDecoder: 'native-libheif' });
  for (const executable of ['/usr/bin/prlimit', '/usr/bin/heif-thumbnailer']) {
    try { await access(executable, constants.X_OK); }
    catch { log('error', 'server.dependency.missing', { executable }); }
  }
  // Monitor without replacing Node's normal crash behavior.
  process.on('uncaughtExceptionMonitor', (error, origin) => log('error', 'server.crashed', { origin, error: errorDetails(error) }));
  process.on('warning', warning => log('warn', 'server.warning', { error: errorDetails(warning) }));
  process.once('exit', code => log(code ? 'error' : 'info', 'server.exited', { code }));
}
