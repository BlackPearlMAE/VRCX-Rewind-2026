import { calendarMidnight, type TimelineZone } from '../data/timeline-calendar';
export type TimelineMonth = { value: number; rankValue?: number; status?: 'recorded'; partial?: boolean } | { value: null; rankValue?: never; status: 'missing' | 'future'; partial?: never };
export interface TimelineWeek { month: number; segment: 0 | 1 | 2 | 3; start: string; end: string; value: number | null }
export interface TimelineData { topic: string; year: number; unit: string; timeZone?: TimelineZone; months: readonly TimelineMonth[]; weeks?: readonly TimelineWeek[] }
const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** An evenly spaced month ruler with optional broad monthly bars and smaller weekly overlays. */
export function createMonthlyTimeline(initial: TimelineData, options: { revealDurationMs?: number; onRevealValue?: (total: number) => void; onRevealStart?: (total: number) => void; onMonthSettled?: (rank: number) => void; onRevealStop?: (completed: boolean) => void } = {}) {
  const revealDurationMs = options.revealDurationMs ?? 2500;
  const element = document.createElement('section');
  element.className = 'monthly-timeline';
  element.setAttribute('aria-label', 'Monthly timeline');
  element.innerHTML = '<p class="timeline-inspection" aria-live="polite"></p><div class="timeline-scroll"><div class="timeline-plot"><div class="timeline-axis" aria-hidden="true"></div><div class="timeline-week-ticks" aria-hidden="true"></div><div class="timeline-months"></div><div class="timeline-week-bars"></div><span class="timeline-end-tick" aria-hidden="true"></span></div></div>';
  const months = element.querySelector<HTMLElement>('.timeline-months')!;
  const ticks = element.querySelector<HTMLElement>('.timeline-week-ticks')!;
  const weeks = element.querySelector<HTMLElement>('.timeline-week-bars')!;
  const inspection = element.querySelector<HTMLElement>('.timeline-inspection')!;
  let current = initial;
  let showValues = false;
  let showWeeks = false;
  let animationFrame = 0;
  let visibleValues: number[] = [];
  let paintReveal: (elapsed: number) => void = () => {};
  let longestValue = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function stopReveal(completed = false) {
    options.onRevealStop?.(completed);
    cancelAnimationFrame(animationFrame); animationFrame = 0;
    element.classList.remove('is-revealing');
    element.dataset.reveal = 'complete';
    element.dataset.revealPhase = 'complete';
    element.removeAttribute('aria-busy');
    weeks.inert = false;
    weeks.removeAttribute('aria-hidden');
  }
  function replay() {
    stopReveal();
    if (!showValues || reducedMotion.matches || longestValue === 0) { paintReveal(Infinity); return; }
    element.classList.add('is-revealing'); element.dataset.reveal = 'running';
    element.setAttribute('aria-busy', 'true');
    weeks.inert = true;
    weeks.setAttribute('aria-hidden', 'true');
    options.onRevealStart?.(current.months.reduce((total, month) => total + (month.value ?? 0), 0));
    paintReveal(0);
    const started = performance.now();
    element.dataset.revealPhase = 'easing';
    const frame = (now: number) => {
      if (!element.isConnected) { stopReveal(); return; }
      const elapsed = Math.max(0, now - started);
      paintReveal(elapsed);
      if (elapsed < revealDurationMs && !reducedMotion.matches) animationFrame = requestAnimationFrame(frame);
      else { paintReveal(Infinity); stopReveal(true); }
    };
    animationFrame = requestAnimationFrame(frame);
  }
  const format = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  const formatWhole = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const buttons = names.map((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'timeline-month-button';
    button.innerHTML = '<span class="timeline-month-bar" aria-hidden="true"><span class="timeline-month-value"></span></span><span class="timeline-month-tick" aria-hidden="true"></span><span class="timeline-month-label"></span>';
    button.querySelector('.timeline-month-label')!.textContent = name;
    function inspect() {
      if (!showValues) return;
      const month = current.months[index]!;
      const detail = month.value === null ? (month.status === 'missing' ? 'No data' : 'Future month') : `${format(visibleValues[index] ?? month.value)} ${current.unit}${month.partial ? ' · Partial month' : ''}`;
      inspection.textContent = `${name} · ${detail}`;
    }
    button.addEventListener('pointerenter', inspect);
    button.addEventListener('focus', inspect);
    button.addEventListener('click', inspect);
    button.addEventListener('keydown', event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % 12 : event.key === 'ArrowLeft' ? (index + 11) % 12 : event.key === 'Home' ? 0 : event.key === 'End' ? 11 : undefined;
      if (next !== undefined) { event.preventDefault(); buttons[next]!.focus(); }
    });
    months.append(button);
    return button;
  });
  element.addEventListener('pointerleave', () => { if (!element.contains(document.activeElement)) inspection.textContent = ''; });
  element.addEventListener('focusout', event => { if (!element.contains(event.relatedTarget as Node | null)) inspection.textContent = ''; });
  function update(data: TimelineData, animate = true) {
    stopReveal();
    if (data.months.length !== 12 || data.months.some(month => month.value !== null && (!Number.isFinite(month.value) || month.value < 0))) throw new Error('Expected twelve valid monthly values.');
    const start = calendarMidnight(data.year, 0, 1, data.timeZone);
    const end = calendarMidnight(data.year + 1, 0, 1, data.timeZone);
    if (data.weeks?.some(week => !Number.isInteger(week.month) || week.month < 0 || week.month > 11 || ![0, 1, 2, 3].includes(week.segment) || Date.parse(week.start) < calendarMidnight(data.year, week.month, 1, data.timeZone) || Date.parse(week.end) > calendarMidnight(data.year, week.month + 1, 1, data.timeZone) || !Number.isFinite(Date.parse(week.start)) || !Number.isFinite(Date.parse(week.end)) || Date.parse(week.start) < start || Date.parse(week.end) > end || Date.parse(week.start) >= Date.parse(week.end) || (week.value !== null && (!Number.isFinite(week.value) || week.value < 0)))) throw new Error('Invalid weekly intervals.');
    current = data;
    inspection.textContent = '';
    element.setAttribute('aria-label', `${data.year} monthly timeline${showValues ? `, ${data.topic}` : ''}`);
    const max = Math.max(1, ...data.months.map(month => month.value ?? 0), ...(data.weeks?.map(week => week.value ?? 0) ?? []));
    longestValue = Math.max(...data.months.map(month => month.value ?? 0));
    // Equal positive values share a rank; zero and unavailable values are unranked.
    const ranked = [...new Set(data.months.flatMap(month => month.value !== null && month.value > 0 ? [month.rankValue ?? month.value] : []))].sort((a, b) => b - a);
    const rankOf = (month: TimelineMonth) => month.value !== null && month.value > 0 ? String(ranked.indexOf(month.rankValue ?? month.value) + 1) : '0';
    buttons.forEach((button, index) => {
      const month = data.months[index]!;
      button.style.left = `${index / 12 * 100}%`;
      button.style.width = `${100 / 12}%`;
      button.dataset.status = month.status ?? 'recorded';
      button.dataset.rank = rankOf(month);
      const bar = button.querySelector<HTMLElement>('.timeline-month-bar')!;
      const rank = Number(button.dataset.rank);
      bar.dataset.place = rank === 0 ? '' : rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`;
      bar.querySelector('.timeline-month-value')!.textContent = month.value === null ? (month.status === 'missing' ? 'No data' : 'Later') : (data.unit === '%' ? format(month.value) + '%' : formatWhole(month.value) + (data.unit === 'hours' ? 'h' : ''));
      bar.dataset.short = String((month.value ?? 0) / max < .24);
      bar.style.height = `calc(var(--timeline-height) * ${(month.value ?? 0) / max})`;
      const value = month.value === null ? (month.status === 'missing' ? 'no data' : 'future month') : `${format(month.value)} ${data.unit}${month.partial ? ', partial month' : ''}`;
      button.setAttribute('aria-label', `${names[index]} ${data.year}${showValues ? `, ${value}` : ''}`);
    });
    ticks.replaceChildren();
    // Four equal visual sections per month, independent of calendar week lengths.
    for (let month = 0; month < 12; month++) {
      for (let section = 1; section < 4; section++) {
        const tick = document.createElement('span'); tick.className = 'timeline-week-tick';
        tick.style.left = `${(month + section / 4) / 12 * 100}%`; ticks.append(tick);
      }
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('timeline-week-line');
    svg.setAttribute('viewBox', '0 0 1000 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const paths = new Map<string, SVGPathElement>();
    function drawLine() {
      const segments = new Map<string, string>();
      let previous: { x: number; y: number; rank: string } | undefined;
      for (const week of data.weeks ?? []) {
        if (week.value === null) { previous = undefined; continue; }
        const x = (week.month + (week.segment + .5) / 4) / 12 * 1000;
        const y = 100 - week.value / max * 100;
        const rank = rankOf(data.months[week.month]!);
        if (previous) {
          const color = rank === previous.rank && ['1', '2', '3'].includes(rank) ? rank : '0';
          segments.set(color, (segments.get(color) ?? '') + ` M${previous.x},${previous.y} L${x},${y}`);
        }
        previous = { x, y, rank };
      }
      for (const [rank, line] of segments) {
        let path = paths.get(rank);
        if (!path) {
          path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.dataset.rank = rank;
          path.setAttribute('vector-effect', 'non-scaling-stroke');
          paths.set(rank, path); svg.append(path);
        }
        path.setAttribute('d', line.trim());
      }
    }
    drawLine();
    weeks.replaceChildren(svg, ...(data.weeks ?? []).flatMap(week => {
      if (week.value === null) return [];
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'timeline-week-button';
      // Weekly overlays follow their month's highlight so the ranking stays consistent.
      button.dataset.rank = rankOf(data.months[week.month]!);
      const from = Date.parse(week.start), to = Date.parse(week.end);
      button.style.left = `${(week.month + (week.segment + .5) / 4) / 12 * 100}%`;
      button.style.bottom = `${week.value / max * 100}%`;
      const date = (time: number) => new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: data.timeZone ?? 'UTC' });
      const label = `${date(from)} to ${date(to - 1)} · ${week.value === null ? 'No data' : `${format(week.value)} ${data.unit}`}`;
      const number = document.createElement('span');
      number.className = 'timeline-week-value';
      number.setAttribute('aria-hidden', 'true');
      number.textContent = week.value === null ? '' : formatWhole(week.value);
      button.append(number);
      button.dataset.short = String((week.value ?? 0) / max < .18);
      button.setAttribute('aria-label', label);
      button.addEventListener('pointerenter', () => { inspection.textContent = label; });
      button.addEventListener('focus', () => { inspection.textContent = label; });
      return [button];
    }));
    const monthBars = buttons.map(button => button.querySelector<HTMLElement>('.timeline-month-bar')!);
    paintReveal = (elapsed: number) => {
      visibleValues = data.months.map((month, index) => {
        if (month.value === null) return 0;
        // Same cubic ease-out for each bar. Proportional durations preserve the
        // same starting speed while allowing every bar to land gently on its own value.
        const duration = longestValue > 0 ? revealDurationMs * month.value / longestValue : 0;
        const progress = duration > 0 ? Math.min(1, elapsed / duration) : 1;
        const value = progress === 1 ? month.value : month.value * (1 - (1 - progress) ** 3);
        const bar = monthBars[index]!;
        bar.style.height = `calc(var(--timeline-height) * ${value / max})`;
        const wasSettled = buttons[index]!.dataset.settled === 'true';
        buttons[index]!.dataset.settled = String(progress === 1);
        if (!wasSettled && progress === 1 && month.value > 0 && Number.isFinite(elapsed) && element.classList.contains('is-revealing')) options.onMonthSettled?.(Number(buttons[index]!.dataset.rank));
        // Keep label placement fixed throughout the rise.
        bar.dataset.revealLabelVisible = String(month.value === 0 || bar.dataset.short === 'true' || value / max >= .12);
        bar.querySelector('.timeline-month-value')!.textContent = formatWhole(value) + (data.unit === 'hours' ? 'h' : '');
        return value;
      });
      options.onRevealValue?.(visibleValues.reduce((total, value) => total + value, 0));
    };
    paintReveal(Infinity);
    if (animate && showValues) replay();
  }
  function setDisplay(values: boolean, weekly = false, animate = true) {
    const becomingVisible = values && !showValues;
    showValues = values; showWeeks = values && weekly;
    element.classList.toggle('has-values', showValues);
    weeks.hidden = !showWeeks;
    update(current, false);
    if (becomingVisible && animate) replay();
  }
  setDisplay(false);
  return {
    element, update, setDisplay, replay,
    suspend() {
      // Freeze the visible frame while this page slides away. Do not settle bars
      // or reveal the weekly overlay until the page is shown again.
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      options.onRevealStop?.(false);
    },
  };
}
