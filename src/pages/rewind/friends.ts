import { createBoopParticles } from '../../components/boop-particles';
import { friendsDefinitions, type FriendsId } from '../../data/friends-definitions';
import { createTitle } from '../../components/title';
import { recapHeader } from '../../components/recap-header';
import { createPageProgress, recapPages } from '../../components/page-progress';
import { addPageKeyboardNavigation } from '../../components/page-navigation';
import { createFriendAvatar } from '../../components/friend-avatar';
import type { createTimelineSynth } from '../../components/timeline-synth';
import type { FriendsPageData, NewFriendEntry } from '../../data/friends-data';

type RevealAudio = Pick<ReturnType<typeof createTimelineSynth>, 'start' | 'update' | 'settled' | 'finish' | 'stop'>;

export function createFriendsPage(onBack: () => void, onPrevious: () => void, onShow: () => void, audio?: RevealAudio, options: { id?: FriendsId; onNext?: () => void; onExclude?: (entry: NewFriendEntry, trigger: HTMLElement) => void } = {}) {
  const definition = friendsDefinitions.find(page => page.id === (options.id ?? 'added'))!;
  const section = document.createElement('section');
  section.className = 'opening-card worlds-page friends-page';
  section.dataset.friends = definition.id;
  section.hidden = true; section.tabIndex = -1;
  section.setAttribute('aria-labelledby', `friends-${definition.id}-title`);
  section.innerHTML = `${recapHeader}<div class="recap-stage"><div class="worlds-content friends-content">
    <div class="worlds-heading-row"><div><p class="worlds-eyebrow">YOUR FRIENDS <span class="friends-demo-label" hidden>· SYNTHETIC DEMO</span></p><div class="friends-heading"></div></div></div>
    <p class="friends-status" role="status">Preparing your friends…</p>
    <div class="worlds-body friends-body" hidden>
      <div class="worlds-overview friends-overview"><p class="worlds-total"><span class="opening-number worlds-number friends-number">0</span><span class="worlds-unit">new friends made</span></p><p class="friends-count-note">First recorded additions this year.<br>Known re-adds are excluded.</p></div>
      <div class="worlds-list-group"><p class="worlds-list-label">Top 10 new friends by time together</p><p class="friends-ranking-status" role="status"></p><ol class="worlds-list friends-list"></ol><p class="friends-measurement">Estimated time in the same instance after becoming friends this year.</p></div>
    </div>

  </div></div><footer data-visualization="spectrum"></footer>`;
  section.prepend(createPageProgress(recapPages));
  const title = createTitle(definition.title, { shine: false, musicReactive: true }, 'h2');
  title.id = `friends-${definition.id}-title`;
  section.querySelector('.friends-heading')!.append(title);
  section.querySelector('.opening-back')!.addEventListener('click', onBack);
  addPageKeyboardNavigation(section, onPrevious, options.onNext);
  section.querySelector('.worlds-unit')!.textContent = definition.unit;
  section.querySelector('.friends-count-note')!.textContent = definition.countNote;
  section.querySelector<HTMLElement>('.friends-count-note')!.hidden = definition.id === 'overlap' || definition.id === 'mutuals';
  section.querySelector('.worlds-list-label')!.textContent = definition.listLabel;
  section.querySelector('.friends-measurement')!.textContent = definition.caption;
  const number = section.querySelector<HTMLElement>('.friends-number')!;
  const topPerson = document.createElement('span'); topPerson.className = 'friends-top-person';
  const dayEquivalent = document.createElement('p'); dayEquivalent.className = 'friends-day-equivalent'; dayEquivalent.hidden = true;
  const highlightsPerson = ['time','overlap','mutuals'].includes(definition.id);
  const comparison = document.createElement('p'); comparison.className = 'friends-comparison'; comparison.hidden = true;
  if (highlightsPerson) {
    section.querySelector('.worlds-total')!.append(topPerson);
    section.querySelector('.worlds-total')!.after(dayEquivalent,comparison);
    section.querySelector('.worlds-unit')!.textContent = definition.id === 'mutuals' ? 'mutual friends with' : definition.id === 'overlap' ? 'hours online with' : 'hours with';
  }
  const headlineValue = () => definition.id === 'mutuals' ? data?.entries[0]?.value ?? 0
    : definition.id === 'time' || definition.id === 'overlap' ? (data?.entries[0]?.seconds ?? 0) / 3600 : data?.total ?? 0;
  const list = section.querySelector<HTMLOListElement>('.friends-list')!;
  const status = section.querySelector<HTMLElement>('.friends-status')!;
  const body = section.querySelector<HTMLElement>('.friends-body')!;
  const rankingStatus = section.querySelector<HTMLElement>('.friends-ranking-status')!;
  let data: FriendsPageData | undefined;
  let seen = false, frame = 0;
  let avatars: ReturnType<typeof createFriendAvatar>[] = [];
  let rows: { element: HTMLElement; value: HTMLElement; bar: HTMLElement; days?: HTMLElement; seconds: number; duration: number; rank: number }[] = [];
  const duration = 2500;
  const boopParticles = definition.id === 'boops' ? createBoopParticles(section) : undefined;
  const format = (value: number) => Math.round(value).toLocaleString('en-US');
  const formatEntry = (value: number) => definition.entryUnit === 'hours'
    ? `${(value / 3600).toLocaleString('en-US', { maximumFractionDigits: 0 })} h`
    : `${format(value)} ${Math.round(value) === 1 ? definition.suffix.slice(0, -1) : definition.suffix}`;
  function paint(elapsed: number, sound = false) {
    const ease = (length: number) => 1 - Math.pow(1 - Math.min(1, elapsed / Math.max(1, length)), 3);
    const headline = headlineValue() * ease(duration);
    number.textContent = format(headline);
    if (definition.id === 'time' || definition.id === 'overlap') dayEquivalent.textContent = `Equivalent to ${(headline / 24).toLocaleString('en-US', { maximumFractionDigits: 1 })} days`;
    const denominator = definition.id === 'overlap' ? data?.ownSeconds : definition.id === 'mutuals' ? data?.friendCount : undefined;
    const numerator = definition.id === 'overlap' ? headline * 3600 : headline;
    comparison.hidden = !data?.entries.length || denominator === undefined || !Number.isFinite(denominator) || denominator <= 0 || numerator > denominator + .001;
    comparison.textContent = !comparison.hidden
      ? definition.id === 'overlap'
        ? `They were online during ${(numerator / denominator! * 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}% of your recorded playtime.`
        : `You share ${(numerator / denominator! * 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}% of your friend list.`
      : '';
    rows.forEach(row => {
      const progress = ease(row.duration);
      row.value.textContent = formatEntry(row.seconds * progress);
      if (row.days) row.days.textContent = `${(row.seconds * progress / 86400).toLocaleString('en-US', { maximumFractionDigits: 1 })} Days`;
      row.bar.style.setProperty('--worlds-share', `${row.seconds / Math.max(1, ...rows.map(item => item.seconds)) * 100 * progress}%`);
      const settled = elapsed >= row.duration;
      if (settled && row.element.dataset.settled !== 'true' && Number.isFinite(elapsed) && row.rank <= 3) {
        row.element.classList.add('is-awarded');
        if (sound) audio?.settled(row.rank);
        if (row.rank === 1) boopParticles?.schedule();
      }
      if (!settled) row.element.classList.remove('is-awarded');
      row.element.dataset.settled = String(settled);
    });
  }
  function stop() { boopParticles?.stop(); cancelAnimationFrame(frame); frame = 0; audio?.stop(); }
  function present() {
    stop();
    const animate = !seen && data?.status === 'ready' && data.total > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animate) {
      rows.forEach(row => row.element.classList.remove('is-awarded'));
      paint(Infinity);
    } else {
      paint(0); audio?.start(headlineValue());
      const started = performance.now();
      const tick = (now: number) => {
        if (section.hidden || !section.isConnected) { stop(); return; }
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) { paint(Infinity); stop(); return; }
        const elapsed = now - started;
        paint(elapsed, true);
        audio?.update(headlineValue() * (1 - Math.pow(1 - Math.min(1, elapsed / duration), 3)));
        if (elapsed < duration) frame = requestAnimationFrame(tick);
        else {
          paint(Infinity); frame = 0;
          if (!rows.length) audio?.settled(1);
          audio?.finish(true);
        }
      };
      frame = requestAnimationFrame(tick);
    }
    if (data?.status === 'ready') seen = true;
  }
  return {
    section,
    update(value?: FriendsPageData) {
      stop(); data = value; seen = false;
      boopParticles?.update(value?.boopImages?.map(image => image.url) ?? []);
      avatars.forEach(avatar => avatar.dispose()); avatars = []; rows = []; list.replaceChildren();
      const ready = value?.status === 'ready';
      body.hidden = !ready;
      if (highlightsPerson) {
        topPerson.textContent = value?.entries[0]?.name ?? '';
        dayEquivalent.hidden = definition.id === 'mutuals' || (definition.id === 'time' && headlineValue() <= 120);
        section.querySelector<HTMLElement>('.friends-overview')!.hidden = !ready || !value?.entries.length;
      }
      const digits = Math.round(headlineValue()).toLocaleString('en-US').length;
      section.style.setProperty('--friends-number-size', digits <= 3 ? '10vw' : digits <= 5 ? '7vw' : '5vw');
      const demoLabel = section.querySelector<HTMLElement>('.friends-demo-label')!;
      demoLabel.hidden = !value || value.source === 'import';
      demoLabel.textContent = value?.source === 'recorded-aggregate' ? '· SAVED LOCAL DEMO' : '· SYNTHETIC DEMO';
      status.textContent = !value ? 'Preparing your friends…' : !ready ? `${definition.title} could not be calculated from the retained history.` : '';
      section.querySelector('.friends-count-note')!.textContent = definition.id === 'time' ? 'The person you spent the most time with this year.'
        : definition.id === 'overlap' ? ''
        : definition.id === 'mutuals' ? ''
        : value?.note ?? definition.countNote;
      rankingStatus.textContent = value?.rankingStatus === 'unavailable' ? 'The ranking is unavailable in this history.' : ready && !value.entries.length ? definition.id === 'added' ? 'No shared-instance time with new friends was recorded.' : 'No qualifying activity was recorded for this topic.' : '';
      const largest = Math.max(1, ...(value?.entries ?? []).map(entry => entry.value ?? entry.seconds));
      for (const [index, entry] of (value?.entries ?? []).entries()) {
        const element = document.createElement('li'); element.className = 'worlds-entry';
        const rank = document.createElement('span'); rank.className = 'worlds-rank'; rank.textContent = String(index + 1).padStart(2, '0'); rank.setAttribute('aria-hidden', 'true');
        const avatar = createFriendAvatar(entry.name, entry.imageUrl); avatars.push(avatar);
        const name = document.createElement('span'); name.className = 'worlds-name'; name.textContent = entry.name; name.title = entry.name;
        if (entry.detail) {
          const detail = document.createElement('small'); detail.className = 'friends-entry-detail'; detail.textContent = entry.detail;
          name.append(detail);
        }
        const amount = document.createElement('span'); amount.className = 'worlds-value';
        let hours = amount, days: HTMLElement | undefined;
        if (definition.entryUnit === 'hours') {
          hours = document.createElement('span'); amount.append(hours);
          if ((entry.value ?? entry.seconds) > 120 * 3600) {
            days = document.createElement('small'); days.className = 'friends-entry-days'; amount.append(days);
          }
        }
        const bar = document.createElement('span'); bar.className = 'worlds-entry-bar'; bar.setAttribute('aria-hidden', 'true');
        let portrait: HTMLElement = avatar.element;
        if (options.onExclude) {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'friends-avatar-button';
          button.setAttribute('aria-label', `Exclude ${entry.name} from this recap`);
          const hint = document.createElement('span'); hint.className = 'user-exclusion-tooltip'; hint.id = `exclude-hint-${definition.id}-${index}`;
          hint.setAttribute('role', 'tooltip'); hint.textContent = 'Remove from Rewind'; button.setAttribute('aria-describedby', hint.id);
          button.append(avatar.element, hint); button.addEventListener('click', () => options.onExclude!(entry, button)); portrait = button;
        }
        element.append(rank, portrait, name, amount, bar); list.append(element);
        rows.push({ element, value: hours, days, bar, seconds: entry.value ?? entry.seconds, duration: duration * (entry.value ?? entry.seconds) / largest, rank: index + 1 });
        avatar.setVisible(!section.hidden);
      }
      paint(Infinity);
      if (!section.hidden) present();
    },
    show(defer = false) {
      section.hidden = false; onShow();
      if (defer) return;
      boopParticles?.setVisible(true);
      avatars.forEach(avatar => avatar.setVisible(true));
      section.focus({ preventScroll: true }); present();
    },
    suspend: stop,
    hide() { stop(); boopParticles?.setVisible(false); avatars.forEach(avatar => avatar.setVisible(false)); section.hidden = true; },
  };
}
