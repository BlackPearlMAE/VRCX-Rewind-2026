import { savedTimelineDemo } from '../../src/data/timeline-demo';
import { test, expect } from '@playwright/test';

test('sound is opt-in, creates native voices on replay, and mute cancels later awards', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const stats = { contexts: 0, voices: 0 };
    (window as any).__audioStats = stats;
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) { super(options); stats.contexts++; }
      createOscillator() { stats.voices++; return super.createOscillator(); }
    };
  });
  const wasm = page.waitForResponse(response => response.url().endsWith('.wasm') && response.ok());
  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');
  await (await wasm).finished();
  await page.evaluate(() => document.fonts.ready);
  const sound = page.getByLabel('Sound', { exact: true });
  await expect(sound).not.toBeChecked();
  expect(await page.evaluate(() => (window as any).__audioStats)).toEqual({ contexts: 0, voices: 0 });
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await sound.check();
  await expect(page.locator('.timeline-sound-status')).toContainText('Sound ready');
  expect(await page.evaluate(() => (window as any).__audioStats)).toEqual({ contexts: 1, voices: 0 });
  const volume = page.getByLabel('Sound volume', { exact: true });
  await volume.press('Home');
  await expect(page.locator('.timeline-volume-value')).toHaveText('0%');
  await volume.press('ArrowRight');
  await expect(page.locator('.timeline-volume-value')).toHaveText('1%');
  await page.getByRole('button', { name: 'Replay reveal' }).click();
  await expect(page.locator('.monthly-timeline')).toHaveAttribute('data-reveal', 'running');
  await expect(page.locator('.monthly-timeline')).toHaveAttribute('data-reveal', 'complete');
  // One riser, one third-place note, two second-place notes and four first-place notes.
  expect(await page.evaluate(() => (window as any).__audioStats)).toEqual({ contexts: 1, voices: 8 });
  await page.getByRole('button', { name: 'Replay reveal' }).click();
  await sound.uncheck();
  await expect(page.locator('.monthly-timeline')).toHaveAttribute('data-reveal', 'complete');
  expect(await page.evaluate(() => (window as any).__audioStats)).toEqual({ contexts: 1, voices: 9 });
  expect(requests).toEqual([]);
});

test('unavailable audio does not prevent the visual reveal', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'AudioContext', { value: undefined }); });
  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');
  await page.getByLabel('Sound', { exact: true }).click();
  await expect(page.locator('.timeline-sound-status')).toContainText('Sound could not start');
  await expect(page.getByLabel('Sound', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Replay reveal' }).click();
  await expect(page.locator('.monthly-timeline')).toHaveAttribute('data-reveal', 'complete');
  await expect(page.locator('.timeline-total-number')).toHaveText(Math.round(savedTimelineDemo().months.reduce((sum, month) => sum + (month.value ?? 0), 0)).toLocaleString('en-US'));
});

