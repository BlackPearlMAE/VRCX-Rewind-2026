import { createTransitionControls } from './transition-controls';
import { createSynthControls } from './synth-controls';

import { createTimelineSynth } from '../../src/components/timeline-synth';

import { savedTimelineDemo } from '../../src/data/timeline-demo';

import { createDatabaseChecker } from '../../src/data/database-check';

import type { TimelineMetric } from '../../src/data/timeline-query';

import { createMonthlyTimeline } from '../../src/components/monthly-timeline';



export function createTimelineTestPage(): HTMLElement {

  const main = document.createElement('main'); main.className = 'timeline-lab';

  main.innerHTML = `<section class="timeline-test-controls" aria-label="Test controls"><h2>Test controls</h2><div><label>Show<select class="timeline-metric" aria-label="Timeline metric"><option value="hours">Recorded time</option><option value="friends-added">Friends added</option></select></label><label><input type="checkbox" class="timeline-show-values" checked> Show monthly data</label><label><input type="checkbox" class="timeline-show-weeks" checked disabled> Weekly line on top</label><span class="timeline-data-source">Saved demo · your recorded 2026 totals</span><div class="timeline-sound-controls"><label><input type="checkbox" class="timeline-sound-enabled"> Sound</label><label>Volume <input type="range" class="timeline-sound-volume" min="0" max="100" step="1" value="25" aria-label="Sound volume"><output class="timeline-volume-value">25%</output></label></div><p class="timeline-sound-status" role="status" aria-live="polite"></p><button type="button" class="timeline-replay">Replay reveal</button><button type="button" class="timeline-load-database">Load my VRCX database</button><input type="file" class="timeline-database-input" accept=".sqlite3,.sqlite,.db" aria-label="Load timeline database" hidden><label class="timeline-account-label" hidden>Account<select class="timeline-account" aria-label="Timeline account"></select></label><button type="button" class="timeline-cancel-load" hidden>Cancel loading</button><p class="timeline-load-status" role="status" aria-live="polite"></p><a href="/">Back to landing</a></div></section><section class="timeline-total" aria-label="Total estimated recorded time"><p class="timeline-total-caption">Recorded time in 2026</p><p class="timeline-total-display"><span class="timeline-total-number">0</span><span class="timeline-total-unit">hours</span></p></section><footer class="timeline-lab-footer"></footer>`;

  const totalPanel = main.querySelector<HTMLElement>('.timeline-total')!;

  const totalNumber = main.querySelector<HTMLElement>('.timeline-total-number')!;

  const synth = createTimelineSynth();

  const synthControls = createSynthControls(synth);

  totalPanel.before(synthControls);

  const sound = main.querySelector<HTMLInputElement>('.timeline-sound-enabled')!;

  const volume = main.querySelector<HTMLInputElement>('.timeline-sound-volume')!;

  const soundStatus = main.querySelector<HTMLElement>('.timeline-sound-status')!;

  const timeline = createMonthlyTimeline(savedTimelineDemo(), {

    onRevealValue: total => { totalNumber.textContent = Math.round(total).toLocaleString('en-US'); synth.update(total); },

    onRevealStart: synth.start,

    onMonthSettled: synth.settled,

    onRevealStop: synth.finish,

  });

  main.querySelector('footer')!.append(timeline.element);
  totalPanel.before(createTransitionControls(main, () => timeline.replay()));

  sound.addEventListener('change', () => {

    const wanted = sound.checked;

    void synth.setEnabled(wanted).then(ready => {

      if (sound.checked !== wanted) return;

      if (wanted && !ready) { sound.checked = false; soundStatus.textContent = 'Sound could not start. Try enabling Sound again.'; }

      else soundStatus.textContent = wanted ? 'Sound ready. Press Replay reveal to listen.' : '';

    });

  });

  volume.addEventListener('input', () => {

    synth.setVolume(Number(volume.value) / 100);

    main.querySelector('.timeline-volume-value')!.textContent = `${volume.value}%`;

  });

  main.querySelector('.timeline-replay')!.addEventListener('click', () => {

    if (!sound.checked) { timeline.replay(); return; }

    void synth.resume().then(ready => {

      soundStatus.textContent = ready ? '' : 'Sound is unavailable. The animation will still play.';

      timeline.replay();

    });

  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) synth.stop(); });

  const values = main.querySelector<HTMLInputElement>('.timeline-show-values')!;

  const weeks = main.querySelector<HTMLInputElement>('.timeline-show-weeks')!;

  function refresh() { weeks.disabled = !values.checked; timeline.setDisplay(values.checked, weeks.checked); }

  values.addEventListener('change', refresh); weeks.addEventListener('change', refresh);

  refresh();

  let checker = createDatabaseChecker();

  let selectedFile: File | undefined;

  let revision = 0;

  let activeAccount = '';

  const metric = main.querySelector<HTMLSelectElement>('.timeline-metric')!;

  const currentMetric = () => metric.value as TimelineMetric;

  function setCaption() {

    const friends = currentMetric() === 'friends-added';

    main.querySelector('.timeline-total-caption')!.textContent = friends ? 'Friends added in 2026' : 'Recorded time in 2026';

    main.querySelector('.timeline-total-unit')!.textContent = friends ? 'friends' : 'hours';

    totalPanel.setAttribute('aria-label', friends ? 'Total friends added' : 'Total estimated recorded time');

  }

  const load = main.querySelector<HTMLButtonElement>('.timeline-load-database')!;

  const input = main.querySelector<HTMLInputElement>('.timeline-database-input')!;

  const cancel = main.querySelector<HTMLButtonElement>('.timeline-cancel-load')!;

  const account = main.querySelector<HTMLSelectElement>('.timeline-account')!;

  const accountLabel = main.querySelector<HTMLElement>('.timeline-account-label')!;

  const source = main.querySelector<HTMLElement>('.timeline-data-source')!;

  const status = main.querySelector<HTMLElement>('.timeline-load-status')!;

  function clearPreview() {

    setCaption();

    totalPanel.hidden = true;

    timeline.setDisplay(false);

    timeline.update({ topic: 'Estimated recorded time', year: 2026, unit: 'hours', months: Array.from({ length: 12 }, () => ({ value: null, status: 'missing' })) });

    values.disabled = true; weeks.disabled = true;

    source.textContent = 'Your database · 2026';

    values.closest('label')!.lastChild!.textContent = ' Show monthly data';

  }

  function finish() { metric.disabled = false; cancel.hidden = true; load.removeAttribute('aria-busy'); }

  async function calculate(accountId: string, token: number, started: number) {

    activeAccount = accountId;

    const selectedMetric = currentMetric();

    load.setAttribute('aria-busy', 'true'); cancel.hidden = false;

    status.textContent = selectedMetric === 'friends-added' ? 'Calculating friends added...' : 'Calculating your recorded time...';

    const result = await checker.loadTimeline(accountId, selectedMetric);

    if (token !== revision) return;

    finish();

    if (!result.ok || !result.data) { status.textContent = result.message; return; }

    totalPanel.hidden = false;

    timeline.update(result.data);

    values.disabled = false; values.checked = true; refresh();

    source.textContent = 'Your database · 2026 · Estimated hours · Europe/Berlin';

    status.textContent = `Loaded in ${((performance.now() - started) / 1000).toFixed(1)} seconds. ${selectedMetric === 'friends-added' ? 'Counts first recorded friendships, excluding re-adds. Incomplete retained history can affect counts.' : 'Empty periods outside retained history are shown as unavailable.'}`;

  }

  async function loadFile(file: File, preferredAccount?: string) {

    const token = ++revision, started = performance.now();

    if (selectedFile) { checker.stop(); checker = createDatabaseChecker(); }

    selectedFile = file; activeAccount = ''; metric.disabled = true;

    clearPreview(); accountLabel.hidden = true;

    load.textContent = 'Choose another database';

    load.setAttribute('aria-busy', 'true'); cancel.hidden = false;

    status.textContent = 'Opening your database locally...';

    const checked = await checker.check(file);

    if (token !== revision) return;

    if (!checked.ok) { finish(); status.textContent = checked.message; return; }

    metric.disabled = false;

    const accounts = checked.accounts ?? [];

    if (!accounts.length) { finish(); status.textContent = 'No VRCX account history was found for calculating corrected visit times.'; return; }

    account.replaceChildren(...accounts.map((id, index) => {

      const option = document.createElement('option'); option.value = id; option.textContent = `Account ${index + 1}: ${id}`; return option;

    }));

    accountLabel.hidden = accounts.length < 2;

    if (preferredAccount && accounts.includes(preferredAccount)) account.value = preferredAccount;

    else if (accounts.length > 1) {

      const option = document.createElement('option'); option.value = ''; option.textContent = 'Select your account'; option.disabled = true; option.selected = true; account.prepend(option);

      status.textContent = 'Choose your account to calculate recorded time.'; finish(); return;

    }

    await calculate(account.value, token, started);

  }

  load.addEventListener('click', () => input.click());

  input.addEventListener('change', () => { const file = input.files?.[0]; input.value = ''; if (file) void loadFile(file); });

  account.addEventListener('change', () => { if (selectedFile && account.value) void loadFile(selectedFile, account.value); });

  cancel.addEventListener('click', () => {

    revision++; activeAccount = ''; checker.stop(); checker = createDatabaseChecker(); finish();

    status.textContent = 'Loading cancelled. Choose a database to try again.';

  });

  metric.addEventListener('change', () => {

    const token = ++revision;

    clearPreview();

    if (activeAccount) void calculate(activeAccount, token, performance.now());

    else if (currentMetric() === 'hours' && !selectedFile) {

      totalPanel.hidden = false; timeline.update(savedTimelineDemo()); values.disabled = false; values.checked = true; refresh();

      source.textContent = 'Saved demo · your recorded 2026 totals'; status.textContent = '';

    } else status.textContent = accountLabel.hidden ? 'Load your VRCX database to show friends added.' : 'Choose your account to calculate this view.';

  });

  window.addEventListener('pagehide', () => { checker.stop(); synth.dispose(); }, { once: true });

  return main;

}
