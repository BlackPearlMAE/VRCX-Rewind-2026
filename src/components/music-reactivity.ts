/** Native analysis of the local music; never requests microphone access. */
export function createMusicReactivity(
  tracks: readonly HTMLAudioElement[],
  readListeningVolume: () => number,
): {
  resume: () => void;
  sample: () => number;
  readWaveform: (target: Float32Array<ArrayBuffer>) => boolean;
  readSpectrum: (target: Float32Array<ArrayBuffer>) => boolean;
  dispose: () => void;
} {
  let context: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let waveform: Float32Array<ArrayBuffer> | null = null;
  let spectrumAnalyser: AnalyserNode | null = null;
  let frequencies: Float32Array<ArrayBuffer> | null = null;
  const sources: MediaElementAudioSourceNode[] = [];
  let disposed = false;
  let unavailable = false;

  function resume(): void {
    if (disposed || unavailable || typeof window.AudioContext !== 'function') return;
    try {
      context ??= new AudioContext();
      const current = context;
      // Keep native playback untouched until the context is actually running.
      // Browsers can leave this promise pending until a user gesture occurs.
      void current.resume().then(() => {
        if (disposed || analyser || current.state !== 'running') return;
        const meter = current.createAnalyser();
        meter.fftSize = 512;
        const samples = new Float32Array(meter.fftSize);
        const spectrum = current.createAnalyser();
        spectrum.fftSize = 2048;
        spectrum.smoothingTimeConstant = .7;
        for (const track of tracks) {
          const source = current.createMediaElementSource(track);
          sources.push(source);
          // One audible path only. The analyser is a silent measurement branch.
          source.connect(current.destination);
          source.connect(meter);
          source.connect(spectrum);
        }
        spectrumAnalyser = spectrum;
        frequencies = new Float32Array(spectrum.frequencyBinCount);
        waveform = samples;
        analyser = meter;
      }).catch(() => { /* Playback continues without a reactive effect. */ });
    } catch {
      unavailable = true;
    }
  }

  function sample(): number {
    if (!analyser || !waveform || context?.state !== 'running') return 0;
    const listeningVolume = readListeningVolume();
    if (listeningVolume <= 0) return 0;
    analyser.getFloatTimeDomainData(waveform);
    let sum = 0;
    for (const value of waveform) {
      const amplitude = value / listeningVolume;
      sum += amplitude * amplitude;
    }
    // Remove listening volume while retaining song dynamics and playback fades.
    // A soft response avoids pinning at maximum.
    return 1 - Math.exp(-4 * Math.sqrt(sum / waveform.length));
  }

  function readWaveform(target: Float32Array<ArrayBuffer>): boolean {
    const volume = readListeningVolume();
    if (!analyser || !waveform || context?.state !== 'running' || volume <= 0) {
      target.fill(0);
      return false;
    }
    analyser.getFloatTimeDomainData(waveform);
    for (let index = 0; index < target.length; index++) {
      const position = index / Math.max(1, target.length - 1) * (waveform.length - 1);
      const low = Math.floor(position);
      const high = Math.min(waveform.length - 1, low + 1);
      const value = waveform[low]! + (waveform[high]! - waveform[low]!) * (position - low);
      target[index] = Math.tanh(value / volume * 2);
    }
    return true;
  }

  function readSpectrum(target: Float32Array<ArrayBuffer>): boolean {
    const volume = readListeningVolume();
    if (!spectrumAnalyser || !frequencies || context?.state !== 'running' || volume <= 0) {
      target.fill(0);
      return false;
    }
    spectrumAnalyser.getFloatFrequencyData(frequencies);
    const binHz = context.sampleRate / spectrumAnalyser.fftSize;
    const lowHz = 60;
    const highHz = Math.min(12000, context.sampleRate / 2);
    const volumeDb = 20 * Math.log10(volume);
    // Logarithmic bands give bass, mids, and treble space along the line.
    for (let index = 0; index < target.length; index++) {
      const low = lowHz * Math.pow(highHz / lowHz, index / target.length);
      const high = lowHz * Math.pow(highHz / lowHz, (index + 1) / target.length);
      const first = Math.min(frequencies.length - 1, Math.max(1, Math.floor(low / binHz)));
      const last = Math.min(frequencies.length, Math.max(first + 1, Math.ceil(high / binHz)));
      let power = 0;
      for (let bin = first; bin < last; bin++) power += Math.pow(10, frequencies[bin]! / 10);
      const db = power > 0 ? 10 * Math.log10(power / (last - first)) - volumeDb : -Infinity;
      target[index] = Math.max(0, Math.min(1, (db + 72) / 60));
    }
    return true;
  }

  function dispose(): void {
    disposed = true;
    for (const source of sources) source.disconnect();
    analyser?.disconnect();
    spectrumAnalyser?.disconnect();
    if (context && context.state !== 'closed') void context.close().catch(() => {});
    frequencies = null;
    spectrumAnalyser = null;
    waveform = null;
    analyser = null;
  }

  return { resume, sample, readWaveform, readSpectrum, dispose };
}
