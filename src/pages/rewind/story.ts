import { createTitle } from '../../components/title';
import { recapHeader } from '../../components/recap-header';
import { addPageKeyboardNavigation } from '../../components/page-navigation';
import { createPageProgress, recapPages } from '../../components/page-progress';

interface StoryPageOptions {
  id?: string;
  kicker?: string;
  title?: string;
  copy?: string;
  disclaimer?: string;
  onPrevious?: () => void;
}

export function createStoryPage(onBack: () => void, onContinue: (() => void) | undefined, onShow: (settled: boolean) => void = () => {}, options: StoryPageOptions = {}) {
  const section = document.createElement('section');
  section.className = 'story-page';
  section.hidden = true;
  section.tabIndex = -1;
  section.setAttribute('aria-labelledby', options.id ?? 'story-title');
  section.innerHTML = `${recapHeader}
    <div class="recap-stage"><div class="story-content"><p class="story-kicker">Alright, let&rsquo;s get started with</p><div class="story-heading"></div><p class="story-copy">and see what you were up to.</p></div></div>
    <footer class="story-footer"><p class="story-navigation-hint">Click or tap the side panels to navigate.<br>Or use <kbd aria-label="Left arrow">&larr;</kbd> / <kbd aria-label="Right arrow">&rarr;</kbd>, <kbd>A</kbd> / <kbd>D</kbd>, or <kbd>Space</kbd>.</p></footer>`;
  if (options.kicker) section.querySelector('.story-kicker')!.textContent = options.kicker;
  if (options.copy) section.querySelector('.story-copy')!.textContent = options.copy;
  if (options.disclaimer) {
    const disclaimer = document.createElement('p');
    disclaimer.className = 'story-disclaimer';
    disclaimer.textContent = options.disclaimer;
    section.querySelector('.story-content')!.append(disclaimer);
  }
  section.prepend(createPageProgress(recapPages));
  const title = createTitle(options.title ?? 'your VRCX Rewind 2026', { shine: false, musicReactive: true }, 'h2');
  title.id = options.id ?? 'story-title';
  section.querySelector('.story-heading')!.append(title);
  section.querySelector('.opening-back')!.addEventListener('click', onBack);

  let active = false;
  function advance() {
    if (!active || section.hidden || !onContinue) return;
    active = false;
    onContinue();
  }
  addPageKeyboardNavigation(section, options.onPrevious, onContinue ? advance : undefined);
  return {
    section,
    next: advance,
    show(deferInteraction = false) {
      section.hidden = false;
      onShow(!deferInteraction);
      active = !deferInteraction;
      if (!deferInteraction) section.focus({ preventScroll: true });
    },
    hide() { active = false; section.hidden = true; },
  };
}
