import { createPageProgress } from './page-progress';
import { createPageNavigation } from './page-navigation';

/** One persistent set of recap controls, separate from the sliding page content. */
export function createRecapChrome(host: HTMLElement, pages: readonly HTMLElement[], onPrevious: () => void, onNext: () => void, onSelect: (index: number) => void) {
  const element = document.createElement('div');
  element.className = 'recap-chrome';
  element.hidden = true;
  const header = pages[1]!.querySelector<HTMLElement>('.opening-header')!;
  const progress = pages[1]!.querySelector<HTMLElement>('.page-progress')!;
  header.remove(); progress.remove();
  const navigation = createPageNavigation(onPrevious, onNext);
  navigation.classList.add('recap-navigation');
  const previous = navigation.querySelector<HTMLButtonElement>('.page-wing-previous')!;
  const next = navigation.querySelector<HTMLButtonElement>('.page-wing-next')!;
  const footers = pages.map((page, index) => {
    page.dataset.recapIndex = String(index);
    page.classList.toggle('recap-reversed', index % 2 === 1);
    page.querySelector('.opening-header')?.remove();
    page.querySelector('.page-progress')?.remove();
    const footer = page.querySelector<HTMLElement>('footer')!;
    footer.className = 'recap-footer';
    footer.dataset.page = page.classList.contains('story-page') || footer.dataset.visualization === 'spectrum' ? 'story' : 'data';
    const timeline = footer.querySelector<HTMLElement>('.monthly-timeline');
    if (timeline) {
      const extension = document.createElement('span');
      extension.className = 'timeline-axis-extension';
      extension.setAttribute('aria-hidden', 'true');
      timeline.append(extension);
    } else {
      const rulerSpace = document.createElement('div');
      rulerSpace.className = 'recap-ruler-space';
      rulerSpace.setAttribute('aria-hidden', 'true');
      footer.prepend(rulerSpace);
      const hint = footer.querySelector<HTMLElement>('.story-navigation-hint')!;
      if (index === 0) {
        const hintCopy = document.createElement('span');
        hintCopy.className = 'story-hint-copy';
        hintCopy.append(...hint.childNodes);
        const line = document.createElement('span');
        line.className = 'story-ruler-line';
        line.setAttribute('aria-hidden', 'true');
        hint.append(hintCopy, line);
      } else {
        // Later interludes carry the ruler through without repeating instructions.
        hint?.remove();
        const line = document.createElement('div');
        line.className = 'recap-interlude-ruler';
        line.setAttribute('aria-hidden', 'true');
        footer.append(line);
      }
    }
    const spacer = document.createElement('div');
    spacer.className = 'recap-top-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    page.prepend(spacer);
    const bottomSpacer = document.createElement('div');
    bottomSpacer.className = 'recap-bottom-spacer';
    bottomSpacer.setAttribute('aria-hidden', 'true');
    page.append(bottomSpacer);
    return footer;
  });
  element.append(progress, header, navigation);
  host.append(element);
  let current = 0;
  let activePages = [...pages];
  let activeFooters = [...footers];
  const footerByPage = new Map(pages.map((page, index) => [page, footers[index]!]));
  function measure() {
    if (element.hidden) return;
    const top = header.getBoundingClientRect().bottom;
    host.style.setProperty('--recap-chrome-height', `${top - element.getBoundingClientRect().top}px`);
    element.style.setProperty('--recap-navigation-top', `${top + 12}px`);
    // Keep each page's text centered independently while both pages are visible.
    activePages.forEach((page, index) => {
      const height = activeFooters[index]!.getBoundingClientRect().height;
      if (height > 0) page.style.setProperty('--recap-footer-height', `${height}px`);
    });
    const ruler = activeFooters[current]!.querySelector<HTMLElement>('.story-ruler-line, .timeline-axis, .recap-interlude-ruler')!;
    const bottom = Math.max(0, innerHeight - ruler.getBoundingClientRect().top + 12);
    element.style.setProperty('--recap-navigation-bottom', `${bottom}px`);
  }
  const observer = new ResizeObserver(measure);
  observer.observe(header);
  footers.forEach(footer => observer.observe(footer));
  window.addEventListener('resize', measure);
  return {
    element,
    header,
    setPages(orderedPages: readonly HTMLElement[], titles: readonly string[]) {
      const previousPage = activePages[current];
      activePages = [...orderedPages];
      activeFooters = activePages.map(page => footerByPage.get(page)!);
      const preserved = previousPage ? activePages.indexOf(previousPage) : -1;
      current = preserved >= 0 ? preserved : Math.min(current, activePages.length - 1);
      pages.forEach(page => { page.dataset.recapIndex = '-1'; });
      activePages.forEach((page, index) => {
        page.dataset.recapIndex = String(index);
        page.classList.toggle('recap-reversed', index % 2 === 1);
      });
      progress.replaceChildren(...createPageProgress(titles, current, onSelect).childNodes);
      [...progress.children].forEach((segment, index) => {
        segment.classList.toggle('is-story-page', activePages[index]!.classList.contains('story-page'));
      });
      if (!element.hidden) this.show(current);
    },
    show(index: number) {
      current = index;
      element.hidden = false;
      host.classList.add('is-recap-active');
      pages.forEach(page => {
        const timeline = page.querySelector<HTMLElement>('.monthly-timeline');
        if (timeline) { timeline.inert = page !== activePages[index]; timeline.setAttribute('aria-hidden', String(page !== activePages[index])); }
      });
      const exclusionsStart = activePages.findIndex(page => page.matches('.worlds-story, .worlds-page, .friends-story, .friends-page'));
      const showExclusions = exclusionsStart >= 0 && index >= exclusionsStart;
      header.dataset.showExclusions = String(showExclusions);
      if (!showExclusions) host.querySelector<HTMLElement>('.recap-exclusions-dropdown:popover-open')?.hidePopover();
      // Editing controls can use the full width; invisible recap wings must not cover them.
      navigation.hidden = activePages[index]!.dataset.page === 'share';
      navigation.dataset.page = activeFooters[index]!.dataset.page;
      navigation.classList.toggle('is-introducing', index === 0);
      previous.disabled = index === 0;
      next.disabled = index === activePages.length - 1;
      [...progress.children].forEach((segment, position) => {
        if (position === index) segment.setAttribute('aria-current', 'step');
        else segment.removeAttribute('aria-current');
      });
      measure();
    },
    hide() { element.hidden = true; host.classList.remove('is-recap-active'); },
  };
}
