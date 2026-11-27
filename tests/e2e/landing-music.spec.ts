import { enterSite } from '../fixtures/startup';
import { expect, test } from '@playwright/test';

test('landing music plays locally, mutes, and stays muted after other clicks', async ({ page }) => {
  const violations: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', event => {
      (window as unknown as { musicViolations: string[] }).musicViolations ??= [];
      (window as unknown as { musicViolations: string[] }).musicViolations.push(event.violatedDirective);
    });
  });
  page.on('pageerror', error => violations.push(error.message));
  await page.goto('/');
  await enterSite(page);
  const toggle = page.locator('.music-toggle');
  await expect(toggle).toBeVisible();
  const volume = page.getByRole('slider', { name: 'Music volume', includeHidden: true });
  await expect(volume).toHaveValue('25');
  expect(await page.locator('audio').first().evaluate((audio: HTMLAudioElement) => audio.volume)).toBeLessThan(0.10);
  await page.locator('.intro').click();
  await expect(toggle).toHaveAccessibleName('Mute background music');
  await expect.poll(() => page.locator('audio').first().evaluate((audio: HTMLAudioElement) => audio.volume), { timeout: 10000 }).toBeGreaterThanOrEqual(0.10);
  expect(await page.locator('audio').first().evaluate((audio: HTMLAudioElement) => ({
    ready: audio.readyState >= 2, local: new URL(audio.src).origin === location.origin,
  }))).toEqual({ ready: true, local: true });
  await page.locator('.music-toggle').hover();
  await volume.focus();
  await page.keyboard.press('ArrowRight');
  await expect(volume).toHaveValue('25.5');
  expect(await page.locator('audio').first().evaluate((audio: HTMLAudioElement) => audio.volume)).toBeCloseTo(0.102, 5);
  await toggle.click();
  await expect(toggle).toHaveAccessibleName('Play background music');
  await page.locator('.intro').click();
  expect(await page.locator('audio').first().evaluate((audio: HTMLAudioElement) => audio.muted)).toBe(true);
  await page.locator('.music-toggle').hover();
  await volume.focus();
  await page.keyboard.press('ArrowRight');
  await expect(volume).toHaveValue('26');
  expect(await page.locator('audio').first().evaluate((audio: HTMLAudioElement) => audio.muted)).toBe(true);
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAccessibleName('Mute background music');
  await expect.poll(() => page.locator('audio').first().evaluate((audio: HTMLAudioElement) => audio.volume), { timeout: 10000 }).toBeGreaterThanOrEqual(0.10);
  expect(await page.locator('audio').first().evaluate((audio: HTMLAudioElement) => audio.volume)).toBeCloseTo(0.104, 5);
  await page.locator('.music-toggle').hover();
  await volume.focus();
  await page.keyboard.press('Home');
  await expect(volume).toHaveValue('0');
  await expect(toggle).toHaveAccessibleName('Play background music');
  await toggle.click();
  await expect(toggle).toHaveAccessibleName('Mute background music');
  await expect.poll(() => page.locator('audio').first().evaluate((audio: HTMLAudioElement) => audio.volume), { timeout: 10000 }).toBeGreaterThanOrEqual(0.10);
  expect(await page.locator('audio').first().evaluate((audio: HTMLAudioElement) => audio.volume)).toBeCloseTo(0.104, 5);
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { musicViolations?: string[] }).musicViolations ?? [])).toEqual([]);
});

test('blocked autoplay retries after a gesture without uncaught errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play;
    let attempts = 0;
    HTMLMediaElement.prototype.play = function () {
      if (++attempts === 1) return Promise.reject(new DOMException('Gesture required', 'NotAllowedError'));
      return original.call(this);
    };
  });
  await page.goto('/');
  await enterSite(page);
  await expect(page.getByRole('button', { name: 'Play background music' })).toBeVisible();
  await expect(page.locator('.music-autoplay-hint')).toBeVisible();
  await expect(page.locator('.music-toggle')).toHaveAttribute('data-state', 'waiting');
  await page.locator('.intro').click();
  await expect(page.getByRole('button', { name: 'Mute background music' })).toBeVisible();
  await expect(page.locator('.music-autoplay-hint')).toBeHidden();
  expect(errors).toEqual([]);
});

test('music button fits a narrow screen and stays off the isolated timeline fixture', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await enterSite(page);
  const bounds = await page.locator('.music-controls').boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');
  await expect(page.locator('audio, .music-toggle')).toHaveCount(0);
});

