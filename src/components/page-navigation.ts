/** Shared icon for the side controls and the navigation hint. */
export function createPageArrow(direction: 'previous' | 'next'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(name, value);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', direction === 'previous' ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7');
  svg.append(path);
  return svg;
}

/** Clickable side wings leave the middle sixty percent for page content. */
export function createPageNavigation(onPrevious: (() => void) | undefined, onNext?: () => void): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'page-wings';
  nav.setAttribute('aria-label', 'Rewind page navigation');
  for (const [direction, action] of [['previous', onPrevious], ['next', onNext]] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `page-wing page-wing-${direction}`;
    button.setAttribute('aria-label', direction === 'previous' ? 'Previous page' : 'Next page');
    button.disabled = !action;
    button.append(createPageArrow(direction));
    if (action) button.addEventListener('click', action);
    nav.append(button);
  }
  return nav;
}

export function addPageKeyboardNavigation(section: HTMLElement, onPrevious: (() => void) | undefined, onNext?: () => void): void {
  section.addEventListener('keydown', event => {
    if (section.hidden || section.closest('[inert]') || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    // Preserve native controls, including the timeline's own arrow-key navigation.
    if ((event.target as Element).closest('button, a, input, select, textarea, [contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    if (event.key === 'ArrowLeft' || key === 'a') {
      event.preventDefault();
      onPrevious?.();
    } else if (event.key === 'ArrowRight' || key === 'd' || event.code === 'Space') {
      event.preventDefault();
      onNext?.();
    }
  });
}
