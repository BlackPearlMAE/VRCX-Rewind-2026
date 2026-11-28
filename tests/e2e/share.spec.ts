import initSqlJs from 'sql.js';
import { databaseFixture } from '../fixtures/database';
import { test, expect } from '@playwright/test';
import { enterSite, dismissImageRecommendation } from '../fixtures/startup';

test('share cards export offline, show friend details by default, and use local uploads', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/'); await enterSite(page);
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  await page.getByRole('button', { name: 'Go to End', exact: true }).click();
  await page.getByRole('button', { name: 'Share your rewind', exact: true }).click();
  const canvas = page.locator('.share-card-canvas');
  await expect(canvas).toBeVisible();
  await context.setOffline(true);
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await expect(canvas).toHaveAttribute('aria-label', /YOUR YEAR/);
  for (const kind of ['Worlds', 'Friends', 'Your stats']) {
    await page.getByRole('button', { name: kind, exact: true }).click();
    await expect(canvas).toHaveAttribute('aria-label', /\. 1\. .+\. 2\. .+\. 3\./);
    await expect(canvas).not.toHaveAttribute('aria-label', /\. 0[123]\. /);
    await canvas.screenshot({path:`test-results/share-base-${kind.replaceAll(' ','-')}.png`});
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toMatch(/vrcx-rewind-2026-(worlds|friends|stats)\.png/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const png = Buffer.concat(chunks);
    expect(png.readUInt32BE(16)).toBe(1120); expect(png.readUInt32BE(20)).toBe(1390);
  }
  await page.getByRole('button', { name: 'Friends', exact: true }).click();
  await expect(page.getByLabel('Include friend names and individual hours')).toHaveCount(0);
  await expect(canvas).toHaveAttribute('aria-label', /Moss/);
  await expect(canvas).toHaveAttribute('data-friends-winner-layout','split');
  await expect(canvas).toHaveAttribute('aria-label',/ONLINE AT THE SAME TIME.*Moss.*171 h online at the same time.*MOST FRIENDS IN COMMON.*MossSpark.*18 mutual friends/);
  await expect(canvas).not.toHaveAttribute('aria-label',/friends online with you/);
  await canvas.screenshot({path:'test-results/friends-card-details.png'});
  const png = await page.evaluate(() => { const c=document.createElement('canvas'); c.width=20; c.height=20; const x=c.getContext('2d')!; x.fillStyle='red'; x.fillRect(0,0,20,20); return c.toDataURL().split(',')[1]!; });
  await page.locator('.share-file').setInputFiles({name:'my-picture.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await expect(page.locator('.share-picture-status')).toHaveText('Your uploaded picture is selected.');
  await expect(page.getByLabel('Name on card')).toHaveValue('Demo user');
  await expect(page.getByLabel('Name on card')).not.toBeEditable();
  await page.getByLabel('Name on card').evaluate((input: HTMLInputElement) => {input.value='Changed name';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect(canvas).toHaveAttribute('aria-label', /Demo user/);
  await expect(page.getByLabel('Name on card')).toHaveValue('Demo user');
  const download = page.waitForEvent('download'); await page.getByRole('button', {name:'Download PNG',exact:true}).click(); await download;
  expect(requests.filter(url => !url.startsWith('blob:'))).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({path:'test-results/share-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/share-mobile.png',fullPage:true});
});


test('imported cards use the selected account and offer recent distinct loadable avatar pictures', async ({ page }) => {
  const SQL = await initSqlJs(), db = new SQL.Database(await databaseFixture('benchmark'));
  const account='usr'+'1'.repeat(32);
  db.run(`ALTER TABLE cache_avatar ADD COLUMN name TEXT; ALTER TABLE cache_avatar ADD COLUMN thumbnail_image_url TEXT; ALTER TABLE cache_avatar ADD COLUMN image_url TEXT;
    CREATE TABLE "${account}_avatar_history" (avatar_id TEXT,created_at TEXT,time INTEGER);`);
  for(let i=0;i<8;i++) {
    db.run('INSERT INTO cache_avatar (id,name,thumbnail_image_url) VALUES (?,?,?)',[`avtr_${i}`,`Synthetic avatar ${i}`,`https://files.vrchat.cloud/share-test-${i}.png`]);
    db.run(`INSERT INTO "${account}_avatar_history" VALUES (?,?,0)`,[`avtr_${i}`,`2026-10-${String(i+1).padStart(2,'0')}`]);
  }
  db.run(`INSERT INTO "${account}_avatar_history" VALUES ('avtr_7','2026-10-09',0)`);
  db.run(`INSERT INTO gamelog_join_leave VALUES
    (20,'usr_11111111-1111-1111-1111-111111111111','Old display name','2026-01-01T00:00:00Z','wrld_test:1','OnPlayerJoined',0),
    (21,'usr_11111111-1111-1111-1111-111111111111','Display Name ★','2026-10-01T00:00:00Z','wrld_test:1','OnPlayerJoined',0);`);
  const buffer=Buffer.from(db.export()); db.close();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/'); await enterSite(page);
  const png=await page.evaluate(()=>{ const c=document.createElement('canvas');c.width=c.height=20;return c.toDataURL().split(',')[1]!; });
  const imageRequests: string[]=[];
  await page.route('https://files.vrchat.cloud/share-test-*',async route=>{
    imageRequests.push(route.request().url());
    if(route.request().url().endsWith('7.png')) { await route.fulfill({status:404,body:''}); return; }
    await route.fulfill({status:200,contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:Buffer.from(png,'base64')});
  });
  await page.locator('.file-input').setInputFiles({name:'fixture.sqlite3',mimeType:'application/octet-stream',buffer});
  await dismissImageRecommendation(page);
  await expect(page.getByRole('button',{name:'Start your rewind',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Start your rewind',exact:true}).click();
  expect(imageRequests).toEqual([]);
  await page.getByRole('button',{name:'Go to Share',exact:true}).click();
  await expect(page.getByLabel('Name on card')).toHaveValue('Display Name ★');
  await expect(page.getByLabel('Name on card')).toBeEditable();
  await page.getByLabel('Name on card').fill('<img src=x onerror=alert(1)>');
  await expect(page.locator('.share-card-canvas')).toHaveAttribute('aria-label', /<img src=x onerror=alert\(1\)>/);
  await page.getByLabel('Name on card').fill('Display Name ★');
  expect(imageRequests).toEqual([]);
  await page.getByLabel('Load world and avatar pictures from VRChat').check();
  await expect(page.locator('#allow-vrchat-images')).toBeChecked();
  await expect(page.locator('.share-picture-options button')).toHaveCount(5);
  await expect(page.locator('.share-picture-options button').first()).toHaveAttribute('aria-label','Use Synthetic avatar 6');
  await expect(page.locator('.share-picture-status')).toHaveText('Recent worn avatars. Choose one or upload a picture.');
  await expect(page.locator('.share-picture-options button').first()).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'No picture',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'No picture',exact:true}).click();
  await page.locator('.share-load-avatars').evaluate((input:HTMLInputElement)=>{input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.getByLabel('Load world and avatar pictures from VRChat').check();
  await expect(page.locator('.share-picture-options button')).toHaveCount(5);
  await expect(page.getByRole('button',{name:'No picture',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.share-picture-options button[aria-pressed="true"]')).toHaveCount(0);
  await page.locator('.share-picture-options button').first().click();
  const downloaded=page.waitForEvent('download'); await page.getByRole('button',{name:'Download PNG',exact:true}).click(); await downloaded;
  await page.getByRole('button',{name:'Your stats',exact:true}).click();
  await expect(page.locator('.share-card-canvas')).toHaveAttribute('aria-label',/1\. hours played/);
  await page.getByRole('button',{name:'Back to start',exact:true}).click();
  await page.getByRole('button',{name:'Choose a new database',exact:true}).click();
  await page.getByRole('button',{name:'Try demo',exact:true}).click();
  await page.getByRole('button',{name:'Go to Share',exact:true}).click();
  await expect(page.locator('.share-picture-options button')).toHaveCount(0);
  await expect(page.getByLabel('Name on card')).toHaveValue('Demo user');
});


for (const width of [1920, 1440, 1024, 768, 390]) {
  test(`share controls receive actual pointer clicks at ${width}px`, async ({ page }) => {
    await page.setViewportSize({width,height:900}); await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto('/'); await enterSite(page);
    await page.getByRole('button',{name:'Try demo',exact:true}).click();
    await page.getByRole('button',{name:'Go to Share',exact:true}).click();
    await expect(page.locator('.recap-navigation')).toBeHidden();
    const content=await page.locator('.share-content').boundingBox();
    expect(Math.abs(content!.x+content!.width/2-(width/2))).toBeLessThan(2);
    const card=await page.locator('.share-card-canvas').boundingBox();expect(Math.abs(card!.x+card!.width/2-width/2)).toBeLessThan(2);
    for(const label of ['Worlds','Friends','Your stats','No picture']) {
      const button=page.getByRole('button',{name:label,exact:true}); await button.scrollIntoViewIfNeeded();
      const point=await button.evaluate(el=>{const r=el.getBoundingClientRect(); const x=r.left+8,y=r.top+r.height/2;return {x,y,receivesClick:el.contains(document.elementFromPoint(x,y))};});
      expect(point.receivesClick).toBe(true); await page.mouse.click(point.x,point.y);
      await expect(page.locator('.share-page')).toBeVisible();
    }
    const chooser=page.waitForEvent('filechooser'); await page.getByRole('button',{name:'Upload profile picture',exact:true}).click(); await (await chooser).setFiles([]);
    await expect(page.locator('.share-page')).toBeVisible();
    const download=page.waitForEvent('download'); await page.getByRole('button',{name:'Download PNG',exact:true}).click(); await download;
    await expect(page.locator('.share-page')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`test-results/share-redesign-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Back to recap',exact:true}).click();
    await expect(page.locator('.end-page')).toBeVisible();
    await expect(page.locator('.recap-navigation')).toBeVisible();
    await page.getByRole('button',{name:'Previous page',exact:true}).click();
    await expect(page.locator('.friends-page:not([hidden])')).toBeVisible();
  });
}

test('development page keeps its centered share layout and unobstructed controls', async ({page})=>{
  await page.setViewportSize({width:1366,height:900}); await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('http://127.0.0.1:4174'); await enterSite(page);
  await page.getByRole('button',{name:'Try demo',exact:true}).click();
  await page.getByRole('button',{name:'Go to Share',exact:true}).click();
  await expect(page.locator('.recap-navigation')).toBeHidden();
  const content=await page.locator('.share-content').boundingBox();
  expect(Math.abs(content!.x+content!.width/2-683)).toBeLessThan(2);
  await page.getByRole('button',{name:'Friends',exact:true}).click();
  await page.getByRole('button',{name:'No picture',exact:true}).click();
  await expect(page.locator('.share-page')).toBeVisible();
  await page.screenshot({path:'test-results/share-redesign-dev.png',fullPage:true});
});


test('chosen gradient and number shadow update all cards and match the downloaded PNG', async ({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'}); await page.goto('/'); await enterSite(page);
  await page.getByRole('button',{name:'Try demo',exact:true}).click();
  await page.getByRole('button',{name:'Go to Share',exact:true}).click();
  const canvas=page.locator('.share-card-canvas');
  const before=await canvas.evaluate((c: HTMLCanvasElement)=>Array.from(c.getContext('2d')!.getImageData(1030,1160,1,1).data));
  await page.getByLabel('Gradient color',{exact:true}).evaluate((el: HTMLInputElement)=>{el.value='#ff8800';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.getByLabel('Accent and number shadow',{exact:true}).evaluate((el: HTMLInputElement)=>{el.value='#00ff00';el.dispatchEvent(new Event('input',{bubbles:true}));});
  for(const label of ['Worlds','Friends','Your stats']) {
    await page.getByRole('button',{name:label,exact:true}).click();
    await expect(page.getByLabel('Gradient color',{exact:true})).toHaveValue('#ff8800');
    await expect(page.getByLabel('Accent and number shadow',{exact:true})).toHaveValue('#00ff00');
    const pixels=await canvas.evaluate((c: HTMLCanvasElement)=>{
      const x=c.getContext('2d')!, region=x.getImageData(64,c.dataset.worldsWinnerLayout ? 220 : c.dataset.friendsWinnerLayout ? 260 : 310,900,120).data;let green=0;
      for(let i=0;i<region.length;i+=4)if(region[i]===0&&region[i+1]===255&&region[i+2]===0)green++;
      const year=x.getImageData(866,40,150,70).data;let yearGreen=0;
      for(let i=0;i<year.length;i+=4)if(year[i]===0&&year[i+1]===255&&year[i+2]===0)yearGreen++;
      const hasHighlights=!!(c.dataset.worldsWinnerLayout || c.dataset.friendsWinnerLayout);
      const stats=x.getImageData(64,hasHighlights ? 660 : 500,952,hasHighlights ? 60 : 138).data;let statsGreen=0;
      for(let i=0;i<stats.length;i+=4)if(stats[i]===0&&stats[i+1]===255&&stats[i+2]===0)statsGreen++;
      return {background:Array.from(x.getImageData(1030,1160,1,1).data),green,yearGreen,statsGreen};
    });
    expect(pixels.background).not.toEqual(before); expect(pixels.green).toBeGreaterThan(50); expect(pixels.yearGreen).toBeGreaterThan(50); expect(pixels.statsGreen).toBeGreaterThan(50);
  }
  const preview=await canvas.evaluate((c: HTMLCanvasElement)=>c.toDataURL().split(',')[1]!);
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG',exact:true}).click();
  const stream=await (await downloaded).createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('base64')).toBe(preview);
  await expect(page.locator('.share-page')).toBeVisible();
});


for(const {merged,cors} of [{merged:true,cors:true},{merged:false,cors:true},{merged:true,cors:false}]) {
  test(`Worlds image card ${merged ? 'merges a shared winner' : 'highlights different winners'} with ${cors ? 'exportable' : 'preview-only'} artwork`,async({page})=>{
    const SQL=await initSqlJs(),db=new SQL.Database(await databaseFixture('benchmark'));
    db.run('DELETE FROM gamelog_location; DELETE FROM gamelog_join_leave; ALTER TABLE cache_world ADD COLUMN thumbnail_image_url TEXT; ALTER TABLE cache_world ADD COLUMN image_url TEXT;');
    const visits=[['a',0,merged?3600000:600000],['a',1,merged?3600000:600000],['a',2,merged?3600000:600000],['b',3,7200000],['c',4,600000],['d',5,600000],['e',6,600000]] as const;
    for(const id of ['a','b','c','d','e'])db.run('INSERT INTO cache_world (id,name,thumbnail_image_url) VALUES (?,?,?)',[`wrld_${id}`,`World ${id.toUpperCase()}`,`https://files.vrchat.cloud/card-world-${id}.png`]);
    visits.forEach(([id,day,duration],index)=>db.run('INSERT INTO gamelog_location VALUES (?,?,?,?,?,?)',[index+1,new Date(Date.UTC(2026,0,day+1,12)).toISOString(),`wrld_${id}:${index}`,`wrld_${id}`,`World ${id.toUpperCase()}`,duration]));
    const buffer=Buffer.from(db.export());db.close();
    await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await enterSite(page);
    const pictures=await page.evaluate(()=>{
      const result:Record<string,string>={};
      for(const [id,color] of [['a','#e04020'],['b','#2050e0'],['c','#20c080'],['d','#e0c020']]) {const c=document.createElement('canvas');c.width=120;c.height=80;const x=c.getContext('2d')!;x.fillStyle=color!;x.fillRect(0,0,120,80);result[id!]=c.toDataURL().split(',')[1]!;}
      return result;
    });
    const requests:string[]=[];
    await page.route('https://files.vrchat.cloud/card-world-*',async route=>{
      requests.push(route.request().url());const id=route.request().url().match(/world-([a-e])/)! [1]!;
      await route.fulfill(pictures[id] ? {status:200,contentType:'image/png',headers:cors ? {'access-control-allow-origin':'*'} : {'access-control-allow-origin':'https://different-origin.invalid'},body:Buffer.from(pictures[id]!,'base64')} : {status:404,body:''});
    });
    await page.locator('.file-input').setInputFiles({name:'fixture.sqlite3',mimeType:'application/octet-stream',buffer});
    await dismissImageRecommendation(page);
    await page.getByRole('button',{name:'Start your rewind',exact:true}).click();
    await page.getByRole('button',{name:'Go to Share',exact:true}).click();
    await page.getByRole('button',{name:'Worlds',exact:true}).click();
    expect(requests).toHaveLength(0);
    const canvas=page.locator('.share-card-canvas');
    await page.getByLabel('Load world and avatar pictures from VRChat').check();
    await expect(page.locator('.share-world-image-status')).toHaveText('World artwork is ready. Missing pictures use placeholders.');
    await expect(canvas).toHaveAttribute('data-worlds-winner-layout',merged?'merged':'split');
    await expect(canvas).toHaveAttribute('aria-label',new RegExp(`DISCOVERED THIS YEAR.*World ${merged?'A':'B'}.*Most time spent · ${merged?'3':'2'} h`));
    expect(requests).toHaveLength(cors ? 6 : 10);expect(new Set(requests).size).toBe(5);
    if(cors) {
    const pixels=await canvas.evaluate((c:HTMLCanvasElement)=>{const x=c.getContext('2d')!;return {left:Array.from(x.getImageData(100,550,1,1).data),right:Array.from(x.getImageData(600,550,1,1).data),circle:Array.from(x.getImageData(154,875,1,1).data),corner:Array.from(x.getImageData(127,848,1,1).data)};});
    if(merged) {expect(pixels.left[0]).toBeGreaterThan(pixels.left[2]!);expect(pixels.circle.slice(0,3)).toEqual([32,80,224]);}
    else {expect(pixels.left[2]).toBeGreaterThan(pixels.left[0]!);expect(pixels.right[0]).toBeGreaterThan(pixels.right[2]!);expect(pixels.circle.slice(0,3)).toEqual([224,64,32]);}
    expect(pixels.corner).not.toEqual(pixels.circle);
    const preview=await canvas.evaluate((c:HTMLCanvasElement)=>c.toDataURL().split(',')[1]!);
    const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG',exact:true}).click();
    const stream=await(await downloaded).createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(Buffer.from(chunk));expect(Buffer.concat(chunks).toString('base64')).toBe(preview);
    } else {
      await expect(page.locator('.share-download')).toBeHidden();
      await expect(page.locator('.share-export-note')).toContainText('technical limitations');
    }
    await page.evaluate(()=>{
      (window as unknown as {captureRequests:number}).captureRequests=0;
      navigator.mediaDevices.getDisplayMedia=async()=>{(window as unknown as {captureRequests:number}).captureRequests++;throw new Error('Manual screenshot view must not request screen sharing');};
    });
    await page.getByRole('button',{name:'Open screenshot view',exact:true}).click();
    const screenshotView=page.getByRole('dialog',{name:'Save your card with a screenshot'});
    await expect(screenshotView).toBeVisible();
    const bounds=await page.locator('.share-screenshot-canvas').boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height+1);
    await page.keyboard.press('ArrowLeft');await expect(screenshotView).toBeVisible();await expect(page.locator('.share-page')).toBeVisible();
    await page.keyboard.press('Escape');await expect(screenshotView).not.toBeVisible();
    expect(await page.evaluate(()=>(window as unknown as {captureRequests:number}).captureRequests)).toBe(0);
    await expect(page.getByRole('button',{name:'Open screenshot view',exact:true})).toBeFocused();
    await canvas.screenshot({path:`test-results/worlds-card-${merged?'merged':'split'}-${cors?'exportable':'preview'}.png`});
    await page.locator('.share-load-avatars').evaluate((input:HTMLInputElement)=>{input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}));});
    expect(await canvas.evaluate((c:HTMLCanvasElement)=>c.toDataURL().startsWith('data:image/png'))).toBe(true);
    await expect(page.getByRole('button',{name:'Download PNG',exact:true})).toBeEnabled();
  });
}


test('share-card labels and numbers match the fictional public demo',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await enterSite(page);
  await page.getByRole('button',{name:'Try demo',exact:true}).click();await page.getByRole('button',{name:'Go to Share',exact:true}).click();
  await page.getByRole('button',{name:'Worlds',exact:true}).click();
  const canvas=page.locator('.share-card-canvas');
  await expect(canvas).toHaveAttribute('aria-label',/discovered worlds/);
  await expect(canvas).toHaveAttribute('aria-label',/instances visited/);
  await expect(canvas).toHaveAttribute('aria-label',/created instances/);
  await expect(canvas).toHaveAttribute('aria-label',/533\. instances visited/);
  await expect(canvas).toHaveAttribute('aria-label',/Ritual \(v\.1\.3\)\. 59 h/);
  await expect(page.getByRole('group',{name:'Card version',exact:true})).toHaveCount(0);
  await expect(canvas).toHaveAttribute('aria-label',/created instances/);
  await expect(canvas).toHaveAttribute('aria-label',/instances visited/);
  await expect(canvas).toHaveAttribute('aria-label',/discovered worlds/);
});


test('Friends highlights show details by default and load thumbnails only with image loading enabled',async({page})=>{
  const SQL=await initSqlJs(),db=new SQL.Database(await databaseFixture('benchmark'));
  const account='usr'+'1'.repeat(32);
  db.run(`INSERT INTO "${account}_friend_log_history" VALUES (1,'usr_friend','Friend','2025-10-01T00:00:00.000Z');
    INSERT INTO "${account}_friend_log_history" VALUES (2,'usr_new','Friend','2026-01-01T00:00:00.000Z');
    INSERT INTO "${account}_friend_log_current" VALUES ('usr_new','New friend');
    INSERT INTO gamelog_join_leave VALUES (2,'usr_new','New friend','2026-04-18T05:30:00.000Z','wrld_test:1','OnPlayerLeft',900000);
    CREATE TABLE "${account}_feed_avatar" (id INTEGER,user_id TEXT,created_at TEXT,current_avatar_thumbnail_image_url TEXT,current_avatar_image_url TEXT);
    INSERT INTO "${account}_feed_avatar" VALUES (1,'usr_friend','2026-10-01','https://files.vrchat.cloud/share-friend-old.png','');
    INSERT INTO "${account}_feed_avatar" VALUES (2,'usr_new','2026-10-01','https://files.vrchat.cloud/share-friend-new.png','');`);
  const buffer=Buffer.from(db.export());db.close();
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await enterSite(page);
  const remoteRequests:string[]=[];page.on('request',request=>{if(request.url().includes('vrchat.cloud'))remoteRequests.push(request.url());});
  await page.locator('.file-input').setInputFiles({name:'friends.sqlite3',mimeType:'application/octet-stream',buffer});
  await dismissImageRecommendation(page);
  await page.getByRole('button',{name:'Start your rewind',exact:true}).click();
  await page.getByRole('button',{name:'Go to Share',exact:true}).click();
  await page.getByRole('button',{name:'Friends',exact:true}).click();
  const canvas=page.locator('.share-card-canvas');
  await expect(canvas).toHaveAttribute('data-friends-winner-layout','split');
  await expect(page.locator('.share-friend-picture-row')).toHaveCount(2);
  await expect(page.getByRole('button',{name:'Show all friends',exact:true})).toHaveAttribute('aria-pressed','false');
  await expect(canvas).toHaveAttribute('aria-label',/MOST TIME TOGETHER.*Synthetic friend.*1 h together.*TOP NEW FRIEND BY TIME.*New friend.*0 h together/);
  expect(remoteRequests).toEqual([]);
  const picture=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=80;const x=c.getContext('2d')!;x.fillStyle='#32b8bd';x.fillRect(0,0,80,80);return c.toDataURL().split(',')[1]!;});
  await page.route('https://files.vrchat.cloud/share-friend-*',route=>route.fulfill({status:200,contentType:'image/png',headers:{'access-control-allow-origin':'https://different-origin.invalid'},body:Buffer.from(picture,'base64')}));
  await page.getByLabel('Load world and avatar pictures from VRChat').check();
  await expect(page.locator('.share-picture-status')).toHaveText('No saved avatar pictures could be loaded. You can upload your own.');
  await expect.poll(()=>remoteRequests.length).toBe(4);
  await expect(page.locator('.share-download')).toBeHidden();
  await expect(page.locator('.share-export-note')).toContainText('technical limitations');
  await canvas.screenshot({path:'test-results/friends-card-split.png'});
  await page.getByRole('button',{name:'Open screenshot view',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Save your card with a screenshot'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.share-friend-picture-row')).toHaveCount(0);
  await expect(page.locator('.share-missing-pictures')).toBeHidden();
  await page.locator('.share-load-avatars').evaluate((input:HTMLInputElement)=>{input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}));});
  await expect(page.locator('.share-friend-picture-row')).toHaveCount(2);
  await page.getByRole('button',{name:'Show all friends',exact:true}).click();
  await expect(page.locator('.share-friend-picture-row')).toHaveCount(2);
  const localPicture=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=320;const x=c.getContext('2d')!;x.fillStyle='#2050e0';x.fillRect(0,0,80,320);x.fillStyle='#ed2040';x.fillRect(0,0,80,80);return c.toDataURL().split(',')[1]!;});
  for(const name of ['Synthetic friend','New friend']) {
    const chooser=page.waitForEvent('filechooser');
    await page.getByRole('button',{name:`Upload profile picture for ${name}`,exact:true}).click();
    await (await chooser).setFiles({name:'friend.png',mimeType:'image/png',buffer:Buffer.from(localPicture,'base64')});
    await expect(page.locator('.share-friend-upload-status')).toHaveText('Friend picture updated.');
    if(name==='Synthetic friend')await expect(page.locator('.share-friend-picture-row').filter({hasText:name})).toContainText('Uploaded picture');
  }
  await expect(page.locator('.share-download')).toBeVisible();
  expect(await canvas.evaluate((c:HTMLCanvasElement)=>Array.from(c.getContext('2d')!.getImageData(100,550,1,1).data))).toEqual([237,32,64,255]);
  expect(await canvas.evaluate((c:HTMLCanvasElement)=>Array.from(c.getContext('2d')!.getImageData(600,550,1,1).data))).toEqual([237,32,64,255]);
  expect(await canvas.evaluate((c:HTMLCanvasElement)=>Array.from(c.getContext('2d')!.getImageData(140,857,1,1).data))).toEqual([32,80,224,255]);
  await expect(page.locator('.share-missing-pictures')).toBeHidden();
  await expect(page.locator('.share-friend-picture-row')).toHaveCount(0);
  await page.locator('.share-load-avatars').evaluate((input:HTMLInputElement)=>{input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}));});
  await expect(page.locator('.share-friend-picture-row')).toHaveCount(0);
  expect(await canvas.evaluate((c:HTMLCanvasElement)=>c.toDataURL().startsWith('data:image/png'))).toBe(true);
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG',exact:true}).click();await downloaded;
  await page.getByRole('button',{name:'Your stats',exact:true}).click();await expect(page.locator('.share-friend-pictures')).toBeHidden();
  await expect(canvas).toHaveAttribute('aria-label',/TIME TOGETHER.*Synthetic friend.*NEW FRIENDS BY TIME.*New friend.*TIME IN WORLDS/);
  await page.getByRole('button',{name:'Friends',exact:true}).click();await expect(page.locator('.share-friend-picture-row')).toHaveCount(0);
  await page.screenshot({path:'test-results/friend-uploads-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.share-missing-pictures')).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/friend-uploads-mobile.png',fullPage:true});
  expect(remoteRequests).toHaveLength(4);
  await page.getByRole('button',{name:'Back to start',exact:true}).click();
  await page.getByRole('button',{name:'Choose a new database',exact:true}).click();
  await page.getByRole('button',{name:'Try demo',exact:true}).click();await page.getByRole('button',{name:'Go to Share',exact:true}).click();
  await page.getByRole('button',{name:'Friends',exact:true}).click();
  await expect(page.locator('.share-friend-picture-row')).toHaveCount(10);
  await expect(page.locator('.share-friend-picture-row')).not.toContainText(['Uploaded picture']);
});


