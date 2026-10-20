import { auth } from '@/server/store';
import { limitAuthRequest, requireAccount, sessionToken } from '@/server/auth-http';
import { handle, json, readJson, requireSameOrigin } from '@/server/http.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function POST(request: Request) {
  return handle(async () => {
    requireSameOrigin(request);
    limitAuthRequest();
    await requireAccount(request);
    const input = await readJson(request, 4096);
    await requireAccount(request);
    return json({ user: await auth.changePassword(input, sessionToken(request)) });
  }, request);
}
