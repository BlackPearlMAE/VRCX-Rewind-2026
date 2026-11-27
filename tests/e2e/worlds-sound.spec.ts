import { test, expect } from '@playwright/test';
import { enterSite } from '../fixtures/startup';

async function start(page: import('@playwright/test').Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    (window as any).__worldVoices = 0;
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      createOscillator() { (window as any).__worldVoices++; return super.createOscillator(); }
    };
  });
  await page.goto('/');
  await enterSite(page);
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}
const voices = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).__worldVoices as number);

test('Worlds reveals play the shared riser and chimes once per page', async ({ page }) => {
  await start(page);
  let expected = await voices(page);
  for (const [title, id, notes] of [
    ['New worlds discovered', 'discoveries', 5],
    ['Your most visited worlds', 'visits', 8],
    ['Where you spent your time', 'time', 8],
    ['Your instances', 'owned', 5],
  ] as const) {
    await page.getByRole('button', { name: `Go to ${title}`, exact: true }).click();
    await expect(page.locator(`[data-worlds=${id}]`)).toBeFocused();
    expected += notes;
    await expect.poll(() => voices(page)).toBe(expected);
  }
  await page.getByRole('button', { name: 'Go to Your most visited worlds', exact: true }).click();
  await expect(page.locator('[data-worlds=visits]')).toBeFocused();
  // Wait past the reveal window to catch accidental replay on return.
  await page.waitForTimeout(2800);
  expect(await voices(page)).toBe(expected);
});

test('leaving a Worlds reveal cancels later notes, and mute silences subsequent pages', async ({ page }) => {
  await start(page);
  const initial = await voices(page);
  await page.getByRole('button', { name: 'Go to New worlds discovered', exact: true }).click();
  await expect.poll(() => voices(page)).toBe(initial + 1);
  await page.getByRole('button', { name: 'Go to Your worlds', exact: true }).click();
  await expect(page.locator('.worlds-story')).toBeFocused();
  await page.waitForTimeout(2800);
  expect(await voices(page)).toBe(initial + 1);
  await page.getByRole('button', { name: 'Mute sound', exact: true }).click();
  await page.getByRole('button', { name: 'Go to Your most visited worlds', exact: true }).click();
  await expect(page.locator('[data-worlds=visits]')).toBeFocused();
  await page.waitForTimeout(2800);
  expect(await voices(page)).toBe(initial + 1);
});

test('Worlds podium colors arrive with the chime and the initial glow fades', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Go to Your most visited worlds', exact: true }).click();
  const rows = page.locator('[data-worlds=visits] .worlds-entry');
  await expect(rows.first()).toHaveAttribute('data-settled', 'false');
  await expect(rows.first().locator('.worlds-rank')).toHaveCSS('color', 'rgb(151, 175, 172)');
  await expect(rows.first()).toHaveAttribute('data-settled', 'true');
  for (const [index, color] of ['rgb(239, 204, 124)', 'rgb(200, 206, 216)', 'rgb(205, 149, 105)'].entries()) {
    const row = rows.nth(index);
    await expect(row).toHaveAttribute('data-settled', 'true');
    await expect(row).toHaveClass(/is-awarded/);
    await expect(row.locator('.worlds-value')).toHaveCSS('color', color);
    await expect.poll(() => row.locator('.worlds-value').evaluate(element => getComputedStyle(element).filter)).toBe('none');
  }
  await expect(rows.nth(3)).not.toHaveClass(/is-awarded/);
  await page.screenshot({ path: 'test-results/worlds-podium-settled.png' });
});
