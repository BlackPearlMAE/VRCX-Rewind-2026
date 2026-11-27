import { enterSite } from '../fixtures/startup';
import { expect, test } from '@playwright/test';

async function canvasImage(page: import('@playwright/test').Page): Promise<string> {
  return page.locator('canvas.gradient-dots').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
}

test('dots flow over time', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await enterSite(page);
  await expect(page.locator('canvas.gradient-dots')).toBeVisible();
  const before = await canvasImage(page);
  await expect.poll(() => canvasImage(page)).not.toBe(before);
});

test('reduced motion keeps the dots static', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await enterSite(page);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('canvas.gradient-dots')).toBeVisible();
  // Allow the initial layout/ResizeObserver frame to finish before sampling.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const before = await canvasImage(page);
  await page.waitForTimeout(300);
  expect(await canvasImage(page)).toBe(before);
});
test('flow preserves row order and repeats the original grid each cycle', async () => {
  const { gridCoordinate } = await import('../../src/components/gradient-dots');
  const axis = [0, 12, 25, 39, 54, 70, 87];
  for (const phase of [0, .25, .5, .75, .999]) {
    const row = [-3, -2, -1, 0, 1, 2, 3].map(index => gridCoordinate(axis, index + phase));
    for (let index = 1; index < row.length; index++) expect(row[index]! - row[index - 1]!).toBeGreaterThanOrEqual(12);
  }
  const visibleRows = (phase: number) => Array.from({ length: 11 }, (_, index) => gridCoordinate(axis, index - 5 + phase))
    .filter(coordinate => Math.abs(coordinate) <= 39);
  expect(visibleRows(1)).toEqual(visibleRows(0));
  expect(visibleRows(.5)).not.toEqual(visibleRows(0));
});