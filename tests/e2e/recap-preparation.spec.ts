import initSqlJs from 'sql.js';
import { enterSite, dismissImageRecommendation } from '../fixtures/startup';
import { test, expect } from '@playwright/test';
import { databaseFixture } from '../fixtures/database';

async function observeWorker(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    (window as any).__databaseMessages = [];
    (window as any).__databaseReplies = [];
    const Native = window.Worker;
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', event => (window as any).__databaseReplies.push(event.data.type));
      }
      postMessage(message: any, options?: any) {
        (window as any).__databaseMessages.push(message.type ?? 'check');
        super.postMessage(message, options);
      }
    };
  });
}

for (const version of [17, 18] as const) {
  test(`prepares a v${version} recap offline and reuses it when reopened`, async ({ page, context }) => {
    await observeWorker(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/'); await enterSite(page);
    await context.setOffline(true);
    const requests: string[] = []; page.on('request', r => requests.push(r.url()));
    await page.locator('.file-input').setInputFiles({ name: `synthetic-v${version}.sqlite3`, mimeType: 'application/octet-stream', buffer: await databaseFixture('benchmark', version) });
    await dismissImageRecommendation(page);
    const stages = ['timeline', 'records', 'worlds', 'friends'];
    await expect.poll(() => page.evaluate(() => (window as any).__databaseReplies.filter((type: string) => ['timeline', 'records', 'worlds', 'friends'].includes(type)))).toEqual(stages);
    await expect(page.locator('.sql-benchmark, .benchmark-cancel, .preparation-status')).toHaveCount(0);
    await page.getByRole('button', { name: 'Start your rewind', exact: true }).click();
    await page.getByRole('button', { name: 'Go to Share', exact: true }).click();
    await expect(page.locator('.share-card-canvas')).toHaveAttribute('aria-label', /1\. hours played/);
    await page.getByRole('button', { name: 'Back to start', exact: true }).click();
    await page.getByRole('button', { name: 'Start your rewind', exact: true }).click();
    await page.getByRole('button', { name: 'Go to Share', exact: true }).click();
    await expect(page.locator('.share-card-canvas')).toHaveAttribute('aria-label', /1\. hours played/);
    const messages: string[] = await page.evaluate(() => (window as any).__databaseMessages);
    expect(messages.filter(type => stages.includes(type))).toEqual(stages);
    expect(messages).not.toContain('benchmark');
    expect(messages).not.toContain('cached-result');
    expect(requests).toEqual([]);
  });
}

test('an early start shows one loading card until the ordered records are ready', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    let holding = true;
    const pending: (() => void)[] = [];
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', event => {
          if (!holding || event.data.type !== 'records') return;
          event.stopImmediatePropagation();
          pending.push(() => this.dispatchEvent(new MessageEvent('message', { data: event.data })));
        });
      }
    };
    Object.assign(window, { releaseRecords: () => {
      holding = false;
      pending.splice(0).forEach(reply => reply());
    } });
  });
  await page.goto('/');
  await enterSite(page);
  await page.locator('.file-input').setInputFiles({ name: 'pending.sqlite3', mimeType: 'application/octet-stream', buffer: await databaseFixture('benchmark') });
  await dismissImageRecommendation(page);
  await page.getByRole('button', { name: 'Start your rewind', exact: true }).click();
  await page.getByRole('button', { name: 'Go to Your records', exact: true }).click();
  const next = page.getByRole('button', { name: 'Next page', exact: true });
  const loadingNav = page.getByRole('button', { name: 'Go to Loading records', exact: true });
  const loading = page.getByRole('heading', { name: 'Your records are loading', exact: true });
  await expect(loadingNav).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Go to Most recorded time in VRChat', exact: true })).toHaveCount(0);
  await next.click();
  await expect(loading).toBeVisible();
  await next.click();
  await expect(page.getByRole('heading', { name: 'The worlds you explored', exact: true })).toBeVisible();
  await loadingNav.click();
  await expect(loading).toBeVisible();
  await page.evaluate(() => (window as Window & { releaseRecords: () => void }).releaseRecords());
  await expect(loadingNav).toHaveCount(0);
  await expect(loading).toBeHidden();
  await expect(page.locator('[data-record=time]')).toBeFocused();
  await expect(page.locator('[data-record=time] .record-number')).toHaveText('1');
});

