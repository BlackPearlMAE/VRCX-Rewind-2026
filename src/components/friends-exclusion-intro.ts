/** Optional fictional exercise. Its entry never changes real statistics. */
export function addFriendsExclusionIntro(section: HTMLElement) {
  let complete = false;
  const panel = document.createElement('div');
  panel.className = 'friends-exclusion-intro';
  panel.innerHTML = `<h3 class="exclusion-intro-caption">Want to leave someone out?</h3>
    <p>Click a user’s icon to exclude them from this recap. Your statistics will update. Open the exclusions icon beside the sound control to see the names, and use the remove icon to include a user again.</p>
    <p class="exclusion-example-instruction">Try this optional example:</p>
    <div class="exclusion-example"><button class="exclusion-example-avatar" type="button" aria-label="Try excluding Example user" aria-describedby="example-exclusion-hint"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></svg><span class="user-exclusion-tooltip" role="tooltip" id="example-exclusion-hint">Remove from Rewind</span></button><span>Example user</span></div>
    <p class="exclusion-example-status" role="status">This only changes your recap. It does not block anyone in VRChat.</p>`;
  section.querySelector('.story-content')!.append(panel);
  const avatar = panel.querySelector<HTMLButtonElement>('.exclusion-example-avatar')!;
  function reset() {
    complete = false; avatar.disabled = false; avatar.classList.remove('has-exclusion-mark');
    avatar.querySelector('.exclusion-cross')?.remove(); panel.classList.remove('is-complete');
    panel.querySelector('.exclusion-example-status')!.textContent = 'Example user was removed from the list. You can try the example again, or continue.';
  }
  avatar.addEventListener('click', () => {
    if (complete) return;
    complete = true; avatar.disabled = true; panel.classList.add('is-complete');
    panel.querySelector('.exclusion-example-status')!.textContent = 'Moving Example user to the exclusions list…';
    section.dispatchEvent(new CustomEvent('recap-exclusion-example', { bubbles: true, detail: { trigger: avatar } }));
  });
  section.addEventListener('recap-exclusion-example-removed', reset);
  section.addEventListener('recap-exclusion-example-added', () => {
    panel.querySelector('.exclusion-example-status')!.textContent = 'Example user is in the dropdown. Use its remove icon to take it out again.';
  });
  return { get complete() { return complete; } };
}
