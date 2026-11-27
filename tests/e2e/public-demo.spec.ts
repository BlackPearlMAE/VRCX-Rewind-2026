import { test, expect } from '@playwright/test';
import { enterSite } from '../fixtures/startup';

for (const port of [4173, 4174]) test(`fictional demo fills every section and share export on port ${port}`, async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/`); await enterSite(page);
  await context.setOffline(true);
  const requests: string[] = []; page.on('request', request => requests.push(request.url()));
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  await page.getByRole('button', { name: 'Go to Your time', exact: true }).click();
  await expect(page.locator('.opening-content .opening-number')).toHaveText('227');
  await expect(page.locator('.opening-sessions')).toHaveText('212 recorded sessions');
  const routes = await page.locator('.page-progress button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')));
  expect(routes.length).toBeGreaterThan(20);
  for (const label of routes) {
    if (!label || !label.startsWith('Go to ')) continue;
    await page.getByRole('button', { name: label, exact: true }).click();
    const visible = page.locator('section.opening-card:not([hidden])');
    if (await visible.count()) expect(await visible.innerText()).not.toMatch(/statistics unavailable|data unavailable|no recorded history/i);
  }
  for (const id of ['discoveries', 'visits', 'time', 'owned']) expect(await page.locator(`[data-worlds="${id}"] .worlds-entry`).count()).toBeGreaterThan(0);
  for (const id of ['added','time','overlap','strangers','mutuals','boops','invites','requests']) expect(await page.locator(`[data-friends="${id}"] .worlds-entry`).count()).toBe(10);
  await page.getByRole('button', { name: 'Go to Online at the same time', exact: true }).click();
  await expect(page.locator('[data-friends="overlap"] .friends-comparison')).toHaveText('They were online during 28% of your recorded playtime.');
  await page.getByRole('button', { name: 'Go to Friends in common', exact: true }).click();
  await expect(page.locator('[data-friends="mutuals"] .friends-comparison')).toHaveText('You share 21% of your friend list.');
  await page.getByRole('button', { name: 'Go to Share', exact: true }).click();
  await expect(page.getByLabel('Name on card')).toHaveValue('Demo user');
  await expect(page.getByLabel('Name on card')).not.toBeEditable();
  const canvas = page.locator('.share-card-canvas');
  for (const kind of ['Worlds','Friends','Your stats']) {
    await page.getByRole('button', { name: kind, exact: true }).click();
    await expect(canvas).not.toHaveAttribute('aria-label', /NaN|undefined|Not available|No recorded|None recorded|—/);
    if (kind === 'Your stats') { await expect(canvas).toHaveAttribute('aria-label', /617\. hours played/); await expect(canvas).toHaveAttribute('aria-label', /227\. days played/); await expect(canvas).toHaveAttribute('aria-label', /212\. recorded sessions/); }
    const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
    expect((await downloaded).suggestedFilename()).toMatch(/vrcx-rewind-2026-(worlds|friends|stats)\.png/);
  }
  await page.getByRole('button', { name: 'Go to New friends made', exact: true }).click();
  await page.getByRole('button', { name: 'Exclude CloverDrift from this recap', exact: true }).click();
  await expect(page.locator('[data-friends="added"] .friends-number')).toHaveText('32');
  await page.getByRole('button', { name: 'Go to Share', exact: true }).click();
  await expect(canvas).toHaveAttribute('aria-label', /32\. friends made/);
  await expect(canvas).not.toHaveAttribute('aria-label', /CloverDrift/);
  await page.getByRole('button', { name: 'Excluded users (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Remove CloverDrift from exclusions', exact: true }).click();
  await expect(canvas).toHaveAttribute('aria-label', /33\. friends made/);
  await expect(canvas).toHaveAttribute('aria-label', /CloverDrift/);
  expect(requests).toEqual([]); expect(errors).toEqual([]);
});