test('parameter controls change generated waveforms and pitch, and reset restores defaults', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const notes: { waveform: string; frequency: number }[] = [];
    (window as any).__parameterNotes = notes;
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      createOscillator() {
        const oscillator = super.createOscillator();
        let frequency = 0;
        const originalFrequency = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
        oscillator.frequency.setValueAtTime = (value, time) => { frequency = value; return originalFrequency(value, time); };
        const originalStart = oscillator.start.bind(oscillator);
        oscillator.start = (time) => { notes.push({ waveform: oscillator.type, frequency }); originalStart(time); };
        return oscillator;
      }
    };
  });
  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');
  await page.getByLabel('Riser waveform', { exact: true }).selectOption('triangle');
  await page.getByLabel('Start pitch', { exact: true }).press('End');
  await expect(page.getByLabel('Start pitch', { exact: true })).toHaveAttribute('aria-valuetext', '600 Hz');
  await page.getByLabel('Pitch rise', { exact: true }).press('End');
  await expect(page.getByLabel('Pitch rise', { exact: true })).toHaveValue('48');
  await page.getByLabel('Pitch rise', { exact: true }).press('Home');
  await page.getByLabel('Chime waveform', { exact: true }).selectOption('square');
  await page.getByLabel('Chime pitch shift', { exact: true }).press('End');
  await page.getByLabel('Sound volume', { exact: true }).press('Home');
  await page.getByLabel('Sound', { exact: true }).check();
  await expect(page.locator('.timeline-sound-status')).toContainText('Sound ready');
  await page.getByRole('button', { name: 'Replay reveal' }).click();
  await expect(page.locator('.monthly-timeline')).toHaveAttribute('data-reveal', 'complete');
  const notes = await page.evaluate(() => (window as any).__parameterNotes as { waveform: string; frequency: number }[]);
  expect(notes).toHaveLength(8);
  expect(notes[0]).toEqual({ waveform: 'triangle', frequency: 600 });
  expect(notes.slice(1).every(note => note.waveform === 'square')).toBe(true);
  expect(notes[1]!.frequency).toBeCloseTo(784);
  expect(notes.at(-1)!.frequency).toBeCloseTo(2093);
  await page.getByRole('button', { name: 'Reset synth' }).click();
  await expect(page.getByLabel('Riser waveform', { exact: true })).toHaveValue('square');
  await expect(page.getByLabel('Chime waveform', { exact: true })).toHaveValue('square');
  await expect(page.getByLabel('Start pitch', { exact: true })).toHaveValue('115');
  await expect(page.getByLabel('Pitch rise', { exact: true })).toHaveValue('32.2');
  await expect(page.getByLabel('Riser level', { exact: true })).toHaveValue('9');
  await expect(page.getByLabel('Pitch smoothing', { exact: true })).toHaveValue('100');
  await expect(page.getByLabel('Attack softness', { exact: true })).toHaveValue('19');
  await expect(page.getByLabel('Riser fade-out', { exact: true })).toHaveValue('1.7');
  await expect(page.getByLabel('Chime pitch shift', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Chime level', { exact: true })).toHaveValue('23');
  await expect(page.getByLabel('Chime length', { exact: true })).toHaveValue('0.35');
  await expect(page.getByLabel('Sound volume', { exact: true })).toHaveValue('0');
  await page.screenshot({ path: 'test-results/synth-settings-desktop.png' });
});

test('riser fade-out slider changes release length while award chimes still play', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const trace = { started: 0, riserStopAt: 0, lastStartAt: 0, voices: 0 };
    (window as any).__riserTail = trace;
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      createOscillator() {
        const oscillator = super.createOscillator();
        const index = trace.voices++;
        const start = oscillator.start.bind(oscillator), stop = oscillator.stop.bind(oscillator);
        oscillator.start = (time = 0) => { if (index === 0) trace.started = time; trace.lastStartAt = time; start(time); };
        oscillator.stop = (time = 0) => { if (index === 0) trace.riserStopAt = time; stop(time); };
        return oscillator;
      }
    };
  });
  await page.goto('http://127.0.0.1:4174/tests/fixtures/timeline.html');
  await page.getByLabel('Sound volume', { exact: true }).press('Home');
  await page.getByLabel('Sound', { exact: true }).check();
  await expect(page.locator('.timeline-sound-status')).toContainText('Sound ready');
  await page.getByLabel('Riser fade-out', { exact: true }).press('End');
  await expect(page.getByLabel('Riser fade-out', { exact: true })).toHaveValue('2');
  await page.getByRole('button', { name: 'Replay reveal' }).click();
  await expect(page.locator('.monthly-timeline')).toHaveAttribute('data-reveal', 'complete');
  const trace = await page.evaluate(() => (window as any).__riserTail);
  expect(trace.voices).toBe(8);
  expect(trace.riserStopAt - trace.started).toBeLessThan(3.8);
  expect(trace.riserStopAt - trace.started).toBeGreaterThan(3);
  // Chimes continue during the configured two-second riser release. Compare
  // audio-clock events rather than assuming wall and audio clocks advance alike.
  expect(trace.lastStartAt).toBeGreaterThan(trace.riserStopAt - 2);
  expect(trace.lastStartAt).toBeLessThan(trace.riserStopAt);
});
