import { expect, test } from '@playwright/test';

// Direct synthetic component checks; no browser click-through of the recap.
async function mount(page: import('@playwright/test').Page, reduced = true, id = 'added') {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');
  await expect(page.locator('.timeline-lab')).toBeVisible();
  await expect(page.locator('#startup')).toHaveCount(0);
  await page.evaluate(async id => {
    const { createFriendsPage } = await import('/src/pages/rewind/friends.ts');
    const { friendsChapterDemo } = await import('/src/data/friends-data.ts');
    const { createStoryPage } = await import('/src/pages/rewind/story.ts');
    const { createRecapChrome } = await import('/src/components/recap-chrome.ts');
    const host = document.createElement('main');
    const stats = { starts: 0, awards: [] as number[], finishes: [] as boolean[], stops: 0 };
    const intro = createStoryPage(() => {}, () => {});
    const story = createStoryPage(() => {}, () => {}, () => chrome.show(1), {
      id: 'friends-story-title', kicker: 'Now, let’s take a closer look at', title: 'the friends you made',
      copy: 'and the people you met along the way.',
      disclaimer: 'Sadly, profile images can’t be loaded reliably. We’ll do our best to show saved avatar pictures instead. These may be older or unavailable.',
    });
    story.section.classList.add('friends-story');
    const friends = createFriendsPage(() => {}, () => {}, () => chrome.show(2), {
      start() { stats.starts++; }, update() {}, settled(rank: number) { stats.awards.push(rank); },
      finish(done: boolean) { stats.finishes.push(done); }, stop() { stats.stops++; },
    }, { id: id as any });
    host.append(intro.section, story.section, friends.section);
    const chrome = createRecapChrome(host, [intro.section, story.section, friends.section], () => {}, () => {}, () => {});
    chrome.setPages([intro.section, story.section, friends.section], ['Your story', 'Your friends', 'New friends made']);
    const root = document.getElementById('app')!; root.inert = false; root.replaceChildren(host);
    document.getElementById('startup')?.remove(); document.body.classList.remove('is-starting');
    (window as any).__friends = friends; (window as any).__friendsStory = story; (window as any).__friendsStats = stats;
    friends.update(friendsChapterDemo().find((page: any) => page.id === id)); friends.show();
  }, id);
}

