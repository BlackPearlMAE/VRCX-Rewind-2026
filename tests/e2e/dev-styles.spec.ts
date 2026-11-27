import { enterSite } from '../fixtures/startup';
import { expect, test } from '@playwright/test';

test('development preview loads CSS under the content security policy', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174');
  await enterSite(page);
  await expect(page.locator('.landing')).toHaveCSS('display', 'flex');
  await expect(page.locator('main')).toHaveCSS('background-color', 'rgb(41, 41, 41)');
  await expect(page.locator('.gradient-dots')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-style', 'italic');
});