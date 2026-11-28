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
test('music credits show the artist, source and Creative Commons license for each track', async ({ page }) => {
  await page.goto('/');
  await enterSite(page);
  await page.getByRole('link', { name: 'More Information about the Site' }).click();
  const credits = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Music credits' }) });
  await credits.locator('summary').click();

  const home = credits.locator('p').filter({ hasText: 'Above All by HOME' });
  const eva = credits.locator('p').filter({ hasText: '失望した by EVA' });
  const airglow = credits.locator('p').filter({ hasText: 'AIRGLOW – New Touch' });
  await expect(home.getByRole('link', { name: 'HOME', exact: true })).toBeVisible();
  await expect(eva.getByRole('link', { name: 'EVA', exact: true })).toBeVisible();
  await expect(airglow.getByRole('link', { name: 'AIRGLOW', exact: true })).toBeVisible();
  for (const track of [home, eva, airglow]) {
    await expect(track.getByRole('link', { name: 'Royalty Free Planet' })).toBeVisible();
  }
  await expect(home.getByRole('link', { name: 'Creative Commons Attribution-ShareAlike 3.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/3.0/');
  for (const track of [eva, airglow]) {
    await expect(track.getByRole('link', { name: 'Creative Commons Attribution 3.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/3.0/');
  }
});
