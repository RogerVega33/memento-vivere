import { test, expect } from './fixtures';
import type { Memory } from '../../src/domain/types';

test('tags can be saved and edited, and search highlights only matching months', async ({ page }) => {
  const memories: Memory[] = [
    { id: 'office', title: 'Primer día', description: '', tags: ['trabajo', 'empresa A'], year: 2025, month: 1, day: null, precision: 'MONTH', photoIds: ['office-photo'], version: 1, createdAt: '', updatedAt: '' },
    { id: 'trip', title: 'Viajes a Perú', description: 'Una aventura', tags: [], year: 2025, month: 2, day: null, precision: 'MONTH', photoIds: [], version: 1, createdAt: '', updatedAt: '' },
    { id: 'current', title: 'Reunión', description: 'Trabajo en equipo', tags: [], year: 2026, month: 10, day: null, precision: 'MONTH', photoIds: [], version: 1, createdAt: '', updatedAt: '' },
  ];
  const key = (memory: Memory) => `${memory.year}-${String(memory.month).padStart(2, '0')}`;
  const counts = (entries: Memory[]) => entries.reduce<Record<string, number>>((result, memory) => { result[key(memory)] = (result[key(memory)] ?? 0) + 1; return result; }, {});
  const searchRequests: string[] = [];
  const dialogs: string[] = [];
  page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/session') {
      await route.fulfill({ json: { user: { id: 'fixture-user', username: 'fixture-user' } } });
      return;
    }
    if (url.pathname === '/api/state') {
      const query = url.searchParams.get('query') ?? '';
      if (query) searchRequests.push(query);
      const text = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
      const matching = memories.filter(memory => [memory.title, memory.description, ...memory.tags].some(value => text(value).includes(text(query))));
      await route.fulfill({ json: {
        profile: { birthDate: '2000-11-30', horizonYears: 80, createdAt: '' }, today: '2026-10-20',
        monthCounts: counts(memories), memoryCount: memories.length, photoCount: 0,
        ...(query ? { search: { query, monthCounts: counts(matching), memoryCount: matching.length } } : {}),
      } });
    } else if (url.pathname.startsWith('/api/memories') && request.method() === 'DELETE') {
      memories.splice(memories.findIndex(memory => memory.id === url.pathname.split('/').at(-1)), 1);
      await route.fulfill({ json: { deleted: true } });
    } else if (url.pathname.startsWith('/api/memories') && request.method() !== 'GET') {
      const match = request.postData()!.match(/name="payload"\r\n\r\n([^\r\n]+)/);
      const payload = JSON.parse(match![1]);
      const existing = memories.find(memory => memory.id === url.pathname.split('/').at(-1));
      const saved = { ...payload, id: existing?.id ?? 'new', photoIds: payload.retainedPhotoIds, version: (existing?.version ?? 0) + 1, createdAt: '', updatedAt: '' };
      if (existing) Object.assign(existing, saved); else memories.push(saved);
      await route.fulfill({ json: saved });
    } else if (url.pathname === '/api/memories') {
      await route.fulfill({ json: memories.filter(memory => key(memory) === url.searchParams.get('month')) });
    } else await route.abort();
  });

  await page.goto('/');
  await expect(page.locator('.month-cell.has-memories')).toHaveCount(2);
  const currentMonth = page.locator('[data-month="2026-10"]');
  await expect(currentMonth).not.toHaveClass(/has-memories/);
  const orange = await currentMonth.evaluate(cell => getComputedStyle(cell).backgroundColor);
  await page.locator('[data-month="2025-01"]').click();
  await expect(page.locator('.memory-tags li')).toHaveText(['trabajo', 'empresa A']);
  await page.getByRole('button', { name: 'Opciones de Primer día', exact: true }).click();
  const options = page.getByRole('button', { name: 'Opciones de Primer día', exact: true });
  await expect(options).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(options).toHaveAttribute('aria-expanded', 'false');
  await expect(options).toBeFocused();
  await options.click();
  await page.getByRole('heading', { name: 'Primer día', exact: true }).click();
  await expect(options).toHaveAttribute('aria-expanded', 'false');
  await options.focus();
  await options.press('Enter');
  await options.press('Tab');
  await expect(page.getByRole('button', { name: 'Editar Primer día' })).toBeFocused();
  await page.getByRole('button', { name: 'Editar Primer día' }).click();
  await expect(page.getByLabel('Etiquetas', { exact: true })).toHaveAttribute('placeholder', 'Viajes, Familia, Amigos, Logros, Historias, ...');
  await expect(page.getByText('Sin saltos de línea.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Quitar fotografía guardada 1' }).click();
  await page.getByRole('button', { name: 'Guardar recuerdo' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.memory-photo')).toHaveCount(0);
  expect(dialogs).toEqual([]);
  expect(memories[0].photoIds).toEqual([]);
  await page.getByRole('button', { name: 'Añadir recuerdo' }).click();
  await page.getByLabel('Título').fill('Con mis compañeros');
  await page.getByLabel('Etiquetas', { exact: true }).fill(' trabajo , empresa   A, , TRABAJO, ');
  await page.getByRole('button', { name: 'Guardar recuerdo' }).click();
  const added = page.locator('.memory-card').filter({ has: page.getByRole('heading', { name: 'Con mis compañeros', exact: true }) });
  await expect(added.locator('.memory-tags li')).toHaveText(['trabajo', 'empresa A']);
  await page.getByRole('button', { name: 'Opciones de Con mis compañeros', exact: true }).click();
  await page.getByRole('button', { name: 'Editar Con mis compañeros' }).click();
  await expect(page.getByLabel('Etiquetas', { exact: true })).toHaveValue('trabajo, empresa A');
  await page.getByLabel('Etiquetas', { exact: true }).fill('amistad');
  await page.getByRole('button', { name: 'Guardar recuerdo' }).click();
  await expect(added.locator('.memory-tags li')).toHaveText(['amistad']);

  const search = page.getByRole('searchbox', { name: 'Buscar recuerdos' });
  const searchButton = page.getByRole('button', { name: 'Buscar', exact: true });
  const clearSearch = page.getByRole('button', { name: 'Borrar búsqueda', exact: true });
  await expect(clearSearch).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Limpiar búsqueda' })).toHaveCount(0);
  await search.fill('TRABAJO');
  await searchButton.focus();
  await expect(clearSearch).toBeVisible();
  await expect(page.locator('.memory-card')).toHaveCount(2);
  await expect(currentMonth).not.toHaveClass(/has-memories/);
  expect(searchRequests).toEqual([]);
  await search.press('Enter');
  await expect(page.locator('#memory-search-status')).toContainText('2 recuerdos encontrados en 2 meses');
  await expect(page.locator('.month-cell.has-memories')).toHaveCount(2);
  await expect(page.locator('[data-month="2026-10"]')).toHaveClass(/has-memories/);
  expect(await currentMonth.evaluate(cell => getComputedStyle(cell).backgroundColor)).not.toBe(orange);
  await expect(page.locator('[data-month="2025-02"]')).not.toHaveClass(/has-memories/);
  await expect(page.locator('.memory-card')).toHaveCount(1);
  await page.getByRole('checkbox', { name: 'Saltar meses sin recuerdos al navegar' }).check();
  await page.getByRole('button', { name: 'Mes siguiente con recuerdos' }).click();
  await expect(page.locator('.month-cell.selected')).toHaveAttribute('data-month', '2026-10');
  await expect(page.locator('.memory-card h2')).toHaveText('Reunión');

  await search.fill('peru');
  await expect(page.locator('.memory-card h2')).toHaveText('Reunión');
  await expect(currentMonth).toHaveClass(/has-memories/);
  await searchButton.click();
  await expect(clearSearch).toBeVisible();
  await expect(page.locator('#memory-search-status')).toContainText('1 recuerdo encontrado en 1 mes');
  await expect(page.locator('[data-month="2025-02"]')).toHaveClass(/has-memories/);
  await expect(page.locator('.month-cell.has-memories')).toHaveCount(1);
  await expect(currentMonth).not.toHaveClass(/has-memories/);
  await expect(currentMonth).toHaveCSS('background-color', orange);
  await search.fill('empresa A');
  await search.press('Enter');
  await expect(page.locator('#memory-search-status')).toContainText('1 recuerdo encontrado en 1 mes');
  await page.locator('[data-month="2025-01"]').click();
  await expect(page.locator('.memory-card h2')).toHaveText('Primer día');
  await search.fill('sin coincidencias');
  await searchButton.click();
  await expect(page.locator('#memory-search-status')).toContainText('0 recuerdos encontrados en 0 meses');
  await expect(page.locator('.month-cell.has-memories')).toHaveCount(0);
  await expect(page.getByText('No hay recuerdos que coincidan en este mes.')).toBeVisible();
  await clearSearch.click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(clearSearch).toHaveCount(0);
  await expect(page.locator('.month-cell.has-memories')).toHaveCount(2);
  await expect(currentMonth).toHaveCSS('background-color', orange);
  await expect(page.locator('.memory-card')).toHaveCount(2);

  await page.setViewportSize({ width: 375, height: 812 });
  await search.fill('amistad');
  await searchButton.click();
  await expect(added).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Opciones de Con mis compañeros', exact: true }).click();
  await page.getByRole('button', { name: 'Eliminar Con mis compañeros' }).click();
  await page.getByRole('button', { name: 'Eliminar recuerdo', exact: true }).click();
  await expect(page.locator('#memory-search-status')).toContainText('0 recuerdos encontrados');
  await expect(page.locator('.month-cell.has-memories')).toHaveCount(0);
});
