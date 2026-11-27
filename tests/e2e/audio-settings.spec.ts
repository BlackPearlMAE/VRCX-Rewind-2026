import { enterSite } from '../fixtures/startup';
import { expect, test } from '@playwright/test';

const key = 'vrcx-rewind:audio-settings';

test('defaults and ordinary page interactions do not create saved settings', async ({ page }) => {
  await page.goto('/');
  await enterSite(page);
  await page.locator('.intro').click();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
});

test('user volume and mute survive reload without restarting muted music', async ({ page }) => {
  await page.goto('/');
  await enterSite(page);
  const slider = page.getByRole('slider', { name: 'Music volume', includeHidden: true });
  await page.locator('.music-toggle').hover();
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('25.5');
  await page.locator('.intro').click();
  await page.getByRole('button', { name: 'Mute background music' }).click();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);
  expect(Object.keys(saved).sort()).toEqual(['expiresAt', 'muted', 'volume']);
  expect(saved.volume).toBeCloseTo(0.102, 5);
  expect(saved.muted).toBe(true);
  expect(saved.expiresAt - Date.now()).toBeGreaterThan(29 * 86400000);
  expect(saved.expiresAt - Date.now()).toBeLessThanOrEqual(30 * 86400000);
  await page.reload();
  await enterSite(page);
  await expect(slider).toHaveValue('25.5');
  expect(await page.locator('audio').evaluateAll(elements => elements.every(element => {
    const audio = element as HTMLAudioElement;
    return audio.muted && audio.paused;
  }))).toBe(true);
  await page.locator('.intro').click();
  await expect(page.getByRole('button', { name: 'Play background music' })).toBeVisible();
  expect(await page.locator('audio').evaluateAll(elements => elements.every(element => (element as HTMLAudioElement).muted))).toBe(true);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).expiresAt, key)).toBe(saved.expiresAt);
  await page.getByRole('button', { name: 'Play background music' }).click();
  await expect(page.getByRole('button', { name: 'Mute background music' })).toBeVisible();
  await page.reload();
  await enterSite(page);
  await expect(slider).toHaveValue('25.5');
  expect(await page.locator('audio').evaluateAll(elements => elements.every(element => !(element as HTMLAudioElement).muted))).toBe(true);
  expect(await page.locator('audio').first().evaluate((audio: HTMLAudioElement) => audio.volume)).toBeLessThan(0.102);
});

for (const [name, stored] of [
  ['expired', JSON.stringify({ volume: 0.5, muted: true, expiresAt: 1 })],
  ['invalid volume', JSON.stringify({ volume: 3, muted: true, expiresAt: Date.now() + 86400000 })],
  ['invalid mute', JSON.stringify({ volume: 0.5, muted: 'yes', expiresAt: Date.now() + 86400000 })],
  ['malformed', '{broken'],
]) {
  test(`${name} settings are discarded and defaults restored`, async ({ page }) => {
    await page.addInitScript(({ key, stored }) => localStorage.setItem(key, stored), { key, stored });
    await page.goto('/');
    await enterSite(page);
    await expect(page.getByRole('slider', { name: 'Music volume', includeHidden: true })).toHaveValue('25');
    expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
    expect(await page.locator('audio').evaluateAll(elements => elements.every(element => !(element as HTMLAudioElement).muted))).toBe(true);
  });
}

test('blocked browser storage leaves music controls working', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      Object.defineProperty(Storage.prototype, method, { value: () => { throw new DOMException('Storage blocked', 'SecurityError'); } });
    }
  });
  await page.goto('/');
  await enterSite(page);
  const slider = page.getByRole('slider', { name: 'Music volume', includeHidden: true });
  await page.locator('.music-toggle').hover();
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('25.5');
  await page.locator('.intro').click();
  await page.getByRole('button', { name: 'Mute background music' }).click();
  await expect(page.getByRole('button', { name: 'Play background music' })).toBeVisible();
  expect(errors).toEqual([]);
});