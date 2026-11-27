import { enterSite } from '../fixtures/startup';
import { expect, test } from '@playwright/test';

test('information link scrolls past scroll snapping and disclosures work by keyboard', async ({ page }) => {
  await page.goto('/');
  await enterSite(page);
  await expect(page.locator('details[open]')).toHaveCount(0);
  await page.getByRole('link', { name: 'More Information about the Site' }).click();
  await expect.poll(() => page.locator('#site-information').evaluate(element => Math.abs(element.getBoundingClientRect().top))).toBeLessThan(2);
  const security = page.locator('summary').filter({ hasText: 'Security and your data' });
  await security.press('Tab');
  await security.press('Enter');
  await expect(page.locator('details[open]')).toHaveCount(1);
  await security.press('Enter');
  await expect(page.locator('details[open]')).toHaveCount(0);
});

for (const width of [1598, 390]) {
  test(`expanded information fits ${width}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 1336 });
    await page.goto('/');
    await enterSite(page);
    await page.getByRole('link', { name: 'More Information about the Site' }).click();
    for (const summary of await page.locator('summary').all()) await summary.click();
    await expect(page.locator('details[open]')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#site-information').screenshot({ path: `test-results/information-${width}.png` });
  });
}