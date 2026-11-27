import { addLandingMusic } from '../../src/components/landing-music';
import { createSliceTransition } from '../../src/components/slice-transition';

export function createTransitionControls(host: HTMLElement, onReveal: () => void): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'transition-test-controls';
  panel.setAttribute('aria-label', 'Title transition test');
  panel.innerHTML = `<h2>Title transition</h2><label for="transition-duration">Motion duration</label><div class="transition-duration-row"><span>Faster</span><input id="transition-duration" type="range" min="1" max="6" step="0.1" value="2.3"><span>Slower</span><output for="transition-duration">2.3 seconds</output></div><label for="transition-pause">Pause duration</label><div class="transition-duration-row"><span>No pause</span><input id="transition-pause" type="range" min="0" max="5" step="0.1" value="0"><span>Longer</span><output for="transition-pause">0.0 seconds</output></div><fieldset class="transition-title-options"><legend>Lettering</legend><label>Text color<input type="color" class="preview-title-color" value="#ffffff"></label><label>VRCX depth color<input type="color" class="preview-depth-color" value="#5db8b0"></label><label>REWIND depth color<input type="color" class="preview-rewind-depth" value="#c886c8"></label><label>2026 depth color<input type="color" class="preview-year-depth" value="#5db8b0"></label><label>Shine color<input type="color" class="preview-shine-color" value="#00e5d0"></label><label><input type="checkbox" class="preview-title-shine"> Shine effect</label><label><input type="checkbox" class="preview-title-music" checked> Music response</label></fieldset><button type="button">Play transition</button><p role="status"></p>`;
  const duration = panel.querySelector<HTMLInputElement>('input')!;
  const output = panel.querySelector('output[for="transition-duration"]')!;
  const pause = panel.querySelector<HTMLInputElement>('#transition-pause')!;
  const pauseOutput = panel.querySelector('output[for="transition-pause"]')!;
  const button = panel.querySelector('button')!;
  const status = panel.querySelector('p')!;
  const transition = createSliceTransition(host);
  const enableMusic = document.createElement('button');
  enableMusic.type = 'button';
  enableMusic.className = 'preview-music-enable';
  enableMusic.textContent = 'Enable preview music';
  button.after(enableMusic);
  enableMusic.addEventListener('click', () => {
    const sample = addLandingMusic(host, panel);
    sample.start();
    enableMusic.remove();
    let pulse = 0;
    let previous = performance.now();
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    function frame(now: number) {
      if (!host.isConnected) return;
      const target = reducedMotion.matches || document.hidden ? 0 : sample();
      const delta = Math.min(.1, Math.max(0, (now - previous) / 1000));
      previous = now;
      pulse = reducedMotion.matches || document.hidden ? 0 : pulse + (target - pulse) * (1 - Math.exp(-delta / (target > pulse ? .045 : .18)));
      document.documentElement.style.setProperty('--title-music-glow', pulse.toFixed(3));
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, { once: true });
  function update() {
    output.textContent = `${Number(duration.value).toFixed(1)} seconds`;
    duration.setAttribute('aria-valuetext', output.textContent);
  }
  function updatePause() {
    pauseOutput.textContent = `${Number(pause.value).toFixed(1)} seconds`;
    pause.setAttribute('aria-valuetext', pauseOutput.textContent);
  }
  pause.addEventListener('input', updatePause);
  updatePause();
  duration.addEventListener('input', update);
  update();
  button.addEventListener('click', () => {
    button.disabled = true;
    status.textContent = '';
    void transition.play(() => {}, onReveal, undefined, { motionMs: Number(duration.value) * 1000, pauseMs: Number(pause.value) * 1000, depthColors: [
      panel.querySelector<HTMLInputElement>('.preview-depth-color')!.value,
      panel.querySelector<HTMLInputElement>('.preview-rewind-depth')!.value,
      panel.querySelector<HTMLInputElement>('.preview-year-depth')!.value,
    ], title: {
      color: panel.querySelector<HTMLInputElement>('.preview-title-color')!.value,
      shineColor: panel.querySelector<HTMLInputElement>('.preview-shine-color')!.value,
      shine: panel.querySelector<HTMLInputElement>('.preview-title-shine')!.checked,
      musicReactive: panel.querySelector<HTMLInputElement>('.preview-title-music')!.checked,
    } }).finally(() => {
      button.disabled = false;
      button.focus({ preventScroll: true });
      status.textContent = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'Reduced motion is enabled; the transition was skipped.' : 'Ready to replay. Adjust the duration to compare.';
    });
  });
  return panel;
}
