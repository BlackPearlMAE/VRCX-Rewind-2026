import { savedTimelineDemo } from '../../src/data/timeline-demo';
import { databaseFixture, timelineBoundaryFixture, friendsTimelineFixture } from '../fixtures/database';

import { test, expect } from '@playwright/test';



const demo = savedTimelineDemo();
const demoTotal = Math.round(demo.months.reduce((sum, month) => sum + (month.value ?? 0), 0));

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });



test('plain calendar ruler spans the page with months and four equal sections per month', async ({ page }) => {

  const requests: string[] = [];

  page.on('request', request => requests.push(request.url()));

  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');

  await expect(page.getByLabel('Show monthly data')).toBeChecked();

  await expect(page.locator('.timeline-month-bar').first()).toBeVisible();

  await page.getByLabel('Show monthly data').uncheck();

  await expect(page.locator('.timeline-month-button')).toHaveCount(12);

  await expect(page.locator('.timeline-month-bar').first()).not.toBeVisible();

  await expect(page.locator('.timeline-week-tick')).toHaveCount(36);

  const line = (await page.locator('.timeline-axis').boundingBox())!;

  expect(line.width).toBeGreaterThan(1800);

  expect(line.y).toBeGreaterThan(1000);

  const jan = (await page.getByRole('button', { name: 'January 2026', exact: true }).boundingBox())!;

  const feb = (await page.getByRole('button', { name: 'February 2026', exact: true }).boundingBox())!;

  expect(jan.width / feb.width).toBeCloseTo(1, 2);

  expect(requests.every(url => new URL(url).origin === 'http://127.0.0.1:4174')).toBe(true);

  await expect(page.locator('.gradient-dots')).toHaveCount(0);

  await page.screenshot({ path: 'test-results/timeline-ruler-1920.png' });

});



test('monthly and smaller weekly data share one axis and use consistent totals', async ({ page }) => {

  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');

  await page.getByLabel('Show monthly data').check();

  await expect(page.locator('.timeline-month-bar').first()).toBeVisible();

  await page.getByLabel('Weekly line on top').check();

  await expect(page.locator('.timeline-week-button')).toHaveCount(demo.weeks!.filter(week => week.value !== null).length);

  await expect(page.locator('.timeline-week-line path').first()).toHaveAttribute('d', /^M/);

  await expect(page.locator('.timeline-week-line path').first()).toHaveAttribute('vector-effect', 'non-scaling-stroke');

  await expect(page.getByRole('button', { name: /^22 Jan to 31 Jan/ })).toHaveCount(1);

  await expect(page.getByRole('button', { name: /^22 Feb to 28 Feb/ })).toHaveCount(1);

  await page.getByRole('button', { name: /^January 2026,/ }).focus();

  await expect(page.locator('.timeline-inspection')).toContainText('January');

  await page.keyboard.press('ArrowRight');

  await expect(page.locator('.timeline-inspection')).toContainText('February');

  const values = await page.locator('.timeline-month-button, .timeline-week-button').evaluateAll(buttons => {

    const total = (group: Element[]) => group.reduce((sum, button) => sum + Number(button.getAttribute('aria-label')?.match(/(?:, |· )(\d+(?:\.\d+)?) hours/)?.[1] ?? 0), 0);

    return { months: total(buttons.filter(b => b.classList.contains('timeline-month-button'))), weeks: total(buttons.filter(b => b.classList.contains('timeline-week-button'))) };

  });

  expect(values.months).toBeGreaterThan(0);

  // Verify each displayed sum against its own one-decimal bucket rounding.
  const displayedSum = (rows: readonly { value: number | null }[]) => rows.reduce((sum, row) => sum + (row.value === null ? 0 : Number(row.value.toLocaleString('en-US', { maximumFractionDigits: 1 }))), 0);
  expect(values.months).toBeCloseTo(displayedSum(demo.months), 8);
  expect(values.weeks).toBeCloseTo(displayedSum(demo.weeks!), 8);
  const rawSum = (rows: readonly { value: number | null }[]) => rows.reduce((sum, row) => sum + (row.value ?? 0), 0);
  expect(rawSum(demo.months)).toBeCloseTo(rawSum(demo.weeks!), 8);

  await page.screenshot({ path: 'test-results/timeline-ruler-data-1920.png' });

  await page.getByLabel('Show monthly data').uncheck();

  await expect(page.locator('.timeline-week-bars')).not.toBeVisible();

  await expect(page.locator('.timeline-month-bar').first()).not.toBeVisible();

});



