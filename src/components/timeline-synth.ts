export type SynthWaveform = 'sine' | 'triangle' | 'sawtooth' | 'square';
export interface SynthSettings {
  riseWaveform: SynthWaveform; startPitch: number; pitchRise: number; riseLevel: number; smoothingMs: number; riserFadeMs: number;
  awardWaveform: SynthWaveform; awardTranspose: number; awardLevel: number; awardDuration: number; noteSpacingMs: number; attackMs: number;
}
export const defaultSynthSettings: Readonly<SynthSettings> = Object.freeze({
  riseWaveform: 'square', startPitch: 115, pitchRise: 32.2, riseLevel: .09, smoothingMs: 100, riserFadeMs: 1700,
  awardWaveform: 'square', awardTranspose: 0, awardLevel: .23, awardDuration: .35, noteSpacingMs: 45, attackMs: 19,
});

interface Voice { oscillator: OscillatorNode; gain: GainNode }

/** Locally generated tones only. The audio context is created by an explicit gesture. */
export function createTimelineSynth() {
  const settings: SynthSettings = { ...defaultSynthSettings };
  let lastTotal = 0;
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let enabled = false;
  let volume = .25;
  let active = false;
  let target = 1;
  let riser: Voice | undefined;
  let riserFading = false;
  const voices = new Set<Voice>();

  function fade(voice: Voice, release = .05) {
    if (!context) return;
    const now = context.currentTime;
    voice.gain.gain.cancelAndHoldAtTime(now);
    voice.gain.gain.setTargetAtTime(.0001, now, release / 5);
    try { voice.oscillator.stop(now + release); } catch { /* Already ended. */ }
  }
  function stop() {
    active = false;
    for (const voice of voices) fade(voice);
    riser = undefined; riserFading = false;
  }
  function voice(frequency: number, start: number, amplitude: number, duration?: number, waveform: SynthWaveform = settings.awardWaveform): Voice {
    const ctx = context!;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0001, amplitude), start + Math.min(settings.attackMs / 1000, duration === undefined ? Infinity : duration * .4));
    if (duration !== undefined) gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain); gain.connect(master!);
    const item = { oscillator, gain };
    voices.add(item);
    oscillator.onended = () => { if (riser === item) { riser = undefined; riserFading = false; } voices.delete(item); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start);
    if (duration !== undefined) oscillator.stop(start + duration + .03);
    return item;
  }
  async function resume(): Promise<boolean> {
    if (!enabled || !context) return false;
    try { await context.resume(); return context.state === 'running'; } catch { return false; }
  }
  function update(total: number) {
    lastTotal = total;
    if (!riser || !context || !active) return;
    const progress = Math.max(0, Math.min(1, total / target));
    // Start a time-based fade near the end, retaining pitch motion during release.
    if (progress >= .96 && !riserFading) {
      riserFading = true;
      fade(riser, settings.riserFadeMs / 1000);
    }
    riser.oscillator.frequency.setTargetAtTime(settings.startPitch * Math.pow(2, progress * settings.pitchRise / 12), context.currentTime, settings.smoothingMs / 1000);
    if (!riserFading) riser.gain.gain.setTargetAtTime(Math.max(.0001, .1 * settings.riseLevel * (.15 + .85 * Math.pow(1 - progress, .7))), context.currentTime, .04);
  }
  return {
    getSettings(): SynthSettings { return { ...settings }; },
    configure(next: Partial<SynthSettings>) {
      const bounds = { startPitch: [60, 600], pitchRise: [0, 48], riseLevel: [0, 1], smoothingMs: [10, 200], riserFadeMs: [100, 2000], awardTranspose: [-12, 12], awardLevel: [0, 1], awardDuration: [.15, 1.2], noteSpacingMs: [0, 160], attackMs: [3, 100] } as const;
      for (const key of Object.keys(bounds) as (keyof typeof bounds)[]) {
        const value = next[key];
        if (typeof value === 'number' && Number.isFinite(value)) settings[key] = Math.max(bounds[key][0], Math.min(bounds[key][1], value));
      }
      for (const key of ['riseWaveform', 'awardWaveform'] as const) {
        const value = next[key];
        if (value && ['sine', 'triangle', 'sawtooth', 'square'].includes(value)) settings[key] = value;
      }
      if (riser) {
        riser.oscillator.type = settings.riseWaveform;
        if (riserFading && next.riserFadeMs !== undefined) fade(riser, settings.riserFadeMs / 1000);
        update(lastTotal);
      }
    },
    async setEnabled(value: boolean): Promise<boolean> {
      enabled = value;
      if (!enabled) { stop(); return true; }
      try {
        if (!context) {
          context = new AudioContext();
          master = context.createGain(); master.gain.value = volume;
          const limiter = context.createDynamicsCompressor();
          limiter.threshold.value = -8; limiter.knee.value = 6; limiter.ratio.value = 8;
          limiter.attack.value = .003; limiter.release.value = .15;
          master.connect(limiter); limiter.connect(context.destination);
        }
        const ready = await resume();
        if (!ready) enabled = false;
        return ready;
      } catch { enabled = false; return false; }
    },
    resume,
    setVolume(value: number) {
      volume = Math.max(0, Math.min(1, value));
      if (context && master) master.gain.setTargetAtTime(volume, context.currentTime, .02);
    },
    start(total: number) {
      stop();
      if (!enabled || context?.state !== 'running' || total <= 0) return;
      target = total; lastTotal = 0; active = true;
      riser = voice(settings.startPitch, context.currentTime + .005, .1 * settings.riseLevel, undefined, settings.riseWaveform);
    },
    update,
    settled(rank: number) {
      if (!active || !enabled || context?.state !== 'running') return;
      const notes = rank === 3 ? [392] : rank === 2 ? [523.25, 659.25] : rank === 1 ? [523.25, 659.25, 783.99, 1046.5] : [];
      notes.forEach((frequency, index) => voice(frequency * Math.pow(2, settings.awardTranspose / 12), context!.currentTime + .005 + index * settings.noteSpacingMs / 1000, (rank === 1 ? .175 : .25) * settings.awardLevel, settings.awardDuration * (rank === 1 ? 1.875 : 1)));
    },
    finish(completed: boolean) {
      if (!completed) { stop(); return; }
      active = false;
      if (riser && !riserFading) fade(riser, settings.riserFadeMs / 1000);
      riser = undefined;
      // Let the final award's short tail finish naturally.
    },
    stop,
    dispose() { stop(); if (context) void context.close().catch(() => {}); },
  };
}
