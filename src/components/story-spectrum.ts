import { sampleRecapAccent } from './recap-color-field';

let nextStoryGlowId = 0;

/** Rounded music-driven hills and shallow troughs with fixed page-edge joins. */
export function addStorySpectrum(main: HTMLElement, readSpectrum: (target: Float32Array<ArrayBuffer>) => boolean): () => void {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const samples = new Float32Array(96);
  const displayed = new Float32Array(samples.length);
  let previousFrame = 0;
  let trebleGlow = 0;
  const gains = new Float32Array(10).fill(1);
  const gainTargets = new Float32Array(10).fill(1);
  const nextGainChange = new Float64Array(10);
  const arrangements = new Map<number, number[]>();
  function arrangement(count: number): number[] {
    const saved = arrangements.get(count);
    if (saved) return saved;
    const slots = Array.from({ length: count }, (_, index) => index)
      .sort((a, b) => Math.abs(a - (count - 1) / 2) - Math.abs(b - (count - 1) / 2));
    const frequencies = Array.from({ length: count }, (_, index) => index);
    // Keep the lowest bands near the middle; mix the remaining bands around them.
    const fixed = Math.min(3, count);
    for (let index = count - 1; index > fixed; index--) {
      const other = fixed + Math.floor(Math.random() * (index - fixed + 1));
      [frequencies[index], frequencies[other]] = [frequencies[other]!, frequencies[index]!];
    }
    const result = new Array<number>(count);
    slots.forEach((slot, index) => { result[slot] = frequencies[index]!; });
    arrangements.set(count, result);
    return result;
  }
  const lines = [...main.querySelectorAll<HTMLElement>('.story-ruler-line, .recap-interlude-ruler')].map(line => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('story-spectrum');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('preserveAspectRatio', 'none');
    const namespace = 'http://www.w3.org/2000/svg';
    const gradientId = `story-neon-${nextStoryGlowId++}`;
    const defs = document.createElementNS(namespace, 'defs');
    const gradient = document.createElementNS(namespace, 'linearGradient');
    gradient.id = gradientId;
    gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
    gradient.setAttribute('x1', '0');
    gradient.setAttribute('y1', '0');
    gradient.setAttribute('y2', '0');
    const colorStops: { stop: SVGStopElement; offset: number }[] = [];
    for (const [offset, opacity] of [[0, 0], [.12, .05], [.28, .65], [.5, 1], [.72, .65], [.88, .05], [1, 0]]) {
      const stop = document.createElementNS(namespace, 'stop');
      stop.setAttribute('offset', String(offset));
      stop.setAttribute('stop-color', '#fff');
      stop.setAttribute('stop-opacity', String(opacity));
      gradient.append(stop);
      colorStops.push({ stop, offset: offset! });
    }
    defs.append(gradient);
    const glow = document.createElementNS(namespace, 'g');
    glow.classList.add('story-neon');
    glow.style.opacity = '0';
    const glowPaths = ['aura', 'halo', 'core'].map(kind => {
      const stroke = document.createElementNS(namespace, 'path');
      stroke.classList.add(`story-neon-${kind}`);
      stroke.setAttribute('vector-effect', 'non-scaling-stroke');
      stroke.style.stroke = `url(#${gradientId})`;
      glow.append(stroke);
      return stroke;
    });
    svg.append(defs, glow);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(path);
    line.append(svg);
    line.classList.add('has-spectrum');
    return { line, svg, path, gradient, glow, glowPaths, colorStops };
  });
  function draw() {
    if (!main.isConnected) { observer.disconnect(); return; }
    const now = performance.now();
    if (reducedMotion.matches || document.hidden) {
      samples.fill(0); displayed.fill(0); previousFrame = 0; trebleGlow = 0;
    } else {
      if (!readSpectrum(samples)) samples.fill(0);
      const delta = previousFrame ? Math.min(.1, (now - previousFrame) / 1000) : 1 / 60;
      previousFrame = now;
      let treblePower = 0;
      const trebleStart = Math.floor(samples.length * .68);
      for (let index = trebleStart; index < samples.length; index++) {
        const energy = Math.max(0, samples[index]! - .12);
        treblePower += energy * energy;
      }
      const glowTarget = Math.min(1, Math.sqrt(treblePower / (samples.length - trebleStart)) * 3.5);
      const glowResponse = glowTarget > trebleGlow ? .06 : .35;
      trebleGlow += (glowTarget - trebleGlow) * (1 - Math.exp(-delta / glowResponse));
      for (let band = 0; band < gains.length; band++) {
        if (now >= nextGainChange[band]!) {
          gainTargets[band] = .85 + Math.random() * .95;
          nextGainChange[band] = now + 2500 + Math.random() * 2500;
        }
        gains[band] = gains[band]! + (gainTargets[band]! - gains[band]!) * (1 - Math.exp(-delta / .9));
      }
      for (let index = 0; index < displayed.length; index++) {
        const response = samples[index]! > displayed[index]! ? .08 : .3;
        displayed[index] = displayed[index]! + (samples[index]! - displayed[index]!) * (1 - Math.exp(-delta / response));
      }
    }
    for (const { line, svg, path, gradient, glow, glowPaths, colorStops } of lines) {
      const page = line.closest<HTMLElement>('.story-page, .worlds-page');
      if (!page || page.hidden) continue;
      const width = line.clientWidth;
      if (width <= 0) continue;
      svg.setAttribute('viewBox', `0 -132 ${width} 264`);
      gradient.setAttribute('x2', String(width));
      const field = page.querySelector<HTMLCanvasElement>('.recap-color-field');
      const pageBounds = page.getBoundingClientRect();
      const lineBounds = line.getBoundingClientRect();
      const fieldWidth = Math.max(1, page.clientWidth);
      const fieldHeight = Math.max(1, page.clientHeight);
      for (const { stop, offset } of colorStops) {
        const x = (lineBounds.left - pageBounds.left + offset * width) / fieldWidth;
        const y = (lineBounds.top - pageBounds.top + lineBounds.height / 2) / fieldHeight;
        stop.setAttribute('stop-color', sampleRecapAccent(field, x, y));
      }
      glow.style.opacity = trebleGlow.toFixed(3);
      const flatWidth = Math.min(100, width * .18);
      const activeWidth = width - flatWidth * 2;
      const count = Math.max(3, Math.min(10, Math.round(activeWidth / 150)));
      const laneWidth = activeWidth / count;
      const order = arrangement(count);
      const hills: { peak: number; left: number; right: number; height: number; strength: number }[] = [];
      for (let band = 0; band < count; band++) {
        const sourceBand = order[band]!;
        const first = Math.floor(sourceBand / count * displayed.length);
        const last = Math.floor((sourceBand + 1) / count * displayed.length);
        let power = 0, position = 0, squaredPosition = 0;
        for (let index = first; index < last; index++) {
          const primary = Math.pow(Math.max(0, displayed[index]! - .17), 2);
          // A small, varied bass/mid contribution keeps treble-heavy lanes alive
          // on bass-heavy tracks without inventing motion during silence.
          const supportIndex = (sourceBand * 13 + index - first) % Math.ceil(displayed.length * .42);
          const support = Math.pow(Math.max(0, displayed[supportIndex]! - .17), 2);
          const energy = primary * .82 + support * .18;
          const local = (index - first + .5) / (last - first);
          power += energy;
          position += local * energy;
          squaredPosition += local * local * energy;
        }
        const rms = Math.sqrt(power / Math.max(1, last - first));
        const middleWeight = 1 - Math.abs((band + .5) / count - .5) * 2;
        const strength = Math.min(1, Math.pow(Math.min(1, rms / .7), 1.15) * gains[sourceBand]! * (.95 + middleWeight * .2));
        const center = power > .00001 ? position / power : .5;
        const spread = power > .00001 ? Math.sqrt(Math.max(0, squaredPosition / power - center * center)) : 0;
        // Frequency energy controls each hill's height, location, and breadth.
        const peakFraction = Math.max(.3, Math.min(.7, center));
        const breadth = .2 + Math.min(.22, spread * .7) + strength * .04;
        const laneStart = flatWidth + band * laneWidth;
        const peak = laneStart + laneWidth * peakFraction;
        const left = laneStart + laneWidth * Math.max(.06, peakFraction - breadth);
        const right = laneStart + laneWidth * Math.min(.94, peakFraction + breadth);
        const height = strength * 110;
        hills.push({ peak, left, right, height, strength });
      }
      const commands = ['M0,0', `L${flatWidth},0`];
      let valleyX = flatWidth, valleyY = 0;
      for (let index = 0; index < hills.length; index++) {
        const hill = hills[index]!;
        const rise = hill.peak - valleyX;
        commands.push(`C${(valleyX + rise * .48).toFixed(2)},${valleyY.toFixed(2)} ${(hill.peak - rise * .48).toFixed(2)},${(-hill.height).toFixed(2)} ${hill.peak.toFixed(2)},${(-hill.height).toFixed(2)}`);
        const next = hills[index + 1];
        // Join hills through one moving trough instead of a straight baseline gap.
        // The trough follows neighboring audio energy and cannot dip over 20px.
        valleyX = next ? (hill.right + next.left) / 2 : width - flatWidth;
        valleyY = next ? Math.min(20, Math.sqrt(hill.strength * next.strength) * 20) : 0;
        const fall = valleyX - hill.peak;
        commands.push(`C${(hill.peak + fall * .48).toFixed(2)},${(-hill.height).toFixed(2)} ${(valleyX - fall * .48).toFixed(2)},${valleyY.toFixed(2)} ${valleyX.toFixed(2)},${valleyY.toFixed(2)}`);
      }
      commands.push(`L${width},0`);
      const outline = commands.join(' ');
      path.setAttribute('d', outline);
      glowPaths.forEach(stroke => stroke.setAttribute('d', outline));
    }
  }
  const observer = new ResizeObserver(draw);
  lines.forEach(({ line }) => observer.observe(line));
  draw();
  return draw;
}
