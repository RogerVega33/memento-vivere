import { auth } from '@/server/store';
import { sessionToken, sessionCookie } from '@/server/auth-http';
import { handle, json, requireSameOrigin } from '@/server/http.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function POST(request: Request) {
  return handle(async () => {
    requireSameOrigin(request);
    await auth.logout(sessionToken(request));
    const response = json({ user: null });
    response.headers.set('Set-Cookie', sessionCookie(request, null));
    return response;
  }, request);
}
