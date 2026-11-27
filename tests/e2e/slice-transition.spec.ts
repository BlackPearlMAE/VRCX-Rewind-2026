import { enterSite, dismissImageRecommendation } from '../fixtures/startup';
import { test, expect } from '@playwright/test';
import { databaseFixture } from '../fixtures/database';

for (const width of [1920, 390]) {
  test(`diagonal slices cover the page swap and release the reveal at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => {
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        const animation = animate.call(this, frames, this.classList.contains('slice-transition') ? { duration: 100 } : options);
        if (this.classList.contains('slice-transition')) animation.pause();
        return animation;
      };
    });
    await page.goto('/');
    await enterSite(page);
    await page.locator('.file-input').setInputFiles({ name: 'fixture.sqlite3', mimeType: 'application/octet-stream', buffer: await databaseFixture('benchmark') });
    await dismissImageRecommendation(page);
    await page.getByRole('button', { name: 'Start your rewind' }).click();
    const overlay = page.locator('.slice-transition');
    await expect(overlay).toHaveAttribute('data-phase', 'covered');
    await expect(page.locator('.landing')).toBeHidden();
    await expect(page.locator('[aria-labelledby=opening-title] .monthly-timeline')).not.toHaveClass(/has-values/);
    expect(await page.locator('main').evaluate(element => element.inert)).toBe(true);
    expect(await page.evaluate(() => [[1, 1], [innerWidth - 2, 1], [1, innerHeight - 2], [innerWidth - 2, innerHeight - 2], [innerWidth / 2, innerHeight / 2]].every(([x, y]) => document.elementFromPoint(x!, y!)?.closest('.transition-slice')))).toBe(true);
    await expect(page.locator('.transition-slice .title-face')).toHaveText(['VRCX', 'REWIND', '2026']);
    await page.screenshot({ path: `test-results/transition-covered-${width}.png`, style: '.transition-slice { transform: skewX(-45deg) !important; }' });
    await page.evaluate(() => { for (const animation of document.getAnimations()) if (animation.playState === 'paused') animation.play(); });
    await expect(overlay).toHaveCount(0);
    expect(await page.locator('main').evaluate(element => element.inert)).toBe(false);
    await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeVisible();
    await expect(page.locator('.story-page[aria-labelledby=story-title]')).toBeFocused();
    await expect(page.locator('.opening-card[aria-labelledby=opening-title]')).toBeHidden();
  });
}


test('test-page duration slider scales the transition and permits another preview', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');
  const slider = page.getByLabel('Motion duration', { exact: true });
  await expect(slider).toHaveValue('2.3');
  await slider.fill('1.2');
  await slider.dispatchEvent('input');
  await expect(page.locator('output[for="transition-duration"]')).toHaveText('1.2 seconds');
  const pause = page.getByLabel('Pause duration', { exact: true });
  await expect(pause).toHaveValue('0');
  await expect(page.getByLabel('Shine effect', { exact: true })).not.toBeChecked();
  await pause.fill('0.8');
  await pause.dispatchEvent('input');
  await expect(page.locator('output[for="transition-pause"]')).toHaveText('0.8 seconds');
  await page.getByRole('button', { name: 'Play transition', exact: true }).click();
  await expect(page.locator('.slice-transition')).toBeVisible();
  const durations = await page.evaluate(() => document.getAnimations().filter(animation => (animation.effect as KeyframeEffect)?.target instanceof Element && ((animation.effect as KeyframeEffect).target as Element).classList.contains('transition-slice')).map(animation => Number(animation.effect!.getTiming().duration)));
  expect(durations).toHaveLength(3);
  expect(durations[0]).toBeCloseTo(540 * 1200 / 1180);
  await expect(page.locator('.slice-transition')).toHaveAttribute('data-phase', 'covered');
  const holdDuration = await page.evaluate(() => document.getAnimations().find(animation => (animation.effect as KeyframeEffect)?.target === document.querySelector('.slice-transition'))?.effect?.getTiming().duration);
  expect(holdDuration).toBe(800);
  await expect(page.locator('.slice-transition')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play transition', exact: true })).toBeEnabled();
  await expect(page.locator('.transition-test-controls p')).toContainText('Ready to replay');
});


test('lettering options change colors and independently disable shine and music glow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const animation = animate.call(this, frames, this.classList.contains('slice-transition') ? { duration: 100 } : options);
      if (this.classList.contains('slice-transition')) animation.pause();
      return animation;
    };
  });
  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');
  await page.getByLabel('Text color', { exact: true }).fill('#ffee00');
  await page.getByLabel('VRCX depth color', { exact: true }).fill('#0077cc');
  await page.getByLabel('Shine color', { exact: true }).fill('#ff8800');
  await page.getByLabel('Shine effect', { exact: true }).uncheck();
  await page.getByLabel('Music response', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Play transition', exact: true }).click();
  await expect(page.locator('.slice-transition')).toHaveAttribute('data-phase', 'covered');
  await expect(page.locator('.transition-title').first()).toHaveCSS('color', 'rgb(255, 238, 0)');
  expect(await page.locator('.transition-title').first().evaluate(element => element.style.getPropertyValue('--title-depth-1'))).toContain('#0077cc');
  await expect(page.locator('.slice-transition .title-reflection')).toHaveCount(0);
  await expect(page.locator('.slice-transition .title-music-glow')).toHaveCount(0);
  await page.evaluate(() => { for (const animation of document.getAnimations()) if (animation.playState === 'paused') animation.play(); });
  await expect(page.locator('.slice-transition')).toHaveCount(0);
  await page.getByLabel('Shine effect', { exact: true }).check();
  await page.getByLabel('Music response', { exact: true }).check();
  await page.getByRole('button', { name: 'Play transition', exact: true }).click();
  await expect(page.locator('.slice-transition')).toHaveAttribute('data-phase', 'covered');
  await expect(page.locator('.slice-transition .title-reflection')).toHaveCount(3);
  await expect(page.locator('.slice-transition .title-music-glow')).toHaveCount(3);
  expect(await page.locator('.transition-title').first().evaluate(element => getComputedStyle(element).getPropertyValue('--title-shine-color'))).toBe('#ff8800');
  await page.evaluate(() => { for (const animation of document.getAnimations()) if (animation.playState === 'paused') animation.play(); });
  await expect(page.locator('.slice-transition')).toHaveCount(0);
});