test('the worker returns unavailable history and clears an earlier database without diagnostic APIs', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/'); await enterSite(page);
  const full = Array.from(await databaseFixture('benchmark'));
  const partial = Array.from(await databaseFixture());
  const result = await page.evaluate(async ({ full, partial }) => {
    const { createDatabaseChecker } = await import('/src/data/database-check.ts');
    const checker = createDatabaseChecker();
    try {
      const checked = await checker.check(new File([new Uint8Array(full)], 'full.sqlite3'));
      const before = await checker.loadTimeline(checked.accounts[0]);
      await checker.check(new File([new Uint8Array(partial)], 'partial.sqlite3'));
      const [timeline, records, worlds, friends] = await Promise.all([
        checker.loadTimeline(''), checker.loadRecords(''), checker.loadWorlds(''), checker.loadFriends(''),
      ]);
      return { before, timeline, records: records.length, worlds: worlds.length, friends: friends.length, hasDiagnostics: 'run' in checker || 'getResult' in checker };
    } finally { checker.stop(); }
  }, { full, partial });
  expect(result.before.ok).toBe(true);
  expect(result.timeline.ok).toBe(false);
  expect(result.records).toBeGreaterThan(0);
  expect(result.worlds).toBeGreaterThan(0);
  expect(result.friends).toBeGreaterThan(0);
  expect(result.hasDiagnostics).toBe(false);
});

test('replacing a database cancels its preparation and shows only the new recap', async ({ page, context }) => {
  await observeWorker(page);
  const SQL = await initSqlJs(), db = new SQL.Database(await databaseFixture('benchmark'));
  db.run('UPDATE gamelog_location SET time = 7200000');
  const replacement = Buffer.from(db.export()); db.close();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/'); await enterSite(page); await context.setOffline(true);
  await page.locator('.file-input').setInputFiles({ name: 'first.sqlite3', mimeType: 'application/octet-stream', buffer: await databaseFixture('benchmark') });
  await dismissImageRecommendation(page);
  await page.getByRole('button', { name: 'Choose a new database', exact: true }).click();
  await page.locator('.file-input').setInputFiles({ name: 'second.sqlite3', mimeType: 'application/octet-stream', buffer: replacement });
  await dismissImageRecommendation(page);
  await page.getByRole('button', { name: 'Start your rewind', exact: true }).click();
  await page.getByRole('button', { name: 'Go to Share', exact: true }).click();
  await expect(page.locator('.share-card-canvas')).toHaveAttribute('aria-label', /2\. hours played/);
  await expect(page.locator('.sql-benchmark')).toHaveCount(0);
  const messages: string[] = await page.evaluate(() => (window as any).__databaseMessages);
  expect(messages.filter(type => type === 'initialize')).toHaveLength(2);
  expect(messages).not.toContain('benchmark');
});

