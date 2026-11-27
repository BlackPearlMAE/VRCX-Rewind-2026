import type { RecordPageData } from '../data/record-pages';

/** A continuous calendar strip with a filling bar and day count for each streak. */
export function createStreakTimeline(options: { revealDurationMs?: number; onRevealStart?: (total: number) => void; onRevealValue?: (total: number) => void; onStreakSettled?: (rank: number) => void; onRevealStop?: (completed: boolean) => void } = {}) {
  const element = document.createElement('div');
  element.className = 'monthly-timeline streak-timeline';
  element.setAttribute('aria-label', 'Longest played-day streak');
  element.innerHTML = '<div class="timeline-scroll"><div class="timeline-plot"><div class="timeline-axis" aria-hidden="true"></div><div class="streak-calendar" aria-hidden="true"></div><div class="streak-runs" aria-hidden="true"></div><div class="streak-months" aria-hidden="true"></div></div></div>';
  const calendar = element.querySelector<HTMLElement>('.streak-calendar')!;
  const months = element.querySelector<HTMLElement>('.streak-months')!;
  const runsLayer = element.querySelector<HTMLElement>('.streak-runs')!;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const duration = options.revealDurationMs ?? 2500;
  let frame = 0;
  let bars: { element: HTMLElement; fill: HTMLElement; label: HTMLElement; days: number; rank: number }[] = [];
  let revealing = false;
  const awardedRanks = new Set<number>();
  function stop(completed = false) {
    cancelAnimationFrame(frame); frame = 0;
    if (revealing) options.onRevealStop?.(completed);
    revealing = false;
  }
  function paint(elapsed: number) {
    const longest = Math.max(1, ...bars.map(bar => bar.days));
    let total = 0;
    for (const bar of bars) {
      const progress = Math.min(1, elapsed / (duration * bar.days / longest));
      const filled = 1 - Math.pow(1 - progress, 3);
      bar.fill.style.clipPath = `inset(0 ${(1 - filled) * 100}% 0 0)`;
      total += bar.days * filled;
      const settled = progress === 1;
      if (revealing && settled && bar.element.dataset.settled !== 'true' && !awardedRanks.has(bar.rank) && bar.rank <= 3) {
        awardedRanks.add(bar.rank);
        options.onStreakSettled?.(bar.rank);
      }
      bar.element.dataset.settled = String(settled);
      bar.label.textContent = String(Math.round(bar.days * filled));
      bar.label.style.opacity = elapsed > 0 ? '1' : '0';
    }
    if (revealing) options.onRevealValue?.(total);
  }
  return {
    element,
    update(result?: RecordPageData) {
      stop();
      const year = result?.year ?? result?.timeline?.year ?? 2026;
      const start = Date.UTC(year, 0, 1);
      const count = (Date.UTC(year + 1, 0, 1) - start) / 86400000;
      const ranges = result?.ranges ?? (result?.range ? [result.range] : []);
      const runs = result?.streaks ?? ranges.map(range => ({ ...range, length: Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86400000) + 1 }));
      const rankedLengths = [...new Set(runs.filter(run => run.length > 0).map(run => run.length))].sort((a, b) => b - a);
      calendar.style.gridTemplateColumns = `repeat(${count}, minmax(0, 1fr))`;
      calendar.replaceChildren(...Array.from({ length: count }, () => {
        const day = document.createElement('span');
        day.className = 'streak-day';
        return day;
      }));
      bars = [];
      const laneEnds: number[] = [];
      const plotWidth = runsLayer.clientWidth || Math.max(320, innerWidth - 112);
      runsLayer.replaceChildren(...[...runs].sort((a, b) => a.start.localeCompare(b.start)).flatMap(run => {
        const first = Math.max(0, (Date.parse(run.start) - start) / 86400000);
        const end = Math.min(count, (Date.parse(run.end) - start) / 86400000 + 1);
        if (end <= first) return [];
        const bar = document.createElement('span');
        bar.className = 'streak-run';
        const rank = rankedLengths.indexOf(run.length) + 1;
        bar.dataset.rank = String(rank);
        bar.classList.toggle('is-best-streak', rank === 1);
        bar.classList.toggle('is-ranked-streak', rank >= 1 && rank <= 3);
        bar.style.left = `${first / count * 100}%`;
        bar.style.width = `${(end - first) / count * 100}%`;
        bar.title = `${run.start} to ${run.end}: ${run.length} ${run.length === 1 ? 'day' : 'days'}`;
        const fill = document.createElement('span'); fill.className = 'streak-run-fill';
        fill.style.gridTemplateColumns = `repeat(${end - first}, minmax(0, 1fr))`;
        fill.replaceChildren(...Array.from({ length: end - first }, () => {
          const day = document.createElement('span');
          day.className = 'streak-run-day';
          return day;
        }));
        const label = document.createElement('span'); label.className = 'streak-run-count';
        const center = (first + end) / 2 / count * plotWidth;
        const halfWidth = Math.max(rank <= 3 ? 20 : 0, String(run.length).length * 4 + 5);
        let lane = laneEnds.findIndex(right => right < center - halfWidth);
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = center + halfWidth;
        bar.style.setProperty('--streak-count-lane', String(lane));
        bar.append(fill, label);
        if (rank <= 3) {
          const place = document.createElement('span'); place.className = 'streak-run-place';
          place.textContent = ['1st', '2nd', '3rd'][rank - 1]!;
          bar.append(place);
        }
        bars.push({ element: bar, fill, label, days: run.length, rank });
        return [bar];
      }));
      months.replaceChildren(...Array.from({ length: 12 }, (_, month) => {
        const label = document.createElement('span');
        label.className = 'streak-month-label';
        const day = (Date.UTC(year, month, 1) - start) / 86400000;
        const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        label.style.left = `${day / count * 100}%`;
        label.style.width = `${length / count * 100}%`;
        label.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month, 1)));
        const tick = document.createElement('span'); tick.className = 'timeline-month-tick'; tick.style.left = `${day / count * 100}%`;
        const wrapper = document.createElement('span'); wrapper.append(tick, label);
        return wrapper;
      }));
      const endTick = document.createElement('span'); endTick.className = 'timeline-end-tick'; months.append(endTick);
      element.setAttribute('aria-label', ranges.length
        ? `${year}: ${result!.value} consecutive days played, ${ranges.map(range => `${range.start} to ${range.end}`).join(' and ')}`
        : `${year}: no recorded streak available`);
      const podiumSummary = rankedLengths.slice(0, 3).map((days, index) => `${['First', 'Second', 'Third'][index]} place: ${days} consecutive days`).join('; ');
      if (podiumSummary) element.setAttribute('aria-label', `${element.getAttribute('aria-label')}; ${podiumSummary}`);
      paint(Infinity);
    },
    suspend: stop,
    setDisplay(visible: boolean, animate = false) {
      stop();
      element.classList.toggle('has-streak', visible);
      if (!visible || !animate || reducedMotion.matches || !bars.length) { paint(Infinity); return; }
      awardedRanks.clear();
      revealing = true;
      options.onRevealStart?.(bars.reduce((sum, bar) => sum + bar.days, 0));
      paint(0);
      const started = performance.now();
      const tick = (now: number) => {
        if (!element.isConnected) { stop(); return; }
        const elapsed = now - started;
        paint(elapsed);
        if (elapsed < duration && !reducedMotion.matches) frame = requestAnimationFrame(tick);
        else { paint(Infinity); stop(true); }
      };
      frame = requestAnimationFrame(tick);
    },
  };
}
