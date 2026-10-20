/** @typedef {Readonly<Record<string,string|undefined>>} Environment */
/** @typedef {{host:string, port:number, database:string, user:string, password:string,
 * ssl:false, max:number, connectionTimeoutMillis:number, idleTimeoutMillis:number, application_name:string}} DatabaseConfig */

/** @param {Environment} environment @param {string} key */
function required(environment, key) {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`Configura ${key} antes de iniciar la aplicación.`);
  return value;
}
/** Explicit values only: no dotenv, inherited driver defaults or connection URL.
 * @param {Environment} environment @returns {DatabaseConfig} */
export function databaseConfig(environment) {
  const host = required(environment, 'PGHOST');
  const port = required(environment, 'PGPORT');
  const database = required(environment, 'PGDATABASE');
  const user = required(environment, 'PGUSER');
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('PGPORT debe estar entre 1 y 65535.');
  const password = environment.PGPASSWORD;
  if (!password) throw new Error('Configura PGPASSWORD antes de iniciar la aplicación.');
  return { host, port: Number(port), database, user, password, ssl: false, max: 5,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, application_name: 'memento-vivere' };
}
