/** Part the existing startup screen into two diagonal panels over the landing page. */
export async function partStartupScreen(startup: HTMLElement, root: HTMLElement): Promise<void> {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.body.classList.remove('is-starting');
    root.inert = false;
    startup.remove();
    return;
  }
  // Freeze moving decoration so the two halves begin as one continuous image.
  startup.getAnimations({ subtree: true }).forEach(animation => animation.pause());
  const otherHalf = startup.cloneNode(true) as HTMLElement;
  const sourceDecoration = [...startup.querySelectorAll<HTMLElement>('.startup-orbs > span, .startup-spinner, .startup-bar > span')];
  const copiedDecoration = [...otherHalf.querySelectorAll<HTMLElement>('.startup-orbs > span, .startup-spinner, .startup-bar > span')];
  sourceDecoration.forEach((source, index) => {
    const style = getComputedStyle(source);
    const target = copiedDecoration[index]!;
    target.style.animation = 'none';
    target.style.transition = 'none';
    target.style.transform = style.transform;
    target.style.opacity = style.opacity;
    target.style.width = style.width;
  });
  otherHalf.removeAttribute('id');
  otherHalf.removeAttribute('aria-labelledby');
  otherHalf.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
  for (const half of [startup, otherHalf]) {
    half.inert = true;
    half.setAttribute('aria-hidden', 'true');
    const edge = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    edge.classList.add('startup-cut-neon', 'transition-neon');
    edge.setAttribute('viewBox', '0 0 100 100');
    edge.setAttribute('preserveAspectRatio', 'none');
    edge.setAttribute('aria-hidden', 'true');
    edge.style.clipPath = 'inset(0 0 100% 0)';
    for (const layer of ['aura', 'halo', 'core', 'inner', 'center']) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', 'M65 0 L35 100');
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      line.classList.add(`startup-cut-${layer}`, `neon-${layer}`);
      edge.append(line);
    }
    half.append(edge);
  }
  startup.classList.add('startup-half-left');
  otherHalf.classList.add('startup-half-right');
  document.body.append(otherHalf);
  document.body.classList.add('is-opening-startup');
  document.body.classList.remove('is-starting');
  const timing: KeyframeAnimationOptions = { duration: 1100, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'both' };
  const animations: Animation[] = [];
  try {
    const drawing = [startup, otherHalf].map(half => half.querySelector<SVGSVGElement>('.startup-cut-neon')!).map(edge =>
      edge.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }], {
        duration: 650, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards',
      }));
    animations.push(...drawing);
    await Promise.allSettled(drawing.map(animation => animation.finished));
    animations.push(
      startup.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(-110vw,-12vh,0)' }], timing),
      otherHalf.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(110vw,12vh,0)' }], timing),
    );
    await Promise.allSettled(animations.map(animation => animation.finished));
  } finally {
    animations.forEach(animation => animation.cancel());
    startup.remove(); otherHalf.remove();
    document.body.classList.remove('is-opening-startup');
    root.inert = false;
  }
}
