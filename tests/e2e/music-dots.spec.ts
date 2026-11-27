import { enterSite } from '../fixtures/startup';
import { databaseFixture } from '../fixtures/database';
import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    musicTest: { mode: 'native' | 'silent' | 'medium' | 'loud'; reads: number; peak: number; radius: number; sources: number };
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.musicTest = { mode: 'native', reads: 0, peak: 0, radius: 0, sources: 0 };
    const read = AnalyserNode.prototype.getFloatTimeDomainData;
    AnalyserNode.prototype.getFloatTimeDomainData = function (samples) {
      read.call(this, samples);
      window.musicTest.reads++;
      for (const value of samples) window.musicTest.peak = Math.max(window.musicTest.peak, Math.abs(value));
      if (window.musicTest.mode !== 'native') {
        for (let index = 0; index < samples.length; index++) {
          const volumeText = document.querySelector('.music-volume')?.getAttribute('aria-valuetext') ?? '10%';
          const listeningVolume = Number.parseFloat(volumeText) / 100;
          const amplitude = window.musicTest.mode === 'silent' ? 0 : window.musicTest.mode === 'medium' ? .1 : .25;
          samples[index] = amplitude * listeningVolume * (index % 2 ? 1 : -1);
        }
      }
    };
    const create = AudioContext.prototype.createMediaElementSource;
    AudioContext.prototype.createMediaElementSource = function (track) {
      window.musicTest.sources++;
      return create.call(this, track);
    };
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.className === 'gradient-dots') window.musicTest.radius = 0;
      return clear.apply(this, args);
    };
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc = function (...args) {
      if (this.canvas.className === 'gradient-dots') window.musicTest.radius = Math.max(window.musicTest.radius, args[2]);
      return arc.apply(this, args);
    };
  });
});

test('all local music players feed native analysis with real music samples', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await enterSite(page);
  await page.locator('.intro').click();
  await expect.poll(() => page.evaluate(() => window.musicTest.sources)).toBe(4);
  await expect.poll(() => page.evaluate(() => window.musicTest.peak), { timeout: 10000 }).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Mute background music' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('dot size reacts to music and settles when muted', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await enterSite(page);
  await page.evaluate(() => { window.musicTest.mode = 'silent'; });
  await page.locator('.intro').click();
  await expect.poll(() => page.evaluate(() => window.musicTest.reads)).toBeGreaterThan(0);
  const quietRadius = await page.evaluate(() => window.musicTest.radius);
  expect(quietRadius).toBeGreaterThan(0);
  await page.evaluate(() => { window.musicTest.mode = 'loud'; });
  await expect.poll(() => page.evaluate(() => window.musicTest.radius)).toBeGreaterThan(quietRadius * 1.15);
  await page.getByRole('button', { name: 'Mute background music' }).click();
  await expect.poll(() => page.evaluate(() => window.musicTest.radius)).toBeLessThan(quietRadius * 1.07);
});

test('reduced motion keeps the dots static while music plays', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await enterSite(page);
  await page.locator('.intro').click();
  await expect(page.getByRole('button', { name: 'Mute background music' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const dots = page.locator('canvas.gradient-dots');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const before = await dots.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.waitForTimeout(300);
  expect(await dots.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(before);
  expect(await page.evaluate(() => window.musicTest.reads)).toBe(0);
  expect(await page.locator('#landing-title .title-music-glow').evaluate(element => getComputedStyle(element).opacity)).toBe('0');
});

test('music still plays when native audio analysis is unavailable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', { value: undefined });
  });
  await page.goto('/');
  await enterSite(page);
  await page.locator('.intro').click();
  await expect(page.getByRole('button', { name: 'Mute background music' })).toBeVisible();
  await expect(page.locator('canvas.gradient-dots')).toBeVisible();
  expect(errors).toEqual([]);
});

