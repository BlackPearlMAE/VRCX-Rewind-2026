import type { createTimelineSynth } from '../../components/timeline-synth';
import { daysAttendanceRecord } from '../../data/days-attendance-record';
import { createRecapImagePermission } from '../../components/recap-image-permission';
import { createWorldThumbnail, permittedImage } from '../../components/world-thumbnail';
import { createStreakTimeline } from '../../components/streak-timeline';
import { recapHeader } from '../../components/recap-header';
import { addPageKeyboardNavigation } from '../../components/page-navigation';
import { createPageProgress, recapPages } from '../../components/page-progress';
import { createMonthlyTimeline } from '../../components/monthly-timeline';
import { recordDefinitions, recordYearlyDetail, type RecordId, type RecordPageData } from '../../data/record-pages';

/** One data-driven record layout, sharing the recap's typography, chrome and footer. */
export function createRecordPage(id: RecordId, onPrevious: () => void, onNext: (() => void) | undefined, onShow: () => void, audio?: Pick<ReturnType<typeof createTimelineSynth>, 'start' | 'update' | 'settled' | 'finish' | 'stop'>) {
  const definition = recordDefinitions.find(item => item.id === id)!;
  const section = document.createElement('section');
  section.className = 'opening-card record-page';
  section.dataset.record = id;
  section.hidden = true;
  section.tabIndex = -1;
  section.setAttribute('aria-labelledby', `record-title-${id}`);
  section.innerHTML = `${recapHeader}<div class="recap-stage"><div class="record-content">
    <h2 class="record-heading"></h2><p class="record-month"></p>
    <p class="record-total" hidden><span class="opening-number record-number">0</span><span class="opening-unit record-unit"></span></p>
    <p class="record-label" hidden></p><p class="record-yearly-total opening-secondary" hidden></p><p class="record-note" hidden></p>
    <p class="record-status" role="status">Preparing this record…</p>
    </div></div><footer class="record-footer"></footer>`;
  const backgroundWord = document.createElement('div');
  backgroundWord.className = 'record-background-word';
  backgroundWord.setAttribute('aria-hidden', 'true');
  const keywords: Record<RecordId, string> = {
    time: 'HOURS', days: 'DAYS', streak: 'STREAK', 'world-time': 'WORLD',
    discoveries: 'EXPLORE', friends: 'FRIENDS', instances: 'INSTANCE', worlds: 'TRAVEL', avatars: 'AVATARS',
  };
  backgroundWord.textContent = keywords[id];
  section.querySelector('.recap-stage')!.prepend(backgroundWord);
  section.prepend(createPageProgress(recapPages));
  const heading = section.querySelector<HTMLElement>('.record-heading')!;
  heading.id = `record-title-${id}`;
  heading.textContent = definition.kicker;
  const month = section.querySelector<HTMLElement>('.record-month')!;
  const total = section.querySelector<HTMLElement>('.record-total')!;
  const number = section.querySelector<HTMLElement>('.record-number')!;
  const unit = section.querySelector<HTMLElement>('.record-unit')!;
  const label = section.querySelector<HTMLElement>('.record-label')!;
  const yearlyTotal = section.querySelector<HTMLElement>('.record-yearly-total')!;
  const note = section.querySelector<HTMLElement>('.record-note')!;
  const status = section.querySelector<HTMLElement>('.record-status')!;
  const thumbnail = id === 'world-time' ? createWorldThumbnail() : undefined;
  const imagePermission = thumbnail ? createRecapImagePermission(section) : undefined;
  if (thumbnail && imagePermission) section.querySelector('.record-content')!.append(imagePermission.element, thumbnail.element);
  const revealDurationMs = 2500;
  const numberRevealDelay = 1100;
  const streak = id === 'streak' ? createStreakTimeline({ revealDurationMs, onRevealStart: audio?.start, onRevealValue: audio?.update, onStreakSettled: audio?.settled, onRevealStop: audio?.finish }) : undefined;
  const timeline = id === 'streak' ? undefined : createMonthlyTimeline({ topic: definition.title, year: 2026, unit: 'count', timeZone: 'Europe/Berlin', months: Array.from({ length: 12 }, () => ({ value: null, status: 'missing' as const })) }, { revealDurationMs, onRevealStart: audio?.start, onRevealValue: audio?.update, onMonthSettled: audio?.settled, onRevealStop: audio?.finish });
  section.querySelector('footer')!.append(streak?.element ?? timeline!.element);
  addPageKeyboardNavigation(section, onPrevious, onNext);
  let result: RecordPageData | undefined;
  let seen = false;
  let revealGeneration = 0;
  let chartTimer: ReturnType<typeof setTimeout> | undefined;
  let countFrame = 0;
  let introAnimations: Animation[] = [];
  function stopReveal(settle = true) {
    audio?.stop();
    revealGeneration++;
    clearTimeout(chartTimer);
    cancelAnimationFrame(countFrame);
    introAnimations.forEach(animation => animation.cancel());
    introAnimations = [];
    section.classList.remove('is-revealing-record');
    if (result && settle) number.textContent = format(result.value);
  }
  function stageReveal() {
    if (!seen && result?.status === 'ready' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      section.classList.add('is-revealing-record');
    }
  }
  function present() {
    const animate = !seen;
    if (!animate || result?.status !== 'ready' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      displayTimeline(true, animate);
      seen = true;
      return;
    }
    stopReveal();
    const generation = revealGeneration;
    const finalValue = result.value;
    section.classList.add('is-revealing-record');
    number.textContent = '0';
    for (const [element, delay] of [[heading, 0], [month, 500], [total, numberRevealDelay], [label, 1350], [yearlyTotal, 1500], ...(thumbnail ? [[thumbnail.element, numberRevealDelay] as const] : [])] as const) {
      if (element.hidden && element !== thumbnail?.element) continue;
      introAnimations.push(element.animate([
        { opacity: 0, transform: 'translateY(12px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 800, delay, easing: 'cubic-bezier(.22,.7,.25,1)', fill: 'both' }));
    }
    chartTimer = setTimeout(() => {
      if (generation !== revealGeneration || section.hidden) return;
      displayTimeline(true, true);
      const started = performance.now();
      const count = (now: number) => {
        if (generation !== revealGeneration || section.hidden) return;
        const progress = Math.min(1, (now - started) / revealDurationMs);
        number.textContent = format(finalValue * (1 - Math.pow(1 - progress, 3)));
        if (progress < 1) countFrame = requestAnimationFrame(count);
      };
      countFrame = requestAnimationFrame(count);
    }, numberRevealDelay);
    void Promise.allSettled(introAnimations.map(animation => animation.finished)).then(() => {
      if (generation !== revealGeneration) return;
      section.classList.remove('is-revealing-record');
      introAnimations.forEach(animation => animation.cancel());
      introAnimations = [];
    });
    seen = true;
  }
  function displayTimeline(visible: boolean, animate = false) {
    if (streak) { streak.update(result); streak.setDisplay(visible, animate); }
    else timeline!.setDisplay(visible, true, animate);
  }
  const format = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
  function paint() {
    total.hidden = !result || result.status !== 'ready';
    yearlyTotal.textContent = result && (result.timeline || id === 'streak') ? recordYearlyDetail(result) : '';
    yearlyTotal.hidden = !yearlyTotal.textContent;
    label.hidden = !result?.label;
    label.textContent = result?.label ?? '';
    thumbnail?.update(result?.status === 'ready' ? result : undefined);
    imagePermission?.setAvailable(result?.status === 'ready' && !!(result.worldId || (result.imageUrl && permittedImage(result.imageUrl))));
    const explanation = id === 'streak' || result?.note?.includes('Showing the earliest') ? '' : result?.note ?? '';
    note.hidden = !explanation;
    note.textContent = explanation;
    if (!result) { status.textContent = 'Preparing this record…'; month.textContent = ''; return; }
    if (result.status === 'unavailable' || (!result.timeline && id !== 'streak')) {
      status.textContent = 'This record isn’t available in this history.';
      month.textContent = '';
      return;
    }
    status.textContent = result.value > 0 ? '' : 'No matching activity was recorded.';
    number.textContent = format(result.value);
    unit.textContent = id === 'world-time' ? (result.value === 1 ? 'total hour in' : 'total hours in') : result.value === 1 ? definition.singular : definition.unit;
    const year = result.year ?? result.timeline?.year ?? 2026;
    const winners = result.value > 0 ? (result.months ?? result.timeline?.months.flatMap((entry, index) => entry.value !== null && Math.abs(entry.value - result!.value) <= .000001 ? [index] : []) ?? []) : [];
    const conjunction = new Intl.ListFormat('en-US', { style: 'long', type: 'conjunction' });
    const names = [...winners].sort((a, b) => a - b).map(index => new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, index, 1))));
    month.textContent = names.length ? conjunction.format(names) : '';
    const ranges = result.ranges ?? (result.range ? [result.range] : []);
    if (id === 'streak' && ranges.length) {
      const date = (value: string) => {
        const at = new Date(`${value}T12:00:00Z`);
        const day = at.getUTCDate();
        const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th';
        const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(at);
        return `${day}${suffix} of ${month}`;
      };
      month.textContent = conjunction.format(ranges.map(range => `${date(range.start)} to ${date(range.end)}`));
    }
    const marked = section.querySelectorAll<HTMLElement>('.timeline-month-button');
    marked.forEach((button, index) => button.classList.toggle('is-record-month', winners.includes(index)));

  }
  return {
    section,
    reset() {
      stopReveal();
      result = undefined; seen = false;
      displayTimeline(false); paint();
    },
    update(value: RecordPageData) {
      stopReveal();

      result = id === 'days' && value.status === 'ready' && value.timeline ? daysAttendanceRecord(value.timeline) : value; seen = false;
      if (result.timeline) timeline?.update(result.timeline, false);
      streak?.update(value);
      paint();
      if (!section.hidden && (value.timeline || streak)) present();
    },
    show(defer = false) {
      section.hidden = false;
      thumbnail?.setVisible(true);
      onShow();
      paint();
      if (defer) stageReveal();
      if (!defer) {
        section.focus({ preventScroll: true });
        if (result && (result.timeline || streak)) present();
      }
    },
    suspend() { stopReveal(false); timeline?.suspend(); streak?.suspend(); },
    hide() { thumbnail?.setVisible(false); stopReveal(); section.hidden = true; displayTimeline(false); },
  };
}
