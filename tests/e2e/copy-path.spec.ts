import { enterSite } from '../fixtures/startup';
import { expect, test } from '@playwright/test';

test('copy button copies the exact database path without quotes', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: {
      writeText: async (text: string) => { document.documentElement.dataset.copiedPath = text; },
    } });
  });
  await page.goto('/');
  await enterSite(page);
  await expect(page.locator('#database-path')).toHaveText('%AppData%\\VRCX\\VRCX.sqlite3');
  const before = await page.getByRole('button', { name: 'Select your VRCX database', exact: true }).boundingBox();
  await page.getByRole('button', { name: 'Copy VRCX database path' }).click();
  expect(await page.getByRole('button', { name: 'Select your VRCX database', exact: true }).boundingBox()).toEqual(before);
  await expect(page.locator('html')).toHaveAttribute('data-copied-path', '%AppData%\\VRCX\\VRCX.sqlite3');
  await expect(page.locator('.copy-feedback')).toHaveText('Database path copied.');
});

test('clipboard failure leaves the path selected for manual copying', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: {
      writeText: async () => { throw new Error('Clipboard unavailable'); },
    } });
  });
  await page.goto('/');
  await enterSite(page);
  const before = await page.getByRole('button', { name: 'Select your VRCX database', exact: true }).boundingBox();
  await page.getByRole('button', { name: 'Copy VRCX database path' }).click();
  expect(await page.getByRole('button', { name: 'Select your VRCX database', exact: true }).boundingBox()).toEqual(before);
  await expect(page.locator('.copy-feedback')).toContainText('Path selected.');
  await expect(page.locator('#database-path')).toBeFocused();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('%AppData%\\VRCX\\VRCX.sqlite3');
});