test('HSV controls and pasted hex stay synchronized and preserve valid colors',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await enterSite(page);
  await page.getByRole('button',{name:'Try demo',exact:true}).click();await page.getByRole('button',{name:'Go to Share',exact:true}).click();
  const popup=page.getByRole('dialog',{name:'Gradient color picker',exact:true});
  await expect(popup).toBeHidden();
  await page.getByRole('button',{name:'Gradient color picker',exact:true}).click();await expect(popup).toBeVisible();
  const hex=page.getByLabel('Gradient color',{exact:true});
  await hex.fill('#ff0000');
  await expect(page.getByLabel('Gradient color hue',{exact:true})).toHaveValue('0');
  await expect(page.getByLabel('Gradient color saturation',{exact:true})).toHaveValue('100');
  await expect(page.getByLabel('Gradient color value',{exact:true})).toHaveValue('100');
  await page.getByLabel('Gradient color hue',{exact:true}).evaluate((input:HTMLInputElement)=>{input.value='120';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect(hex).toHaveValue('#00ff00');
  expect(await page.getByLabel('Gradient color saturation',{exact:true}).evaluate(el=>getComputedStyle(el).getPropertyValue('--hsv-track'))).toContain('#00ff00');
  expect(await page.getByLabel('Gradient color value',{exact:true}).evaluate(el=>getComputedStyle(el).getPropertyValue('--hsv-track'))).toContain('#00ff00');
  await hex.fill('0000FF');await expect(hex).toHaveValue('#0000ff');
  await expect(page.getByLabel('Gradient color hue',{exact:true})).toHaveValue('240');
  await hex.fill('#f0f');await hex.blur();await expect(hex).toHaveValue('#ff00ff');
  const canvas=page.locator('.share-card-canvas');
  const before=await canvas.evaluate((c:HTMLCanvasElement)=>c.toDataURL());
  await hex.fill('#zzzzzz');await hex.blur();await expect(hex).toHaveAttribute('aria-invalid','true');
  expect(await canvas.evaluate((c:HTMLCanvasElement)=>c.toDataURL())).toBe(before);
  await hex.fill('#ffffff');await expect(hex).not.toHaveAttribute('aria-invalid');
  const square=page.locator('.share-hsv-square').first();await square.click({position:{x:50,y:40}});
  await expect(hex).not.toHaveValue('#ffffff');
  const picked=await hex.inputValue();
  await page.getByRole('button',{name:'Friends',exact:true}).click();await expect(hex).toHaveValue(picked);
  await expect(popup).toBeHidden();
  await page.getByRole('button',{name:'Accent and number shadow picker',exact:true}).click();
  await page.getByLabel('Accent and number shadow',{exact:true}).fill('ABCDEF');
  await expect(page.getByLabel('Accent and number shadow',{exact:true})).toHaveValue('#abcdef');
  await page.getByRole('dialog',{name:'Accent and number shadow picker',exact:true}).screenshot({path:'test-results/hsv-picker.png'});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const activePopup=page.getByRole('dialog',{name:'Accent and number shadow picker',exact:true});
  await expect.poll(async()=>{const box=await activePopup.boundingBox();return !!box && box.x>=0 && box.x+box.width<=390 && box.y>=0 && box.y+box.height<=844;}).toBe(true);
  await activePopup.screenshot({path:'test-results/hsv-picker-mobile.png'});
  await page.keyboard.press('Escape');await expect(activePopup).toBeHidden();
  await page.getByRole('button',{name:'Gradient color picker',exact:true}).click();await expect(popup).toBeVisible();
  await page.getByRole('button',{name:'Accent and number shadow picker',exact:true}).click();await expect(popup).toBeHidden();await expect(activePopup).toBeVisible();
  await page.getByRole('button',{name:'Close Accent and number shadow picker',exact:true}).click();await expect(activePopup).toBeHidden();
  await expect(page.getByRole('button',{name:'Accent and number shadow picker',exact:true})).toBeFocused();
});


test('Your Stats focuses on hours and includes the requested metrics and highlights',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await enterSite(page);
  await page.getByRole('button',{name:'Try demo',exact:true}).click();await page.getByRole('button',{name:'Go to Share',exact:true}).click();
  await page.getByRole('button',{name:'Your stats',exact:true}).click();
  const canvas=page.locator('.share-card-canvas');
  await expect(canvas).toHaveAttribute('aria-label',/617\. hours played/);
  await expect(canvas).toHaveAttribute('aria-label',/longest streak.*days played.*25\. full days of playtime.*recorded sessions/);
  await expect(canvas).toHaveAttribute('aria-label',/TIME TOGETHER\. 1\. MossCloud.*77 h\. 2\. JuniperGlow.*\. 3\. MossRipple.*NEW FRIENDS BY TIME\. 1\. CloverDrift.*\. 2\. CloverRipple.*\. 3\. NimbusBloom.*TIME IN WORLDS\. 1\. Ritual.*59 h\. 2\. .*\. 3\./);
  await expect(canvas).toHaveAttribute('aria-label',/33\. friends made.*533\. instances visited.*51\. worlds discovered/);
  await expect(canvas).not.toHaveAttribute('aria-label',/of the year played|avatars uploaded|YOUR YEAR IN HOURS|161,3/);
  await expect(page.locator('.share-friend-picture-row')).toHaveCount(6);
  await canvas.screenshot({path:'test-results/your-stats-focused.png'});
});


