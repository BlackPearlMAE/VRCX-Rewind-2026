export interface RecapPage {
  section: HTMLElement;
  show(defer?: boolean): void;
  hide(): void;
  suspend?(): void;
}

/** Slides are interruptible; controls and the incoming page remain interactive. */
export function createPageTransition(host: HTMLElement) {
  let active: { finish(): void } | undefined;
  return {
    cancel() { active?.finish(); },
    async slide(from: RecapPage, to: RecapPage, direction: 'next' | 'previous'): Promise<void> {
      active?.finish();
      if (from === to || from.section.hidden) return;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        from.hide();
        window.scrollTo({ top: 0, behavior: 'instant' });
        to.show();
        return;
      }
      const previousMinHeight = host.style.minHeight;
      const wasInert = from.section.inert;
      const scrollTop = window.scrollY;
      const animations: Animation[] = [];
      let finished = false;
      const transition = {
        finish() {
          if (finished) return;
          finished = true;
          from.hide();
          for (const animation of animations) animation.cancel();
          from.section.classList.remove('is-page-sliding');
          to.section.classList.remove('is-page-sliding');
          from.section.inert = wasInert;
          host.style.minHeight = previousMinHeight;
          if (active === transition) active = undefined;
        },
      };
      active = transition;
      try {
        from.suspend?.();
        host.style.minHeight = `${innerHeight}px`;
        from.section.classList.add('is-page-sliding');
        to.section.classList.add('is-page-sliding');
        from.section.scrollTop = scrollTop;
        to.section.scrollTop = 0;
        window.scrollTo({ top: 0, behavior: 'instant' });
        // Start the incoming page now, including focus and keyboard navigation.
        // Only the outgoing content is inert; the shared controls stay available.
        to.show();
        from.section.inert = true;
        const sign = direction === 'next' ? 1 : -1;
        const timing: KeyframeAnimationOptions = { duration: 650, easing: 'cubic-bezier(.22,.7,.25,1)', fill: 'both' };
        animations.push(
          from.section.animate([{ transform: 'translateX(0%)' }, { transform: `translateX(${-sign * 100}%)` }], timing),
          to.section.animate([{ transform: `translateX(${sign * 100}%)` }, { transform: 'translateX(0%)' }], timing),
        );
        await Promise.allSettled(animations.map(animation => animation.finished));
      } finally {
        transition.finish();
      }
    },
  };
}
