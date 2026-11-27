import { friendsDefinitions } from '../data/friends-definitions';
import { worldsDefinitions } from '../data/worlds-data';
import { recordDefinitions } from '../data/record-pages';

export const recapPages = ['Your story', 'Your time', 'Your records', ...recordDefinitions.map(record => record.title), 'Your worlds', ...worldsDefinitions.map(page => page.title), 'Your friends', ...friendsDefinitions.map(page => page.title), 'End', 'Share'] as const;

/** One quiet segment per recap page; supply the selected pages as the flow grows. */
export function createPageProgress(pages: readonly string[], currentIndex = 0, onSelect?: (index: number) => void): HTMLElement {
  const progress = document.createElement('ol');
  progress.className = 'page-progress';
  progress.setAttribute('aria-label', 'Rewind pages');
  pages.forEach((title, index) => {
    const segment = document.createElement('li');
    segment.className = 'page-progress-segment';
    segment.setAttribute('aria-label', title);
    if (index === currentIndex) segment.setAttribute('aria-current', 'step');
    if (onSelect) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'page-progress-button';
      button.setAttribute('aria-label', `Go to ${title}`);
      const hint = document.createElement('span');
      hint.className = 'page-progress-hint'; hint.textContent = title;
      hint.setAttribute('aria-hidden', 'true');
      button.append(hint);
      button.addEventListener('click', () => onSelect(index));
      segment.append(button);
    }
    progress.append(segment);
  });
  return progress;
}
