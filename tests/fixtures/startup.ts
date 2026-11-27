import type { Page } from '@playwright/test';

export async function enterSite(page: Page): Promise<void> {
  const start = page.locator('#startup-start');
  await start.click({ timeout: 15000 });
  await page.locator('#startup').waitFor({ state: 'detached' });
}

/** Wait for the import-ready state, then keep the optional image setting as-is. */
export async function dismissImageRecommendation(page: Page): Promise<void> {
  await page.locator('.import-status[data-state="ready"]').waitFor({ state: 'visible' });
  const dialog = page.locator('#image-recommendation-dialog');
  if (await dialog.isVisible()) {
    await dialog.locator('.image-recommendation-continue').click();
    await dialog.waitFor({ state: 'hidden' });
  }
}
