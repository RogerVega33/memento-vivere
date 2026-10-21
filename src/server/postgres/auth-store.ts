import { randomBytes, randomUUID } from 'node:crypto';
import { RepositoryError } from '../../domain/errors.mjs';
import { credentials, generateRecoveryPhrase, hashSecret, normalizeRecoveryPhrase, tokenHash, verifySecret } from '../auth.mjs';
import type { AuthStore } from '../contracts';
import { Database, sqlCode } from './database';
import { PostgresAuthRepository } from './auth-repository';
import { PostgresLifeRepository } from './life-repository';

const digest = (token: string | null) => token && /^[A-Za-z0-9_-]{43}$/.test(token) ? Buffer.from(tokenHash(token), 'hex') : null;
const freshSession = () => { const token = randomBytes(32).toString('base64url'); return { token, hash: digest(token)! }; };

/** Credential service; repository owns transactions, never the expensive hashes. */
export class PostgresAuthStore implements AuthStore {
  private readonly accounts: PostgresAuthRepository;
  constructor(db: Database, private readonly secrets = { hashSecret, verifySecret, generateRecoveryPhrase }) {
    this.accounts = new PostgresAuthRepository(db);
  }
  async authenticate(token: string | null) {
    const hash = digest(token);
    if (!hash) return null;
    const user = await this.accounts.session(hash);
    return user ? { user, repository: new PostgresLifeRepository(this.accounts.db, user.id, hash) } : null;
  }
  async register(input: unknown, previousToken: string | null = null) {
    const { username, password } = credentials(input, true);
    const passwordHash = await this.secrets.hashSecret(password);
    const recoveryPhrase = this.secrets.generateRecoveryPhrase();
    const recoveryHash = await this.secrets.hashSecret(recoveryPhrase);
    const user = { id: randomUUID(), username };
    const session = freshSession();
    try {
      await this.accounts.register({ ...user, password_hash: passwordHash, recovery_phrase_hash: recoveryHash }, session.hash, digest(previousToken));
    } catch (error) {
      if (sqlCode(error) === '23505') throw new RepositoryError('Ese nombre de usuario ya está en uso.', 409);
      throw error;
    }
    return { user, token: session.token, recoveryPhrase };
  }
  async login(input: unknown, previousToken: string | null = null) {
    const { username, password } = credentials(input, false);
    const account = await this.accounts.find(username);
    const valid = await this.secrets.verifySecret(password, account?.password_hash ?? null);
    if (!account || !valid) {
      if (account) await this.accounts.failedLogin(account.id, account.password_hash);
      throw new RepositoryError('Usuario o contraseña incorrectos.', 401);
    }
    const session = freshSession();
    const user = await this.accounts.login(account.id, account.password_hash, session.hash, digest(previousToken));
    if (!user) throw new RepositoryError('Usuario o contraseña incorrectos.', 401);
    return { user, token: session.token };
  }
  async recover(input: unknown, previousToken: string | null = null) {
    const { username, password } = credentials(input, true);
    const phrase = normalizeRecoveryPhrase((input as Record<string, unknown>).recoveryPhrase);
    const account = await this.accounts.find(username);
    const valid = await this.secrets.verifySecret(phrase ?? '', account?.recovery_phrase_hash ?? null);
    const failure = () => new RepositoryError('Usuario o palabras de recuperación incorrectos.', 401);
    if (!account || !phrase || !valid) throw failure();
    const passwordHash = await this.secrets.hashSecret(password);
    const recoveryPhrase = this.secrets.generateRecoveryPhrase();
    const recoveryHash = await this.secrets.hashSecret(recoveryPhrase);
    const session = freshSession();
    const user = await this.accounts.recover(account.id, account.recovery_phrase_hash, passwordHash, recoveryHash, session.hash, digest(previousToken));
    if (!user) throw failure();
    return { user, token: session.token, recoveryPhrase };
  }
  async changePassword(input: unknown, token: string | null) {
    const account = await this.authenticate(token);
    if (!account) throw new RepositoryError('Tu sesión terminó. Inicia sesión de nuevo.', 401);
    if (!input || typeof input !== 'object' || !('currentPassword' in input) || !('newPassword' in input)
      || typeof input.currentPassword !== 'string' || typeof input.newPassword !== 'string') throw new RepositoryError('Escribe la contraseña actual y la nueva.', 400);
    if (!input.currentPassword || Array.from(input.currentPassword).length > 128) throw new RepositoryError('La contraseña actual no es correcta.', 400);
    const { password } = credentials({ username: account.user.username, password: input.newPassword }, true);
    const current = await this.accounts.byId(account.user.id);
    if (!await this.secrets.verifySecret(input.currentPassword, current?.password_hash ?? null) || !current) throw new RepositoryError('La contraseña actual no es correcta.', 400);
    const passwordHash = await this.secrets.hashSecret(password);
    return this.accounts.changePassword(account.user.id, digest(token)!, current.password_hash, passwordHash);
  }
  async logout(token: string | null) { const hash = digest(token); if (hash) await this.accounts.logout(hash); }
}
