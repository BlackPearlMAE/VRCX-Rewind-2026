import type { createTimelineSynth } from '../../components/timeline-synth';
import { createPageProgress, recapPages } from '../../components/page-progress';
import { addPageKeyboardNavigation } from '../../components/page-navigation';
import { recapHeader } from '../../components/recap-header';
import { createTitle } from '../../components/title';
import { createRecapImagePermission } from '../../components/recap-image-permission';
import { createWorldThumbnail, getVRChatImagesAllowed, onVRChatImagesChange, permittedImage } from '../../components/world-thumbnail';
import { worldsDefinitions, type WorldsId, type WorldsPageData } from '../../data/worlds-data';

/** Desktop chapter pages; thumbnails enhance the same readable, text-first lists. */
export function createWorldsPage(id: WorldsId, onPrevious: () => void, onNext: (() => void) | undefined, onShow: () => void, audio?: Pick<ReturnType<typeof createTimelineSynth>, 'start' | 'update' | 'settled' | 'finish' | 'stop'>) {
  const definition = worldsDefinitions.find(page => page.id === id)!;
  const section = document.createElement('section');
  section.className = 'opening-card worlds-page';
  section.dataset.worlds = id;
  section.hidden = true;
  section.tabIndex = -1;
  section.setAttribute('aria-labelledby', `worlds-title-${id}`);
  section.innerHTML = `${recapHeader}<div class="recap-stage"><div class="worlds-content">
    <div class="worlds-heading-row"><div><p class="worlds-eyebrow">YOUR WORLDS <span class="worlds-demo-label" hidden>· SAVED DEMO</span></p><div class="worlds-heading"></div></div><p class="worlds-ranking-total" hidden></p></div>
    <p class="worlds-status" role="status">Preparing your worlds…</p>
    <div class="worlds-body" hidden><div class="worlds-overview"><p class="worlds-total"><span class="opening-number worlds-number"></span><span class="worlds-unit"></span></p><div class="worlds-breakdown" hidden></div></div>
      <div class="worlds-list-group"><p class="worlds-list-label"></p><ol class="worlds-list"></ol></div>
    </div>
    <div class="worlds-image-controls" hidden><p class="worlds-image-note" role="status" hidden></p></div>
  </div></div><footer data-visualization="spectrum"></footer>`;
  section.prepend(createPageProgress(recapPages));
  const title = createTitle(definition.title, { shine: false, musicReactive: true }, 'h2');
  title.id = `worlds-title-${id}`;
  section.querySelector('.worlds-heading')!.append(title);
  const list = section.querySelector<HTMLOListElement>('.worlds-list')!;
  const status = section.querySelector<HTMLElement>('.worlds-status')!;
  const body = section.querySelector<HTMLElement>('.worlds-body')!;
  const summary = section.querySelector<HTMLElement>('.worlds-ranking-total')!;
  const breakdown = section.querySelector<HTMLElement>('.worlds-breakdown')!;
  const listLabel = section.querySelector<HTMLElement>('.worlds-list-label')!;
  const ranked = id === 'visits' || id === 'time';
  section.classList.toggle('worlds-ranked', ranked);
  let result: WorldsPageData | undefined;
  let thumbnails: ReturnType<typeof createWorldThumbnail>[] = [];
  let animations: Animation[] = [];
  let seen = false;
  const revealDurationMs = 2500;
  let countFrame = 0;
  let counters: { element: Element; value: number; duration: number; text: (value: number) => string }[] = [];
  let bars: { element: HTMLElement; share: number; duration: number }[] = [];
  function paintCounts(elapsed: number) {
    const ease = (duration: number) => {
      const progress = duration > 0 ? Math.min(1, elapsed / duration) : 1;
      return 1 - Math.pow(1 - progress, 3);
    };
    counters.forEach(counter => { counter.element.textContent = counter.text(counter.value * ease(counter.duration)); });
    bars.forEach((bar, index) => {
      bar.element.style.setProperty('--worlds-share', `${bar.share * ease(bar.duration)}%`);
      if (!ranked || index > 2) return;
      const row = bar.element.closest<HTMLElement>('.worlds-entry')!;
      const settled = bar.share > 0 && elapsed >= bar.duration;
      if (settled && row.dataset.settled !== 'true' && Number.isFinite(elapsed)) row.classList.add('is-awarded');
      if (!settled) row.classList.remove('is-awarded');
      row.dataset.settled = String(settled);
    });
  }
  const failedThumbnails = new Set<object>();
  const imageDisclaimer = section.querySelector<HTMLElement>('.worlds-image-note')!;
  const imageControls = section.querySelector<HTMLElement>('.worlds-image-controls')!;
  const imagePermission = createRecapImagePermission(section);
  imageControls.prepend(imagePermission.element);
  function imageNote() {
    const count = getVRChatImagesAllowed() ? failedThumbnails.size : 0;
    imageControls.hidden = imagePermission.element.hidden && count === 0;
    imageDisclaimer.hidden = count === 0;
    imageDisclaimer.textContent = count ? count === 1 ? 'Could not load 1 image.' : `Could not load ${count} images.` : '';
  }
  onVRChatImagesChange(imageNote);
  function stopReveal() {
    audio?.stop();
    cancelAnimationFrame(countFrame); countFrame = 0;
    animations.forEach(animation => animation.cancel()); animations = [];
  }
  function present() {
    const reveal = !seen && result?.status === 'ready' && result.total > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    stopReveal();
    if (reveal) {
      animations = [section.querySelector('.worlds-heading-row')!, section.querySelector('.worlds-overview')!, ...list.children].map((element, index) =>
        element.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 600, delay: Math.min(index * 65, 500), easing: 'cubic-bezier(.22,.7,.25,1)', fill: 'backwards' }));
    }
    if (reveal) {
      paintCounts(0);
      audio?.start(result!.total);
      const settled = new Set<number>();
      const started = performance.now();
      const tick = (now: number) => {
        if (section.hidden || !section.isConnected) { stopReveal(); return; }
        const elapsed = now - started;
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reducedMotion) { paintCounts(Infinity); stopReveal(); return; }
        paintCounts(elapsed);
        audio?.update(result!.total * (1 - Math.pow(1 - Math.min(1, elapsed / revealDurationMs), 3)));
        if (ranked) bars.slice(0, 3).forEach((bar, index) => {
          if (bar.share > 0 && elapsed >= bar.duration && !settled.has(index)) {
            settled.add(index); audio?.settled(index + 1);
          }
        });
        if (elapsed < revealDurationMs && !matchMedia('(prefers-reduced-motion: reduce)').matches) countFrame = requestAnimationFrame(tick);
        else {
          paintCounts(Infinity); countFrame = 0;
          if (!ranked) audio?.settled(1);
          audio?.finish(true);
        }
      };
      countFrame = requestAnimationFrame(tick);
    } else {
      list.querySelectorAll('.is-awarded').forEach(row => row.classList.remove('is-awarded'));
      paintCounts(Infinity);
    }
    if (result?.status === 'ready') seen = true;
  }
  function format(value: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value); }
  function paint() {
    counters = []; bars = [];
    const ready = result?.status === 'ready';
    section.querySelector<HTMLElement>('.worlds-demo-label')!.hidden = result?.source !== 'recorded-aggregate';
    body.hidden = !ready || result!.total === 0;
    status.textContent = !result ? 'Preparing your worlds…' : !ready ? 'This topic is unavailable in the selected history. Required activity fields may be missing.' : result.total === 0 ? `No ${definition.unit} in the recorded recap period.` : '';
    imagePermission.setAvailable(!body.hidden && !!result?.entries.some(entry => entry.worldId || (entry.imageUrl && permittedImage(entry.imageUrl))));
    imageNote();
    summary.hidden = !ready || !ranked;
    if (!ready) {
      thumbnails.forEach(thumbnail => thumbnail.dispose()); thumbnails = []; list.replaceChildren();
      failedThumbnails.clear(); imageNote();
      return;
    }
    section.querySelector('.worlds-number')!.textContent = format(result!.total);
    section.querySelector('.worlds-unit')!.textContent = definition.unit;
    summary.textContent = `${format(result!.total)} ${definition.unit} across all worlds`;
    listLabel.textContent = ranked ? `Top ${result!.entries.length} · ${result!.detail ?? ''}` : id === 'owned' ? 'Your instances by world' : result!.detail ?? 'Recent discoveries';
    counters.push(
      { element: section.querySelector('.worlds-number')!, value: result!.total, duration: revealDurationMs, text: format },
      { element: summary, value: result!.total, duration: revealDurationMs, text: value => `${format(value)} ${definition.unit} across all worlds` },
    );
    breakdown.hidden = !result!.breakdown;
    breakdown.replaceChildren(...(result!.breakdown ?? []).map(item => {
      const cell = document.createElement('div');
      const value = document.createElement('strong'); value.textContent = format(item.value);
      const label = document.createElement('span'); label.textContent = item.label;
      counters.push({ element: value, value: item.value, duration: revealDurationMs, text: format });
      cell.append(value, label); return cell;
    }));
    thumbnails.forEach(thumbnail => { thumbnail.setVisible(false); thumbnail.dispose(); });
    thumbnails = [];
    failedThumbnails.clear(); imageNote();
    list.replaceChildren(...result!.entries.map((entry, index) => {
      const item = document.createElement('li'); item.className = 'worlds-entry';
      const rank = document.createElement('span'); rank.className = 'worlds-rank'; rank.textContent = String(index + 1).padStart(2, '0'); rank.setAttribute('aria-hidden', 'true');
      const thumbnail = createWorldThumbnail(state => {
        if (state === 'failed') failedThumbnails.add(entry);
        else failedThumbnails.delete(entry);
        imageNote();
      }); thumbnail.update({ worldId: entry.worldId, imageUrl: entry.imageUrl, label: entry.name }); thumbnails.push(thumbnail);
      const name = document.createElement('span'); name.className = 'worlds-name'; name.textContent = entry.name; name.title = entry.name;
      const value = document.createElement('span'); value.className = 'worlds-value'; value.textContent = entry.detail ?? `${format(entry.value)} ${id === 'time' || id === 'discoveries' ? 'h' : id === 'visits' ? 'visits' : 'instances'}`;
      let hours = value;
      let days: HTMLElement | undefined;
      if (!entry.detail && (id === 'time' || id === 'discoveries') && entry.value > 120) {
        hours = document.createElement('span'); hours.textContent = value.textContent;
        days = document.createElement('small'); days.className = 'worlds-entry-days';
        value.replaceChildren(hours, days);
      }
      const bar = document.createElement('span'); bar.className = 'worlds-entry-bar'; bar.setAttribute('aria-hidden', 'true'); bar.style.setProperty('--worlds-share', `${entry.value / Math.max(1, ...result!.entries.map(entry => entry.value)) * 100}%`);
      const largest = Math.max(1, ...result!.entries.map(entry => entry.value));
      const duration = revealDurationMs * entry.value / largest;
      bars.push({ element: bar, share: entry.value / largest * 100, duration });
      if (days) counters.push({ element: days, value: entry.value, duration, text: current => `${(current / 24).toLocaleString('en-US', { maximumFractionDigits: 1 })} Days` });
      if (!entry.detail) counters.push({ element: hours, value: entry.value, duration, text: current => `${format(current)} ${id === 'time' || id === 'discoveries' ? 'h' : id === 'visits' ? 'visits' : 'instances'}` });
      item.append(rank, thumbnail.element, name, value, bar);
      thumbnail.setVisible(!section.hidden);
      return item;
    }));
  }
  addPageKeyboardNavigation(section, onPrevious, onNext);
  section.querySelector('.opening-back')!.addEventListener('click', onPrevious);
  return {
    section,
    update(value?: WorldsPageData) {
      stopReveal(); result = value; seen = false;
      if (!value) { thumbnails.forEach(thumbnail => thumbnail.dispose()); thumbnails = []; list.replaceChildren(); }
      paint();
      if (!section.hidden) present();
    },
    show(defer = false) {
      section.hidden = false; onShow();
      if (defer && !seen && result?.status === 'ready' && !matchMedia('(prefers-reduced-motion: reduce)').matches) paintCounts(0);
      if (!defer) { thumbnails.forEach(thumbnail => thumbnail.setVisible(true)); section.focus({ preventScroll: true }); present(); }
    },
    suspend() { stopReveal(); },
    hide() { stopReveal(); thumbnails.forEach(thumbnail => thumbnail.setVisible(false)); section.hidden = true; },
  };
}
