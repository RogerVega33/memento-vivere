import { test, expect } from './fixtures';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('login has no forced heading focus; Back/Forward navigate account forms without leaving the app', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { user: null } }));
  await page.goto('/');
  const title = page.getByRole('heading', { name: 'Inicia sesión', exact: true });
  await expect(title).toBeVisible();
  await expect(title).not.toBeFocused();
  await page.getByRole('button', { name: 'Claro', exact: true }).tap();
  for (const form of [
    { button: 'Crea tu cuenta', heading: 'Crea tu cuenta' },
    { button: '¿Olvidaste tu contraseña?', heading: 'Recupera tu cuenta' },
  ]) {
    await page.getByRole('button', { name: form.button, exact: true }).tap();
    const heading = page.getByRole('heading', { name: form.heading, exact: true });
    await expect(heading).toBeFocused();
    await expect(heading).toHaveCSS('outline-style', 'none');
    await page.getByLabel('Nombre de usuario', { exact: true }).fill('usuario_ficticio');
    await page.getByLabel(form.heading === 'Crea tu cuenta' ? 'Contraseña' : 'Nueva contraseña', { exact: true }).fill('contraseña ficticia');
    await page.goBack();
    await expect(title).toBeVisible();
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Claro', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.goForward();
    await expect(heading).toBeVisible();
    await expect(page.getByLabel(form.heading === 'Crea tu cuenta' ? 'Contraseña' : 'Nueva contraseña', { exact: true })).toHaveValue('');
    expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain('usuario_ficticio');
    await page.getByRole('button', { name: 'Volver a iniciar sesión', exact: true }).tap();
    await expect(title).toBeVisible();
  }
  const header = await page.locator('.site-header').boundingBox();
  const theme = await page.locator('.theme-switch').boundingBox();
  expect(Math.abs(header!.x + header!.width - theme!.x - theme!.width)).toBeLessThan(2);
});

test('mobile header places the account by the brand and Back only dismisses password change', async ({ page }) => {
  const user = { id: 'fictional-user', username: 'ficticio' };
  const state = { profile: { birthDate: '2000-01-01', horizonYears: 80, createdAt: '2026-10-20T00:00:00Z' },
    today: '2026-10-20', monthCounts: {}, memoryCount: 0, photoCount: 0 };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/auth/session' ? { user } : path === '/api/state' ? state : [] });
  });
  await page.goto('/');
  const account = page.getByRole('button', { name: 'Menú de la cuenta de ficticio' });
  const dashboard = page.getByRole('heading', { name: 'Tu vida, mes a mes.' });
  await expect(dashboard).toBeVisible();
  for (const width of [320, 390, 700]) {
    await page.setViewportSize({ width, height: 844 });
    const header = await page.locator('.site-header').boundingBox();
    const brand = await page.locator('.brand').boundingBox();
    const avatar = await account.boundingBox();
    const theme = await page.locator('.theme-switch').boundingBox();
    expect(Math.abs(brand!.y + brand!.height / 2 - avatar!.y - avatar!.height / 2)).toBeLessThan(2);
    expect(brand!.x + brand!.width).toBeLessThanOrEqual(avatar!.x);
    expect(theme!.y).toBeGreaterThanOrEqual(brand!.y + brand!.height);
    expect(Math.abs(header!.x + header!.width - theme!.x - theme!.width)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const close of ['back', 'cancel', 'escape', 'x'] as const) {
    await account.tap();
    await page.getByRole('menuitem', { name: 'Cambiar contraseña', exact: true }).tap();
    const dialog = page.getByRole('dialog', { name: 'Cambiar contraseña' });
    await expect(dialog).toBeVisible();
    if (close === 'back') await page.goBack();
    else if (close === 'cancel') await dialog.getByRole('button', { name: 'Cancelar', exact: true }).tap();
    else if (close === 'escape') await page.keyboard.press('Escape');
    else await dialog.getByRole('button', { name: 'Cerrar', exact: true }).tap();
    await expect(dialog).toBeHidden();
    await expect(account).toBeFocused();
    await expect(dashboard).toBeVisible();
    expect(await page.evaluate(() => history.state.mementoPanel.panel)).toBe('closed');
  }
});
