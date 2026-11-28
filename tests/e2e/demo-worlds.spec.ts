import { test, expect } from '@playwright/test';
import initSqlJs from 'sql.js';
import { enterSite, dismissImageRecommendation } from '../fixtures/startup';
import { databaseFixture } from '../fixtures/database';
import { savedWorldsDemo } from '../../src/data/worlds-demo';

test('demo world lists match import sizes and fit the recap with and without artwork', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const picture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
  const requests: string[] = [];
  await page.route('https://api.vrchat.cloud/**', async route => { requests.push(route.request().url()); await route.fulfill({status:200,contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:picture}); });
  await page.goto('/'); await enterSite(page);
  await page.getByRole('button',{name:'Try demo',exact:true}).click();
  const cases = [['discoveries','New worlds discovered',5],['owned','Your instances',5],['visits','Your most visited worlds',10],['time','Where you spent your time',10]] as const;
  for (const images of [false,true]) {
    if (images) {
      await page.getByRole('button', { name: 'Go to Most time in one world', exact: true }).click();
      const recordSwitch = page.locator('[data-record="world-time"]').getByRole('switch', { name: 'Load images from VRChat' });
      await expect(recordSwitch).toBeVisible();
      await recordSwitch.check();
      await expect(recordSwitch).toBeVisible();
      await expect(recordSwitch).toBeChecked();
      await expect(page.locator('[data-record="world-time"] .record-world-image img')).toBeVisible();
    }
    for (const size of [{width:1920,height:1080},{width:1366,height:768}]) {
      await page.setViewportSize(size);
      for (const [id,title,count] of cases) {
        await page.getByRole('button',{name:'Go to '+title,exact:true}).click();
        const section = page.locator('[data-worlds="'+id+'"]');
        await expect(section.locator('.worlds-entry')).toHaveCount(count);
        const imageSwitch = section.getByRole('switch', { name: 'Load images from VRChat' });
        if (images) await expect(imageSwitch).toBeHidden();
        else await expect(imageSwitch).toBeVisible();
        const boxes=await section.locator('.worlds-entry').evaluateAll(rows=>rows.map(row=>{const r=row.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));
        const stage=(await section.locator('.recap-stage').boundingBox())!;
        for(const box of boxes){expect(box.top).toBeGreaterThanOrEqual(stage.y-1);expect(box.bottom).toBeLessThanOrEqual(stage.y+stage.height+1);}
        if(images)await expect(section.locator('.record-world-image img')).toHaveCount(count);
        await section.screenshot({path:'test-results/demo-worlds-'+id+'-'+size.width+'-'+images+'.png'});
      }
    }
    if(!images)expect(requests).toEqual([]);
  }
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every(url=>url.startsWith('https://api.vrchat.cloud/api/1/image/file_'))).toBe(true);
  await page.getByRole('button', { name: 'Go to Most time in one world', exact: true }).click();
  const recordSwitch = page.getByRole('switch', { name: 'Load images from VRChat' });
  await expect(recordSwitch).toBeChecked();
  await recordSwitch.uncheck();
  await expect(recordSwitch).toBeVisible();
  await page.getByRole('button', { name: 'Go to Share', exact: true }).click();
  const shareSwitch = page.getByLabel('Load world and avatar pictures from VRChat');
  await expect(shareSwitch).not.toBeChecked();
  await shareSwitch.check();
  await expect(shareSwitch).toBeVisible();
  await expect(shareSwitch).toBeChecked();
  await page.getByRole('button', { name: 'Go to Most time in one world', exact: true }).click();
  await expect(recordSwitch).toBeHidden();
  for(const page of savedWorldsDemo()) for(const world of page.entries) expect(world.worldId).toMatch(/^wrld_[0-9a-f-]{36}$/);
});

