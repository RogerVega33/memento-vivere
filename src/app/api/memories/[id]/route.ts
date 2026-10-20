import { ValidationError } from '@/domain/errors.mjs';
import { requireRepository } from '@/server/auth-http';
import { readJson, handle, json, requireSameOrigin } from '@/server/http.mjs';
import { saveMemory } from '@/server/save-memory';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export function PATCH(request: Request, context: Context) {
  return handle(async () => json(await saveMemory(request, (await context.params).id)), request);
}
export function DELETE(request: Request, context: Context) {
  return handle(async () => {
    requireSameOrigin(request);
    await requireRepository(request);
    const data: unknown = await readJson(request, 4096);
    if (!data || typeof data !== 'object' || !('version' in data) || !Number.isInteger(data.version)) throw new ValidationError('La solicitud no es válida.');
    const { id } = await context.params;
    await (await requireRepository(request)).delete(id, Number(data.version));
    return json({ deleted: true });
  }, request);
}