test('mobile contains ruler overflow and lets keyboard users reach December', async ({ page }) => {

  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const december = page.getByRole('button', { name: /^December 2026,/ });

  await december.focus();

  await expect(december).toBeInViewport();

  await page.screenshot({ path: 'test-results/timeline-ruler-mobile.png' });

});



test('local data replaces samples offline and clips visits at Berlin month and section boundaries', async ({ page, context }) => {

  const wasm = page.waitForResponse(response => response.url().endsWith('.wasm') && response.ok());

  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');

  await (await wasm).finished();

  await page.evaluate(() => document.fonts.ready);

  const requests: string[] = [];

  page.on('request', request => requests.push(request.url()));

  await context.setOffline(true);

  await page.locator('.timeline-database-input').setInputFiles({ name: 'synthetic.sqlite3', mimeType: 'application/octet-stream', buffer: await timelineBoundaryFixture() });

  await expect(page.locator('.timeline-load-status')).toContainText('Loaded in');

  await expect(page.locator('.timeline-data-source')).toContainText('Your database');

  await expect(page.getByRole('button', { name: 'March 2026, 3.5 hours, partial month', exact: true })).toBeVisible();

  await expect(page.getByRole('button', { name: 'April 2026, 2.5 hours, partial month', exact: true })).toBeVisible();

  await page.getByLabel('Weekly line on top').check();

  await expect(page.getByRole('button', { name: '1 Apr to 7 Apr · 1 hours', exact: true })).toBeVisible();

  await expect(page.getByRole('button', { name: '8 Apr to 14 Apr · 0.5 hours', exact: true })).toBeVisible();

  await expect(page.getByRole('button', { name: '15 Apr to 21 Apr · 1 hours', exact: true })).toBeVisible();

  await expect(page.locator('.timeline-month-button[data-status="future"]')).toHaveCount(1);

  expect(requests).toEqual([]);

  await expect(page.locator('main')).not.toContainText('SYNTHETIC-CONFIG-DO-NOT-TRANSMIT');

});



test('unsupported databases clear sample bars and show an error instead of invented data', async ({ page }) => {

  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');

  await page.locator('.timeline-database-input').setInputFiles({ name: 'old.sqlite3', mimeType: 'application/octet-stream', buffer: await databaseFixture('old-version') });

  await expect(page.locator('.timeline-load-status')).toContainText('needs an update');

  await expect(page.locator('.timeline-month-bar').first()).not.toBeVisible();

});



test('multiple account histories require a choice and can switch accounts', async ({ page }) => {

  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');

  await page.locator('.timeline-database-input').setInputFiles({ name: 'multi.sqlite3', mimeType: 'application/octet-stream', buffer: await databaseFixture('multi-account') });

  await expect(page.locator('.timeline-load-status')).toContainText('Choose your account');

  const account = page.getByLabel('Timeline account', { exact: true });

  await account.selectOption('usr' + '2'.repeat(32));

  await expect(page.locator('.timeline-load-status')).toContainText('Loaded in');

  await account.selectOption('usr' + '1'.repeat(32));

  await expect(page.locator('.timeline-load-status')).toContainText('Loaded in');

  await expect(account).toHaveValue('usr' + '1'.repeat(32));

});



