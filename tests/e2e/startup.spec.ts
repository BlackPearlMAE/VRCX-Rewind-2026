import { dismissImageRecommendation } from '../fixtures/startup';
import { expect, test } from '@playwright/test';

test('loads for at least 1.2 seconds, then starts music only on Start', async ({ page }) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    Object.assign(window, { playAttempts: 0 });
    HTMLMediaElement.prototype.play = function () {
      (window as unknown as { playAttempts: number }).playAttempts++;
      return play.call(this);
    };
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const start = page.getByRole('button', { name: 'Start', exact: true });
  await expect(start).toBeVisible();
  expect(await page.evaluate(() => performance.now())).toBeGreaterThanOrEqual(1200);
  expect(await page.evaluate(() => (window as unknown as { playAttempts: number }).playAttempts)).toBe(0);
  await expect(page.locator('#app')).toHaveAttribute('inert', '');
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#startup')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mute background music' })).toBeVisible();
  await expect(page.locator('#landing-title')).toBeFocused();
});

test('keeps waiting for opening assets beyond the minimum', async ({ page }) => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/audio/*.mp3', async route => { await waiting; await route.continue(); });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await expect(page.getByRole('progressbar')).toBeVisible();
  await expect(page.locator('#startup-start')).toBeHidden();
  release();
  await expect(page.locator('#startup-start')).toBeVisible();
});

test('failed optional music still allows entry and preserves saved mute', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vrcx-rewind:audio-settings', JSON.stringify({ volume: .1, muted: true, expiresAt: Date.now() + 86400000 })));
  await page.route('**/audio/*.mp3', route => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.locator('#startup')).toHaveCount(0);
  expect(await page.locator('audio').evaluateAll(tracks => tracks.every(track => (track as HTMLAudioElement).paused && (track as HTMLAudioElement).muted))).toBe(true);
});

test('mobile loader respects reduced motion and fits the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.startup-bar span')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('#startup-start')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/startup-mobile.png' });
});


test('waits for SQLite before offering Start, then imports and exports offline', async ({ page, context }) => {
  const { databaseFixture } = await import('../fixtures/database');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const pending: string[] = [];
  await context.route('**/*.wasm', async route => { pending.push(route.request().url()); await held; await route.continue(); });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => pending.length).toBeGreaterThan(0);
  await page.waitForTimeout(1600);
  await expect(page.locator('#startup-start')).toBeHidden();
  release();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.locator('#startup')).toHaveCount(0);
  await context.unroute('**/*.wasm');
  await context.setOffline(true);
  const requests: string[] = [];
  page.on('request', r => requests.push(r.url()));
  await page.locator('.file-input').setInputFiles({ name: 'offline.sqlite3', mimeType: 'application/octet-stream', buffer: await databaseFixture('benchmark') });
  await dismissImageRecommendation(page);
  await page.getByRole('button', { name: 'Start your rewind', exact: true }).click();
  await page.getByRole('button', { name: 'Go to Share', exact: true }).click();
  await expect(page.locator('.share-card-canvas')).toHaveAttribute('aria-label', /1\. hours played/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click(); await download;
  expect(requests).toEqual([]);
});

test('a failed SQLite preload offers retry instead of claiming offline readiness', async ({ page }) => {
  await page.route('**/*.wasm', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0);
  await expect(page.locator('#app')).toHaveAttribute('inert', '');
});


for (const query of ['preview=timeline', 'preview=friends', 'preview=worlds', 'preview=accounts', 'loading=300', 'loading=hold']) {
  test(`removed query option ${query} opens the normal application`, async ({ page }) => {
    await page.goto('/?' + query, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#startup-start')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveTitle('VRCX Rewind 2026');
    await expect(page.locator('#startup-bar')).toBeHidden();
    await expect(page.locator('#startup-status')).toBeHidden();
    await expect(page.locator('.timeline-lab, .friends-image-lab, [data-test-page=accounts]')).toHaveCount(0);
    await expect(page.locator('.file-input')).toHaveCount(1);
    await page.locator('#startup-start').click();
    await expect(page.locator('#startup')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try demo', exact: true })).toBeVisible();
  });
}
