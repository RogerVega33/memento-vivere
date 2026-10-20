import type { AuthStore, SqlPool } from './contracts';
import { Database, lazyPool } from './postgres/database';
import { PostgresAuthStore } from './postgres/auth-store';
import { databaseConfig } from './postgres/config.mjs';

type StorageConfig = Readonly<Record<string, string | undefined>>;
/** Receives explicit values; tests inject a pool and never read environment files. */
export function createStorage(config: StorageConfig, pool?: SqlPool): AuthStore {
  return new PostgresAuthStore(new Database(pool ?? lazyPool(databaseConfig(config))));
}
