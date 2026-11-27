import { enterSite, dismissImageRecommendation } from '../fixtures/startup';
import { test, expect } from '@playwright/test';
import { databaseFixture } from '../fixtures/database';

async function start(page: import('@playwright/test').Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await enterSite(page);
  await page.locator('.file-input').setInputFiles({ name: 'fixture.sqlite3', mimeType: 'application/octet-stream', buffer: await databaseFixture('benchmark') });
  await dismissImageRecommendation(page);
  await page.getByRole('button', { name: 'Start your rewind' }).click();
  await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeFocused();
}

test('story precedes the data and one sound control mutes music and timeline', async ({ page }) => {
  await start(page);
  await expect(page.locator('.opening-card[aria-labelledby=opening-title]')).toBeHidden();
  const storyArrow = (await page.getByRole('button', { name: 'Previous page', exact: true }).locator('svg').boundingBox())!;
  expect(storyArrow.y + storyArrow.height / 2).toBeCloseTo(page.viewportSize()!.height / 2, 0);
  await expect(page.locator('.story-navigation-hint')).toContainText('Space');
  await expect(page.locator('.story-navigation-hint')).not.toContainText('Click the arrows');
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
  await expect(page.locator('.recap-chrome [aria-current="step"]')).toHaveAttribute('aria-label', 'Your story');
  await page.screenshot({ path: 'test-results/story-desktop.png' });
  await page.getByRole('button', { name: 'Mute sound', exact: true }).click();
  expect(await page.locator('audio').evaluateAll(tracks => tracks.every(track => (track as HTMLAudioElement).muted))).toBe(true);
  // Space on the music button operates that button; it must not turn the page.
  await page.getByRole('button', { name: 'Unmute sound', exact: true }).press('Space');
  await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeVisible();
  await page.getByRole('button', { name: 'Mute sound', exact: true }).click();
  await page.locator('.story-page[aria-labelledby=story-title]').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.opening-card[aria-labelledby=opening-title]')).toBeVisible();
  await expect(page.locator('.opening-card[aria-labelledby=opening-title] .opening-number')).toHaveText('1');
  const dataArrow = (await page.getByRole('button', { name: 'Previous page', exact: true }).locator('svg').boundingBox())!;
  expect(dataArrow.y + dataArrow.height / 2).toBeCloseTo(storyArrow.y + storyArrow.height / 2, 0);
  await expect(page.getByRole('button', { name: 'Unmute sound', exact: true })).toBeVisible();
  await expect(page.locator('.opening-sound')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unmute sound', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.opening-back svg')).toHaveCount(1);
  await expect(page.locator('.recap-music-toggle svg')).toHaveCount(1);
  await expect(page.locator('.opening-header')).not.toContainText('VRCX REWIND');
  await expect(page.locator('.recap-chrome [aria-current="step"]')).toHaveAttribute('aria-label', 'Your time');
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeFocused();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.opening-card[aria-labelledby=opening-title] .opening-number')).toHaveText('1');
});

test('mobile wings and arrow keys navigate while scrolling leaves the story in place', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/story-mobile.png' });
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeFocused();
  await page.keyboard.press('a');
  await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeFocused();
  const unavailableLeft = (await page.getByRole('button', { name: 'Previous page', exact: true }).boundingBox())!;
  await page.mouse.click(unavailableLeft.x + 10, unavailableLeft.y + unavailableLeft.height / 2);
  await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeVisible();
  await expect(page.locator('.landing')).toBeHidden();
  await page.mouse.move(190, 400);
  await page.mouse.wheel(0, 180);
  await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeVisible();
  // The full right wing, including space away from its arrow, is clickable.
  const rightWing = await page.getByRole('button', { name: 'Next page', exact: true }).boundingBox();
  expect(rightWing!.width).toBeCloseTo(390 * .08, 0);
  expect(rightWing!.x + rightWing!.width).toBeCloseTo(390, 0);
  await page.mouse.click(rightWing!.x + 10, rightWing!.y + rightWing!.height / 2);
  await expect(page.locator('.opening-card[aria-labelledby=opening-title]')).toBeVisible();
  await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeHidden();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.opening-card[aria-labelledby=opening-title]')).toBeVisible();
  const leftWing = await page.getByRole('button', { name: 'Previous page', exact: true }).boundingBox();
  await page.mouse.click(leftWing!.x + 10, leftWing!.y + leftWing!.height / 2);
  await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('.opening-card[aria-labelledby=opening-title]')).toBeVisible();
  const january = page.locator('[aria-labelledby=opening-title] .timeline-month-button').first();
  await january.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[aria-labelledby=opening-title] .timeline-month-button').nth(1)).toBeFocused();
  await expect(page.locator('.opening-card[aria-labelledby=opening-title]')).toBeVisible();
});


test('A and D navigate pages without overriding focused controls', async ({ page }) => {
  await start(page);
  await page.keyboard.press('d');
  await expect(page.locator('.opening-card[aria-labelledby=opening-title]')).toBeFocused();
  await page.keyboard.press('a');
  await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeFocused();
  await page.keyboard.press('D');
  await expect(page.locator('.opening-card[aria-labelledby=opening-title]')).toBeFocused();
  await page.getByRole('button', { name: 'Mute sound', exact: true }).focus();
  await page.keyboard.press('a');
  await expect(page.locator('.opening-card[aria-labelledby=opening-title]')).toBeVisible();
  await page.locator('.opening-card[aria-labelledby=opening-title]').focus();
  await page.keyboard.press('A');
  await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeFocused();
});


