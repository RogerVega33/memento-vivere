import { test, expect } from './fixtures';

test('the photo viewer navigates only within the selected memory', async ({ page }) => {
  const memories = [
    { id: 'trip', title: 'Un viaje', photoIds: ['trip-1', 'trip-2', 'trip-3'] },
    { id: 'portrait', title: 'Un retrato', photoIds: ['portrait-1'] },
    { id: 'gallery', title: 'Galería completa', photoIds: ['gallery-1', 'gallery-2', 'gallery-3', 'gallery-4', 'gallery-5', 'gallery-6'] },
  ].map(memory => ({
    ...memory, description: '', year: 2020, month: 5, day: null,
    precision: 'MONTH', version: 1,
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
        today: '2026-10-19', monthCounts: { '2020-05': 3 }, memoryCount: 3, photoCount: 10,
      } });
    } else if (url.pathname === '/api/memories') {
      await route.fulfill({ json: memories });
    } else if (url.pathname.startsWith('/api/photos/')) {
      await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#78a9d1"/></svg>' });
    } else await route.abort();
  });
  await page.goto('/');
  await page.locator('[data-month="2020-05"]').click();
  const thumbnail = page.getByRole('button', { name: 'Ampliar fotografía 2 de Un viaje', exact: true });
  await thumbnail.click();
  const viewer = page.getByRole('dialog', { name: 'Un viaje', exact: true });
  const previous = viewer.getByRole('button', { name: 'Fotografía anterior' });
  const next = viewer.getByRole('button', { name: 'Fotografía siguiente' });
  await expect(viewer.locator('.lightbox-image')).toHaveAttribute('src', '/api/photos/trip-2');
  await expect(viewer.getByRole('status')).toHaveText('2 de 3');
  await next.click();
  await expect(viewer.locator('.lightbox-image')).toHaveAttribute('src', '/api/photos/trip-3');
  await expect(next).toBeDisabled();
  await expect(viewer.getByRole('status')).toHaveText('3 de 3');
  await previous.click();
  await expect(viewer.locator('.lightbox-image')).toHaveAttribute('src', '/api/photos/trip-2');
  await previous.press('ArrowLeft');
  await expect(viewer.locator('.lightbox-image')).toHaveAttribute('src', '/api/photos/trip-1');
  await expect(previous).toBeDisabled();
  await next.dblclick();
  await expect(viewer.getByRole('status')).toHaveText('3 de 3');
  expect(await viewer.locator('.lightbox-stage').evaluate(stage => {
    const selection = window.getSelection();
    return Boolean(selection && !selection.isCollapsed && selection.rangeCount && selection.getRangeAt(0).intersectsNode(stage));
  })).toBe(false);
  await expect(viewer.locator('.lightbox-image')).toHaveAttribute('draggable', 'false');
  await previous.click();
  await previous.press('ArrowLeft');
  await viewer.getByRole('button', { name: 'Cerrar' }).press('ArrowLeft');
  await expect(viewer.getByRole('status')).toHaveText('1 de 3');
  await viewer.getByRole('button', { name: 'Cerrar' }).press('ArrowRight');
  await expect(viewer.getByRole('status')).toHaveText('2 de 3');
  const appUrl = page.url();
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 812 });
    await viewer.getByRole('button', { name: 'Pantalla completa', exact: true }).click();
    await expect(viewer).toHaveClass(/lightbox-dialog--fullscreen/);
    const fullscreenBounds = await viewer.boundingBox();
    expect(fullscreenBounds!.x).toBe(0);
    expect(fullscreenBounds!.y).toBe(0);
    const contentWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(fullscreenBounds!.width).toBeGreaterThanOrEqual(contentWidth);
    expect(fullscreenBounds!.width).toBeLessThanOrEqual(width);
    expect(fullscreenBounds!.height).toBe(812);
    await expect(viewer.getByRole('status')).toHaveText('2 de 3');
    await next.click();
    await expect(viewer.locator('.lightbox-image')).toHaveAttribute('src', '/api/photos/trip-3');
    await expect(next).toBeDisabled();
    await previous.press('ArrowLeft');
    await expect(viewer.getByRole('status')).toHaveText('2 de 3');
    await previous.click();
    await expect(previous).toBeDisabled();
    await viewer.press('ArrowRight');
    await page.goBack();
    await expect(viewer).toBeVisible();
    await expect(viewer).not.toHaveClass(/lightbox-dialog--fullscreen/);
    await expect(viewer.getByRole('status')).toHaveText('2 de 3');
    expect(page.url()).toBe(appUrl);
  }
  await viewer.getByRole('button', { name: 'Pantalla completa', exact: true }).click();
  await viewer.press('Escape');
  await expect(viewer).not.toHaveClass(/lightbox-dialog--fullscreen/);
  await viewer.getByRole('button', { name: 'Pantalla completa', exact: true }).click();
  await viewer.getByRole('button', { name: 'Salir de pantalla completa', exact: true }).click();
  await expect(viewer).not.toHaveClass(/lightbox-dialog--fullscreen/);
  await viewer.getByRole('button', { name: 'Pantalla completa', exact: true }).click();
  await viewer.evaluate(dialog => dialog.dispatchEvent(new Event('cancel', { cancelable: true })));
  await expect(viewer).toBeVisible();
  await expect(viewer).not.toHaveClass(/lightbox-dialog--fullscreen/);
  await page.goBack();
  await expect(viewer).toHaveCount(0);
  expect(page.url()).toBe(appUrl);
  await expect(page.locator('.month-cell.selected')).toHaveAttribute('data-month', '2020-05');
  await page.locator('[data-month="2020-06"]').click();
  await expect(page.locator('#selected-month-heading')).toHaveText('junio 2020');
  await page.goForward();
  await expect(viewer).toHaveCount(0);
  await expect(page.locator('.month-cell.selected')).toHaveAttribute('data-month', '2020-06');
  await page.locator('[data-month="2020-05"]').click();
  await expect(page.locator('#selected-month-heading')).toHaveText('mayo 2020');
  await thumbnail.click();
  await expect(viewer.getByRole('status')).toHaveText('2 de 3');
  await page.setViewportSize({ width: 375, height: 812 });
  const bounds = await next.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  await viewer.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(thumbnail).toBeFocused();
  await page.getByRole('button', { name: 'Ampliar fotografía 1 de Un retrato', exact: true }).click();
  const portrait = page.getByRole('dialog', { name: 'Un retrato', exact: true });
  await expect(portrait.getByRole('status')).toHaveText('1 de 1');
  await expect(portrait.getByRole('button', { name: /Fotografía (anterior|siguiente)/ })).toHaveCount(0);
  await portrait.getByRole('button', { name: 'Pantalla completa', exact: true }).click();
  await expect(portrait).toHaveClass(/lightbox-dialog--fullscreen/);
  await expect(portrait.getByRole('button', { name: /Fotografía (anterior|siguiente)/ })).toHaveCount(0);
  await portrait.getByRole('button', { name: 'Cerrar' }).press('ArrowRight');
  await expect(portrait.locator('.lightbox-image')).toHaveAttribute('src', '/api/photos/portrait-1');
  await portrait.getByRole('button', { name: 'Cerrar' }).click();
  await expect(portrait).toHaveCount(0);
  expect(page.url()).toBe(appUrl);
  const gallery = page.locator('.memory-card').filter({ has: page.getByRole('heading', { name: 'Galería completa', exact: true }) });
  await expect(gallery.locator('.memory-photo')).toHaveCount(6);
  for (const photo of await gallery.locator('.memory-photo').all()) await expect(photo).toBeVisible();
  await gallery.getByRole('button', { name: 'Ampliar fotografía 6 de Galería completa', exact: true }).click();
  const completeViewer = page.getByRole('dialog', { name: 'Galería completa', exact: true });
  await expect(completeViewer.getByRole('status')).toHaveText('6 de 6');
  await expect(completeViewer.getByRole('button', { name: 'Fotografía siguiente' })).toBeDisabled();
  await completeViewer.getByRole('button', { name: 'Fotografía anterior' }).click();
  await expect(completeViewer.locator('.lightbox-image')).toHaveAttribute('src', '/api/photos/gallery-5');
});