test('Your Stats uses discoveries rather than all worlds visited',async({page})=>{
  const SQL=await initSqlJs(),db=new SQL.Database(await databaseFixture('benchmark'));
  const account='usr'+'1'.repeat(32);
  db.run(`INSERT INTO gamelog_location VALUES
    (2,'2026-04-19T05:00:00.000Z','wrld_test:1','wrld_test','Synthetic world',3600000),
    (3,'2026-04-20T05:00:00.000Z','wrld_old:2','wrld_old','Old world',3600000),
    (4,'2025-12-01T05:00:00.000Z','wrld_old:1','wrld_old','Old world',3600000);
    INSERT INTO "${account}_friend_log_history" VALUES (1,'usr_friend','Friend','2026-01-01T00:00:00.000Z');`);
  const buffer=Buffer.from(db.export());db.close();
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await enterSite(page);
  await page.locator('.file-input').setInputFiles({name:'stats.sqlite3',mimeType:'application/octet-stream',buffer});
  await dismissImageRecommendation(page);
  await page.getByRole('button',{name:'Start your rewind',exact:true}).click();await page.getByRole('button',{name:'Go to Share',exact:true}).click();
  await page.getByRole('button',{name:'Your stats',exact:true}).click();
  await expect(page.locator('.share-card-canvas')).toHaveAttribute('aria-label',/1\. friends made.*3\. instances visited.*1\. worlds discovered/);
});


