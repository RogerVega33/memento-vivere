import { auth, authLimits, requestIdentity } from './store';
import { networkContext } from './request-network.mjs';
import { SESSION_SECONDS } from './auth.mjs';
import { RepositoryError } from '@/domain/errors.mjs';
import { handle, json, readJson, requireSameOrigin } from './http.mjs';

export const SESSION_COOKIE = 'mv_session';

export function sessionToken(request: Request): string | null {
  const matches = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(SESSION_COOKIE + '='));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(SESSION_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export async function requireAccount(request: Request) {
  const account = await auth.authenticate(sessionToken(request));
  if (!account) throw new RepositoryError('Tu sesión terminó. Inicia sesión de nuevo.', 401);
  // A cookie can change in another tab while a form for the old account is open.
  const expectedUser = request.headers.get('x-memento-user');
  if (expectedUser && expectedUser !== account.user.id) throw new RepositoryError('La cuenta cambió en otra pestaña. Inicia sesión de nuevo.', 401);
  return account;
}

export async function requireRepository(request: Request) { return (await requireAccount(request)).repository; }

export function limitAuthRequest() { authLimits.ip(requestIdentity()); }

export function sessionCookie(request: Request, token: string | null) {
  const secure = networkContext()?.secure ?? new URL(request.url).protocol === 'https:';
  return `${SESSION_COOKIE}=${token ?? ''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? SESSION_SECONDS : 0}${secure ? '; Secure' : ''}`;
}

export function authenticateRequest(request: Request, action: 'register' | 'login' | 'recover') {
  return handle(async () => {
    requireSameOrigin(request);
    limitAuthRequest();
    const input = await readJson(request, 4096);
    if (action !== 'register') authLimits.username(action, input);
    const result = await auth[action](input, sessionToken(request));
    const response = json({ user: result.user, ...('recoveryPhrase' in result ? { recoveryPhrase: result.recoveryPhrase } : {}) }, action === 'register' ? 201 : 200);
    response.headers.set('Set-Cookie', sessionCookie(request, result.token));
    return response;
  }, request);
}
