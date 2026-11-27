/** Elastic displacement: each additional pixel of input produces less movement. */
export function rubberBand(input: number, extent: number): number {
  const force = Math.max(0, input) * .55;
  return extent * force / (extent + force);
}

/** Exact critically damped spring step, stable at different display frame rates. */
export function springStep(position: number, velocity: number, target: number, frequency: number, seconds: number): [number, number] {
  const displacement = position - target;
  const coefficient = velocity + frequency * displacement;
  const decay = Math.exp(-frequency * seconds);
  return [target + (displacement + coefficient * seconds) * decay,
    (velocity - frequency * coefficient * seconds) * decay];
}

/** Both ends of the section transition use the same pull, release, and spring. */
export function addOpeningScrollResistance(main: HTMLElement): () => void {
  const landing = main.querySelector<HTMLElement>('.landing')!;
  const information = main.querySelector<HTMLElement>('#site-information')!;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let mode: 'idle' | 'pull' | 'snap' = 'idle';
  let direction = 1;
  let frame = 0;
  let previousTime = 0;
  let lastInput = 0;
  let rawPull = 0;
  let returnVelocity = 0;
  let inputVelocity = 0;
  let snapPosition = 0;
  let snapVelocity = 0;
  const informationTop = (): number => window.scrollY + information.getBoundingClientRect().top;
  const holdPosition = (): number => Math.max(0, window.scrollY + landing.getBoundingClientRect().bottom - window.innerHeight);
  const anchor = (): number => direction > 0 ? holdPosition() : informationTop();
  const destination = (): number => direction > 0 ? informationTop() : holdPosition();
  const stretchLimit = (): number => Math.min(220, window.innerHeight * .22);
  const releaseDistance = (): number => Math.min(96, window.innerHeight * .1);

  function clear(): void {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    mode = 'idle';
    document.documentElement.classList.remove('is-scroll-held');
  }
  function bypass(): void {
    clear();
    rawPull = returnVelocity = inputVelocity = 0;
    lastInput = 0;
  }
  function requestFrame(): void {
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function startSnap(velocity: number): void {
    mode = 'snap';
    snapPosition = window.scrollY;
    snapVelocity = direction * Math.min(650, velocity);
    rawPull = returnVelocity = inputVelocity = 0;
    document.documentElement.classList.remove('is-scroll-held');
    requestFrame();
  }
  function tick(time: number): void {
    frame = 0;
    if (!main.isConnected || reducedMotion.matches || main.querySelector('dialog[open]')) { clear(); return; }
    const dt = previousTime ? Math.min(.05, (time - previousTime) / 1000) : 1 / 60;
    previousTime = time;
    if (mode === 'pull') {
      if (time - lastInput > 130) [rawPull, returnVelocity] = springStep(rawPull, returnVelocity, 0, 6, dt);
      window.scrollTo({ top: anchor() + direction * rubberBand(rawPull, stretchLimit()), behavior: 'instant' });
      if (rawPull < .5 && Math.abs(returnVelocity) < 4) {
        window.scrollTo({ top: anchor(), behavior: 'instant' });
        bypass();
        return;
      }
    } else if (mode === 'snap') {
      const target = destination();
      [snapPosition, snapVelocity] = springStep(snapPosition, snapVelocity, target, 10, dt);
      window.scrollTo({ top: snapPosition, behavior: 'instant' });
      if (Math.abs(snapPosition - target) < .6 && Math.abs(snapVelocity) < 6) {
        window.scrollTo({ top: target, behavior: 'instant' });
        bypass();
        return;
      }
    } else { clear(); return; }
    requestFrame();
  }
  main.addEventListener('wheel', event => {
    if (landing.hidden || event.defaultPrevented || event.ctrlKey || event.metaKey || reducedMotion.matches || main.querySelector('dialog[open]')) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return;
    const inputDirection = Math.sign(event.deltaY);
    let pixels = Math.abs(event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
    if (mode === 'snap') {
      if (inputDirection === direction) { event.preventDefault(); return; }
      bypass();
    }
    if (mode === 'idle') {
      direction = inputDirection;
      const boundary = anchor();
      const distanceToBoundary = direction * (boundary - window.scrollY);
      // Long opening content and the information content itself retain native scrolling.
      if (distanceToBoundary < -3 || distanceToBoundary >= pixels) return;
      pixels -= Math.max(0, distanceToBoundary);
      rawPull = returnVelocity = inputVelocity = 0;
      lastInput = 0;
    }
    event.preventDefault();
    const now = performance.now();
    if (inputDirection !== direction) {
      // Unwind an unfinished pull immediately when the user changes their mind.
      rawPull = Math.max(0, rawPull - pixels);
      inputVelocity = returnVelocity = 0;
      lastInput = now;
      window.scrollTo({ top: anchor() + direction * rubberBand(rawPull, stretchLimit()), behavior: 'instant' });
      if (!rawPull) bypass();
      return;
    }
    const interval = lastInput ? Math.max(32, Math.min(250, now - lastInput)) : 120;
    inputVelocity = inputVelocity * .65 + (pixels / interval * 1000) * .35;
    lastInput = now;
    rawPull += pixels;
    returnVelocity = 0;
    mode = 'pull';
    document.documentElement.classList.add('is-scroll-held');
    const extent = stretchLimit();
    const distance = rubberBand(rawPull, extent);
    const derivative = .55 * extent * extent / Math.pow(extent + rawPull * .55, 2);
    const visualVelocity = Math.min(650, inputVelocity * derivative);
    const projected = distance + Math.min(28, visualVelocity * .12);
    window.scrollTo({ top: anchor() + direction * distance, behavior: 'instant' });
    if (distance >= releaseDistance() || (distance >= releaseDistance() * .8 && projected >= releaseDistance())) startSnap(visualVelocity);
    else requestFrame();
  }, { passive: false });
  return bypass;
}