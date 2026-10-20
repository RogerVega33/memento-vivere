import { test, expect } from './fixtures';

test.use({ hasTouch: true });

test('registration and recovery helpers work with hover, focus, click, Escape and touch', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { user: null } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Crea tu cuenta', exact: true }).click();
  const help = page.getByRole('button', { name: 'Ayuda: Nombre de usuario', exact: true });
  const tooltip = page.locator('#username-hint');
  await expect(tooltip).toBeHidden();
  await help.hover();
  await expect(tooltip).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();
  await help.focus();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
  await help.click();
  await expect(tooltip).toBeVisible();
  await help.click();
  await expect(tooltip).toBeHidden();
  await page.getByLabel('Nombre de usuario', { exact: true }).click();
  await page.setViewportSize({ width: 320, height: 780 });
  await help.tap();
  await expect(tooltip).toBeVisible();
  const rect = await tooltip.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(320);
  await page.getByLabel('Nombre de usuario', { exact: true }).tap();
  await expect(tooltip).toBeHidden();
  await page.getByRole('button', { name: 'Volver a iniciar sesión', exact: true }).click();
  await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click();
  await page.getByRole('button', { name: 'Ayuda: Palabras de recuperación', exact: true }).tap();
  await expect(page.locator('#phrase-hint')).toBeVisible();
});

test('help in a narrow native dialog stays onscreen and Escape dismisses help before the dialog', async ({ page }) => {
  const user = { id: 'fictional-user', username: 'ficticio' };
  const state = { profile: { birthDate: '2000-01-01', horizonYears: 80, createdAt: '2026-10-20T00:00:00Z' },
    today: '2026-10-20', monthCounts: {}, memoryCount: 0, photoCount: 0 };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/auth/session' ? { user } : path === '/api/state' ? state : [] });
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Añadir recuerdo', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo recuerdo' });
  const help = dialog.getByRole('button', { name: 'Ayuda: Día', exact: true });
  await help.focus();
  const tooltip = dialog.locator('#memory-day-hint');
  await expect(tooltip).toBeVisible();
  const rect = await tooltip.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(360);
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