test('volume slider gives quiet levels half its travel and caps output at 80%', async ({ page }) => {
  await page.goto('/');
  await enterSite(page);
  const slider = page.getByRole('slider', { name: 'Music volume', includeHidden: true });
  await page.locator('.intro').click();
  await expect.poll(() => page.locator('audio').first().evaluate((audio: HTMLAudioElement) => audio.volume), { timeout: 10000 }).toBeCloseTo(0.10, 5);
  for (const [position, level] of [[0, 0], [25, 0.10], [50, 0.20], [75, 0.50], [100, 0.80]]) {
    await slider.evaluate((element: HTMLInputElement, value) => {
      element.value = String(value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, position);
    expect(await page.locator('audio').first().evaluate((audio: HTMLAudioElement) => audio.volume)).toBeCloseTo(level, 5);
    await expect(slider).toHaveAttribute('aria-valuetext', `${level * 100}% volume`);
  }
});
test('music fades in and crossfades at 3:39.8 on successive loops', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await enterSite(page);
  await page.locator('.intro').click();
  const first = page.locator('audio').nth(0);
  const second = page.locator('audio').nth(1);
  await expect.poll(() => first.evaluate((track: HTMLAudioElement) => track.volume), { timeout: 10000 }).toBeGreaterThan(0);
  expect(await first.evaluate((track: HTMLAudioElement) => track.volume)).toBeLessThan(0.10);
  await expect.poll(() => first.evaluate((track: HTMLAudioElement) => track.volume), { timeout: 10000 }).toBeCloseTo(0.10, 5);
  await expect(page.getByRole('slider', { name: 'Music volume', includeHidden: true })).toHaveValue('25');
  await first.evaluate((track: HTMLAudioElement) => { track.currentTime = 219; track.dispatchEvent(new Event('timeupdate')); });
  expect(await second.evaluate((track: HTMLAudioElement) => track.paused)).toBe(true);
  await first.evaluate((track: HTMLAudioElement) => { track.currentTime = 219.8; track.dispatchEvent(new Event('timeupdate')); });
  await expect.poll(() => second.evaluate((track: HTMLAudioElement) => track.paused)).toBe(false);
  await second.evaluate((track: HTMLAudioElement) => { track.currentTime = 3.5; track.dispatchEvent(new Event('timeupdate')); });
  const levels = await page.locator('audio').evaluateAll(elements => elements.map(element => (element as HTMLAudioElement).volume));
  expect(levels[0]).toBeGreaterThan(0);
  expect(levels[1]).toBeGreaterThan(0);
  expect(levels[0]! + levels[1]!).toBeCloseTo(0.10, 5);
  await page.getByRole('button', { name: 'Mute background music' }).click();
  expect(await page.locator('audio').evaluateAll(elements => elements.every(element => (element as HTMLAudioElement).muted))).toBe(true);
  await second.evaluate((track: HTMLAudioElement) => { track.currentTime = 8; track.dispatchEvent(new Event('timeupdate')); });
  await expect.poll(() => first.evaluate((track: HTMLAudioElement) => track.paused)).toBe(true);
  expect(await second.evaluate((track: HTMLAudioElement) => track.volume)).toBeCloseTo(0.10, 5);
  await second.evaluate((track: HTMLAudioElement) => { track.currentTime = 219.8; track.dispatchEvent(new Event('timeupdate')); });
  await expect.poll(() => first.evaluate((track: HTMLAudioElement) => track.paused)).toBe(false);
  expect(await page.locator('audio').evaluateAll(elements => elements.every(element => (element as HTMLAudioElement).muted))).toBe(true);
  await first.evaluate((track: HTMLAudioElement) => { track.currentTime = 8; track.dispatchEvent(new Event('timeupdate')); });
  await expect.poll(() => second.evaluate((track: HTMLAudioElement) => track.paused)).toBe(true);
  expect(errors).toEqual([]);
});

for (const width of [1920, 390]) {
  test(`landing volume uses the shared hover fade and hidden hover area at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await enterSite(page);
    const panel = page.locator('.music-controls .music-volume-panel');
    const slider = page.locator('.music-volume');
    const toggle = page.locator('.music-toggle');
    await page.mouse.move(width / 2, 400);
    await expect(slider).toBeHidden();
    await panel.hover();
    await expect(slider).toBeVisible();
    await expect(panel).toHaveCSS('opacity', '1');
    await toggle.click();
    await page.mouse.move(width / 2, 400);
    await expect(toggle).toBeFocused();
    await page.waitForTimeout(250);
    await expect(panel).toHaveCSS('opacity', '1');
    await expect(panel).toHaveCSS('transition-delay', '0.5s');
    await expect(slider).toBeHidden();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(toggle).toBeFocused();
    await expect(slider).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    await expect(slider).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveValue('25.5');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.mouse.move(width / 2, 400);
    await page.screenshot({ path: `test-results/landing-volume-${width}.png` });
  });
}