test('image-free cards preserve their layout and labels across all card types',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await enterSite(page);
  await page.getByRole('button',{name:'Try demo',exact:true}).click();await page.getByRole('button',{name:'Go to Share',exact:true}).click();
  const canvas=page.locator('.share-card-canvas');
  for(const kind of ['Worlds','Friends','Your stats']) {
    await page.getByRole('button',{name:kind,exact:true}).click();
    await expect(page.getByRole('group',{name:'Card version',exact:true})).toHaveCount(0);
    const labels=await canvas.getAttribute('aria-label');
    expect(labels).not.toMatch(/,\d+\s*h(?:\b|$)/);
    const layout=await canvas.evaluate((c:HTMLCanvasElement)=>({width:c.width,height:c.height,worlds:c.dataset.worldsWinnerLayout,friends:c.dataset.friendsWinnerLayout}));
    await page.locator('.share-load-avatars').evaluate((input:HTMLInputElement)=>{input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}));});
    await expect(canvas).toHaveAttribute('aria-label',labels!);
    expect(await canvas.evaluate((c:HTMLCanvasElement)=>({width:c.width,height:c.height,worlds:c.dataset.worldsWinnerLayout,friends:c.dataset.friendsWinnerLayout}))).toEqual(layout);
    await expect(page.locator('.share-download')).toBeVisible();
    await canvas.screenshot({path:`test-results/no-images-${kind.replaceAll(' ','-')}.png`});
  }
});


