import { test, expect } from './fixtures';

test('month arrows stay in place and optionally skip empty months', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  const months = ['2001-01', '2013-05', '2025-09'];
  const memories = months.map((month, index) => ({
    id: `memory-${index}`, title: `Recuerdo ${index + 1}`, description: '',
    year: Number(month.slice(0, 4)), month: Number(month.slice(5)), day: null,
    precision: 'MONTH', photoIds: [], version: 1,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  }));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/session') {
      await route.fulfill({ json: { user: { id: 'fixture-user', username: 'fixture-user' } } });
      return;
    }
    if (url.pathname === '/api/state') {
      await route.fulfill({ json: {
        profile: { birthDate: '2000-11-30', horizonYears: 80, createdAt: '2026-01-01T00:00:00Z' },
        today: '2026-10-19', monthCounts: Object.fromEntries(months.map(month => [month, 1])),
        memoryCount: memories.length, photoCount: 0,
      } });
    } else if (url.pathname === '/api/memories') {
      const index = months.indexOf(url.searchParams.get('month') ?? '');
      await route.fulfill({ json: index < 0 ? [] : [memories[index]] });
    } else await route.abort();
  });
  await page.goto('/');
  await expect(page.locator('.month-cell.selected')).toHaveAttribute('data-month', '2026-10');
  await expect(page.locator('#selected-month-heading')).toHaveText('octubre 2026');
  await page.locator('[data-month="2013-05"]').click();
  const next = page.getByRole('button', { name: 'Mes siguiente', exact: true });
  const initial = await next.boundingBox();
  expect(initial).not.toBeNull();
  for (const month of ['junio', 'julio', 'agosto', 'septiembre', 'octubre']) {
    await next.click();
    await expect(page.locator('#selected-month-heading')).toHaveText(`${month} 2013`);
    const position = await next.boundingBox();
    expect(position!.x).toBeCloseTo(initial!.x, 1);
    expect(position!.y).toBeCloseTo(initial!.y, 1);
    await expect(next).toBeFocused();
  }
  await page.getByRole('checkbox', { name: 'Saltar meses sin recuerdos al navegar' }).check();
  const nextMemory = page.getByRole('button', { name: 'Mes siguiente con recuerdos', exact: true });
  const previousMemory = page.getByRole('button', { name: 'Mes anterior con recuerdos', exact: true });
  await nextMemory.click();
  await expect(page.locator('.month-cell.selected')).toHaveAttribute('data-month', '2025-09');
  await expect(nextMemory).toBeDisabled();
  await previousMemory.click();
  await expect(page.locator('#selected-month-heading')).toHaveText('mayo 2013');
  await previousMemory.click();
  await expect(page.locator('#selected-month-heading')).toHaveText('enero 2001');
  await expect(previousMemory).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Saltar meses sin recuerdos al navegar' })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Saltar meses sin recuerdos al navegar' }).uncheck();
  await next.click();
  await expect(page.locator('#selected-month-heading')).toHaveText('febrero 2001');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.reload();
  await expect(page.locator('.month-cell.selected')).toHaveAttribute('data-month', '2026-10');
  await expect(page.locator('#selected-month-heading')).toHaveText('octubre 2026');
});