test('first story highlights both wings and arrows, then clears the introduction on navigation', async ({ page }) => {
  await start(page);
  const navigation = page.locator('.recap-navigation');
  await expect(navigation).toHaveClass(/is-introducing/);
  for (const direction of ['previous', 'next']) {
    const wing = navigation.locator(`.page-wing-${direction}`);
    expect(await wing.evaluate(element => getComputedStyle(element, '::before').content)).toBe('""');
    await expect(wing).toHaveCSS('color', 'rgb(238, 238, 238)');
    expect(await wing.locator('svg').evaluate(element => getComputedStyle(element).filter)).toContain('drop-shadow');
  }
  await expect(navigation.locator('.page-wing-previous')).toBeDisabled();
  await expect(page.locator('.story-navigation-hint')).toHaveCSS('font-size', '20px');
  await page.keyboard.press('Space');
  await expect(page.locator('.opening-card[aria-labelledby=opening-title]')).toBeFocused();
  await expect(navigation).not.toHaveClass(/is-introducing/);
  expect(await navigation.locator('.page-wing-next').evaluate(element => getComputedStyle(element, '::before').content)).toBe('none');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeFocused();
  await expect(navigation).toHaveClass(/is-introducing/);
});


for (const width of [1920, 390]) {
  test(`navigation wings stop above the ruler without blocking the timeline at ${width}px`, async ({ page }) => {
    const height = width === 390 ? 844 : 1080;
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await enterSite(page);
    await page.getByRole('button', { name: 'Try demo', exact: true }).click();
    await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeFocused();
    const storyLine = (await page.locator('.story-ruler-line').boundingBox())!;
    const hint = (await page.locator('.story-hint-copy').boundingBox())!;
    expect(storyLine.x - hint.x - hint.width).toBeGreaterThanOrEqual(8);
    for (const name of ['Previous page', 'Next page']) {
      const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(box.y + box.height).toBeCloseTo(storyLine.y - 12, 0);
    }
    // The bottom gutter below the ruler no longer turns the page.
    await page.mouse.click(width - 8, height - 8);
    await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeFocused();
    await page.mouse.click(width - 8, storyLine.y - 20);
    await expect(page.locator('.opening-card[aria-labelledby=opening-title]')).toBeFocused();
    const previous = (await page.getByRole('button', { name: 'Previous page', exact: true }).boundingBox())!;
    const axis = (await page.locator('.opening-card[aria-labelledby=opening-title] .timeline-axis').boundingBox())!;
    expect(previous.y + previous.height).toBeCloseTo(axis.y - 12, 0);
    expect(storyLine.x + storyLine.width).toBeCloseTo(width, 0);
    // January overlaps the left wing; its native interaction takes priority.
    const january = page.locator('[aria-labelledby=opening-title] .timeline-month-button').first();
    await january.click();
    await expect(january).toBeFocused();
    await expect(page.locator('.opening-card[aria-labelledby=opening-title]')).toBeVisible();
    await page.screenshot({ path: `test-results/navigation-bottom-${width}.png` });
    await page.mouse.click(8, height - 8);
    await expect(page.locator('.opening-card[aria-labelledby=opening-title]')).toBeVisible();
    await page.mouse.click(8, axis.y - 20);
    await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeFocused();
  });
}

for (const width of [1920, 390]) {
  test(`recap volume appears on hover and focus and shares saved audio settings at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await enterSite(page);
    await page.getByRole('button', { name: 'Try demo', exact: true }).click();
    await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeFocused();
    const volume = page.getByRole('slider', { name: 'Sound volume' });
    await expect(page.locator('.recap-volume')).toBeHidden();
    const mute = page.getByRole('button', { name: 'Mute sound', exact: true });
    await mute.hover();
    await expect(volume).toBeVisible();
    await volume.fill('50');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vrcx-rewind:audio-settings')!).volume)).toBe(.2);
    await mute.click();
    await volume.fill('40');
    expect(await page.locator('audio').evaluateAll(tracks => tracks.every(track => (track as HTMLAudioElement).muted))).toBe(true);
    await page.locator('.story-page[aria-labelledby=story-title]').focus();
    await page.mouse.move(width / 2, 400);
    await expect(page.locator('.recap-volume')).toBeHidden();
    await page.getByRole('button', { name: 'Back to start', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Unmute sound', exact: true })).toBeFocused();
    await expect(volume).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    await expect(volume).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/recap-volume-${width}.png` });
  });
}

test('clicked mute does not pin the slider open and leaving delays its fade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await enterSite(page);
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  await expect(page.locator('.slice-transition')).toHaveCount(0);
  const mute = page.locator('.recap-music-toggle');
  const panel = page.locator('.recap-volume-panel');
  await mute.hover();
  await expect(panel).toHaveCSS('opacity', '1');
  await mute.click();
  await page.mouse.move(960, 400);
  await expect(mute).toBeFocused();
  // Stay fully open during the half-second grace period.
  await page.waitForTimeout(250);
  await expect(panel).toHaveCSS('opacity', '1');
  await expect(panel).toHaveCSS('transition-duration', '0.2s');
  await expect(panel).toHaveCSS('transition-delay', '0.5s');
  await expect(page.locator('.recap-volume')).toBeHidden();
  await expect(panel).toHaveCSS('opacity', '0');
  await expect(mute).toBeFocused();
  // The invisible panel remains a hover target, while its slider stays out of the tab order.
  await panel.hover();
  await expect(page.locator('.recap-volume')).toBeVisible();
  await expect(panel).toHaveCSS('opacity', '1');
});
