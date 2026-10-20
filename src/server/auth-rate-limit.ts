import { RepositoryError } from '../domain/errors.mjs';

export class AuthLimitError extends RepositoryError {
  constructor(readonly retryAfter: number) {
    super('Demasiados intentos. Espera antes de volver a intentarlo.', 429);
  }
}

/** Fixed windows like Kindle-notes. Success never clears a window. */
export class AuthRateLimiter {
  private readonly ips = new Map<string, { count: number; expires: number }>();
  private readonly names = new Map<string, { count: number; expires: number }>();
  constructor(private readonly now = Date.now, private readonly capacity = 10000) {}
  private consume(map: Map<string, { count: number; expires: number }>, key: string) {
    const now = this.now();
    for (const [name, entry] of map) if (entry.expires <= now) map.delete(name);
    let entry = map.get(key);
    if (!entry) {
      if (map.size >= this.capacity) throw new AuthLimitError(900);
      entry = { count: 0, expires: now + 900000 };
      map.set(key, entry);
    }
    if (entry.count >= 20) throw new AuthLimitError(Math.max(1, Math.ceil((entry.expires - now) / 1000)));
    entry.count++;
  }
  ip(identity: string) { this.consume(this.ips, identity); }
  username(action: 'login' | 'recover', value: unknown) {
    if (value && typeof value === 'object' && 'username' in value && typeof value.username === 'string') {
      this.consume(this.names, `${action}:${value.username.trim().toLowerCase()}`);
    }
  }
}
