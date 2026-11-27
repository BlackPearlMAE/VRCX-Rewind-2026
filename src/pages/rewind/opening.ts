import { timePlayedPreview, type TimePlayedVariant } from '../../data/time-played-preview';
import type { TimePlayedSessionData, DaysPlayedData } from '../../data/time-played-data';
import { recapHeader } from '../../components/recap-header';
import { addPageKeyboardNavigation } from '../../components/page-navigation';
import { createTimelineSynth } from '../../components/timeline-synth';
import { createPageProgress, recapPages } from '../../components/page-progress';
import { createMonthlyTimeline, type TimelineData } from '../../components/monthly-timeline';
import type { TimelineLoadResult } from '../../data/timeline-query';

export function createOpeningCard(onBack: () => void, onPrevious: () => void = onBack, onShow: () => void = () => {}, onNext?: () => void) {
  const section = document.createElement('section');
  section.className = 'opening-card';
  section.hidden = true;
  section.tabIndex = -1;
  section.setAttribute('aria-labelledby', 'opening-title');
  section.innerHTML = `${recapHeader}
    <div class="recap-stage"><div class="opening-content"><h2 id="opening-title">You played VRChat this year for</h2><p class="opening-total" hidden><span class="opening-number">0</span><span class="opening-unit">hours played!</span></p><p class="opening-comparison" hidden></p><p class="opening-secondary" hidden></p><p class="opening-sessions opening-secondary" hidden></p><p class="opening-status" role="status">Preparing your recorded time…</p></div></div>
    <footer class="opening-footer"></footer>`;
  // Planned recap: opening, up to eight records, Worlds, and Friends.
  section.prepend(createPageProgress(recapPages, 1));
  section.querySelector('button')!.addEventListener('click', onBack);
  const number = section.querySelector<HTMLElement>('.opening-number')!;
  const status = section.querySelector<HTMLElement>('.opening-status')!;
  const total = section.querySelector<HTMLElement>('.opening-total')!;
  const heading = section.querySelector<HTMLElement>('#opening-title')!;
  const comparison = section.querySelector<HTMLElement>('.opening-comparison')!;
  const secondary = section.querySelector<HTMLElement>('.opening-secondary')!;
  const sessions = section.querySelector<HTMLElement>('.opening-sessions')!;
  let sessionCount: number | undefined;
  let variant: TimePlayedVariant = 'days-high';
  const unit = section.querySelector<HTMLElement>('.opening-unit')!;
  const synth = createTimelineSynth();
  let soundEnabled = true;
  let audioPending = false;
  let revealRevision = 0;
  document.addEventListener('visibilitychange', () => { if (document.hidden) synth.stop(); });
  window.addEventListener('pagehide', () => synth.dispose(), { once: true });
  let data: TimelineData | undefined;
  const timeline = createMonthlyTimeline({ topic: 'Recorded time', year: 2026, unit: 'hours', months: Array.from({ length: 12 }, () => ({ value: null, status: 'missing' as const })) }, {
    revealDurationMs: 2500,
    onRevealValue: value => { number.textContent = Math.round(value).toLocaleString('en-US'); unit.textContent = data?.unit === 'days' ? (Math.round(value) === 1 ? 'day' : 'days') : (Math.round(value) === 1 ? 'hour played!' : 'hours played!'); synth.update(value); },
    onRevealStart: synth.start,
    onMonthSettled: synth.settled,
    onRevealStop: synth.finish,
  });
  addPageKeyboardNavigation(section, onPrevious, onNext);
  section.querySelector('footer')!.append(timeline.element);
  let source: TimelineData | undefined;
  let sessionData: TimePlayedSessionData | undefined;
  let daysData: DaysPlayedData | undefined;
  let seen = false;
  function applyPresentation() {
    data = source;
    const hasDays = !!(sessionData || daysData);
    if (!hasDays && variant.startsWith('days-')) variant = 'hours-high';
    sessions.hidden = !source || sessionCount === undefined;
    sessions.textContent = sessionCount === undefined ? '' : `${sessionCount.toLocaleString('en-US')} recorded ${sessionCount === 1 ? 'session' : 'sessions'}`;
    comparison.hidden = true;
    secondary.hidden = true;
    heading.textContent = 'You played VRChat this year for';
    if (source) {
      const selected = timePlayedPreview(source, sessionData, variant, daysData);
      data = selected.timeline;
      secondary.textContent = selected.daysMode
        ? `${Math.round(selected.hours).toLocaleString('en-US')} recorded hours`
        : `${selected.days.toLocaleString('en-US')} ${selected.days === 1 ? 'day' : 'days'} played`;
      secondary.hidden = !hasDays;
      heading.textContent = selected.title;
      comparison.textContent = selected.comparison;
      comparison.hidden = false;

    }
    total.hidden = !data;
  }
  function reveal() {
    if (!data) return;
    timeline.setDisplay(false);
    timeline.update(data, false);
    timeline.setDisplay(true, true, !seen);
    seen = true;
  }
  return {
    section,
    reset() {
      synth.stop();
      seen = false;
      variant = 'days-high';
      source = undefined;
      sessionData = undefined;
      sessionCount = undefined;
      daysData = undefined;
      applyPresentation();
      status.textContent = 'Preparing your recorded time…';
      timeline.setDisplay(false);
      number.textContent = '0';
    },
    update(result: TimelineLoadResult) {
      source = result.ok ? result.data : undefined;
      sessionData = result.ok ? result.sessionData : undefined;
      daysData = result.ok ? result.daysData : undefined;
      sessionCount = result.ok ? result.sessionCount ?? sessionData?.summary.sessionCount : undefined;
      if (source && (sessionData || daysData)) {
        const selection = timePlayedPreview(source, sessionData, variant, daysData);
        variant = selection.preferredMetric === 'days' ? 'days-high' : 'hours-high';
      }
      applyPresentation();
      status.textContent = data ? '' : result.message;
      if (data && !section.hidden && !audioPending) reveal();
    },
    setSoundVolume(volume: number) { synth.setVolume(Math.min(1, volume * 2.5)); },
    setSoundEnabled(enabled: boolean) {
      soundEnabled = enabled;
      if (!enabled || !section.hidden) void synth.setEnabled(enabled);
    },
    prepareAudio() { void synth.setEnabled(soundEnabled); },
    suspend() {
      revealRevision++;
      audioPending = true;
      synth.stop();
      timeline.suspend();
    },
    show(deferReveal = false) {
      section.hidden = false;
      onShow();
      if (deferReveal) { audioPending = true; if (seen) reveal(); return; }
      section.focus({ preventScroll: true });
      if (seen) { reveal(); return; }
      const revision = ++revealRevision;
      audioPending = true;
      // Unlock audio directly from the Start gesture before the animation begins.
      void synth.setEnabled(soundEnabled).then(() => {
        if (revision !== revealRevision) return;
        audioPending = false;
        if (!section.hidden) reveal();
      });
    },
    hide() { revealRevision++; audioPending = false; section.hidden = true; timeline.setDisplay(false); synth.stop(); },
  };
}
