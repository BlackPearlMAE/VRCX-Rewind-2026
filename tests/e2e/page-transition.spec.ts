import { enterSite } from '../fixtures/startup';
import { test, expect } from '@playwright/test';

for (const width of [1920, 390]) {
  test(`Next and Previous keep controls interactive while sliding at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => {
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        const animation = animate.call(this, frames, options);
        if (this.classList.contains('is-page-sliding')) { animation.pause(); animation.currentTime = 210; }
        return animation;
      };
    });
    await page.goto('/'); await enterSite(page);
    await page.getByRole('button', { name: 'Try demo', exact: true }).click();
    await expect(page.locator('.slice-transition')).toHaveCount(0);
    const story = page.locator('[aria-labelledby=story-title]');
    const opening = page.locator('[aria-labelledby=opening-title]');
    const chrome = page.locator('.recap-chrome');
    const before = await chrome.boundingBox();
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(opening).toBeFocused();
    await expect(story).toHaveAttribute('inert', '');
    await expect(opening).not.toHaveAttribute('inert');
    await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeEnabled();
    await expect(opening.locator('.monthly-timeline')).toHaveClass(/has-values/);
    expect(await chrome.boundingBox()).toEqual(before);
    const frames = () => page.evaluate(() => document.getAnimations()
      .filter(a => ((a.effect as KeyframeEffect)?.target as Element)?.classList.contains('is-page-sliding'))
      .map(a => (a.effect as KeyframeEffect).getKeyframes().map(f => f.transform)));
    expect(await frames()).toEqual(expect.arrayContaining([
      ['translateX(0%)', 'translateX(-100%)'], ['translateX(100%)', 'translateX(0%)'],
    ]));
    await page.screenshot({ path: `test-results/page-slide-next-${width}.png` });
    // Reverse while the original transition is still paused: controls must work.
    await page.getByRole('button', { name: 'Previous page', exact: true }).click();
    await expect(story).toBeFocused();
    await expect(opening).toHaveAttribute('inert', '');
    expect(await frames()).toEqual(expect.arrayContaining([
      ['translateX(0%)', 'translateX(100%)'], ['translateX(-100%)', 'translateX(0%)'],
    ]));
    await page.evaluate(() => { for (const a of document.getAnimations()) if (a.playState === 'paused') a.play(); });
    await expect(page.locator('.is-page-sliding')).toHaveCount(0);
    await expect(story).toBeVisible(); await expect(story).toBeFocused();
    await expect(opening).toBeHidden();
    expect(await chrome.boundingBox()).toEqual(before);
  });
}