test('each bar eases into its own value with proportional durations and a synchronized total', async ({ page }) => {

  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.clock.install({ time: new Date('2026-11-20T12:00:00Z') });

  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');

  await expect(page.locator('.timeline-total-number')).toBeVisible();
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100));
  const animationMonths = [400, 300, 310, 320, 330, 222.5, 340, 350, 390, 523.4, 380, null];
  const animationTotal = Math.round(animationMonths.reduce<number>((sum, value) => sum + (value ?? 0), 0));
  await page.evaluate(async values => {
    const { createMonthlyTimeline } = await import('/src/components/monthly-timeline.ts');
    const total = document.querySelector('.timeline-total-number')!;
    const months = values.map(value => value === null ? { value: null, status: 'future' as const } : { value });
    const weeks = values.flatMap((value, month) => [0, 1, 2, 3].map(segment => ({ month, segment,
      start: new Date(Date.UTC(2026, month, segment * 7 + 1)).toISOString(),
      end: new Date(segment === 3 ? Date.UTC(2026, month + 1, 1) : Date.UTC(2026, month, (segment + 1) * 7 + 1)).toISOString(),
      value: value === null ? null : value / 4,
    })));
    const chart = createMonthlyTimeline({ topic: 'Synthetic animation test', year: 2026, unit: 'hours', timeZone: 'UTC', months, weeks },
      { onRevealValue: value => { total.textContent = Math.round(value).toLocaleString('en-US'); } });
    document.querySelector('.monthly-timeline')!.replaceWith(chart.element);
    chart.setDisplay(true, true, false);
    const old = document.querySelector('.timeline-replay')!;
    const replay = old.cloneNode(true); old.replaceWith(replay);
    replay.addEventListener('click', () => chart.replay());
  }, animationMonths);


  await page.getByRole('button', { name: 'Replay reveal' }).click();

  const timeline = page.locator('.monthly-timeline');

  await expect(timeline).toHaveAttribute('data-reveal', 'running');

  const values = () => page.locator('.timeline-month-value').evaluateAll(labels => labels.map(label => parseFloat(label.textContent ?? '')).filter(Number.isFinite));

  const weeklyLine = await page.locator('.timeline-week-line').innerHTML();

  const winner = page.locator('.timeline-month-button[data-rank="1"] .timeline-month-bar');

  const shorter = page.locator('.timeline-month-button').nth(5).locator('.timeline-month-bar');

  const initialPlacement = await winner.getAttribute('data-short');

  await page.clock.runFor(400);

  expect(await winner.getAttribute('data-short')).toBe(initialPlacement);

  expect(await page.locator('.timeline-week-line').innerHTML()).toBe(weeklyLine);

  await expect(page.locator('.timeline-week-value').first()).toHaveText('100');

  await expect(page.locator('.timeline-week-bars')).toHaveCSS('opacity', '0');

  expect(await page.locator('.timeline-week-bars').evaluate(element => (element as HTMLElement).inert)).toBe(true);

  const growing = await values();

  expect(growing[5]).toBeLessThan(growing[9]!);

  expect(growing[5]! / animationMonths[5]!).toBeGreaterThan(growing[9]! / animationMonths[9]!);

  const total = Number((await page.locator('.timeline-total-number').textContent())!.replaceAll(',', ''));

  expect(total).toBeGreaterThan(0);

  expect(total).toBeLessThan(animationTotal);

  expect(Math.abs(total - growing.reduce((sum, value) => sum + value, 0))).toBeLessThan(6);

  const startHeight = (await shorter.boundingBox())!.height;

  await page.clock.runFor(300);

  const middleHeight = (await shorter.boundingBox())!.height;

  await page.clock.runFor(300);

  const laterHeight = (await shorter.boundingBox())!.height;

  expect(middleHeight - startHeight).toBeGreaterThan(0);

  expect(laterHeight - middleHeight).toBeGreaterThan(0);

  expect(laterHeight - middleHeight).toBeLessThan(middleHeight - startHeight);

  await expect(page.locator('.timeline-month-button').nth(5)).toHaveAttribute('data-settled', 'false');

  await page.clock.runFor(400);

  await expect(page.locator('.timeline-month-button').nth(5)).toHaveAttribute('data-settled', 'true');

  await expect(page.locator('.timeline-month-value').nth(5)).toHaveText(`${Math.round(animationMonths[5]!)}h`);

  await expect(page.locator('.timeline-month-button[data-rank="1"]')).toHaveAttribute('data-settled', 'false');

  await page.screenshot({ path: 'test-results/timeline-reveal-midway.png' });

  await page.clock.runFor(480);

  const third = page.locator('.timeline-month-button[data-rank="3"] .timeline-month-bar');

  expect(await third.evaluate(bar => getComputedStyle(bar, '::after').opacity)).toBe('1');

  await expect(page.locator('.timeline-month-button[data-rank="2"]')).toHaveAttribute('data-settled', 'false');

  expect(await winner.evaluate(bar => getComputedStyle(bar, '::after').opacity)).toBe('0');

  await page.clock.runFor(70);

  await expect(page.locator('.timeline-month-button[data-rank="2"]')).toHaveAttribute('data-settled', 'true');

  await expect(page.locator('.timeline-month-button[data-rank="1"]')).toHaveAttribute('data-settled', 'false');

  await page.clock.runFor(600);

  await expect(timeline).toHaveAttribute('data-reveal', 'complete');

  await expect(page.locator('.timeline-month-value').nth(9)).toHaveText('523h');

  await expect(page.locator('.timeline-total-number')).toHaveText(animationTotal.toLocaleString('en-US'));

  expect(await winner.evaluate(bar => getComputedStyle(bar, '::after').opacity)).toBe('1');

  expect(Number(await page.locator('.timeline-week-bars').evaluate(element => getComputedStyle(element).opacity))).toBeLessThan(1);

  await page.clock.runFor(650);

  await expect(page.locator('.timeline-week-bars')).toHaveCSS('opacity', '1');

  await page.screenshot({ path: 'test-results/timeline-reveal-finished.png' });

  await page.getByRole('button', { name: 'Replay reveal' }).click();

  await expect(page.locator('.timeline-total-number')).toHaveText('0');

  await expect(page.locator('.timeline-week-bars')).toHaveCSS('opacity', '0');

});



