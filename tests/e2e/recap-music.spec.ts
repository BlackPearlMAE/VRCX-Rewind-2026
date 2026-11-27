import { expect, test, type Locator } from '@playwright/test';
import { enterSite } from '../fixtures/startup';

async function seek(track: Locator, time: number): Promise<void> {
  await track.evaluate((audio: HTMLAudioElement, time) => {
    audio.currentTime = time;
    audio.dispatchEvent(new Event('timeupdate'));
  }, time);
}

async function reachTail(track: Locator): Promise<void> {
  await track.evaluate((audio: HTMLAudioElement) => {
    audio.currentTime = audio.duration - 2.1821;
    audio.dispatchEvent(new Event('timeupdate'));
  });
}

for (const duringCrossfade of [false, true]) {
  test(`playlist rotates 1-2-3-1 and continues on the menu (existing loop fade: ${duringCrossfade})`, async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await enterSite(page);
    await expect(page.locator('audio')).toHaveCount(4);
    const first = page.locator('audio').nth(0);
    const loop = page.locator('audio').nth(1);
    const second = page.locator('audio').nth(2);
    const third = page.locator('audio').nth(3);
    await expect(first).toHaveJSProperty('paused', false);
    if (duringCrossfade) {
      await seek(first, 219.8);
      await expect.poll(() => loop.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
    }
    await page.getByRole('button', { name: 'Try demo', exact: true }).click();
    await expect(page.locator('.landing')).toBeHidden();
    const current = duringCrossfade ? loop : first;
    if (duringCrossfade) {
      await seek(loop, 8);
      await expect(first).toHaveJSProperty('paused', true);
    }
    await seek(current, 214);
    await expect(second).toHaveJSProperty('paused', true);
    await seek(current, 215.4289);
    await expect.poll(() => second.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
    await seek(second, 1.09105);
    const levels = await page.locator('audio').evaluateAll(elements => elements.map(element => (element as HTMLAudioElement).volume));
    expect(levels[duringCrossfade ? 1 : 0]).toBeGreaterThan(.02);
    expect(levels[2]).toBeGreaterThan(.02);
    expect(levels.reduce((sum, value) => sum + value, 0)).toBeCloseTo(.10, 5);
    await seek(second, 2.3);
    await expect(current).toHaveJSProperty('paused', true);

    // All files are local and ready: the rest of the playlist works offline.
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Back to start', exact: true }).click();
    await expect(page.locator('.landing')).toBeVisible();
    await expect(second).toHaveJSProperty('paused', false);
    expect(await second.evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThanOrEqual(2.3);
    await expect(first).toHaveJSProperty('paused', true);
    await page.getByRole('button', { name: 'Mute background music' }).click();
    await reachTail(second);
    await expect.poll(() => third.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
    await seek(third, 2.3);
    await expect(second).toHaveJSProperty('paused', true);
    expect(await page.locator('audio').evaluateAll(elements => elements.every(element => (element as HTMLAudioElement).muted))).toBe(true);
    await reachTail(third);
    await expect.poll(() => first.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
    await seek(first, 2.3);
    await expect(third).toHaveJSProperty('paused', true);
    // Song one now leads back to two, even though the menu is visible.
    await seek(first, 215.4289);
    await expect.poll(() => second.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
    await seek(second, 2.3);
    await expect(first).toHaveJSProperty('paused', true);
    await expect(loop).toHaveJSProperty('paused', true);
    await page.getByRole('button', { name: 'Play background music' }).click();
    await expect(second).toHaveJSProperty('muted', false);
    await expect(second).toHaveJSProperty('volume', .10);
    expect(errors).toEqual([]);
  });
}

test('returning to the menu during a transition keeps the transition and song two', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await enterSite(page);
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  const first = page.locator('audio').nth(0);
  const second = page.locator('audio').nth(2);
  await seek(first, 215.4289);
  await expect.poll(() => second.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
  await page.getByRole('button', { name: 'Back to start', exact: true }).click();
  await expect(second).toHaveJSProperty('paused', false);
  await seek(second, 2.3);
  await expect(first).toHaveJSProperty('paused', true);
  await expect(second).toHaveJSProperty('volume', .10);
});

test('leaving after the approved entry waits for the next beat', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await enterSite(page);
  const first = page.locator('audio').nth(0);
  const second = page.locator('audio').nth(2);
  await seek(first, 216);
  await expect(second).toHaveJSProperty('paused', true);
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  await expect.poll(() => second.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
  expect(await second.evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeLessThan(1);
});

test('missed crossfades advance through the playlist instead of repeating song two', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await enterSite(page);
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  for (const [outgoingIndex, incomingIndex] of [[0, 2], [2, 3], [3, 0]]) {
    await page.locator('audio').nth(outgoingIndex).evaluate((audio: HTMLAudioElement) => {
      audio.pause();
      audio.dispatchEvent(new Event('ended'));
    });
    await expect.poll(() => page.locator('audio').nth(incomingIndex).evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
    await expect(page.locator('audio').nth(outgoingIndex)).toHaveJSProperty('paused', true);
  }
});

test('an unavailable third song is skipped without breaking the rotation', async ({ page }) => {
  await page.route('**/audio/r_Q15eu03z8.mp3', route => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await enterSite(page);
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  const first = page.locator('audio').nth(0);
  const second = page.locator('audio').nth(2);
  await seek(first, 215.4289);
  await expect.poll(() => second.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
  await seek(second, 2.3);
  await expect(first).toHaveJSProperty('paused', true);
  await reachTail(second);
  await expect.poll(() => first.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
  await seek(first, 2.3);
  await expect(second).toHaveJSProperty('paused', true);
});