test('missing world uploads live on the left, keep the card centered, and hide when complete',async({page})=>{
  const SQL=await initSqlJs(),db=new SQL.Database(await databaseFixture('benchmark'));
  db.run("INSERT INTO gamelog_location VALUES (2,'2026-04-19T05:00:00.000Z','wrld_other:1','wrld_other','Other world',7200000);");
  const buffer=Buffer.from(db.export());db.close();
  await page.setViewportSize({width:1920,height:1080});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await enterSite(page);
  const requests:string[]=[];page.on('request',request=>{if(request.url().includes('vrchat.cloud'))requests.push(request.url());});
  await page.locator('.file-input').setInputFiles({name:'worlds.sqlite3',mimeType:'application/octet-stream',buffer});
  await dismissImageRecommendation(page);
  await page.getByRole('button',{name:'Start your rewind',exact:true}).click();await page.getByRole('button',{name:'Go to Share',exact:true}).click();
  await page.getByRole('button',{name:'Worlds',exact:true}).click();
  const panel=page.locator('.share-missing-pictures'),canvas=page.locator('.share-card-canvas');
  await expect(page.locator('.share-world-picture-row')).toHaveCount(2);
  const card=await canvas.boundingBox(),left=await panel.boundingBox(),right=await page.locator('.share-editor').boundingBox();
  expect(Math.abs(card!.x+card!.width/2-960)).toBeLessThan(2);expect(left!.x+left!.width).toBeLessThan(card!.x);expect(right!.x).toBeGreaterThan(card!.x+card!.width);
  await page.screenshot({path:'test-results/missing-pictures-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/missing-pictures-mobile.png',fullPage:true});
  await page.setViewportSize({width:1920,height:1080});
  const picture=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=100;const x=c.getContext('2d')!;x.fillStyle='#20c080';x.fillRect(0,0,100,100);return c.toDataURL().split(',')[1]!;});
  for(const name of ['Synthetic world','Other world']) {
    const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:`Upload world picture for ${name}`,exact:true}).click();
    await (await chooser).setFiles({name:'world.png',mimeType:'image/png',buffer:Buffer.from(picture,'base64')});
    await expect(page.getByRole('button',{name:`Upload world picture for ${name}`,exact:true})).toHaveCount(0);
  }
  await expect(panel).toBeHidden();
  const centered=await canvas.boundingBox();expect(Math.abs(centered!.x+centered!.width/2-960)).toBeLessThan(2);
  expect(await canvas.evaluate((c:HTMLCanvasElement)=>Array.from(c.getContext('2d')!.getImageData(100,550,1,1).data))).toEqual([32,192,128,255]);
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG',exact:true}).click();await downloaded;
  await page.getByRole('button',{name:'Your stats',exact:true}).click();await expect(page.locator('.share-world-pictures')).toBeHidden();
  await page.getByRole('button',{name:'Worlds',exact:true}).click();await expect(panel).toBeHidden();
  expect(requests).toEqual([]);
  await page.getByRole('button',{name:'Back to start',exact:true}).click();await page.getByRole('button',{name:'Choose a new database',exact:true}).click();await page.getByRole('button',{name:'Try demo',exact:true}).click();await page.getByRole('button',{name:'Go to Share',exact:true}).click();
  await expect(panel).toBeVisible();expect(await page.locator('.share-world-picture-row').count()).toBeGreaterThan(0);
});


