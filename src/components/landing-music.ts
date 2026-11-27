import { localMusicUrl, musicAssets } from '../data/music-assets';
import { createMusicReactivity } from './music-reactivity';

export interface MusicLevelReader {
  (): number;
  ready: Promise<void>;
  muted: boolean;
  start: () => void;
  readWaveform(target: Float32Array<ArrayBuffer>): boolean;
  readSpectrum(target: Float32Array<ArrayBuffer>): boolean;
}

/** Locally hosted landing music; browsers may require a user gesture to start. */
export function addLandingMusic(main: HTMLElement, controlsHost = main.querySelector<HTMLElement>('.landing')!): MusicLevelReader {
  const storageKey = 'vrcx-rewind:audio-settings';
  const retentionMs = 30 * 24 * 60 * 60 * 1000;
  const savedSettings = readSettings();

  function readSettings(): { volume: number; muted: boolean } | null {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) return null;
      const saved: unknown = JSON.parse(raw);
      if (typeof saved === 'object' && saved !== null &&
          'volume' in saved && typeof saved.volume === 'number' && Number.isFinite(saved.volume) && saved.volume >= 0 && saved.volume <= 0.8 &&
          'muted' in saved && typeof saved.muted === 'boolean' &&
          'expiresAt' in saved && typeof saved.expiresAt === 'number' && Number.isFinite(saved.expiresAt) && saved.expiresAt > Date.now()) {
        return { volume: saved.volume, muted: saved.muted };
      }
      localStorage.removeItem(storageKey);
    } catch {
      // Storage may be unavailable or contain invalid JSON; music still works.
      try { localStorage.removeItem(storageKey); } catch { /* Storage is blocked. */ }
    }
    return null;
  }

  function saveSettings(): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        volume: selectedVolume,
        muted: !enabled,
        expiresAt: Date.now() + retentionMs,
      }));
    } catch {
      // Private browsing or a full storage quota must not break the controls.
    }
  }

  const loopStart = 219.8; // Start the next playthrough at 3:39.8.
  // Approved earlier-v2 preview: align the incoming pulse at 0.0848 seconds.
  const recapStart = 215.4289;
  const beatSeconds = 60 / 109.986;
  const recapFadeSeconds = 2.1821;
  let recapTransitionAt: number | null = null;
  const fadeInSeconds = 6;
  const landing = main.querySelector<HTMLElement>('.landing');
  const onMainPage = () => !landing?.hidden;
  const landingTracks = [document.createElement('audio'), document.createElement('audio')];
  const recapTrack = document.createElement('audio');
  const thirdTrack = document.createElement('audio');
  const tracks = [...landingTracks, recapTrack, thirdTrack];
  // Once the recap has been entered, returning to the menu keeps the playlist.
  let rotationStarted = !onMainPage();
  for (const track of tracks) {

    track.preload = 'auto';
    track.volume = 0;
    track.muted = savedSettings?.muted ?? false;
    track.hidden = true;
  }

  let audio = tracks[0]!;
  // Prepare each full file once; the landing players share their local URL.
  const ready = Promise.all(musicAssets.map((asset, index) => localMusicUrl(asset.path).then(url => new Promise<void>(resolve => {
    const players = index === 0 ? landingTracks : [index === 1 ? recapTrack : thirdTrack];
    const first = players[0]!;
    const finish = () => {
      clearTimeout(timeout);
      first.removeEventListener('canplay', finish);
      first.removeEventListener('error', finish);
      resolve();
    };
    const timeout = window.setTimeout(finish, 8000);
    first.addEventListener('canplay', finish, { once: true });
    first.addEventListener('error', finish, { once: true });
    for (const track of players) { track.src = url; track.load(); }
    if (first.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA || first.error) finish();
  })).catch(() => {
    // A failed optional asset must not lock the visitor out of the recap.
  }))).then(() => {});
  let started = false;
  let selectedVolume = savedSettings?.volume ?? 0.10;
  const reactivity = createMusicReactivity(tracks, () => selectedVolume);
  let crossfade: { outgoing: HTMLAudioElement; incoming: HTMLAudioElement; duration: number } | null = null;
  let startingLoop = false;
  let initialFade = true;

  const controls = document.createElement('div');
  controls.className = 'music-controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Background music controls');
  const volume = document.createElement('input');
  volume.type = 'range';
  volume.className = 'music-volume';
  volume.min = '0';
  volume.max = '100';
  volume.step = '0.5';
  volume.value = String(volumeToPosition(selectedVolume));
  volume.setAttribute('aria-label', 'Music volume');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'music-toggle';
  button.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/><g class="music-waves"><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></g><path class="music-slash" d="m16 9 5 6m0-6-5 6"/></svg>`;
  const recapButtons = [...main.querySelectorAll<HTMLButtonElement>('[data-music-toggle]')];
  for (const recapButton of recapButtons) recapButton.append(button.firstElementChild!.cloneNode(true));
  let enabled = !(savedSettings?.muted ?? false);
  let reportedEnabled: boolean | undefined;
  let reportedVolume: number | undefined;
  const recapVolumes = [...main.querySelectorAll<HTMLElement>('.recap-volume-panel')].map(panel => {
    const slider = volume.cloneNode(true) as HTMLInputElement;
    slider.className = 'recap-volume';
    slider.setAttribute('aria-label', 'Sound volume');
    panel.append(slider);
    return slider;
  });
  let waitingForInteraction = false;
  const autoplayHint = document.createElement('span');
  autoplayHint.className = 'music-autoplay-hint';
  autoplayHint.textContent = 'Click anywhere to start music';
  autoplayHint.setAttribute('role', 'status');
  autoplayHint.hidden = true;
  let lastAudibleVolume = selectedVolume > 0 ? selectedVolume : 0.10;

  // Reserve half the slider travel for fine control at quieter listening levels.
  function positionToVolume(position: number): number {
    return position <= 50 ? position * 0.004 : 0.20 + (position - 50) * 0.012;
  }

  function volumeToPosition(level: number): number {
    return level <= 0.20 ? level / 0.004 : 50 + (level - 0.20) / 0.012;
  }

  function update(): void {
    const playing = !audio.paused && enabled && selectedVolume > 0;
    const label = playing ? 'Mute background music' : 'Play background music';
    button.setAttribute('aria-label', label);
    const waiting = enabled && selectedVolume > 0 && audio.paused && waitingForInteraction;
    button.title = waiting ? 'Music is enabled. Click anywhere to start playback.' : label;
    button.dataset.state = waiting ? 'waiting' : playing ? 'playing' : 'muted';
    autoplayHint.hidden = !waiting;
    for (const recapButton of recapButtons) {
      const soundLabel = enabled ? 'Mute sound' : 'Unmute sound';
      recapButton.setAttribute('aria-label', soundLabel);
      recapButton.dataset.muted = String(!enabled);
      recapButton.setAttribute('aria-pressed', String(!enabled));
    }
    if (reportedEnabled !== enabled || reportedVolume !== selectedVolume) {
      reportedEnabled = enabled;
      reportedVolume = selectedVolume;
      main.dispatchEvent(new CustomEvent('rewind-audio-change', { detail: { enabled, volume: selectedVolume } }));
    }
    button.dataset.playing = String(playing);
    volume.value = String(volumeToPosition(selectedVolume));
    const percent = Number((selectedVolume * 100).toFixed(1));
    volume.setAttribute('aria-valuetext', `${percent}% volume`);
    volume.title = `Music volume: ${percent}%`;
    for (const slider of recapVolumes) {
      slider.value = volume.value;
      slider.setAttribute('aria-valuetext', `${percent}% volume`);
    }
  }

  async function play(): Promise<void> {
    reactivity.resume();
    try {
      await audio.play();
      waitingForInteraction = false;
      mix();
    } catch (error) {
      // A browser restriction is different from the user's explicit mute choice.
      waitingForInteraction = error instanceof DOMException && error.name === 'NotAllowedError';
    }
    update();
  }

  function adjustVolume(event: Event): void {
    selectedVolume = positionToVolume(Number((event.currentTarget as HTMLInputElement).value));
    if (selectedVolume > 0) lastAudibleVolume = selectedVolume;
    mix();
    update();
    saveSettings();
    // Adjusting volume preserves an explicit mute choice.
    if (enabled && audio.paused) void play();
  }
  for (const slider of [volume, ...recapVolumes]) slider.addEventListener('input', adjustVolume);
  function toggleMusic(event: Event): void {
    const recapControl = recapButtons.includes(event.currentTarget as HTMLButtonElement);
    if (enabled && (recapControl || (!audio.paused && selectedVolume > 0))) {
      enabled = false;
      for (const track of tracks) track.muted = true;
      update();
    } else {
      enabled = true;
      for (const track of tracks) track.muted = false;
      if (selectedVolume === 0) selectedVolume = lastAudibleVolume;
      mix();
      void play();
    }
    saveSettings();
  }
  button.addEventListener('click', toggleMusic);
  for (const recapButton of recapButtons) recapButton.addEventListener('click', toggleMusic);
  function startOnInteraction(event: Event): void {
    if (!started) return;
    reactivity.resume();
    if (event.target instanceof Node && controls.contains(event.target)) return;
    if (enabled && audio.paused) void play();
  }
  // Keep the fallback scoped to this page, without interfering with its controls.
  main.addEventListener('pointerup', startOnInteraction);
  main.addEventListener('click', startOnInteraction);
  main.addEventListener('keydown', startOnInteraction);
  function mix(): void {
    if (crossfade) {
      const { outgoing, incoming, duration } = crossfade;
      const progress = Math.min(1, incoming.currentTime / duration);
      outgoing.volume = selectedVolume * (1 - progress);
      incoming.volume = selectedVolume * progress;
      if (progress === 1) {
        crossfade = null;
        audio = incoming;
        recapTransitionAt = null;
        outgoing.pause();
        outgoing.currentTime = 0;
      }
    } else {
      const progress = initialFade ? Math.min(1, audio.currentTime / fadeInSeconds) : 1;
      audio.volume = selectedVolume * progress;
      if (progress === 1) initialFade = false;
    }
    if (!onMainPage()) rotationStarted = true;
    if (crossfade || startingLoop || audio.paused) return;
    if (!rotationStarted) {
      if (landingTracks.includes(audio) && audio.currentTime >= loopStart) void startNextLoop();
      return;
    }
    const incoming = nextRotationTrack();
    if (!incoming || incoming.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (landingTracks.includes(audio)) {
      // Preserve the approved first-to-second entrance, including late departures.
      recapTransitionAt ??= recapStart + Math.max(0, Math.ceil((audio.currentTime - recapStart) / beatSeconds)) * beatSeconds;
      if (audio.currentTime >= recapTransitionAt) void startPlaylistCrossfade(incoming, recapTransitionAt);
    } else if (Number.isFinite(audio.duration)) {
      const transitionAt = Math.max(0, audio.duration - recapFadeSeconds);
      if (audio.currentTime >= transitionAt) void startPlaylistCrossfade(incoming, transitionAt);
    }
  }

  function nextRotationTrack(): HTMLAudioElement | undefined {
    const order = [landingTracks[0]!, recapTrack, thirdTrack];
    const index = landingTracks.includes(audio) ? 0 : order.indexOf(audio);
    // Skip an unavailable optional song while retaining the playlist order.
    for (let offset = 1; offset < order.length; offset++) {
      const candidate = order[(index + offset) % order.length]!;
      if (candidate.src && !candidate.error) return candidate;
    }
    return undefined;
  }

  async function startPlaylistCrossfade(incoming: HTMLAudioElement, transitionAt: number): Promise<void> {
    startingLoop = true;
    const outgoing = audio;
    incoming.currentTime = Math.max(0, outgoing.currentTime - transitionAt);
    incoming.volume = 0;
    try {
      await incoming.play();
      if (!main.isConnected) {
        incoming.pause();
        incoming.currentTime = 0;
        return;
      }
      initialFade = false;
      crossfade = { outgoing, incoming, duration: recapFadeSeconds };
      mix();
    } catch {
      // Keep the current song audible if the next player cannot start yet.
    } finally {
      startingLoop = false;
    }
  }
  async function startNextLoop(): Promise<void> {
    startingLoop = true;
    const outgoing = audio;
    const incoming = landingTracks.find(track => track !== outgoing)!;
    incoming.currentTime = 0;
    incoming.volume = 0;
    // Use the remaining tail (about seven seconds), measured from actual playback.
    const duration = Math.max(0.1, outgoing.duration - outgoing.currentTime);
    try {
      await incoming.play();
      if (!main.isConnected) { incoming.pause(); incoming.currentTime = 0; return; }
      initialFade = false;
      crossfade = { outgoing, incoming, duration };
      mix();
    } catch {
      // Leave the current track audible and retry if the browser delays playback.
    } finally {
      startingLoop = false;
    }
  }

  for (const track of tracks) {
    track.addEventListener('timeupdate', mix);
    track.addEventListener('ended', () => {
      if (track !== audio || crossfade || startingLoop) return;
      // Continue the rotation if buffering/background throttling missed a fade.
      if (!onMainPage()) rotationStarted = true;
      const incoming = rotationStarted ? nextRotationTrack() : undefined;
      if (incoming) {
        track.pause();
        track.currentTime = 0;
        track.volume = 0;
        audio = incoming;
      }
      recapTransitionAt = null;
      audio.currentTime = 0;
      initialFade = true;
      void play();
    });
  }
  const pageObserver = new MutationObserver(() => {
    if (!onMainPage()) rotationStarted = true;
    // Page navigation never interrupts playback or resets the rotation.
    mix();
  });
  if (landing) pageObserver.observe(landing, { attributes: true, attributeFilter: ['hidden'] });
  // Playback time drives the envelopes, so buffering and background throttling
  // cannot advance a fade ahead of the song. timeupdate also works in background tabs.
  const timer = window.setInterval(() => {
    if (!main.isConnected) {
      clearInterval(timer);
      pageObserver.disconnect();
      reactivity.dispose();
      for (const track of tracks) track.pause();
      return;
    }
    mix();
  }, 50);

  for (const event of ['playing', 'pause', 'error']) {
    for (const track of tracks) track.addEventListener(event, update);
  }
  const volumePanel = document.createElement('div');
  volumePanel.className = 'music-volume-panel';
  volumePanel.append(volume);
  controls.append(volumePanel, button, autoplayHint);
  controlsHost.prepend(controls, ...tracks);
  update();
  // Preview controls can request playback before the local audio URLs are ready.
  void ready.then(() => {
    if (main.isConnected && started && enabled && selectedVolume > 0 && audio.paused) void play();
  });
  const audible = () => enabled && selectedVolume > 0 && tracks.some(track => !track.paused && !track.muted);
  return Object.assign(() => audible() ? reactivity.sample() : 0, {
    ready,
    muted: !enabled || selectedVolume === 0,
    start(): void {
      if (started) return;
      started = true;
      reactivity.resume();
      if (enabled && selectedVolume > 0) void play();
    },
    readWaveform(target: Float32Array<ArrayBuffer>): boolean {
      if (!audible()) { target.fill(0); return false; }
      return reactivity.readWaveform(target);
    },
    readSpectrum(target: Float32Array<ArrayBuffer>): boolean {
      if (!audible()) { target.fill(0); return false; }
      return reactivity.readSpectrum(target);
    },
  });
}
