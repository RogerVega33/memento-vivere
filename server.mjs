import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import next from 'next';
import { prepareDatabase } from './src/server/postgres/initialize.mjs';
import { networkHandler, trustedProxyIp } from './src/server/request-network.mjs';

/** @param {string[]} args @param {Record<string,string|undefined>} environment */
export function serverOptions(args, environment) {
  let hostname = '0.0.0.0', port = environment.PORT ?? '3000', dev = false, webpack = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dev') dev = true;
    else if (args[i] === '--webpack') webpack = true;
    else if (args[i] === '--hostname' && args[i + 1]) hostname = args[++i];
    else if (args[i] === '--port' && args[i + 1]) port = args[++i];
    else throw new Error(`Argumento de servidor no válido: ${args[i]}`);
  }
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('El puerto HTTP debe estar entre 1 y 65535.');
  return { hostname, port: Number(port), dev, webpack };
}

async function start() {
  const options = serverOptions(process.argv.slice(2), process.env);
  const server = createServer();
  const app = next({ ...options, httpServer: server });
  let proxy;
  try {
    await app.prepare();
    // Next has loaded runtime configuration; validate the proxy and prepare
    // PostgreSQL before opening the public HTTP listener.
    proxy = trustedProxyIp(process.env.TRUSTED_PROXY_IP);
    await prepareDatabase(process.env);
  } catch (error) {
    try { await app.close(); } catch { /* Preserve the startup failure. */ }
    throw error;
  }
  const handle = app.getRequestHandler();
  server.on('request', networkHandler(handle, proxy));
  server.on('error', () => { console.error('No se pudo iniciar el servidor HTTP.'); process.exitCode = 1; void app.close(); });
  server.listen(options.port, options.hostname);
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 25000);
    deadline.unref();
    server.close(() => { void app.close().then(() => { clearTimeout(deadline); }); });
  };
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await start().catch(() => { console.error('No se pudo preparar el servidor. Revisa la configuración y el esquema PostgreSQL.'); process.exitCode = 1; });
}
