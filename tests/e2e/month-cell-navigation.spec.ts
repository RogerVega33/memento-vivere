import { test, expect } from './fixtures';

test('a first click selects the month; another click opens its memories below the map', async ({ page }) => {
  const user = { id: 'fictional-user', username: 'ficticio' };
  const state = { profile: { birthDate: '1993-11-30', horizonYears: 80, createdAt: '2026-10-20T00:00:00Z' },
    today: '2026-10-20', monthCounts: {}, memoryCount: 0, photoCount: 0 };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/auth/session' ? { user } : path === '/api/state' ? state : [] });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.locator('.month-cell[data-current="true"]')).toHaveAttribute('aria-pressed', 'true');
    const cell = page.locator('.month-cell[data-month="2005-05"]');
    await cell.scrollIntoViewIfNeeded();
    const beforeSelection = await page.evaluate(() => window.scrollY);
    await cell.click();
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
    const heading = page.locator('#selected-month-heading');
    await expect(heading).toHaveText('mayo 2005');
    expect(Math.abs(await page.evaluate(() => window.scrollY) - beforeSelection)).toBeLessThan(2);

    await cell.click();
    await expect(heading).toBeInViewport({ ratio: 1 });
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeSelection);

    await page.getByRole('button', { name: 'Pantalla completa', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'El mapa de tu vida' });
    await dialog.locator('.month-cell[data-month="2005-05"]').click();
    await expect(dialog).toHaveCount(0);
    await expect(heading).toHaveText('mayo 2005');
    await expect(heading).toBeInViewport({ ratio: 1 });
  }
});