test('Friends components render synthetic data, safe names, unavailable and empty results', async ({ page }) => {
  await mount(page);
  await expect(page.locator('.friends-number')).toHaveText('47');
  await expect(page.locator('.friends-list li')).toHaveCount(10);
  const totalBox = (await page.locator('.friends-number').boundingBox())!;
  const firstRow = (await page.locator('.friends-list li').first().boundingBox())!;
  const lastRow = (await page.locator('.friends-list li').last().boundingBox())!;
  expect(totalBox.x + totalBox.width).toBeLessThan(firstRow.x);
  expect(lastRow.x).toBeGreaterThan(firstRow.x);
  expect(lastRow.y).toBeGreaterThan(firstRow.y);
  const avatar = (await page.locator('.friends-avatar').first().boundingBox())!;
  expect(avatar.width).toBeGreaterThanOrEqual(40);
  expect(avatar.width).toBeLessThanOrEqual(80);
  expect(totalBox.x).toBeLessThan(1920 * .2);
  expect(totalBox.x).toBeGreaterThan(1920 * .08);
  expect(lastRow.x + lastRow.width).toBeLessThan(1920 * .92);

  await expect(page.locator('.friends-demo-label')).toBeVisible();
  await expect(page.locator('.friends-avatar img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  const layout = await page.locator('.friends-content').boundingBox();
  expect(layout!.y + layout!.height).toBeLessThan(1080 - 120);
  await expect(page.locator('.friends-measurement')).toHaveText('Estimated time in the same instance after becoming friends this year.');
  await expect(page.locator('.friends-page')).not.toContainText('idle time');
  const dataRuler = (await page.locator('.friends-page .recap-interlude-ruler').boundingBox())!;
  const measurement = (await page.locator('.friends-measurement').boundingBox())!;
  expect(measurement.y + measurement.height).toBeLessThan(dataRuler.y - 120);

  await page.screenshot({ path: 'test-results/friends-data-1080.png' });
  await page.evaluate(() => { (window as any).__friends.hide(); (window as any).__friendsStory.show(); });
  await expect(page.locator('.story-disclaimer')).toContainText('profile images');
  const disclaimer = (await page.locator('.story-disclaimer').boundingBox())!;
  const ruler = (await page.locator('.friends-story .recap-interlude-ruler').boundingBox())!;
  expect(disclaimer.y + disclaimer.height).toBeLessThan(ruler.y - 24);
  await page.screenshot({ path: 'test-results/friends-story-1080.png' });
  await page.evaluate(() => {
    (window as any).__friendsStory.hide();
    (window as any).__friends.update({ status: 'ready', total: 1, rankingStatus: 'ready', source: 'import', entries: [{ userId: 'synthetic', name: '<img src=x onerror=alert(1)>', seconds: 3600 }] });
    (window as any).__friends.show();
  });
  await expect(page.locator('.friends-list .worlds-name')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.friends-list .worlds-name img')).toHaveCount(0);
  await expect(page.locator('.friends-demo-label')).toBeHidden();
  await page.evaluate(() => (window as any).__friends.update({ status: 'ready', total: 0, rankingStatus: 'ready', source: 'import', entries: [] }));
  await expect(page.locator('.friends-number')).toHaveText('0');
  await expect(page.locator('.friends-ranking-status')).toContainText('No shared-instance time');
  await page.evaluate(() => (window as any).__friends.update({ status: 'unavailable', total: 0, rankingStatus: 'unavailable', source: 'import', entries: [] }));
  await expect(page.locator('.friends-body')).toBeHidden();
  await expect(page.locator('.friends-status')).toContainText('could not be calculated');
});

test('Friends podium colors and chimes settle once, and hiding cancels the reveal', async ({ page }) => {
  await mount(page, false);
  await expect(page.locator('.friends-list li').first()).toHaveAttribute('data-settled', 'false');
  await expect.poll(() => page.evaluate(() => (window as any).__friendsStats.awards)).toEqual([3, 2, 1]);
  await expect(page.locator('.friends-list li').first().locator('.worlds-value')).toHaveCSS('color', 'rgb(239, 204, 124)');
  await expect.poll(() => page.evaluate(() => (window as any).__friendsStats.finishes)).toEqual([true]);
  await page.evaluate(() => { (window as any).__friends.hide(); (window as any).__friends.show(); });
  expect(await page.evaluate(() => (window as any).__friendsStats.starts)).toBe(1);
  await page.evaluate(async () => {
    const { friendsDemo } = await import('/src/data/friends-data.ts');
    (window as any).__friends.update(friendsDemo()); (window as any).__friends.hide();
  });
  await page.waitForTimeout(2700);
  expect(await page.evaluate(() => (window as any).__friendsStats.awards)).toEqual([3, 2, 1]);
});

test('the shared image permission enables avatars and revokes back to initials', async ({ page }) => {
  let images = 0;
  await page.route('https://files.vrchat.cloud/synthetic-*.png', async route => {
    images++;
    await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="teal"/></svg>' });
  });
  await mount(page);
  await page.evaluate(() => (window as any).__friends.update({ status: 'ready', total: 1, rankingStatus: 'ready', source: 'import', entries: [{ userId: 'synthetic', name: 'Synthetic Friend', seconds: 3600, imageUrl: 'https://files.vrchat.cloud/synthetic-avatar.png' }] }));
  await page.evaluate(async () => {
    const { createWorldThumbnail } = await import('/src/components/world-thumbnail.ts');
    const thumbnail = createWorldThumbnail();
    thumbnail.element.classList.add('synthetic-world-image');
    document.querySelector('main')!.append(thumbnail.element);
    thumbnail.update({ imageUrl: 'https://files.vrchat.cloud/synthetic-world.png', label: 'Synthetic world' });
    thumbnail.setVisible(true);
  });
  expect(images).toBe(0);
  await page.evaluate(async () => (await import('/src/components/world-thumbnail.ts')).setVRChatImagesAllowed(true));
  await expect(page.locator('.friends-avatar img')).toHaveCount(1);
  await expect(page.locator('.synthetic-world-image img')).toHaveCount(1);
  expect(images).toBe(2);
  await page.evaluate(async () => (await import('/src/components/world-thumbnail.ts')).setVRChatImagesAllowed(false));
  await expect(page.locator('.friends-avatar img')).toHaveCount(0);
  await expect(page.locator('.friends-avatar')).toHaveText('SF');
  await expect(page.locator('.synthetic-world-image img')).toHaveCount(0);
});

test('worker returns Friends data locally and resolves unavailable accounts', async ({ page }) => {
  const { friendsTimelineFixture } = await import('../fixtures/database');
  const bytes = [...await friendsTimelineFixture()];
  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');
  await expect(page.locator('.timeline-lab')).toBeVisible();
  await expect(page.locator('#startup')).toHaveCount(0);
  const result = await page.evaluate(async input => {
    const { createDatabaseChecker } = await import('/src/data/database-check.ts');
    const checker = createDatabaseChecker();
    try {
      const checked = await checker.check(new File([new Uint8Array(input)], 'synthetic.sqlite3'));
      const friends = await checker.loadFriends(checked.accounts![0]!);
      const invalid = await checker.loadFriends('unavailable-account');
      checker.stop();
      const stopped = await checker.loadFriends(checked.accounts![0]!);
      return { friends, invalid, stopped };
    } finally { checker.stop(); }
  }, bytes);
  expect(result.friends).toHaveLength(8);
  expect(result.friends[0].status).toBe('ready');
  expect(result.friends[0].total).toBe(4);
  expect(result.friends[0].rankingStatus).toBe('ready');
  expect(result.invalid[0].status).toBe('unavailable');
  expect(result.stopped[0].status).toBe('unavailable');
});

test('the recap has only one image switch on the landing page', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');
  await expect(page.locator('.timeline-lab')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { createLandingPage } = await import('/src/pages/entry/landing.ts');
    const landing = createLandingPage();
    return {
      total: landing.querySelectorAll('input[role="switch"]').length,
      main: landing.querySelectorAll('.import-panel input[role="switch"]').length,
      label: landing.querySelector('.landing-options .image-permission-label')?.textContent,
    };
  });
  expect(result.total).toBe(1);
  expect(result.main).toBe(1);
  expect(result.label).toContain('Load images from VRChat');
});

for (const id of ['time', 'overlap', 'strangers', 'mutuals', 'boops', 'invites', 'requests']) {
  test(`Friends ${id} card renders its metric and stays above the waveform`, async ({ page }) => {
    await mount(page, true, id);
    const card = page.locator(`[data-friends=${id}]`);
    await expect(card).toBeVisible();
    await expect(card.locator('.friends-list li')).toHaveCount(10);
    await expect(card).not.toContainText('idle time');
    const firstValue = card.locator('.worlds-value').first();
    if (['time','overlap'].includes(id)) await expect(firstValue).toContainText('h');
    else await expect(firstValue).not.toContainText(' h');
    const note = (await card.locator('.friends-measurement').boundingBox())!;
    const ruler = (await card.locator('.recap-interlude-ruler').boundingBox())!;
    expect(note.y + note.height).toBeLessThan(ruler.y - 120);
  });
}

test('boop particles fire just after first place settles, then clear on leaving', async ({ page }) => {
  await mount(page, false, 'boops');
  await page.evaluate(() => {
    const section = document.querySelector('[data-friends=boops]')!;
    (window as any).__boopTiming = {};
    new MutationObserver(() => {
      const timing = (window as any).__boopTiming;
      if (!timing.settled && section.querySelector('.worlds-entry[data-settled=true] .worlds-rank')?.textContent === '01') timing.settled = performance.now();
      if (!timing.particles && section.querySelector('.boop-particle')) { timing.particles = performance.now(); timing.count = section.querySelectorAll('.boop-particle').length; }
    }).observe(section, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-settled'] });
  });
  await expect(page.locator('[data-friends=boops] .worlds-entry').first()).toHaveAttribute('data-settled','true');
  await expect.poll(() => page.evaluate(() => (window as any).__boopTiming.particles ?? 0)).toBeGreaterThan(0);
  const timing = await page.evaluate(() => (window as any).__boopTiming);
  expect(timing.count).toBe(8);
  expect(timing.particles - timing.settled).toBeGreaterThanOrEqual(300);
  await page.evaluate(() => (window as any).__friends.hide());
  await expect(page.locator('.boop-particle')).toHaveCount(0);
  await page.evaluate(() => (window as any).__friends.show());
  await page.waitForTimeout(3000);
  await expect(page.locator('.boop-particle')).toHaveCount(0);
});

test('leaving before the boop delay cancels the pending burst', async ({ page }) => {
  await mount(page, false, 'boops');
  await expect(page.locator('[data-friends=boops] .worlds-entry').first()).toHaveAttribute('data-settled','true');
  await page.evaluate(() => (window as any).__friends.hide());
  await page.waitForTimeout(500);
  await expect(page.locator('.boop-particle')).toHaveCount(0);
});

test('boop images obey the shared image switch and reduced motion suppresses particles', async ({ page }) => {
  let requests = 0;
  await page.route('https://files.vrchat.cloud/synthetic-boop-*.png', async route => {
    requests++;
    await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="16" fill="pink"/></svg>' });
  });
  await mount(page, false, 'boops');
  await page.evaluate(() => (window as any).__friends.update({ status:'ready', total:5, source:'import', rankingStatus:'ready', entries:[{userId:'usr_a',name:'Synthetic',seconds:0,value:5}], boopImages:[...Array.from({length:12},(_,index)=>({url:`https://files.vrchat.cloud/synthetic-boop-${index}.png`,userId:'usr_a'})),{url:'https://unapproved.invalid/no.png'}] }));
  expect(requests).toBe(0);
  await page.evaluate(async () => (await import('/src/components/world-thumbnail.ts')).setVRChatImagesAllowed(true));
  await expect.poll(() => requests).toBe(12);
  await expect(page.locator('.boop-particle')).toHaveCount(12);
  await expect(page.locator('.boop-particle img')).toHaveCount(12);
  await page.evaluate(async () => (await import('/src/components/world-thumbnail.ts')).setVRChatImagesAllowed(false));
  await expect(page.locator('.boop-particle img')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion:'reduce' });
  await expect(page.locator('.boop-particle')).toHaveCount(0);
});


test('Time together highlights the leading person and shows days only above 120 hours', async ({ page }) => {
  await mount(page, true, 'time');
  const update = async (name: string, hours: number) => page.evaluate(({name,hours}) => (window as any).__friends.update({status:'ready',total:42,source:'import',rankingStatus:'ready',entries:[{userId:'synthetic',name,seconds:hours*3600}]}), {name,hours});
  await update('Top person', 240);
  await expect(page.locator('.friends-number')).toHaveText('240');
  await expect(page.locator('.friends-top-person')).toHaveText('Top person');
  await expect(page.locator('.friends-list .worlds-value').first()).toHaveText('240 h10 Days');
  await expect(page.locator('.friends-day-equivalent')).toHaveText('Equivalent to 10 days');
  await expect(page.locator('.friends-day-equivalent')).toBeVisible();
  await update('Next person', 120);
  await expect(page.locator('.friends-top-person')).toHaveText('Next person');
  await expect(page.locator('.friends-number')).toHaveText('120');
  await expect(page.locator('.friends-day-equivalent')).toBeHidden();
  await expect(page.locator('.friends-entry-days')).toHaveCount(0);
  await update('Next person', 120.1);
  await expect(page.locator('.friends-number')).toHaveText('120');
  await expect(page.locator('.friends-list .worlds-value').first()).toContainText('120 h');
  await expect(page.locator('.friends-entry-days')).toHaveText('5 Days');
  await expect(page.locator('.friends-day-equivalent')).toBeVisible();
  await page.evaluate(() => (window as any).__friends.update({status:'ready',total:0,source:'import',rankingStatus:'ready',entries:[]}));
  await expect(page.locator('.friends-overview')).toBeHidden();
});


for (const id of ['added', 'overlap']) {
  test(`${id} shows day equivalents above 120 hours`, async ({ page }) => {
    await mount(page, true, id);
    await page.evaluate(() => (window as any).__friends.update({status:'ready',total:2,source:'import',rankingStatus:'ready',entries:[
      {userId:'a',name:'Long time',seconds:156*3600},
      {userId:'b',name:'Short time',seconds:120*3600},
    ]}));
    await expect(page.locator('.friends-entry-days')).toHaveCount(1);
    await expect(page.locator('.friends-entry-days')).toHaveText('6.5 Days');
    await expect(page.locator('.friends-list .worlds-value').first()).toContainText('156 h');
    await expect(page.locator('.friends-number')).toHaveText(id === 'overlap' ? '156' : '2');
  });
}


for (const id of ['time', 'discoveries', 'visits']) {
  test(`Worlds ${id} shows days for hours only`, async ({ page }) => {
    await mount(page);
    await page.evaluate(async id => {
      const { createWorldsPage } = await import('/src/pages/rewind/worlds.ts');
      const worlds = createWorldsPage(id as any, () => {}, undefined, () => {});
      document.querySelector('main')!.replaceChildren(worlds.section);
      worlds.update({id:id as any,status:'ready',total:276,entries:[
        {worldId:'synthetic-a',name:'Long visit',value:156},
        {worldId:'synthetic-b',name:'Short visit',value:120},
      ]}); worlds.show();
    }, id);
    const days = page.locator('.worlds-entry-days');
    await expect(days).toHaveCount(id === 'visits' ? 0 : 1);
    if (id !== 'visits') await expect(days).toHaveText('6.5 Days');
  });
}


test('Top navigation marks story pages and shows styled page names on hover and focus', async ({ page }) => {
  await mount(page);
  const progress = page.locator('.recap-chrome .page-progress');
  await expect(progress.locator('.is-story-page')).toHaveCount(2);
  const dot = await progress.locator('.is-story-page').first().evaluate(el => getComputedStyle(el, '::after').width);
  expect(dot).toBe('8px');
  const button = progress.getByRole('button', {name:'Go to Your friends',exact:true});
  const hint = button.locator('.page-progress-hint');
  await expect(hint).toBeHidden();
  await button.hover();
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText('Your friends');
  await page.mouse.move(0, 300);
  await expect(hint).toBeHidden();
  await button.focus();
  await expect(hint).toBeVisible();
  await expect(button).not.toHaveAttribute('title');
});


test('imported friend names remain literal text in the DOM', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => {
    (window as any).__friends.update({ status: 'ready', total: 1, rankingStatus: 'ready', source: 'import', entries: [
      { userId: 'usr_synthetic', name: '<img src=x onerror=alert(1)>', seconds: 3600 },
    ] });
  });
  await expect(page.locator('.worlds-name')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.worlds-name img')).toHaveCount(0);
});
