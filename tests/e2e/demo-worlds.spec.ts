import { test, expect } from '@playwright/test';
import { enterSite } from '../fixtures/startup';
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
    if(images) { await page.getByRole('button',{name:'Back to start',exact:true}).click(); await page.locator('#allow-vrchat-images').check(); await page.getByRole('button',{name:'Try demo',exact:true}).click(); }
    for (const size of [{width:1920,height:1080},{width:1366,height:768}]) {
      await page.setViewportSize(size);
      for (const [id,title,count] of cases) {
        await page.getByRole('button',{name:'Go to '+title,exact:true}).click();
        const section = page.locator('[data-worlds="'+id+'"]');
        await expect(section.locator('.worlds-entry')).toHaveCount(count);
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
  for(const page of savedWorldsDemo()) for(const world of page.entries) expect(world.worldId).toMatch(/^wrld_[0-9a-f-]{36}$/);
});
