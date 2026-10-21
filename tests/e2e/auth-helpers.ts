import { expect, type Page } from '@playwright/test';

export async function register(page: Page) {
  const username = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = 'una contraseña ficticia y larga';
  await page.getByRole('button', { name: 'Crea tu cuenta', exact: true }).click();
  await page.getByLabel('Nombre de usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByLabel('Confirmar contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Guarda tus palabras de recuperación' })).toBeVisible();
  await expect(page.locator('.recovery-words li')).toHaveCount(8);
  const words = (await page.locator('.recovery-words strong').allTextContents()).join(' ');
  await saveWords(page);
  return { username, password, words };
}

export async function saveWords(page: Page) {
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Ya guardé mi usuario y las ocho palabras en orden.' }).check();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
}

export async function login(page: Page, username: string, password: string) {
  await page.getByLabel('Nombre de usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: /^Menú de la cuenta de / }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
}
