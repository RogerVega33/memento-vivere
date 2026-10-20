import { ValidationError } from '@/domain/errors.mjs';
import { requireRepository } from '@/server/auth-http';
import { handle, json } from '@/server/http.mjs';
import { saveMemory } from '@/server/save-memory';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return handle(async () => {
    const repository = await requireRepository(request);
    const month = new URL(request.url).searchParams.get('month');
    if (!month) throw new ValidationError('Selecciona un mes.');
    return json(await repository.listMonth(month));
  }, request);
}
export function POST(request: Request) { return handle(async () => json(await saveMemory(request), 201), request); }
