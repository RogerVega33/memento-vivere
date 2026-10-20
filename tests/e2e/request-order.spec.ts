import { test, expect } from './fixtures';

test('a delayed manual retry cannot overwrite the newly selected month', async ({ page }) => {
  let currentRequests = 0;
  let releaseOldResponse: () => void = () => {};
  const delayed = new Promise<void>(resolve => { releaseOldResponse = resolve; });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/session') {
      await route.fulfill({ json: { user: { id: 'fixture-user', username: 'fixture-user' } } });
      return;
    }
    if (url.pathname === '/api/state') {
      await route.fulfill({ json: {
        profile: { birthDate: '2000-01-01', horizonYears: 80, createdAt: '' },
        today: '2026-10-20', monthCounts: { '2026-09': 1, '2026-10': 1 }, memoryCount: 2, photoCount: 0,
      } });
      return;
    }
    if (url.pathname !== '/api/memories') { await route.abort(); return; }
    const month = url.searchParams.get('month');
    if (month === '2026-10') {
      currentRequests++;
      if (currentRequests === 1) { await route.fulfill({ status: 503, json: { error: 'Fallo simulado para probar Reintentar.' } }); return; }
      await delayed;
    }
    await route.fulfill({ json: [{
      id: month, title: month === '2026-09' ? 'Septiembre ficticio' : 'Octubre atrasado',
      description: '', tags: [], year: 2026, month: month === '2026-09' ? 9 : 10,
      day: null, precision: 'MONTH', photoIds: [], version: 1, createdAt: '', updatedAt: '',
    }] }).catch(() => { /* The obsolete request may already be cancelled. */ });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect.poll(() => currentRequests).toBe(2);
  await page.getByRole('button', { name: 'Mes anterior', exact: true }).click();
  await expect(page.locator('#selected-month-heading')).toHaveText('septiembre 2026');
  await expect(page.locator('.memory-card h2')).toHaveText('Septiembre ficticio');
  releaseOldResponse();
  await expect(page.locator('.memory-card h2')).toHaveText('Septiembre ficticio');
});
