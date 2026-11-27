import { test, expect } from '@playwright/test';

// Direct synthetic component checks; no private data or recap click-through.
async function mount(page: import('@playwright/test').Page, reduced = true) {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');
  await expect(page.locator('.timeline-lab')).toBeVisible();
  await expect(page.locator('#startup')).toHaveCount(0);
  await page.evaluate(async () => {
    const { createFriendsPage } = await import('/src/pages/rewind/friends.ts');
    const { createStoryPage } = await import('/src/pages/rewind/story.ts');
    const { createRecapChrome } = await import('/src/components/recap-chrome.ts');
    const { createRecapExclusions } = await import('/src/components/recap-exclusions.ts');
    const { addFriendsExclusionIntro } = await import('/src/components/friends-exclusion-intro.ts');
    const { filterFriendsDemo, syntheticFriendsSnapshot } = await import('/src/data/friends-demo-filter.ts');
    const host = document.createElement('main'); let current = 0;
    const intro = createStoryPage(() => {}, () => go(1), () => chrome.show(0));
    const story = createStoryPage(() => {}, () => go(2), () => chrome.show(1), {
      id: 'friends-story-title', kicker: 'Now, let’s take a closer look at', title: 'the friends you made',
      copy: 'and the people you met along the way.', disclaimer: 'Sadly, profile images can’t be loaded reliably. We’ll do our best to show saved avatar pictures instead. These may be older or unavailable.', onPrevious: () => go(0),
    });
    story.section.classList.add('friends-story'); addFriendsExclusionIntro(story.section);
    const added = createFriendsPage(() => {}, () => go(1), () => chrome.show(2), undefined, { onNext: () => go(3), onExclude: (entry: any, trigger: HTMLElement) => exclusions.openPerson(entry.userId, entry.name, trigger) });
    const time = createFriendsPage(() => {}, () => go(2), () => chrome.show(3), undefined, { id: 'time', onExclude: (entry: any, trigger: HTMLElement) => exclusions.openPerson(entry.userId, entry.name, trigger) });
    const pages = [intro, story, added, time];
    function go(index: number) { pages[current]!.hide(); current = index; pages[index]!.show(); }
    host.append(...pages.map(page => page.section));
    const chrome = createRecapChrome(host, pages.map(page => page.section), () => go(current - 1), () => go(current + 1), go);
    chrome.setPages(pages.map(page => page.section), ['Your story', 'Your friends', 'New friends made', 'Time together']);
    const snapshot = syntheticFriendsSnapshot();
    const exclusions = createRecapExclusions(host, chrome.header, async ids => {
      const results = filterFriendsDemo(snapshot, ids);
      added.update(results.find(page => page.id === 'added')); time.update(results.find(page => page.id === 'time'));
    });
    added.update(filterFriendsDemo(snapshot, []).find(page => page.id === 'added'));
    time.update(filterFriendsDemo(snapshot, []).find(page => page.id === 'time'));
    const root = document.getElementById('app')!; root.replaceChildren(host); root.inert = false;
    (window as any).__recapExclusions = { go, exclusions, snapshot }; go(1);
  });
}

test('the example is optional and its dropdown entry can be removed without changing data', async ({ page }) => {
  await mount(page);
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Go to New friends made', exact: true })).toBeEnabled();
  await page.keyboard.press('Space'); await expect(page.locator('[data-friends=added]')).toBeVisible();
  await page.evaluate(() => (window as any).__recapExclusions.go(1));
  const exercise = (await page.locator('.friends-exclusion-intro').boundingBox())!;
  const ruler = (await page.locator('.friends-story .recap-interlude-ruler').boundingBox())!;
  expect(exercise.y + exercise.height).toBeLessThan(ruler.y - 120);
  await expect(page.locator('.exclusion-intro-caption')).toHaveText('Want to leave someone out?');
  await page.getByRole('button', { name: 'Try excluding Example user' }).click();
  await expect(page.locator('.friends-story .exclusion-cross path')).toHaveCount(2);
  const dropdown = page.getByRole('region', { name: 'Excluded users', exact: true });
  await expect(dropdown).toBeVisible();
  await expect(dropdown.locator('.exclusions-list > li > span')).toHaveText('Example user');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__recapExclusions.exclusions.ids())).toEqual([]);
  await page.getByRole('button', { name: 'Remove Example user from exclusions' }).click();
  await expect(dropdown.locator('.exclusions-list li')).toHaveCount(0);
  await expect(page.locator('.friends-story .exclusion-cross')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try excluding Example user' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dropdown).toBeHidden();
});

