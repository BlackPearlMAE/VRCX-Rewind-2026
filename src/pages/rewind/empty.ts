import { addPageKeyboardNavigation } from '../../components/page-navigation';
import type { RecapPage } from '../../components/page-transition';

/** Empty content shell while the ending and share designs are being decided. */
export function createEmptyRecapPage(id: 'end' | 'share', onPrevious: () => void, onShow: () => void, onNext?: () => void): RecapPage {
  const section = document.createElement('section');
  section.className = `opening-card ${id}-page`;
  section.dataset.page = id;
  section.hidden = true;
  section.tabIndex = -1;
  section.setAttribute('aria-label', id === 'end' ? 'End' : 'Share');
  section.innerHTML = '<div class="recap-stage"></div><footer data-visualization="spectrum"></footer>';
  addPageKeyboardNavigation(section, onPrevious, onNext);
  return {
    section,
    show() {
      section.hidden = false;
      onShow();
      section.focus({ preventScroll: true });
    },
    hide() { section.hidden = true; },
  };
}
