import { createRecapColorField } from './recap-color-field';

/** Soft color and rising dust underneath the recap's frosted surface. */
export function addRecapAtmosphere(main: HTMLElement): (level: number) => void {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let pulse = 0;
  let elapsed = 0;
  let previousTime = 0;
  let frame = 0;
  const scenes = [...main.querySelectorAll<HTMLElement>('.story-page, .opening-card')].map(page => {
    const layer = document.createElement('div');
    layer.className = 'recap-atmosphere';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = '<canvas class="recap-color-field"></canvas><div class="recap-glow recap-glow-pink"></div><div class="recap-glow recap-glow-teal"></div><canvas class="recap-dust"></canvas>';
    page.prepend(layer);
    const canvas = layer.querySelector<HTMLCanvasElement>('.recap-dust')!;
    const context = canvas.getContext('2d');
    // Initialize GPU color fields only when a page is first shown.
    const renderColor = null as ReturnType<typeof createRecapColorField>;
    const dots = Array.from({ length: 90 }, () => ({
      x: Math.random(), y: Math.random(), radius: .7 + Math.random() * 2,
      speed: 5 + Math.random() * 10, phase: Math.random() * Math.PI * 2,
      drift: 8 + Math.random() * 20, pink: Math.random() > .5,
    }));
    return { page, layer, canvas, context, renderColor, colorAttempted: false, dots, width: 0, height: 0, ratio: 0 };
  });
  function draw() {
    const level = reducedMotion.matches ? 0 : pulse;
    for (const scene of scenes) {
      if (scene.page.hidden || !scene.context) continue;
      const { canvas, context, layer, dots } = scene;
      if (!scene.colorAttempted) {
        scene.colorAttempted = true;
        scene.renderColor = createRecapColorField(layer.querySelector<HTMLCanvasElement>('.recap-color-field')!, Number(scene.page.dataset.recapIndex ?? 0) % 2 === 1);
        if (scene.renderColor) layer.classList.add('has-smooth-color');
      }
      const width = layer.clientWidth;
      const height = layer.clientHeight;
      if (!width || !height) continue;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      if (scene.width !== width || scene.height !== height || scene.ratio !== ratio) {
        scene.width = width; scene.height = height; scene.ratio = ratio;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
      scene.renderColor?.(canvas.width, canvas.height, reducedMotion.matches ? 0 : elapsed);
      layer.style.setProperty('--atmosphere-pulse', level.toFixed(3));
      context.clearRect(0, 0, width, height);
      const count = Math.min(dots.length, Math.round(width / 22) + 30);
      for (const dot of dots.slice(0, count)) {
        const travel = height + 60;
        const y = ((dot.y * travel - elapsed * dot.speed) % travel + travel) % travel - 30;
        const x = dot.x * width + Math.sin(elapsed * .12 + dot.phase) * dot.drift;
        const edgeFade = Math.max(0, Math.min(1, y / 70, (height - y) / 70));
        // Keep the reading area calmer while leaving movement around its edges.
        const centerFade = .35 + .65 * Math.min(1, Math.abs(x / width - .5) * 3);
        const alpha = (.17 + level * .28) * edgeFade * centerFade;
        context.fillStyle = dot.pink ? `rgba(246, 153, 238, ${alpha})` : `rgba(109, 239, 222, ${alpha})`;
        context.beginPath();
        context.arc(x, y, dot.radius * (1 + level * .45), 0, Math.PI * 2);
        context.fill();
      }
    }
  }
  function animate(time: number) {
    frame = 0;
    if (!main.isConnected) { cleanup(); return; }
    if (document.hidden || reducedMotion.matches) return;
    if (previousTime) elapsed += Math.min(.1, (time - previousTime) / 1000);
    previousTime = time;
    draw();
    frame = requestAnimationFrame(animate);
  }
  function restart() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    if (!main.isConnected) { cleanup(); return; }
    draw();
    if (!document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(animate);
  }
  const resize = new ResizeObserver(() => { if (main.isConnected) draw(); else cleanup(); });
  const visibility = new MutationObserver(restart);
  for (const scene of scenes) {
    resize.observe(scene.layer);
    visibility.observe(scene.page, { attributes: true, attributeFilter: ['hidden'] });
  }
  function cleanup() {
    cancelAnimationFrame(frame);
    resize.disconnect();
    visibility.disconnect();
    document.removeEventListener('visibilitychange', restart);
    reducedMotion.removeEventListener('change', restart);
  }
  document.addEventListener('visibilitychange', restart);
  reducedMotion.addEventListener('change', restart);
  restart();
  return level => { pulse = Math.max(0, Math.min(1, level)); };
}
