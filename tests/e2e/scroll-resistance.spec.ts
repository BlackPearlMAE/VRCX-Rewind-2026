import { enterSite } from '../fixtures/startup';
import { expect, test } from '@playwright/test';
import { rubberBand, springStep } from '../../src/components/scroll-resistance';

test('resistance increases continuously and a spring settles without overshooting', () => {
  const offsets = [0, 100, 200, 300].map(input => rubberBand(input, 220));
  expect(offsets[0]).toBe(0);
  expect(offsets[3]! - offsets[2]!).toBeLessThan(offsets[2]! - offsets[1]!);
  let position = 100;
  let velocity = 0;
  for (let step = 0; step < 240; step++) {
    const previous = position;
    [position, velocity] = springStep(position, velocity, 0, 6, 1 / 60);
    expect(position).toBeGreaterThanOrEqual(0);
    expect(position).toBeLessThanOrEqual(previous);
  }
  expect(position).toBeLessThan(.01);
});

test('small pulls stretch the opening and spring back without a reset deadline', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await enterSite(page);
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(400, 500);
  await page.mouse.wheel(0, 90);
  await expect(page.locator('html')).toHaveClass(/is-scroll-held/);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(20);
  expect(await page.evaluate(() => scrollY)).toBeLessThan(60);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2);
  await expect(page.locator('html')).not.toHaveClass(/is-scroll-held/);
});

test('normal spaced wheel notches can release the downward pull', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await enterSite(page);
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(400, 500);
  for (let notch = 0; notch < 4; notch++) {
    await page.mouse.wheel(0, 120);
    if (notch < 3) await page.waitForTimeout(250);
  }
  await expect.poll(() => page.locator('#site-information').evaluate(element => Math.abs(element.getBoundingClientRect().top))).toBeLessThan(3);
});

test('a strong flick releases without requiring many wheel events', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await enterSite(page);
  await page.mouse.move(400, 500);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.locator('#site-information').evaluate(element => Math.abs(element.getBoundingClientRect().top))).toBeLessThan(3);
});

test('more-information link bypasses the spring', async ({ page }) => {
  await page.goto('/');
  await enterSite(page);
  await page.getByRole('link', { name: 'More Information about the Site' }).click();
  await expect.poll(() => page.locator('#site-information').evaluate(element => Math.abs(element.getBoundingClientRect().top))).toBeLessThan(3);
});

for (const direction of ['down', 'up']) {
  test(`${direction} uses identical resistance and springs back after a short pull`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await enterSite(page);
    await page.evaluate(() => document.fonts.ready);
    if (direction === 'up') {
      await page.getByRole('link', { name: 'More Information about the Site' }).click();
      await expect.poll(() => page.locator('#site-information').evaluate(element => Math.abs(element.getBoundingClientRect().top))).toBeLessThan(3);
    }
    const start = await page.evaluate(() => scrollY);
    await page.mouse.move(400, 500);
    await page.mouse.wheel(0, direction === 'up' ? -90 : 90);
    await expect(page.locator('html')).toHaveClass(/is-scroll-held/);
    const displacement = Math.abs(await page.evaluate(() => scrollY) - start);
    expect(displacement).toBeGreaterThan(20);
    expect(displacement).toBeLessThan(60);
    await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - start)).toBeLessThan(2);
  });
}

test('normal spaced upward wheel input releases to the opening', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await enterSite(page);
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('link', { name: 'More Information about the Site' }).click();
  await expect.poll(() => page.locator('#site-information').evaluate(element => Math.abs(element.getBoundingClientRect().top))).toBeLessThan(3);
  await page.mouse.move(400, 500);
  for (let notch = 0; notch < 4; notch++) {
    await page.mouse.wheel(0, -120);
    if (notch < 3) await page.waitForTimeout(250);
  }
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(3);
});