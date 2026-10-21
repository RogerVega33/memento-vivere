import { test, expect } from './fixtures';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('Ir a hoy centers the current life-map cell at every viewport size, even when already selected', async ({ page }) => {
  const user = { id: 'fictional-user', username: 'ficticio' };
  const state = { profile: { birthDate: '1993-11-30', horizonYears: 80, createdAt: '2026-10-20T00:00:00Z' },
    today: '2026-10-20', monthCounts: {}, memoryCount: 0, photoCount: 0 };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/auth/session' ? { user } : path === '/api/state' ? state : [] });
  });
  await page.goto('/');
  const current = page.locator('.month-cell[data-current="true"]');
  await expect(current).toHaveAttribute('aria-pressed', 'true');
  for (const width of [390, 700, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      await page.emulateMedia({ reducedMotion });
      const jump = page.getByRole('button', { name: 'Ir a hoy', exact: true });
      await jump.scrollIntoViewIfNeeded();
      await jump.tap();
      await expect(current).toBeInViewport({ ratio: 1 });
      await expect.poll(async () => {
        const bounds = await current.boundingBox();
        const height = await page.evaluate(() => window.innerHeight);
        return Math.abs(bounds!.y + bounds!.height / 2 - height / 2);
      }).toBeLessThan(3);
      await expect(current).toBeFocused();
      await expect(current).toHaveAttribute('aria-pressed', 'true');
    }
  }
});

test('login has no forced heading focus; Back/Forward navigate account forms without leaving the app', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { user: null } }));
  await page.goto('/');
  const title = page.getByRole('heading', { name: 'Inicia sesión', exact: true });
  await expect(title).toBeVisible();
  await expect(title).not.toBeFocused();
  await page.emulateMedia({ colorScheme: 'light' });
  const themeToggle = page.locator('.header-theme-switch');
  await expect(themeToggle).toHaveCount(1);
  await expect(themeToggle).toHaveAccessibleName('Activar tema oscuro');
  await themeToggle.tap();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(themeToggle).toHaveAccessibleName('Activar tema claro');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await themeToggle.tap();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(themeToggle).toHaveAccessibleName('Activar tema oscuro');
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
    await expect(themeToggle).toHaveAttribute('title', 'Tema claro. Activar tema oscuro');
    await page.goForward();
    await expect(heading).toBeVisible();
    await expect(page.getByLabel(form.heading === 'Crea tu cuenta' ? 'Contraseña' : 'Nueva contraseña', { exact: true })).toHaveValue('');
    expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain('usuario_ficticio');
    await page.getByRole('button', { name: 'Volver a iniciar sesión', exact: true }).tap();
    await expect(title).toBeVisible();
  }
  for (const width of [320, 375, 390, 490, 700]) {
    await page.setViewportSize({ width, height: 844 });
    const header = await page.locator('.site-header').boundingBox();
    const brand = await page.locator('.brand').boundingBox();
    const theme = await page.locator('.header-theme-switch').boundingBox();
    expect(Math.abs(brand!.y + brand!.height / 2 - theme!.y - theme!.height / 2)).toBeLessThan(2);
    expect(brand!.x + brand!.width).toBeLessThanOrEqual(theme!.x);
    await expect(page.locator('.brand small')).toBeHidden();
    expect(Math.abs(header!.x + header!.width - theme!.x - theme!.width)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('a single theme button stays beside the account at every viewport size', async ({ page }) => {
  const user = { id: 'fictional-user', username: 'ficticio' };
  const state = { profile: { birthDate: '2000-01-01', horizonYears: 80, createdAt: '2026-10-20T00:00:00Z' },
    today: '2026-10-20', monthCounts: {}, memoryCount: 0, photoCount: 0 };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/auth/session' ? { user } : path === '/api/state' ? state : [] });
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const account = page.getByRole('button', { name: 'Menú de la cuenta de ficticio' });
  const menu = page.getByRole('menu', { name: 'Mi cuenta' });
  const headerTheme = page.locator('.header-theme-switch');
  for (const width of [320, 390, 700, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(headerTheme).toHaveCount(1);
    await expect(headerTheme).toBeVisible();
    if (width <= 700) await expect(page.locator('.brand small')).toBeHidden();
    else await expect(page.locator('.brand small')).toBeVisible();
    const theme = await headerTheme.boundingBox();
    const avatar = await account.boundingBox();
    expect(theme!.x + theme!.width).toBeLessThanOrEqual(avatar!.x);
    expect(Math.abs(theme!.y + theme!.height / 2 - avatar!.y - avatar!.height / 2)).toBeLessThan(2);
    await account.tap();
    await expect(menu.getByRole('menuitemradio')).toHaveCount(0);
    await expect(menu.locator('.theme-toggle')).toHaveCount(0);
    const bounds = await menu.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await headerTheme.tap();
    await expect(menu).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(headerTheme).toHaveAccessibleName('Activar tema claro');
    await headerTheme.tap();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  }
  await headerTheme.tap();
  await page.reload();
  await expect(headerTheme).toHaveAttribute('title', 'Tema oscuro. Activar tema claro');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await account.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Cambiar contraseña', exact: true })).toBeFocused();
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
    expect(Math.abs(brand!.y + brand!.height / 2 - avatar!.y - avatar!.height / 2)).toBeLessThan(2);
    const theme = await page.locator('.header-theme-switch').boundingBox();
    expect(brand!.x + brand!.width).toBeLessThanOrEqual(theme!.x);
    expect(theme!.x + theme!.width).toBeLessThanOrEqual(avatar!.x);
    expect(Math.abs(theme!.y + theme!.height / 2 - avatar!.y - avatar!.height / 2)).toBeLessThan(2);
    await expect(page.locator('.brand small')).toBeHidden();
    expect(Math.abs(header!.x + header!.width - avatar!.x - avatar!.width)).toBeLessThan(2);
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
