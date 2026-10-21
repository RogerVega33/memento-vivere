import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { log } from './logger.mjs';

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
  process.on('warning', warning => log('warn', 'server.warning', { error: warning }));
  process.once('exit', code => log(code ? 'error' : 'info', 'server.exited', { code }));
}

/** Preserve fatal exit behavior without Node printing an unsanitized stack.
 * Installed only by the HTTP entry point, never by builds or route imports.
 * @param {Pick<NodeJS.Process, 'on'|'exit'>} [target] */
export function registerFatalLogging(target = process) {
  target.on('uncaughtException', (error, origin) => {
    log('error', 'server.crashed', { error, origin });
    target.exit(1);
  });
  target.on('unhandledRejection', error => {
    log('error', 'server.crashed', { error, origin: 'unhandledRejection' });
    target.exit(1);
  });
}
