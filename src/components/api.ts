export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
let sessionRevision = 0;
let expectedUser: string | null = null;
export function setApiUser(id: string | null) { expectedUser = id; }

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const revision = sessionRevision;
  const headers = new Headers(options?.headers);
  const protectedRequest = !path.startsWith('/api/auth/') || path === '/api/auth/password';
  if (expectedUser && protectedRequest) headers.set('X-Memento-User', expectedUser);
  let response: Response;
  try { response = await fetch(path, { ...options, headers, cache: 'no-store' }); }
  catch { throw new Error('No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && revision === sessionRevision && !options?.signal?.aborted && protectedRequest) window.dispatchEvent(new Event('memento:session-expired'));
    throw new ApiError(data?.error ?? 'No se pudo completar la operación. Inténtalo de nuevo.', response.status);
  }
  if (/^\/api\/auth\/(login|register|recover|logout)$/.test(path)) sessionRevision++;
  return data as T;
}