test('optimized online overlap preserves closed intervals, gaps, repeated statuses and boundary visits',async({page})=>{
  const SQL=await initSqlJs(),db=new SQL.Database(await databaseFixture('benchmark'));
  const account='usr'+'1'.repeat(32),from=Date.parse('2025-12-31T23:00:00.000Z');
  db.run(`DELETE FROM gamelog_location;DELETE FROM gamelog_join_leave;DELETE FROM "${account}_friend_log_current";
    CREATE TABLE "${account}_feed_online_offline" (id INTEGER,user_id TEXT,type TEXT,created_at TEXT);`);
  const visits:{start:number;end:number}[]=[];
  let visitId=0,eventId=0;
  function visit(start:number,duration:number){db.run('INSERT INTO gamelog_location VALUES (?,?,?,?,?,?)',[++visitId,new Date(start).toISOString(),'wrld_test:'+visitId,'wrld_test','World',duration]);}
  visit(from-1800000,10800000);visits.push({start:from,end:from+9000000});
  for(let day=0;day<20;day++){
    const start=Date.UTC(2026,0,day+1,12);visit(start,7200000);visits.push({start,end:start+7200000});
    if(day%4===0)visit(start+1800000,5400000);
  }
  const expected:{userId:string;seconds:number}[]=[];
  let seed=39219;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let person=0;person<64;person++){
    const userId='usr_peer_'+String(person).padStart(2,'0');db.run(`INSERT INTO "${account}_friend_log_current" VALUES (?,?)`,[userId,'Peer '+person]);
    const events:{id:number;at:number;type:string}[]=[];
    function status(at:number,type:string){events.push({id:++eventId,at,type});}
    if(person===0){status(from-3600000,'Online');status(Date.UTC(2026,0,1,14),'Offline');}
    else if(person===1){status(Date.UTC(2026,0,1,13),'Online');status(Date.UTC(2026,0,1,13,30),'Online');status(Date.UTC(2026,0,1,14),'Offline');}
    else if(person===2)status(Date.UTC(2026,0,1,12),'Online');
    else for(let interval=0;interval<18;interval++){
      const at=Date.UTC(2026,0,Math.floor(random()*24)-1,Math.floor(random()*24),Math.floor(random()*60),0,123);
      status(at,'Online');if(random()>.12)status(at+Math.floor(random()*8+1)*900000,'Offline');
      if(interval%7===0)status(at,'Online');
    }
    events.sort((a,b)=>a.at-b.at||a.id-b.id);
    for(const event of events)db.run(`INSERT INTO "${account}_feed_online_offline" VALUES (?,?,?,?)`,[event.id,userId,event.type,new Date(event.at).toISOString()]);
    let seconds=0;
    events.forEach((event,index)=>{const next=events[index+1];if(event.type!=='Online'||next?.type!=='Offline'||next.at<=event.at)return;for(const own of visits)seconds+=Math.max(0,Math.min(own.end,next.at)-Math.max(own.start,event.at))/1000;});
    if(seconds>0)expected.push({userId,seconds});
  }
  expected.sort((a,b)=>b.seconds-a.seconds||a.userId.localeCompare(b.userId));
  const bytes=Array.from(db.export());db.close();
  await page.goto('http://127.0.0.1:4174');await enterSite(page);
  const results=await page.evaluate(async ({bytes,excluded})=>{
    const {createDatabaseChecker}=await import('/src/data/database-check.ts');const checker=createDatabaseChecker();
    try {
      const checked=await checker.check(new File([new Uint8Array(bytes)],'overlap.sqlite3'));
      const normal=(await checker.loadFriends(checked.accounts![0]!)).find((page:{id?:string})=>page.id==='overlap');
      const filtered=(await checker.loadFriends(checked.accounts![0]!,[excluded])).find((page:{id?:string})=>page.id==='overlap');
      return {normal,filtered};
    }finally{checker.stop();}
  },{bytes,excluded:expected[0]!.userId});
  const result=results.normal;
  expect(result?.status).toBe('ready');expect(result?.total).toBe(expected.length);
  expect(result?.entries.map((entry:{userId:string})=>entry.userId)).toEqual(expected.slice(0,10).map(entry=>entry.userId));
  result?.entries.forEach((entry:{seconds:number},index:number)=>expect(entry.seconds).toBeCloseTo(expected[index]!.seconds,3));
  expect(results.filtered?.total).toBe(expected.length-1);
  expect(results.filtered?.entries.map((entry:{userId:string})=>entry.userId)).toEqual(expected.slice(1,11).map(entry=>entry.userId));
});