test('Your Stats opens first and other card tabs pulse only until opened',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/');await enterSite(page);
  await page.getByRole('button',{name:'Try demo',exact:true}).click();await page.getByRole('button',{name:'Go to Share',exact:true}).click();
  const stats=page.getByRole('button',{name:'Your stats',exact:true}),friends=page.getByRole('button',{name:'Friends',exact:true}),worlds=page.getByRole('button',{name:'Worlds',exact:true});
  await expect(stats).toHaveAttribute('aria-pressed','true');await expect(page.locator('.share-card-canvas')).toHaveAttribute('aria-label',/^YOUR YEAR/);
  await expect(page.locator('.share-settings-divider')).toHaveCount(3);
  expect(await friends.evaluate(el=>getComputedStyle(el).animationName)).toBe('share-card-invitation');
  expect(await worlds.evaluate(el=>getComputedStyle(el).animationName)).toBe('share-card-invitation');
  await page.emulateMedia({reducedMotion:'reduce'});expect(await friends.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await friends.click();await expect(friends).not.toHaveClass(/share-card-unopened/);await expect(worlds).toHaveClass(/share-card-unopened/);
  await worlds.click();await expect(worlds).not.toHaveClass(/share-card-unopened/);
  await stats.click();await expect(friends).not.toHaveClass(/share-card-unopened/);await expect(worlds).not.toHaveClass(/share-card-unopened/);
  await page.getByRole('button',{name:'Back to recap',exact:true}).click();await page.getByRole('button',{name:'Go to Share',exact:true}).click();
  await expect(friends).not.toHaveClass(/share-card-unopened/);
  await page.getByRole('button',{name:'Back to start',exact:true}).click();await page.getByRole('button',{name:'Try demo',exact:true}).click();await page.getByRole('button',{name:'Go to Share',exact:true}).click();
  await expect(stats).toHaveAttribute('aria-pressed','true');await expect(friends).not.toHaveClass(/share-card-unopened/);
});


