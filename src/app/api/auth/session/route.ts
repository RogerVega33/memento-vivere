import { auth } from '@/server/store';
import { sessionToken } from '@/server/auth-http';
import { handle, json } from '@/server/http.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return handle(async () => json({ user: (await auth.authenticate(sessionToken(request)))?.user ?? null }), request);
}
