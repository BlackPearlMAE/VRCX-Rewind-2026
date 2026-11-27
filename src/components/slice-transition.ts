import { createTitle, type TitleOptions } from './title';

export interface SliceTransitionOptions { title?: TitleOptions; depthColors?: readonly [string, string, string]; motionMs?: number; pauseMs?: number }
export const defaultSliceTransitionOptions: SliceTransitionOptions = { motionMs: 2300, pauseMs: 0, title: { shine: false } };
export const defaultSliceDepthColors = ['#5db8b0', '#c886c8', '#5db8b0'] as const;

/** Diagonal title wipe. Swap the page only while all three slices cover it. */
export function createSliceTransition(host: HTMLElement, defaults: SliceTransitionOptions = defaultSliceTransitionOptions) {
  let running = false;
  return {
    async play(changePage: () => void, revealPage: () => void, durationMs = 1540, options: SliceTransitionOptions = defaults): Promise<void> {
      if (running) return;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { changePage(); revealPage(); return; }
      const scale = Number.isFinite(durationMs) ? Math.max(500, Math.min(10000, durationMs)) / 1540 : 1;
      // Explicit motion and pause settings are independent; retain the original total-duration API.
      const motionScale = options.motionMs !== undefined && Number.isFinite(options.motionMs) ? Math.max(200, Math.min(10000, options.motionMs)) / 1180 : scale;
      const pauseMs = options.pauseMs !== undefined && Number.isFinite(options.pauseMs) ? Math.max(0, Math.min(10000, options.pauseMs)) : 360 * scale;
      running = true;
      const overlay = document.createElement('div');
      overlay.className = 'slice-transition';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.dataset.phase = 'entering';
      const block = document.createElement('div');
      block.className = 'transition-slices';
      overlay.append(block);
      for (const [index, word] of ['VRCX', 'REWIND', '2026'].entries()) {
        const slice = document.createElement('div');
        slice.className = 'transition-slice';
        const depthColor = options.title?.depthColor ?? (options.depthColors ?? defaultSliceDepthColors)[index]!;
        slice.style.setProperty('--slice-accent', depthColor);
        const outline = document.createElement('div');
        outline.className = 'transition-slice-outline';
        const rim = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        rim.classList.add('transition-neon');
        rim.setAttribute('viewBox', '0 0 100 100');
        rim.setAttribute('preserveAspectRatio', 'none');
        rim.setAttribute('aria-hidden', 'true');
        for (const layer of ['aura', 'halo', 'core', 'inner', 'center']) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          line.setAttribute('x', '0'); line.setAttribute('y', '0');
          line.setAttribute('width', '100'); line.setAttribute('height', '100');
          line.setAttribute('vector-effect', 'non-scaling-stroke');
          line.classList.add(`neon-${layer}`);
          rim.append(line);
        }
        outline.append(rim);
        const label = document.createElement('span');
        const title = createTitle(word, { ...options.title, depthColor });
        title.classList.add('transition-title');
        label.append(title);
        slice.append(outline, label);
        block.append(slice);
      }
      const slices = Array.from(block.children) as HTMLElement[];
      const animations: Animation[] = [];
      const wasInert = host.inert;
      // Block input without hiding the scrollbar and widening the underlying page.
      const preventScroll = (event: Event) => event.preventDefault();
      const preventScrollKey = (event: KeyboardEvent) => {
        if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) event.preventDefault();
      };
      overlay.addEventListener('wheel', preventScroll, { passive: false });
      overlay.addEventListener('touchmove', preventScroll, { passive: false });
      document.addEventListener('keydown', preventScrollKey);
      host.inert = true;
      document.body.append(overlay);
      const pose = (x: string) => `translateX(${x}) skewX(-45deg)`;
      try {
        await Promise.all(slices.map((slice, index) => {
          const animation = slice.animate([{ transform: pose('calc(-100vw - 100dvh - 4px)') }, { transform: pose('0px') }], {
            duration: 540 * motionScale, delay: (2 - index) * 100 * motionScale, easing: 'cubic-bezier(.22,.75,.2,1)', fill: 'both',
          });
          animations.push(animation);
          return animation.finished;
        }));
        overlay.dataset.phase = 'covered';
        changePage();
        // A short title hold makes the three words readable before they leave.
        const hold = overlay.animate([{ opacity: 1 }, { opacity: 1 }], { duration: pauseMs });
        animations.push(hold);
        await hold.finished;
        overlay.dataset.phase = 'leaving';
        // Keep the assembled title rigid: the entire group exits in one motion.
        const exit = block.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(calc(100vw + 100dvh + 4px))' }], {
          duration: 440 * motionScale, easing: 'cubic-bezier(.35,0,.7,.2)', fill: 'both',
        });
        animations.push(exit);
        await exit.finished;
      } finally {
        for (const animation of animations) animation.cancel();
        overlay.remove();
        host.inert = wasInert;
        document.removeEventListener('keydown', preventScrollKey);
        running = false;
        revealPage();
      }
    },
  };
}