for (const source of ['profile', 'world', 'friend'] as const) {
  test(`disabling images cancels an in-flight non-CORS ${source} fallback`, async ({ page }) => {
    await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');
    const url = 'https://files.vrchat.cloud/synthetic-consent.png';
    let fallback!: () => void;
    const requested = new Promise<void>(resolve => { fallback = resolve; });
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(url, async route => {
      if (route.request().headers()['origin']) await route.fulfill({ status: 403, body: '' });
      else { fallback(); await held; await route.abort(); }
    });
    await page.evaluate(async ({ source, url }) => {
      const { createSharePage } = await import('/src/pages/rewind/share.ts');
      const { setVRChatImagesAllowed } = await import('/src/components/world-thumbnail.ts');
      const Native = window.Image;
      const images: HTMLImageElement[] = [];
      (window as any).__consentImages = images;
      window.Image = function (...args: any[]) { const im = new Native(...args as []); images.push(im); return im; } as typeof Image;
      const share = createSharePage(() => {}, () => {}, async () => ({ pictures: source === 'profile' ? [{ avatarId: 'avtr_test', name: 'Synthetic', url }] : [] }));
      document.body.append(share.section);
      share.update({ worlds: [{ id: 'time', status: 'ready', total: 1, entries: [{ worldId: 'wrld_synthetic', name: 'Synthetic world', value: 1, ...(source === 'world' ? { imageUrl: url } : {}) }] }],
        friends: [{ id: 'time', status: 'ready', total: 1, rankingStatus: 'ready', source: 'import', entries: [{ userId: 'usr_synthetic', name: 'Synthetic friend', seconds: 3600, ...(source === 'friend' ? { imageUrl: url } : {}) }] }] });
      share.show(); setVRChatImagesAllowed(true);
    }, { source, url });
    try {
      await requested;
      await page.evaluate(async () => { const { setVRChatImagesAllowed } = await import('/src/components/world-thumbnail.ts'); setVRChatImagesAllowed(false); });
      expect(await page.evaluate(url => (window as any).__consentImages.filter((im: HTMLImageElement) => im.src === url).length, url)).toBe(0);
      await expect(page.locator('.share-download')).toBeEnabled();
    } finally { release(); }
  });
}
