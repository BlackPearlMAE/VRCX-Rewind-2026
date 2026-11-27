import { enterSite, dismissImageRecommendation } from '../fixtures/startup';
import { test, expect } from '@playwright/test';
import { databaseFixture } from '../fixtures/database';

test('Start opens the real recorded-time card offline and returns to the prepared landing', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const wasm = page.waitForResponse(response => response.url().endsWith('.wasm') && response.ok());
  await page.goto('/');
  await enterSite(page);
  await (await wasm).finished();
  await context.setOffline(true);
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.locator('.file-input').setInputFiles({ name: 'synthetic.sqlite3', mimeType: 'application/octet-stream', buffer: await databaseFixture('benchmark') });
  await dismissImageRecommendation(page);
  await page.getByRole('button', { name: 'Start your rewind' }).click();
  await expect(page.locator('.slice-transition')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.page-slide-shield')).toHaveCount(0);
  await expect(page.locator('.opening-card[aria-labelledby="opening-title"]')).toBeVisible();
  await expect(page.locator('.opening-total .opening-number')).toHaveText('1');
  await expect(page.locator('.opening-comparison')).toBeVisible();
  await expect(page.locator('.opening-sessions')).toHaveText('1 recorded session');
  await expect(page.locator('.opening-sessions')).toBeVisible();
  await expect(page.locator('.recap-footer .timeline-month-button:visible')).toHaveCount(12);
  await expect(page.locator('.recap-footer .monthly-timeline:visible')).toHaveClass(/has-values/);
  await expect(page.locator('.landing')).toBeHidden();
  await expect(page.locator('.sql-benchmark')).toHaveCount(0);
  await expect(page.locator('.opening-card[aria-labelledby="opening-title"]')).toBeFocused();
  await page.screenshot({ path: 'test-results/opening-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.recap-footer .timeline-scroll:visible')).toBeVisible();
  await page.screenshot({ path: 'test-results/opening-mobile.png' });
  await page.getByRole('button', { name: 'Back to start' }).click();
  await expect(page.getByRole('button', { name: 'Start your rewind' })).toBeFocused();
  await page.getByRole('button', { name: 'Start your rewind' }).click();
  await expect(page.locator('.slice-transition')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.page-slide-shield')).toHaveCount(0);
  await expect(page.locator('.opening-total .opening-number')).toHaveText('1');
  await expect(page.locator('.opening-comparison')).toBeVisible();
  await expect(page.locator('.opening-sessions')).toHaveText('1 recorded session');
  await expect(page.locator('.opening-sessions')).toBeVisible();
  expect(requests).toEqual([]);
});

test('unavailable history shows an honest empty state on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await enterSite(page);
  await page.locator('.file-input').setInputFiles({ name: 'partial.sqlite3', mimeType: 'application/octet-stream', buffer: await databaseFixture() });
  await dismissImageRecommendation(page);
  await page.getByRole('button', { name: 'Start your rewind' }).click();
  await expect(page.locator('.slice-transition')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.page-slide-shield')).toHaveCount(0);
  await expect(page.locator('.opening-status')).toContainText('could not be calculated');
  await expect(page.locator('.opening-total')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/opening-mobile-empty.png' });
  await page.getByRole('button', { name: 'Back to start' }).click();
  await expect(page.getByRole('button', { name: 'Start your rewind' })).toBeVisible();
});


test('first visit plays tones, revisits stay finished and silent, and a new database resets the reveal', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    (window as any).__openingVoices = 0;
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      createOscillator() { (window as any).__openingVoices++; return super.createOscillator(); }
    };
  });
  await page.goto('/');
  await enterSite(page);
  await page.locator('.file-input').setInputFiles({ name: 'synthetic.sqlite3', mimeType: 'application/octet-stream', buffer: await databaseFixture('benchmark') });
  await dismissImageRecommendation(page);
  await page.getByRole('button', { name: 'Start your rewind' }).click();
  await expect(page.locator('.slice-transition')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.page-slide-shield')).toHaveCount(0);
  await expect(page.locator('.recap-footer .monthly-timeline:visible')).toHaveAttribute('data-reveal', 'complete');
  await expect.poll(() => page.evaluate(() => (window as any).__openingVoices)).toBe(5);
  await page.getByRole('button', { name: 'Back to start' }).click();
  await page.getByRole('button', { name: 'Start your rewind' }).click();
  await expect(page.locator('.slice-transition')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.page-slide-shield')).toHaveCount(0);
  await expect(page.locator('.recap-footer .monthly-timeline:visible')).toHaveAttribute('data-reveal', 'complete');
  await expect(page.locator('.opening-total .opening-number')).toHaveText('1');
  await expect(page.locator('.opening-comparison')).toBeVisible();
  await expect(page.locator('.opening-sessions')).toHaveText('1 recorded session');
  await expect(page.locator('.opening-sessions')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__openingVoices)).toBe(5);
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(page.locator('.page-slide-shield')).toHaveCount(0);
  await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeVisible();
  await page.getByRole('button', { name: 'Back to start' }).click();
  await expect(page.getByRole('button', { name: 'Start your rewind' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose a new database' }).click();
  await page.locator('.file-input').setInputFiles({ name: 'new.sqlite3', mimeType: 'application/octet-stream', buffer: await databaseFixture('benchmark') });
  await dismissImageRecommendation(page);
  await page.getByRole('button', { name: 'Start your rewind' }).click();
  await expect(page.locator('.slice-transition')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.page-slide-shield')).toHaveCount(0);
  await expect(page.locator('.recap-footer .monthly-timeline:visible')).toHaveAttribute('data-reveal', 'running');
  await page.getByRole('button', { name: 'Mute sound', exact: true }).click();
  const mutedVoices = await page.evaluate(() => (window as any).__openingVoices);
  await expect(page.locator('.recap-footer .monthly-timeline:visible')).toHaveAttribute('data-reveal', 'complete');
  expect(await page.evaluate(() => (window as any).__openingVoices)).toBe(mutedVoices);
  await expect(page.getByRole('button', { name: 'Unmute sound', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

 test('saved mute silences the timeline before entering the recap', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vrcx-rewind:audio-settings', JSON.stringify({ volume: .1, muted: true, expiresAt: Date.now() + 86400000 }));
    (window as any).__openingVoices = 0;
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      createOscillator() { (window as any).__openingVoices++; return super.createOscillator(); }
    };
  });
  await page.goto('/');
  await enterSite(page);
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  await expect(page.locator('.slice-transition')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unmute sound', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.page-slide-shield')).toHaveCount(0);
  await expect(page.locator('.recap-footer .monthly-timeline:visible')).toHaveAttribute('data-reveal', 'complete');
  expect(await page.evaluate(() => (window as any).__openingVoices)).toBe(0);
  expect(await page.locator('audio').evaluateAll(tracks => tracks.every(track => (track as HTMLAudioElement).muted))).toBe(true);
  await page.getByRole('button', { name: 'Unmute sound', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mute sound', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.locator('audio').evaluateAll(tracks => tracks.every(track => !(track as HTMLAudioElement).muted))).toBe(true);
});
