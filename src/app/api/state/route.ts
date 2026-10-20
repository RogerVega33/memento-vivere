import { requireRepository } from '@/server/auth-http';
import { handle, json } from '@/server/http.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return handle(async () => json(await (await requireRepository(request)).snapshot(new URL(request.url).searchParams.get('query') ?? '')), request);
}
