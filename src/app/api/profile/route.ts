import { ValidationError } from '@/domain/errors.mjs';
import { todayInZone, validateNewBirthDate } from '@/domain/dates.mjs';
import { requireRepository } from '@/server/auth-http';
import { readJson, handle, json, requireSameOrigin } from '@/server/http.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function POST(request: Request) {
  return handle(async () => {
    requireSameOrigin(request);
    const repository = await requireRepository(request);
    const payload: unknown = await readJson(request, 4096);
    if (!payload || typeof payload !== 'object' || !('birthDate' in payload) || typeof payload.birthDate !== 'string') throw new ValidationError('Introduce tu fecha de nacimiento.');
    validateNewBirthDate(payload.birthDate, todayInZone());
    await repository.setup(payload.birthDate);
    return json(await repository.snapshot(), 201);
  }, request);
}
