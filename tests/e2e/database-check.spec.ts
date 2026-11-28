import { enterSite, dismissImageRecommendation } from '../fixtures/startup';
import { expect, test } from '@playwright/test';
import { databaseFixture } from '../fixtures/database';

async function choose(page: import('@playwright/test').Page, buffer: Buffer, name = 'VRCX.sqlite3') {
  await page.locator('.file-input').setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
}

test('validates real SQLite contents, updates button, and clears an earlier selection on error', async ({ page }) => {
  await page.goto('/');
  await enterSite(page);
  await choose(page, await databaseFixture(), 'renamed.data');
  await dismissImageRecommendation(page);
  await expect(page.getByRole('button', { name: 'Start your rewind' })).toBeEnabled();
  await expect(page.getByRole('status')).toContainText('checked. Ready for your rewind.');
  await expect(page.getByRole('status')).toContainText('renamed.data');
  await choose(page, Buffer.from('not sqlite'), 'VRCX.sqlite3');
  await expect(page.getByRole('status')).toContainText('not a SQLite database');
  await expect(page.getByRole('button', { name: 'Select your VRCX database' })).toBeEnabled();
});

for (const [kind, message] of [['unrelated', 'not have a recognized VRCX'], ['unsupported', 'not supported by this build']] as const) {
  test(`rejects ${kind} SQLite layout`, async ({ page }) => {
    await page.goto('/');
    await enterSite(page);
    await choose(page, await databaseFixture(kind));
    await expect(page.getByRole('status')).toContainText(message);
  });
}

test('rejects empty and truncated files', async ({ page }) => {
  await page.goto('/');
  await enterSite(page);
  await choose(page, Buffer.alloc(0));
  await expect(page.getByRole('status')).toContainText('empty');
  await choose(page, Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.alloc(100)]));
  await expect(page.getByRole('status')).toContainText('could not be read');
});

test('preloaded checker works offline without post-selection requests or stored data', async ({ page, context }) => {
  const wasmReady = page.waitForResponse(response => response.url().endsWith('.wasm') && response.status() === 200);
  await page.goto('/');
  await enterSite(page);
  await (await wasmReady).finished();
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await context.setOffline(true);
  await choose(page, await databaseFixture());
  await dismissImageRecommendation(page);
  await expect(page.getByRole('button', { name: 'Start your rewind' })).toBeEnabled();
  expect(requests).toEqual([]);
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, indexed: (await indexedDB.databases()).length }))).toEqual({ local: 0, session: 0, indexed: 0 });
});
for (const width of [1920, 390]) {
  test(`valid selection collapses the panel and permits replacement at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto('/');
    await enterSite(page);
    await choose(page, await databaseFixture());
    await dismissImageRecommendation(page);
    await expect(page.locator('.import-panel')).toHaveClass(/is-ready/);
    await expect(page.locator('.panel-copy')).not.toBeVisible();
    await expect(page.locator('.database-location')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Start your rewind' })).toBeVisible();
    await page.locator('.import-action').evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
    const panelBox = (await page.locator('.import-panel').boundingBox())!;
    const actionBox = (await page.locator('.import-action').boundingBox())!;
    const optionsBox=await page.locator('.landing-options').boundingBox();
    const groupBottom=optionsBox ? optionsBox.y+optionsBox.height : actionBox.y+actionBox.height;
    expect(Math.abs((actionBox.y+groupBottom)/2-panelBox.y-panelBox.height/2)).toBeLessThan(3);
    expect(panelBox.height).toBeGreaterThan(300);
    let pickerOpened = false;
    page.on('filechooser', () => { pickerOpened = true; });
    await page.getByRole('button', { name: 'Choose a new database' }).click();
    await expect(page.locator('.panel-copy')).toBeVisible();
    await expect(page.locator('.database-location')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select your VRCX database' })).toBeEnabled();
    expect(pickerOpened).toBe(false);
    const picker = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Select your VRCX database' }).click();
    await (await picker).setFiles({ name: 'replacement.sqlite3', mimeType: 'application/octet-stream', buffer: await databaseFixture() });
    await dismissImageRecommendation(page);
    await expect(page.getByRole('status')).toContainText('replacement.sqlite3 checked.');
    await page.locator('.import-action').evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
    await page.screenshot({ path: `test-results/database-ready-${width}.png` });
  });
}
for (const [kind, message] of [
  ['old-version', 'You may need to restart VRCX after the update'],
  ['future-version', 'newer VRCX database version'],
  ['missing-version', 'version is missing or invalid'],
  ['invalid-version', 'version is missing or invalid'],
  ['missing-configs', 'version is missing'],
] as const) {
  test(`rejects ${kind} metadata without starting recap SQL`, async ({ page }) => {
    await page.goto('/');
    await enterSite(page);
    await choose(page, await databaseFixture(kind));
    await expect(page.getByRole('status')).toContainText(message);
    await expect(page.getByRole('button', { name: 'Select your VRCX database' })).toBeEnabled();
    await expect(page.locator('tbody tr')).toHaveCount(0);
    await expect(page.locator('.preparation-status')).not.toBeVisible();
  });
}


test('ready import hides demo and keeps the landing and Share image switches available',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await enterSite(page);
  const demo=page.getByRole('button',{name:'Try demo',exact:true});
  await expect(demo).toBeVisible();
  await page.getByRole('switch',{name:'Load images from VRChat',exact:true}).check();
  await expect(page.locator('.image-permission-tooltip')).toBeVisible();
  await expect(page.locator('#allow-vrchat-images')).toBeChecked();
  await choose(page,await databaseFixture('benchmark'));
  await expect(page.getByRole('button',{name:'Start your rewind',exact:true})).toBeVisible();
  await expect(demo).toBeHidden();await expect(page.locator('.preparation-status')).toHaveCount(0);
  await expect(page.locator('.image-permission-tooltip')).toBeVisible();
  await page.screenshot({path:'test-results/landing-ready-clean.png',fullPage:true});
  await page.getByRole('button',{name:'Start your rewind',exact:true}).click();await page.getByRole('button',{name:'Go to Share',exact:true}).click();
  const shareImageSwitch=page.getByLabel('Load world and avatar pictures from VRChat');
  await expect(shareImageSwitch).toBeVisible();await expect(shareImageSwitch).toBeChecked();
  await shareImageSwitch.uncheck();
  await expect(shareImageSwitch).toBeVisible();await expect(shareImageSwitch).not.toBeChecked();
  await page.getByRole('button',{name:'Back to start',exact:true}).click();
  await expect(page.locator('.image-permission-tooltip')).toBeVisible();await expect(demo).toBeHidden();
  await page.getByRole('button',{name:'Choose a new database',exact:true}).click();
  await expect(demo).toBeVisible();await expect(page.getByRole('button',{name:'Select your VRCX database',exact:true})).toBeVisible();
});