async function expectVisibleFlight(page: import('@playwright/test').Page, source: { x: number; y: number }) {
  const flight = page.locator('body > .exclusion-flight');
  await expect(flight).toHaveCount(1);
  await flight.evaluate(element => { const animation=element.getAnimations()[0]!; animation.pause(); animation.currentTime=350; });
  await expect(flight).toHaveCSS('position','fixed');
  const initial=(await flight.boundingBox())!;
  expect(Math.abs(initial.x-source.x)).toBeLessThan(2);
  expect(Math.abs(initial.y-source.y)).toBeLessThan(2);
  expect(initial.x).toBeGreaterThanOrEqual(0);expect(initial.y).toBeGreaterThanOrEqual(0);
  await flight.evaluate(element => { element.getAnimations()[0]!.currentTime=1050; });
  const middle=(await flight.boundingBox())!;
  const target=(await page.locator('.recap-exclusions-toggle').boundingBox())!;
  expect(middle.y).toBeLessThan(initial.y);
  expect(Math.abs(middle.x+middle.width/2-target.x-target.width/2)).toBeLessThan(Math.abs(initial.x+initial.width/2-target.x-target.width/2));
  await flight.evaluate(element => element.getAnimations()[0]!.play());
}

test('the marked example flies to the icon before opening the names dropdown', async ({ page }) => {
  await mount(page, false);
  const source=page.getByRole('button', { name: 'Try excluding Example user' });
  const sourceRect=(await source.boundingBox())!;
  await source.click();
  await expectVisibleFlight(page,sourceRect);
  await expect(page.locator('.recap-exclusions-dropdown')).toBeHidden();
  await expect(page.locator('.exclusion-flight')).toHaveCount(0);
  await expect(page.locator('.recap-exclusions-dropdown')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Example user from exclusions' })).toBeVisible();
  const panel = (await page.locator('.recap-exclusions-dropdown').boundingBox())!;
  const icon = (await page.locator('.recap-exclusions-toggle').boundingBox())!;
  expect(panel.y).toBeGreaterThanOrEqual(icon.y + icon.height + 16);
  await page.locator('.story-heading').filter({ visible: true }).click();
  await expect(page.locator('.recap-exclusions-dropdown')).toBeHidden();
});

test('real avatar exclusions refill statistics and restore through the dropdown remove icon', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => (window as any).__recapExclusions.go(2));
  const added = page.locator('[data-friends=added]');
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  const external: string[] = [];
  page.on('request', request => { if (new URL(request.url()).origin !== 'http://127.0.0.1:4174') external.push(request.url()); });
  await added.getByRole('button', { name: 'Exclude Moss from this recap', exact: true }).click();
  await expect(added.locator('.friends-number')).toHaveText('46');
  await expect(added.locator('.friends-list')).not.toContainText('Moss');
  await expect(added.locator('.friends-list li')).toHaveCount(10);
  await expect(added.locator('.friends-list')).toContainText('Demo person 11');
  await expect(page.locator('.recap-exclusions-dropdown')).toBeHidden();
  await page.evaluate(() => (window as any).__recapExclusions.go(3));
  const time = page.locator('[data-friends=time]');
  await expect(time.locator('.friends-number')).toHaveText('83');
  await page.getByRole('button', { name: 'Excluded users (1)', exact: true }).click();
  await expect(page.locator('.exclusions-list > li > span')).toHaveText('Moss');
  await page.getByRole('button', { name: 'Remove Moss from exclusions', exact: true }).click();
  await expect(time.locator('.friends-number')).toHaveText('126');
  await expect(page.locator('.exclusions-list li')).toHaveCount(0);
  await time.locator('.friends-heading').click();
  await page.evaluate(() => (window as any).__recapExclusions.go(2));
  await expect(added.locator('.friends-number')).toHaveText('47');
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).toBe(storage);
  expect(external).toEqual([]);
});

test('user icons have styled hover and keyboard hints and retain the flight without opening the list', async ({ page }) => {
  await mount(page, false);
  await page.evaluate(() => (window as any).__recapExclusions.go(2));
  const avatar = page.getByRole('button', { name: 'Exclude Moss from this recap', exact: true });
  const hint = avatar.getByRole('tooltip');
  await expect(hint).toBeHidden();
  await expect(avatar).not.toHaveAttribute('title');
  await avatar.hover();
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText('Remove from Rewind');
  await page.mouse.move(0, 0); await avatar.focus();
  await expect(hint).toBeVisible();
  const sourceRect=(await avatar.boundingBox())!;
  await avatar.click();
  await expectVisibleFlight(page,sourceRect);
  await expect(page.locator('.exclusion-flight .user-exclusion-tooltip')).toHaveCount(0);
  await expect(page.locator('.exclusion-flight')).toHaveCount(0);
  await expect(page.locator('.recap-exclusions-dropdown')).toBeHidden();
  await page.getByRole('button', { name: 'Excluded users (1)', exact: true }).click();
  await expect(page.locator('.recap-exclusions-dropdown')).toBeVisible();
});


test('Excluded users control starts at the users story and closes when returning earlier', async ({ page }) => {
  await mount(page);
  const toggle = page.locator('.recap-exclusions-toggle');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('.recap-exclusions-dropdown')).toBeVisible();
  await page.evaluate(() => (window as any).__recapExclusions.go(0));
  await expect(toggle).toBeHidden();
  await expect(page.locator('.recap-exclusions-dropdown')).toBeHidden();
  await page.evaluate(() => (window as any).__recapExclusions.go(1));
  await expect(toggle).toBeVisible();
  await page.evaluate(() => (window as any).__recapExclusions.go(3));
  await expect(toggle).toBeVisible();
});