test('account selection and switching work offline with account-specific Friends and shared playtime', async ({ page, context }) => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(await databaseFixture('multi-account'));
  for (const [suffix, count, name] of [['1', 1, 'Synthetic account one'], ['2', 2, 'Synthetic account two']] as const) {
    const account = 'usr' + suffix.repeat(32);
    const self = `usr_${suffix.repeat(8)}-${suffix.repeat(4)}-${suffix.repeat(4)}-${suffix.repeat(4)}-${suffix.repeat(12)}`;
    db.run('INSERT INTO gamelog_join_leave (user_id,display_name,created_at,type) VALUES (?,?,?,?)', [self, name, '2026-04-18T05:00:00.000Z', 'OnPlayerJoined']);
    for (let i = 0; i < count; i++) db.run(`INSERT INTO "${account}_friend_log_history" VALUES (?,?,?,?)`, [i + 1, 'usr_new_' + suffix + i, 'Friend', '2026-04-18T05:00:00.000Z']);
  }
  const buffer = Buffer.from(db.export()); db.close();
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/'); await enterSite(page);
  await context.setOffline(true);
  const requests: string[] = []; page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
  await page.locator('.file-input').setInputFiles({ name: 'accounts.sqlite3', mimeType: 'application/octet-stream', buffer });
  await dismissImageRecommendation(page);
  const account = page.getByLabel('Account for your rewind', { exact: true });
  await expect(account).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start your rewind', exact: true })).toBeDisabled();
  await expect(page.locator('.account-history-note')).toContainText('shared database history');
  for (const [suffix, count, name] of [['2', 2, 'Synthetic account two'], ['1', 1, 'Synthetic account one']] as const) {
    await expect(account.locator(`option[value="usr${suffix.repeat(32)}"]`)).toHaveText(name);
    await account.selectOption({ label: name });
    await page.getByRole('button', { name: 'Start your rewind', exact: true }).click();
    await page.getByRole('button', { name: 'Go to Share', exact: true }).click();
    await expect(page.locator('.share-card-canvas')).toHaveAttribute('aria-label', new RegExp(`1\\. hours played.*${count}\\. friends made`));
    await expect(page.getByLabel('Name on card')).toHaveValue(name);
    await page.getByRole('button', { name: 'Back to start', exact: true }).click();
  }
  expect(requests).toEqual([]);
});

test('excluding an imported friend refills the ranking and updates the new-friends record', async ({ page, context }) => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(await databaseFixture('benchmark'));
  const account = 'usr' + '1'.repeat(32);
  for (let i = 1; i <= 11; i++) {
    const id = 'usr_sample_' + i;
    const name = 'Friend ' + i;
    db.run(`INSERT INTO "${account}_friend_log_current" VALUES (?, ?)`, [id, name]);
    db.run(`INSERT INTO "${account}_friend_log_history" VALUES (?, ?, ?, ?)`, [i, id, 'Friend', '2026-04-01T12:00:00Z']);
    db.run('INSERT INTO gamelog_join_leave VALUES (?, ?, ?, ?, ?, ?, ?)', [i + 1, id, name, '2026-04-18T05:30:00.000Z', 'wrld_test:1', 'OnPlayerLeft', i * 60000]);
  }
  const buffer = Buffer.from(db.export());
  db.close();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await enterSite(page);
  await context.setOffline(true);
  await page.locator('.file-input').setInputFiles({ name: 'friends.sqlite3', mimeType: 'application/octet-stream', buffer });
  await dismissImageRecommendation(page);
  await page.getByRole('button', { name: 'Start your rewind', exact: true }).click();
  const friends = page.locator('[data-friends=added]');
  const record = page.locator('[data-record=friends]');
  const goToFriends = page.getByRole('button', { name: 'Go to New friends made', exact: true });
  const goToRecord = page.getByRole('button', { name: 'Go to Most new friends added', exact: true });
  await goToFriends.click();
  await expect(friends.locator('.friends-number')).toHaveText('11');
  await expect(friends.locator('.worlds-name').last()).toHaveText('Friend 2');
  await friends.getByRole('button', { name: 'Exclude Friend 11 from this recap', exact: true }).click();
  await expect(friends.locator('.friends-number')).toHaveText('10');
  await expect(friends.locator('.worlds-name').last()).toHaveText('Friend 1');
  await goToRecord.click();
  await expect(record.locator('.record-number')).toHaveText('10');
  await goToFriends.click();
  await page.getByRole('button', { name: 'Excluded users (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Friend 11 from exclusions', exact: true }).click();
  await expect(friends.locator('.friends-number')).toHaveText('11');
  await expect(friends.locator('.worlds-name').first()).toHaveText('Friend 11');
  await page.keyboard.press('Escape');
  await goToRecord.click();
  await expect(record.locator('.record-number')).toHaveText('11');
});
