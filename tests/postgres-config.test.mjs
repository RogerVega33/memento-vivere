import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponent } from './component-render.mjs';
const { databaseConfig } = loadComponent('src/server/postgres/config.mjs');
const environment = { PGHOST: 'postgres', PGPORT: '5432', PGDATABASE: 'memento_test', PGUSER: 'fictional_user', PGPASSWORD: ' ficticia:@/# con espacios ' };

test('PostgreSQL uses explicit PG variables and keeps the password intact without URL encoding', () => {
  const config = databaseConfig(environment);
  assert.equal(config.host, 'postgres');
  assert.equal(config.port, 5432);
  assert.equal(config.database, 'memento_test');
  assert.equal(config.user, 'fictional_user');
  assert.equal(config.password, environment.PGPASSWORD);
  assert.equal(config.max, 5);
  assert.equal(config.ssl, false);
});

test('missing connection variables and malformed ports fail before loading a driver or connecting', () => {
  for (const key of Object.keys(environment)) assert.throws(() => databaseConfig({ ...environment, [key]: '' }), new RegExp(key));
  for (const PGPORT of ['0', '65536', '5432junk', '5.5', '-1']) assert.throws(() => databaseConfig({ ...environment, PGPORT }), /PGPORT/);
});