test('a world thumbnail hides one world from rankings and Share while preserving totals and Records', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await enterSite(page);
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  await page.getByRole('button', { name: 'Go to Your worlds', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const exercise = page.locator('.worlds-exclusion-intro');
  await expect(exercise).toContainText('Your totals and Records still include it.');
  const practice = exercise.getByRole('button', { name: 'Hide Example world from practice rankings' });
  await expect(practice.locator('.world-icon')).toBeVisible();
  await practice.hover();
  await expect(practice.locator('.exclusion-cross, .exclusion-cross-preview')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await practice.click();
  await expect(exercise.locator('.exclusion-cross path')).toHaveCount(2);
  await expect(page.locator('body > .exclusion-flight')).toHaveCount(1);
  const dropdown = page.getByRole('region', { name: 'Recap exclusions', exact: true });
  await expect(dropdown.locator('.exclusions-list')).toContainText('Example world');
  await expect(dropdown.locator('.exclusions-entry-icon .world-icon')).toBeVisible();
  await expect(page.locator('body > .exclusion-flight')).toHaveCount(0);
  await dropdown.getByRole('button', { name: 'Remove Example world from exclusions' }).click();
  await expect(exercise.locator('.exclusion-cross')).toHaveCount(0);
  await expect(practice).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await practice.click();
  await expect(dropdown).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1920, height: 1080 });
  const record = page.locator('[data-record=world-time]');
  await page.getByRole('button', { name: 'Go to Most time in one world', exact: true }).click();
  const recordText = await record.innerText();
  const time = page.locator('[data-worlds=time]');
  await page.getByRole('button', { name: 'Go to Where you spent your time', exact: true }).click();
  const exclusions = page.locator('.recap-exclusions-toggle');
  await expect(exclusions).toBeVisible();
  const total = await time.locator('.worlds-ranking-total').innerText();
  const ritual = time.getByRole('button', { name: 'Hide Ritual (v.1.3) from world rankings', exact: true });
  await expect(ritual.locator('.world-icon')).toBeVisible();
  await ritual.hover();
  await expect(ritual.locator('.exclusion-cross, .exclusion-cross-preview')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await ritual.click();
  await expect(page.locator('body > .worlds-thumbnail-action.exclusion-flight .exclusion-cross')).toBeVisible();
  await expect(dropdown).toBeHidden();
  await expect(page.locator('body > .exclusion-flight')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await exclusions.click();
  const excludedWorld = dropdown.getByRole('listitem').filter({ hasText: 'Ritual (v.1.3)' });
  const excludedGlobe = excludedWorld.locator('.exclusions-entry-icon .world-icon');
  await expect(excludedGlobe).toBeVisible();
  await expect(excludedGlobe).toHaveCSS('stroke', 'rgb(169, 235, 226)');
  await page.keyboard.press('Escape');
  await expect(time.locator('.worlds-ranking-total')).toHaveText(total);
  await expect(time.locator('.worlds-entry')).toHaveCount(10);
  await expect(time.locator('.worlds-name').last()).toHaveText('Estates (POSTAL 2)');
  await page.getByRole('button', { name: 'Go to Share', exact: true }).click();
  const canvas = page.locator('.share-card-canvas');
  await expect(canvas).toHaveAttribute('aria-label', /TIME IN WORLDS.*Peaceful Orbit/);
  await expect(canvas).not.toHaveAttribute('aria-label', /Ritual/);
  await page.getByRole('button', { name: 'Go to Most time in one world', exact: true }).click();
  await expect(record).toHaveText(recordText, { useInnerText: true });
  await page.getByRole('button', { name: 'Go to Where you spent your time', exact: true }).click();
  await time.getByRole('button', { name: 'Hide Peaceful Orbit from world rankings', exact: true }).click();
  await expect(ritual).toBeVisible();
  await exclusions.click();
  await expect(dropdown.getByRole('button', { name: 'Remove Ritual (v.1.3) from exclusions' })).toHaveCount(0);
  await dropdown.getByRole('button', { name: 'Remove Peaceful Orbit from exclusions' }).click();
  await expect(time.getByRole('button', { name: 'Hide Peaceful Orbit from world rankings', exact: true })).toBeVisible();
  await expect(dropdown.getByRole('button', { name: 'Remove Peaceful Orbit from exclusions' })).toHaveCount(0);
  await expect(time.locator('.worlds-ranking-total')).toHaveText(total);
});

test('an imported world ranking refills from its backup without another worker query', async ({ page }) => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(await databaseFixture('benchmark'));
  db.run('DELETE FROM gamelog_location; DELETE FROM gamelog_join_leave;');
  for (let i = 1; i <= 11; i++) {
    const id = `wrld_fixture_${i}`;
    db.run('INSERT INTO gamelog_location VALUES (?, ?, ?, ?, ?, ?)', [i, new Date(Date.UTC(2026, 3, i)).toISOString(), id + ':1', id, 'World ' + i, i * 3600000]);
  }
  const buffer = Buffer.from(db.export());
  db.close();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const requests: string[] = [];
    Object.assign(window, { worldTestRequests: requests });
    window.Worker = class extends NativeWorker {
      postMessage(message: { type?: string }, transfer?: Transferable[]) {
        requests.push(message.type ?? 'check');
        super.postMessage(message, transfer ?? []);
      }
    };
  });
  await page.goto('/');
  await enterSite(page);
  await page.locator('.file-input').setInputFiles({ name: 'worlds.sqlite3', mimeType: 'application/octet-stream', buffer });
  await dismissImageRecommendation(page);
  await page.getByRole('button', { name: 'Start your rewind', exact: true }).click();
  await page.getByRole('button', { name: 'Go to Where you spent your time', exact: true }).click();
  const time = page.locator('[data-worlds=time]');
  await expect(time.locator('.worlds-name').last()).toHaveText('World 2');
  await time.getByRole('button', { name: 'Hide World 11 from world rankings', exact: true }).click();
  await expect(time.locator('.worlds-name').last()).toHaveText('World 1');
  await expect(time.locator('.worlds-entry')).toHaveCount(10);
  await expect(time.locator('.worlds-ranking-total')).toHaveText('66 estimated hours across all worlds');
  const requests = await page.evaluate(() => (window as Window & { worldTestRequests: string[] }).worldTestRequests);
  expect(requests.filter(type => type === 'worlds')).toHaveLength(1);
});
