import type { AuthStore } from './contracts';
import { AuthRateLimiter } from './auth-rate-limit';
import { networkContext } from './request-network.mjs';
import { RepositoryError } from '../domain/errors.mjs';
import { createStorage } from './storage';

// Shared by route bundles. Configuration and the driver remain lazy until use.
const scope = globalThis as typeof globalThis & { mementoPostgresAuth?: AuthStore; mementoAuthLimits?: AuthRateLimiter };
function current() {
  if (!scope.mementoPostgresAuth) {
    scope.mementoPostgresAuth = createStorage({ PGHOST: process.env.PGHOST, PGPORT: process.env.PGPORT,
      PGDATABASE: process.env.PGDATABASE, PGUSER: process.env.PGUSER, PGPASSWORD: process.env.PGPASSWORD });
  }
  return scope.mementoPostgresAuth;
}
export const auth: AuthStore = {
  authenticate: token => current().authenticate(token),
  register: (input, previous) => current().register(input, previous),
  login: (input, previous) => current().login(input, previous),
  recover: (input, previous) => current().recover(input, previous),
  changePassword: (input, token) => current().changePassword(input, token),
  logout: token => current().logout(token),
};
export const authLimits = scope.mementoAuthLimits ??= new AuthRateLimiter();
export function requestIdentity() {
  const context = networkContext();
  if (!context) throw new RepositoryError('La aplicación debe iniciarse mediante su servidor HTTP.', 503);
  return context.ip;
}
