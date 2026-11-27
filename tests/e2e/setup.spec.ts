import { enterSite, dismissImageRecommendation } from '../fixtures/startup';
import { databaseFixture } from '../fixtures/database';
import { expect, test } from '@playwright/test';

test('landing loads without runtime errors or external requests', async ({ page }) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4173') externalRequests.push(request.url());
  });
  await page.goto('/');
  await enterSite(page);
  await expect(page.getByRole('heading', { name: 'VRCX REWIND 2026', exact: true })).toBeVisible();
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Select your VRCX database' }).click();
  await (await picker).setFiles({ name: 'VRCX.sqlite3', mimeType: 'application/octet-stream', buffer: await databaseFixture() });
  await dismissImageRecommendation(page);
  await expect(page.getByRole('status')).toContainText('checked. Ready for your rewind.');
  await page.getByRole('link', { name: /More Information/ }).click();
  await expect(page).toHaveURL(/#site-information$/);
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
  test(`layout fits ${viewport.width}px screen`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await enterSite(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('.import-panel .demo-button')).toBeVisible();
    await expect(page.locator('.import-panel #allow-vrchat-images')).not.toBeChecked();
    await expect(page.locator('.landing')).not.toContainText('Friend image test');
    await expect(page.locator('.landing')).not.toContainText('World image test');
    await expect(page.locator('.landing')).not.toContainText('Saved local recap');
    if (viewport.width === 1920) {
      for (const selector of ['.import-panel', '.more-link', '.affiliation-notice']) {
        const box = (await page.locator(selector).boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      }
      const panel = (await page.locator('.import-panel').boundingBox())!;
      const more = (await page.locator('.more-link').boundingBox())!;
      expect(more.y).toBeGreaterThan(panel.y + panel.height);
      expect(await page.locator('.landing').evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(viewport.height);
    }
    await page.screenshot({ path: `test-results/landing-${viewport.width}.png`, fullPage: false });
    const hint = page.locator('#image-permission-help');
    const info = page.getByRole('button', { name: 'About VRChat images', exact: true });
    await expect(hint).toBeHidden();
    await page.locator('.landing-options .image-permission-label').hover();
    await expect(hint).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(hint).toBeHidden();
    await info.focus();
    await expect(hint).toBeVisible();
    await info.press('Escape');
    await expect(hint).toBeHidden();
    await expect(page.locator('#allow-vrchat-images')).not.toBeChecked();
  });
}