for (const width of [1920, 390]) {
  test(`pink title glow follows music and mute at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1080 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await enterSite(page);
    await page.evaluate(() => { window.musicTest.mode = 'silent'; });
    await page.locator('.intro').click();
    const glow = page.locator('#landing-title .title-music-glow');
    const opacity = () => glow.evaluate(element => Number(getComputedStyle(element).opacity));
    await expect.poll(() => page.evaluate(() => window.musicTest.reads)).toBeGreaterThan(0);
    await expect.poll(opacity).toBeLessThan(.05);
    await page.evaluate(() => { window.musicTest.mode = 'loud'; });
    await expect.poll(opacity).toBeGreaterThan(.6);
    await expect(page.getByRole('heading', { name: 'VRCX REWIND 2026', exact: true })).toBeVisible();
    expect(await page.locator('#landing-title').evaluate(element => getComputedStyle(element).color)).toBe('rgb(255, 255, 255)');
    await page.screenshot({ path: `test-results/title-music-glow-${width}.png` });
    await page.getByRole('button', { name: 'Mute background music' }).click();
    await expect.poll(opacity).toBeLessThan(.05);
  });
}
test('listening volume does not change the glow and musical dynamics remain visible', async ({ page }) => {
  await page.goto('/');
  await enterSite(page);
  await page.locator('.intro').click();
  await expect.poll(() => page.evaluate(() => window.musicTest.reads)).toBeGreaterThan(0);
  const glow = page.locator('#landing-title .title-music-glow');
  const opacity = () => glow.evaluate(element => Number(getComputedStyle(element).opacity));
  await page.evaluate(() => { window.musicTest.mode = 'loud'; });
  for (const position of [5, 25, 100]) {
    await page.getByRole('slider', { name: 'Music volume', includeHidden: true }).evaluate((element: HTMLInputElement, position) => {
      element.value = String(position);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, position);
    await expect.poll(opacity).toBeGreaterThan(.60);
    await expect.poll(opacity).toBeLessThan(.67);
  }
  await page.evaluate(() => { window.musicTest.mode = 'medium'; });
  await expect.poll(opacity).toBeLessThan(.36);
  await expect.poll(opacity).toBeGreaterThan(.30);
  await page.evaluate(() => { window.musicTest.mode = 'silent'; });
  await expect.poll(opacity).toBeLessThan(.05);
});

test('the same real song excerpt produces a similar glow at quiet and loud volume', async ({ page }) => {
  await page.goto('/');
  await enterSite(page);
  await page.locator('.intro').click();
  await expect.poll(() => page.evaluate(() => window.musicTest.peak)).toBeGreaterThan(0);
  const medians: number[] = [];
  for (const position of [5, 100]) {
    await page.getByRole('slider', { name: 'Music volume', includeHidden: true }).evaluate((element: HTMLInputElement, value) => {
      element.value = String(value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, position);
    const median = await page.evaluate(async () => {
      const track = document.querySelector('audio')!;
      const glow = document.querySelector('#landing-title .title-music-glow')!;
      track.currentTime = 60;
      return new Promise<number>((resolve, reject) => {
        const levels: number[] = [];
        const deadline = performance.now() + 8000;
        function collect(): void {
          if (performance.now() > deadline) { reject(new Error('Music excerpt did not advance')); return; }
          if (track.currentTime >= 60.5) levels.push(Number(getComputedStyle(glow).opacity));
          if (track.currentTime >= 61.5 && levels.length > 0) {
            levels.sort((a, b) => a - b);
            resolve(levels[Math.floor(levels.length / 2)]!);
          } else requestAnimationFrame(collect);
        }
        requestAnimationFrame(collect);
      });
    });
    medians.push(median);
  }
  expect(medians[0]).toBeGreaterThan(.05);
  expect(medians[1]).toBeLessThan(.9);
  expect(Math.abs(medians[0]! - medians[1]!)).toBeLessThan(.06);
});

test('transition letters share the title depth and live music glow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await enterSite(page);
  await page.evaluate(() => { window.musicTest.mode = 'loud'; });
  await page.locator('.intro').click();
  await expect.poll(() => page.locator('#landing-title .title-music-glow').evaluate(element => Number(getComputedStyle(element).opacity))).toBeGreaterThan(.6);
  const angle = await page.locator('#landing-title').evaluate(element => getComputedStyle(element).transform);
  await page.locator('.file-input').setInputFiles({ name: 'fixture.sqlite3', mimeType: 'application/octet-stream', buffer: await databaseFixture('benchmark') });
  await page.getByRole('button', { name: 'Start your rewind' }).click();
  await expect(page.locator('.transition-title')).toHaveCount(3);
  expect(await page.locator('.transition-title').first().evaluate(element => getComputedStyle(element).transform)).toBe(angle);
  await expect(page.locator('.transition-title').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect.poll(() => page.locator('.transition-title .title-music-glow').first().evaluate(element => Number(getComputedStyle(element).opacity))).toBeGreaterThan(.6);
  await page.evaluate(() => { window.musicTest.mode = 'silent'; });
  await expect.poll(() => page.locator('.transition-title .title-music-glow').first().evaluate(element => Number(getComputedStyle(element).opacity))).toBeLessThan(.05);
  await expect(page.locator('.slice-transition')).toHaveCount(0);
});

test('transition test page can enable real preview music and mute its glow', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');
  await page.evaluate(() => { window.musicTest.mode = 'loud'; });
  await page.getByRole('button', { name: 'Enable preview music' }).click();
  await expect.poll(() => page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--title-music-glow')))).toBeGreaterThan(.6);
  await page.getByRole('button', { name: 'Mute background music', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--title-music-glow')))).toBeLessThan(.05);
});
