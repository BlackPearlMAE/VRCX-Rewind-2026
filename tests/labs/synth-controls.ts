import { defaultSynthSettings, type SynthSettings, type createTimelineSynth } from '../../src/components/timeline-synth';

/** Parameter workbench, mounted only by the timeline design test page. */
export function createSynthControls(synth: ReturnType<typeof createTimelineSynth>): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'timeline-synth-panel';
  panel.setAttribute('aria-label', 'Synth settings');
  panel.innerHTML = '<h2>Synth settings</h2><p>Rising-tone changes apply live. Replay to hear new chime settings.</p>';
  const refresh: (() => void)[] = [];
  function group(title: string) {
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend'); legend.textContent = title;
    fieldset.append(legend); panel.append(fieldset); return fieldset;
  }
  function waveform(parent: HTMLElement, key: 'riseWaveform' | 'awardWaveform', label: string) {
    const field = document.createElement('label'); field.className = 'synth-param';
    const text = document.createElement('span'); text.textContent = label;
    const select = document.createElement('select'); select.setAttribute('aria-label', label);
    for (const name of ['sine', 'triangle', 'sawtooth', 'square'] as const) {
      const option = document.createElement('option'); option.value = name; option.textContent = name[0]!.toUpperCase() + name.slice(1); select.append(option);
    }
    select.addEventListener('change', () => synth.configure({ [key]: select.value } as Partial<SynthSettings>));
    refresh.push(() => { select.value = synth.getSettings()[key]; });
    field.append(text, select); parent.append(field);
  }
  function slider(parent: HTMLElement, key: Exclude<keyof SynthSettings, 'riseWaveform' | 'awardWaveform'>, label: string, min: number, max: number, step: number, unit: string, scale = 1) {
    const field = document.createElement('label'); field.className = 'synth-param';
    const header = document.createElement('span'); header.className = 'synth-param-header';
    const text = document.createElement('span'); text.textContent = label;
    const value = document.createElement('span'); value.className = 'synth-param-value';
    header.append(text, value);
    const input = document.createElement('input'); input.type = 'range';
    input.min = String(min); input.max = String(max); input.step = String(step); input.setAttribute('aria-label', label);
    function render() {
      const number = Number((synth.getSettings()[key] * scale).toFixed(2));
      input.value = String(number); value.textContent = `${number}${unit}`;
      input.setAttribute('aria-valuetext', value.textContent);
    }
    input.addEventListener('input', () => { synth.configure({ [key]: Number(input.value) / scale }); render(); });
    refresh.push(render); field.append(header, input); parent.append(field);
  }
  const rise = group('Rising tone');
  waveform(rise, 'riseWaveform', 'Riser waveform');
  slider(rise, 'startPitch', 'Start pitch', 60, 600, 5, ' Hz');
  slider(rise, 'pitchRise', 'Pitch rise', 0, 48, .1, ' semitones');
  slider(rise, 'riseLevel', 'Riser level', 0, 100, 1, '%', 100);
  slider(rise, 'smoothingMs', 'Pitch smoothing', 10, 200, 5, ' ms');
  slider(rise, 'riserFadeMs', 'Riser fade-out', .1, 2, .05, ' s', .001);
  const awards = group('Place chimes');
  waveform(awards, 'awardWaveform', 'Chime waveform');
  slider(awards, 'awardTranspose', 'Chime pitch shift', -12, 12, 1, ' semitones');
  slider(awards, 'awardLevel', 'Chime level', 0, 100, 1, '%', 100);
  slider(awards, 'awardDuration', 'Chime length', .15, 1.2, .05, ' s');
  slider(awards, 'noteSpacingMs', 'Note spacing', 0, 160, 5, ' ms');
  const envelope = group('Envelope');
  slider(envelope, 'attackMs', 'Attack softness', 3, 100, 1, ' ms');
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Reset synth';
  reset.addEventListener('click', () => { synth.configure(defaultSynthSettings); refresh.forEach(render => render()); });
  panel.append(reset); refresh.forEach(render => render()); return panel;
}
