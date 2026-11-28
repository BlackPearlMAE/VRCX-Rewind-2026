import { savedTimePlayedDemo } from '../../src/data/timeline-demo';
import { enterSite, dismissImageRecommendation } from '../fixtures/startup';
import { test, expect } from '@playwright/test';
import { databaseFixture } from '../fixtures/database';

const demo = savedTimePlayedDemo();
const demoHours = demo.data!.months.reduce((sum, month) => sum + (month.value ?? 0), 0);
const demoDays = demo.daysData!.timeline.months.reduce((sum, month) => sum + (month.value ?? 0), 0);
const demoHeadline = Math.round(demoHours / demoDays <= 4 ? demoDays : demoHours).toLocaleString('en-US');

test('saved hours demo opens offline without a database without a header badge', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const wasm = page.waitForResponse(response => response.url().endsWith('.wasm') && response.ok());
  await page.goto('/');
  await enterSite(page);
  await (await wasm).finished();
  await context.setOffline(true);
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  let filePickers = 0;
  page.on('filechooser', () => filePickers++);
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  await expect(page.locator('.story-page:not([hidden])')).toBeFocused();
  await expect(page.locator('.recap-chrome .demo-badge')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(page.locator('.opening-content .opening-number')).toHaveText(demoHeadline);
  await expect(page.locator('.recap-chrome .demo-badge')).toHaveCount(0);
  await expect(page.locator('[aria-labelledby="opening-title"] .timeline-month-button')).toHaveCount(12);
  await expect(page.locator('[aria-labelledby="opening-title"] .timeline-month-button').nth(11)).toHaveAttribute('data-status', 'future');
  await expect(page.locator('.preparation-status')).toBeHidden();
  expect(await page.locator('.sql-benchmark tbody tr').count()).toBe(0);
  expect(filePickers).toBe(0);
  expect(requests).toEqual([]);
  await page.screenshot({ path: 'test-results/demo-hours-desktop.png' });
  await page.getByRole('button', { name: 'Back to start' }).click();
  await expect(page.getByRole('button', { name: 'Try demo', exact: true })).toBeFocused();
});

test('crowded streak counts stay next to their bars as the demo resizes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 2560, height: 1080 });
  await page.goto('/');
  await enterSite(page);
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  await page.getByRole('button', { name: 'Go to Longest streak of days played', exact: true }).click();

  const chart = page.locator('.streak-timeline');
  await expect(chart).toBeVisible();
  const countLayout = () => chart.locator('.streak-run-count').evaluateAll(labels => {
    const shown = labels.filter(label => getComputedStyle(label).visibility === 'visible');
    const boxes = shown.map(label => label.getBoundingClientRect());
    return {
      shown: shown.length,
      runs: labels.length,
      nearBars: shown.every((label, index) => Math.abs(label.parentElement!.getBoundingClientRect().top - boxes[index]!.bottom - 6) < 1),
      overlaps: boxes.some((box, index) => index > 0 && boxes[index - 1]!.right > box.left),
    };
  });

  const wide = await countLayout();
  expect(wide.shown).toBeGreaterThan(20);
  expect(wide.nearBars).toBe(true);
  expect(wide.overlaps).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await countLayout()).shown).toBeLessThan(wide.shown);
  expect(await countLayout()).toMatchObject({ runs: wide.runs, nearBars: true, overlaps: false });
  await expect(chart.locator('.streak-run[data-rank="1"] .streak-run-count')).toBeVisible();
  await page.setViewportSize({ width: 2560, height: 1080 });
  await expect.poll(countLayout).toEqual(wide);
});

test('demo and imported totals remain separate when switching sources on mobile', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await enterSite(page);
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.opening-content .opening-number')).toHaveText(demoHeadline);
  await page.screenshot({ path: 'test-results/demo-hours-mobile.png' });
  await page.getByRole('button', { name: 'Back to start' }).click();
  await page.locator('.file-input').setInputFiles({ name: 'fixture.sqlite3', mimeType: 'application/octet-stream', buffer: await databaseFixture('benchmark') });
  await dismissImageRecommendation(page);
  await page.getByRole('button', { name: 'Start your rewind' }).click();
  await expect(page.locator('.recap-chrome .demo-badge')).toBeHidden();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.opening-content .opening-number')).toHaveText('1');
  await expect(page.locator('.recap-chrome .demo-badge')).toBeHidden();
  await page.getByRole('button', { name: 'Back to start' }).click();
  await page.getByRole('button', { name: 'Choose a new database', exact: true }).click();
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.opening-content .opening-number')).toHaveText(demoHeadline);
  await expect(page.locator('.recap-chrome .demo-badge')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
