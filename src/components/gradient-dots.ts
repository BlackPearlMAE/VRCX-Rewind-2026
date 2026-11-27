/** Interpolate along the original uneven grid, including between its rows. */
export function gridCoordinate(axis: readonly number[], index: number): number {
  const magnitude = Math.abs(index);
  const lower = Math.min(Math.floor(magnitude), axis.length - 2);
  const coordinate = axis[lower]! + (axis[lower + 1]! - axis[lower]!) * (magnitude - lower);
  return Math.sign(index) * coordinate;
}
/** Diamond gradient and halftone share straight, 45-degree contours. */
export function addGradientDots(
  main: HTMLElement,
  readMusicLevel: () => number = () => 0,
  onMusicPulse: (level: number) => void = () => {},
): void {
  const canvas = document.createElement('canvas');
  canvas.className = 'gradient-dots';
  canvas.setAttribute('aria-hidden', 'true');
  main.prepend(canvas);
  const context = canvas.getContext('2d');
  if (!context) return;

  let pendingFrame = 0;
  let animationFrame = 0;
  let renderDots: (elapsed: number) => void = () => {};
  let elapsed = 0;
  let musicPulse = 0;
  let previousPulseTime = 0;
  let previousTime = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function draw(): void {
    pendingFrame = 0;
    if (!main.isConnected || !context) return;
    const width = main.clientWidth;
    const height = main.clientHeight;
    canvas.width = width;
    canvas.height = height;
    const landing = main.querySelector<HTMLElement>('.landing');
    const centerX = width * 1.08;
    // Anchor the diamond tip to the actual section boundary, including on mobile.
    const centerY = landing ? landing.offsetTop + landing.offsetHeight : window.innerHeight;
    const extent = width * .62;
    const pinkX = -width * .08;
    const pinkY = 0;
    const bottomPinkY = height;
    const paintedHeight = height;
    const image = context.createImageData(width, paintedHeight);
    const positions = [0, .22, .49, .83];
    const tealColors = [[0, 229, 208], [0, 184, 167], [20, 86, 80], [41, 41, 41]];
    const pinkColors = [[237, 0, 255], [190, 0, 205], [86, 20, 84], [41, 41, 41]];
    function sample(colors: number[][], distance: number, channel: number): number {
      if (distance >= .83) return 41;
      const index = distance <= .22 ? 1 : distance <= .49 ? 2 : 3;
      const blend = (distance - positions[index - 1]!) / (positions[index]! - positions[index - 1]!);
      const low = colors[index - 1]![channel]!;
      return low + (colors[index]![channel]! - low) * blend;
    }
    // Both glows use identical 45-degree diamond contours.
    for (let y = 0; y < paintedHeight; y++) {
      for (let x = 0; x < width; x++) {
        const tealDistance = (Math.abs(x - centerX) + Math.abs(y - centerY)) / extent;
        const pinkDistance = Math.min(Math.abs(x - pinkX) + Math.abs(y - pinkY), Math.abs(x - pinkX) + Math.abs(y - bottomPinkY)) / extent;
        if (Math.min(tealDistance, pinkDistance) >= .83) continue;
        const offset = (y * width + x) * 4;
        for (let channel = 0; channel < 3; channel++) {
          const color = Math.min(255, Math.max(0,
            sample(tealColors, tealDistance, channel) + sample(pinkColors, pinkDistance, channel) - 41));
          // Soften all glows equally by blending 12% back into the charcoal base.
          image.data[offset + channel] = 41 + (color - 41) * .88;
        }
        image.data[offset + 3] = 255;
      }
    }
    // Cache the static gradient; animation only repaints the lightweight dot layer.
    const background = document.createElement('canvas');
    background.width = width;
    background.height = height;
    background.getContext('2d')!.putImageData(image, 0, 0);
    // Cache soft circular light rings; no per-pixel work during animation.
    function makeWaveTexture(color: number[]): HTMLCanvasElement {
      const texture = document.createElement('canvas');
      texture.width = texture.height = 256;
      const pixels = texture.getContext('2d')!;
      const ring = pixels.createImageData(256, 256);
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const distance = Math.hypot(x - 127.5, y - 127.5) / 127.5;
          if (distance > 1) continue;
          const offset = (y * 256 + x) * 4;
          ring.data[offset] = color[0]!;
          ring.data[offset + 1] = color[1]!;
          ring.data[offset + 2] = color[2]!;
          ring.data[offset + 3] = 255 * .12 * Math.exp(-Math.pow((distance - .6) / .12, 2));
        }
      }
      pixels.putImageData(ring, 0, 0);
      return texture;
    }
    const tealWave = makeWaveTexture([0, 229, 208]);
    const pinkWave = makeWaveTexture([237, 0, 255]);
    // A fixed diamond mask clips every part of an expanding circular wave locally.
    const waveMask = document.createElement('canvas');
    waveMask.width = waveMask.height = 512;
    const maskContext = waveMask.getContext('2d')!;
    const maskPixels = maskContext.createImageData(512, 512);
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const distance = (Math.abs(x - 255.5) + Math.abs(y - 255.5)) / 255.5;
        maskPixels.data[(y * 512 + x) * 4 + 3] = 255 * Math.max(0, Math.min(1, (.83 - distance) / .12));
      }
    }
    maskContext.putImageData(maskPixels, 0, 0);
    const waveLayer = document.createElement('canvas');
    waveLayer.width = waveLayer.height = 512;
    const waveContext = waveLayer.getContext('2d')!;
    const dots: { diamond: number; u: number; v: number }[] = [];
    // Preserve the same spacing profile throughout the movement.
    const limit = extent * .83 / Math.SQRT2;
    const positivePositions = [0];
    for (let position = 0; position < limit + 40;) {
      position += 12 + 6 * Math.pow(Math.min(1, position / limit), .85);
      positivePositions.push(position);
    }
    const centers = [[centerX, centerY], [pinkX, pinkY], [pinkX, bottomPinkY]];
    const directions = [[-1, 1], [1, 0], [0, -1]];
    const count = positivePositions.length - 2;
    for (let diamond = 0; diamond < centers.length; diamond++) {
      for (let u = -count; u <= count; u++) {
        for (let v = -count; v <= count; v++) dots.push({ diamond, u, v });
      }
    }
    renderDots = (time: number): void => {
      const target = reducedMotion.matches || document.hidden ? 0 : readMusicLevel();
      const delta = Math.min(.1, Math.max(0, time - previousPulseTime));
      previousPulseTime = time;
      const smoothing = 1 - Math.exp(-delta / (target > musicPulse ? .045 : .18));
      musicPulse = reducedMotion.matches || document.hidden ? 0 : musicPulse + (target - musicPulse) * smoothing;
      onMusicPulse(musicPulse);
      context.clearRect(0, 0, width, height);
      context.drawImage(background, 0, 0);
      if (!reducedMotion.matches) {
        context.save();
        context.globalCompositeOperation = 'screen';
        for (let diamond = 0; diamond < centers.length; diamond++) {
          // Launch every 7 seconds; each wave travels for 12 seconds.
          // Start the next ring a little past halfway through the previous one.
          const age = (time + diamond * 4) % 7;
          for (let generation = 0; generation < 2; generation++) {
            const progress = (age + generation * 7) / 12;
            if (progress >= 1) continue;
            const radius = 256 * (.12 + 1.55 * progress);
            const [x, y] = centers[diamond]!;
            waveContext.clearRect(0, 0, 512, 512);
            waveContext.globalCompositeOperation = 'source-over';
            waveContext.drawImage(diamond === 0 ? tealWave : pinkWave, 256 - radius, 256 - radius, radius * 2, radius * 2);
            waveContext.globalCompositeOperation = 'destination-in';
            waveContext.drawImage(waveMask, 0, 0);
            waveContext.globalCompositeOperation = 'source-over';
            context.globalAlpha = Math.min(1, progress / .04);
            context.drawImage(waveLayer, x! - extent, y! - extent, extent * 2, extent * 2);
          }        }
        context.restore();
      }
      // At every full phase, row identities advance but the grid is identical.
      const phase = reducedMotion.matches ? 0 : (time / 6) % 1;
      for (const dot of dots) {
        const [originX, originY] = centers[dot.diamond]!;
        const [directionU, directionV] = directions[dot.diamond]!;
        const u = gridCoordinate(positivePositions, dot.u + phase * directionU!);
        const v = gridCoordinate(positivePositions, dot.v + phase * directionV!);
        const x = originX! + (u - v) / Math.SQRT2;
        const y = originY! + (u + v) / Math.SQRT2;
        const distance = (Math.abs(x - originX!) + Math.abs(y - originY!)) / extent;
        if (distance >= .83) continue;        if (x < -4 || x > width + 4 || y < -4 || y > height + 4) continue;
        const tealDistance = (Math.abs(x - centerX) + Math.abs(y - centerY)) / extent;
        const pinkDistance = Math.min(Math.abs(x - pinkX) + Math.abs(y - pinkY), Math.abs(x - pinkX) + Math.abs(y - bottomPinkY)) / extent;
        if (Math.min(tealDistance, pinkDistance) + .001 < distance) continue;
        const tealStrength = Math.max(0, 1 - tealDistance / .83);
        const pinkStrength = Math.max(0, 1 - pinkDistance / .83);
        const red = Math.round(18 + 24 * tealStrength - 6 * pinkStrength);
        const green = Math.round(18 - 10 * tealStrength + 7 * pinkStrength);
        const blue = Math.round(18 + 21 * tealStrength + 6 * pinkStrength);
        const radius = (.25 + 3.65 * Math.pow(Math.min(1, distance / .8), .85)) * (1 + .42 * musicPulse);
        const edgeFade = Math.min(1, (.83 - distance) / .18);
        const opacity = (.28 + .12 * Math.max(tealStrength, pinkStrength)) * edgeFade * (1 + .65 * musicPulse);
        context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${opacity})`;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }
    };
    renderDots(elapsed);
    startAnimation();
  }
  function animate(timestamp: number): void {
    animationFrame = 0;
    if (!main.isConnected) { cleanup(); return; }
    if (document.hidden || reducedMotion.matches) { previousTime = 0; return; }
    if (previousTime) elapsed += Math.min((timestamp - previousTime) / 1000, .1);
    previousTime = timestamp;
    renderDots(elapsed);
    animationFrame = requestAnimationFrame(animate);
  }
  function startAnimation(): void {
    if (!animationFrame && !document.hidden && !reducedMotion.matches) {
      animationFrame = requestAnimationFrame(animate);
    }
  }
  function updateMotion(): void {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    previousTime = 0;
    renderDots(elapsed);
    startAnimation();
  }
  function cleanup(): void {
    onMusicPulse(0);
    cancelAnimationFrame(animationFrame);
    cancelAnimationFrame(pendingFrame);
    observer.disconnect();
    window.removeEventListener('resize', scheduleDraw);
    document.removeEventListener('visibilitychange', updateMotion);
    reducedMotion.removeEventListener('change', updateMotion);
  }
  function scheduleDraw(): void {
    if (!main.isConnected) return;
    if (!pendingFrame) pendingFrame = requestAnimationFrame(draw);
  }
  const observer = new ResizeObserver(() => {
    if (!main.isConnected) {
      cleanup();
      return;
    }
    scheduleDraw();
  });
  observer.observe(main);
  window.addEventListener('resize', scheduleDraw);
  document.addEventListener('visibilitychange', updateMotion);
  reducedMotion.addEventListener('change', updateMotion);
  scheduleDraw();
}