test('reduced motion shows the captured final totals immediately', async ({ page }) => {

  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');

  await expect(page.locator('.monthly-timeline')).toHaveAttribute('data-reveal', 'complete');

  await expect(page.locator('.timeline-month-value').nth(9)).toHaveText(`${Math.round(demo.months[9]!.value!)}h`);

  await expect(page.locator('.timeline-total-number')).toHaveText(demoTotal.toLocaleString('en-US'));

  await expect(page.locator('.timeline-data-source')).toContainText('Saved demo');

  await expect(page.locator('.timeline-month-button').nth(10)).toHaveAttribute('data-status', 'recorded');

  await expect(page.locator('.timeline-month-button').nth(11)).toHaveAttribute('data-status', 'future');

});







test('friends view waits for real data and counts first friendships at Berlin boundaries without reloading the file', async ({ page }) => {

  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');

  await page.getByLabel('Timeline metric').selectOption('friends-added');

  await expect(page.locator('.timeline-load-status')).toContainText('Load your VRCX database');

  await expect(page.locator('.timeline-total')).toBeHidden();

  await expect(page.locator('.timeline-month-bar').first()).not.toBeVisible();

  await page.locator('.timeline-database-input').setInputFiles({ name: 'synthetic-friends.sqlite3', mimeType: 'application/octet-stream', buffer: await friendsTimelineFixture() });

  await expect(page.locator('.timeline-load-status')).toContainText('Loaded in');

  await expect(page.locator('.timeline-total-caption')).toHaveText('Friends added in 2026');

  await expect(page.locator('.timeline-total-number')).toHaveText('4');

  await expect(page.locator('.timeline-total-unit')).toHaveText('friends');

  await expect(page.getByRole('button', { name: 'March 2026, 1 friends', exact: true })).toBeVisible();

  await expect(page.getByRole('button', { name: 'April 2026, 3 friends', exact: true })).toBeVisible();

  await expect(page.getByRole('button', { name: '1 Apr to 7 Apr · 2 friends', exact: true })).toBeVisible();

  await expect(page.getByRole('button', { name: '8 Apr to 14 Apr · 1 friends', exact: true })).toBeVisible();

  await expect(page.getByRole('button', { name: 'February 2026, 0 friends', exact: true })).toBeVisible();

  await page.getByLabel('Timeline metric').selectOption('hours');

  await expect(page.getByRole('button', { name: 'March 2026, 3.5 hours, partial month', exact: true })).toBeVisible();

  await page.getByLabel('Timeline metric').selectOption('friends-added');

  await expect(page.locator('.timeline-total-number')).toHaveText('4');

  await expect(page.locator('.timeline-data-source')).toContainText('Your database');

});
