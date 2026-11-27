import type { Page } from '@playwright/test';

export async function enterSite(page: Page): Promise<void> {
  const start = page.locator('#startup-start');
  await start.click({ timeout: 15000 });
  await page.locator('#startup').waitFor({ state: 'detached' });
}
