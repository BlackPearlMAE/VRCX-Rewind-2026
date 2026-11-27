import { enterSite } from '../fixtures/startup';
import { expect, test } from '@playwright/test';

test('folder help opens, explains Windows path, and restores focus on Escape', async ({ page }) => {
  await page.goto('/');
  await enterSite(page);
  const help = page.getByRole('button', { name: 'Help finding your VRCX database' });
  await help.click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('VRCX.sqlite3');
  await expect(modal).toContainText('File name');
  await expect(modal.locator('.picker-filename-value code')).toHaveText(String.raw`%AppData%\VRCX\VRCX.sqlite3`);
  await expect(modal.locator('.picker-search')).toContainText('Search Documents');
  await expect(modal.locator('.explorer-window')).toBeVisible();
  await expect(modal.locator('.dialog-folder')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(modal).not.toBeVisible();
  await expect(help).toBeFocused();
  await help.click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(modal).not.toBeVisible();
});

test('folder help fits mobile and closes using its close button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await enterSite(page);
  await page.getByRole('button', { name: 'Help finding your VRCX database' }).click();
  const modal = page.getByRole('dialog');
  const box = await modal.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await modal.screenshot({ path: 'test-results/path-help-mobile.png' });
  await page.getByRole('button', { name: 'Close database help' }).click();
  await expect(modal).not.toBeVisible();
});

test('file-name illustration demonstrates pasting once scrolled into view', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await enterSite(page);
  await page.getByRole('button', { name: 'Help finding your VRCX database' }).click();
  const field = page.locator('.picker-filename-value');
  await field.scrollIntoViewIfNeeded();
  await expect(field).toHaveClass(/is-demonstrating/);
  const code = field.locator('code');
  await code.evaluate(element => { const animation = element.getAnimations()[0]!; animation.pause(); animation.currentTime = 800; });
  await expect(code).toHaveCSS('visibility', 'hidden');
  await code.evaluate(element => { element.getAnimations()[0]!.currentTime = 6000; });
  await expect(code).toHaveCSS('visibility', 'visible');
  const menu = field.locator('.picker-context-menu');
  await menu.evaluate(element => { const animation = element.getAnimations()[0]!; animation.pause(); animation.currentTime = 4000; });
  await expect(menu).toHaveCSS('visibility', 'visible');
  await expect(menu.locator('.context-paste')).toHaveText('Paste');
  await menu.evaluate(element => { element.getAnimations()[0]!.currentTime = 6000; });
  await expect(menu).toHaveCSS('visibility', 'hidden');
  await page.getByRole('dialog').screenshot({ path: 'test-results/path-help-paste-demo.png' });
});

test('reduced-motion help shows the completed path without animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await enterSite(page);
  await page.getByRole('button', { name: 'Help finding your VRCX database' }).click();
  const code = page.locator('.picker-filename-value code');
  await code.scrollIntoViewIfNeeded();
  await expect(code).toHaveCSS('visibility', 'visible');
  await expect(code).toHaveCSS('animation-name', 'none');
});
for (const width of [1280, 390]) {
  test(`illustrated cursor reaches Open at ${width}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await enterSite(page);
    await page.getByRole('button', { name: 'Help finding your VRCX database' }).click();
    const field = page.locator('.picker-filename-value');
    await field.scrollIntoViewIfNeeded();
    await expect(field).toHaveClass(/is-demonstrating/);
    const cursor = page.locator('.picker-demo-cursor');
    await cursor.evaluate(element => { const animation = element.getAnimations()[0]!; animation.pause(); animation.currentTime = 7600; });
    const open = page.locator('.picker-open');
    await open.evaluate(element => { const animation = element.getAnimations()[0]!; animation.pause(); animation.currentTime = 7600; });
    await expect(open).toHaveCSS('background-color', 'rgb(105, 82, 116)');
    const cursorBox = (await cursor.boundingBox())!;
    const openBox = (await open.boundingBox())!;
    expect(cursorBox.x).toBeGreaterThan(openBox.x);
    expect(cursorBox.x).toBeLessThan(openBox.x + openBox.width);
    expect(cursorBox.y).toBeGreaterThan(openBox.y);
    expect(cursorBox.y).toBeLessThan(openBox.y + openBox.height);
  });
}