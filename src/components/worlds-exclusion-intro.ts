import { createWorldIcon } from './world-icon';

/** A practice ranking that belongs only to the Worlds introduction. */
export function addWorldsExclusionIntro(section: HTMLElement) {
  const panel = document.createElement('div');
  panel.className = 'worlds-exclusion-intro';
  panel.innerHTML = `<h3 class="exclusion-intro-caption">Want to leave your home world out of the rankings?</h3>
    <p>Click or tap a world’s thumbnail to hide it from the Worlds rankings and Share cards. You can hide one world at a time. Your totals and Records still include it. Use the exclusions icon beside the sound control to bring it back.</p>
    <p class="exclusion-example-instruction">Try this optional example:</p>
    <div class="exclusion-example"><button class="exclusion-example-avatar worlds-example-thumbnail" type="button" aria-label="Hide Example world from practice rankings" aria-describedby="world-exclusion-example-hint"><span class="user-exclusion-tooltip" id="world-exclusion-example-hint" role="tooltip">Hide from rankings</span></button><span>Example world</span></div>
    <p class="exclusion-example-status" role="status">This example only changes the practice ranking.</p>`;
  section.querySelector('.story-content')!.append(panel);

  const thumbnail = panel.querySelector<HTMLButtonElement>('.worlds-example-thumbnail')!;
  const status = panel.querySelector<HTMLElement>('.exclusion-example-status')!;
  thumbnail.prepend(createWorldIcon());

  thumbnail.addEventListener('click', () => {
    thumbnail.disabled = true;
    panel.classList.add('is-complete');
    status.textContent = 'Moving Example world to the exclusions list…';
    section.dispatchEvent(new CustomEvent('recap-exclusion-example', { bubbles: true, detail: { trigger: thumbnail } }));
  });
  section.addEventListener('recap-exclusion-example-added', () => {
    status.textContent = 'Example world is in the dropdown. Use the remove icon to restore it.';
  });
  section.addEventListener('recap-exclusion-example-removed', () => {
    if (!thumbnail.disabled) return;
    thumbnail.disabled = false;
    thumbnail.classList.remove('has-exclusion-mark');
    thumbnail.querySelector('.exclusion-cross')?.remove();
    panel.classList.remove('is-complete');
    status.textContent = 'Example world is back in the practice ranking. Try it again or continue.';
  });
}
