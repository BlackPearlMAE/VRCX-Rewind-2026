import { createFriendAvatarIcon } from './friend-avatar';
import { createWorldIcon } from './world-icon';
import type { WorldEntry } from '../data/worlds-data';

type HiddenWorld = Pick<WorldEntry, 'worldId' | 'name'>;
import { getVRChatImagesAllowed, onVRChatImagesChange } from './world-thumbnail';

function createExclusionCross() {
  const cross = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  cross.setAttribute('viewBox', '0 0 40 40'); cross.setAttribute('aria-hidden', 'true'); cross.classList.add('exclusion-cross');
  for (const path of ['M10 10L30 30', 'M30 10L10 30']) {
    const line = document.createElementNS(cross.namespaceURI, 'path'); line.setAttribute('d', path); cross.append(line);
  }
  return cross;
}

function markExcluded(element: HTMLElement) {
  element.classList.add('has-exclusion-mark');
  if (!element.querySelector('.exclusion-cross')) element.append(createExclusionCross());
}

export function createRecapExclusions(host: HTMLElement, header: HTMLElement, onChange: (ids: string[]) => Promise<void>, onWorldChange?: () => void) {
  type Person = { name: string; picture?: HTMLImageElement };
  const names = new Map<string, Person>();
  const examples = new Map<HTMLElement, { name: string; icon: SVGSVGElement }>();
  let hiddenWorld: HiddenWorld | undefined;
  let busy = false, revision = 0, flightRevision = 0;
  const flights = new Set<Animation>();
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'recap-exclusions-toggle';
  button.setAttribute('aria-label', 'Excluded users'); button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 8a3 3 0 0 1 0 6m2-3h5"/></svg>';
  header.querySelector('.opening-header-actions')!.append(button);
  const dropdown = document.createElement('div');
  dropdown.className = 'recap-exclusions-dropdown'; dropdown.id = 'recap-exclusions-dropdown'; dropdown.popover = 'auto';
  dropdown.setAttribute('role', 'region'); dropdown.setAttribute('aria-labelledby', 'recap-exclusions-title');
  dropdown.innerHTML = '<h2 id="recap-exclusions-title">Excluded users</h2><p class="exclusions-empty">No users excluded.</p><ul class="exclusions-list"></ul><p class="exclusions-status" role="status" aria-live="polite"></p>';
  host.append(dropdown);
  button.popoverTargetElement = dropdown;
  button.setAttribute('aria-controls', dropdown.id);
  const title = dropdown.querySelector<HTMLElement>('#recap-exclusions-title')!;
  const list = dropdown.querySelector<HTMLUListElement>('.exclusions-list')!;
  const status = dropdown.querySelector<HTMLElement>('.exclusions-status')!;
  const notice = document.createElement('p'); notice.className = 'recap-exclusions-notice'; notice.setAttribute('role', 'alert'); notice.hidden = true; header.append(notice);
  button.addEventListener('click', () => { notice.hidden = true; });
  const removeIcon = '<svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6m4-6v6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function position() {
    const rect = button.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 20}px`;
    dropdown.style.right = `${Math.max(16, innerWidth - rect.right)}px`;
    dropdown.style.maxHeight = `${Math.max(60, Math.min(400, innerHeight - rect.bottom - 44))}px`;
  }
  function notifyExample(story: HTMLElement, type: 'added' | 'removed') {
    story.dispatchEvent(new Event(`recap-exclusion-example-${type}`));
  }
  function render() {
    list.replaceChildren();
    const append = (name: string, icon: Element, onRemove: () => void, isExample = false) => {
      const row = document.createElement('li'), label = document.createElement('span'), remove = document.createElement('button');
      const picture = document.createElement('div');
      picture.className = 'exclusions-entry-icon'; picture.setAttribute('aria-hidden', 'true');
      picture.append(icon);
      label.textContent = name; remove.type = 'button'; remove.className = 'exclusions-remove'; remove.innerHTML = removeIcon;
      remove.setAttribute('aria-label', `Remove ${name} from exclusions`); const hint = document.createElement('span'); hint.className = 'user-exclusion-tooltip exclusions-restore-tooltip'; hint.setAttribute('role', 'tooltip'); hint.textContent = 'Include in Rewind'; remove.append(hint);
      remove.disabled = busy && !isExample;
      remove.addEventListener('click', onRemove); row.append(picture, label, remove); list.append(row);
    };
    for (const [story, example] of examples) {
      append(example.name, example.icon.cloneNode(true) as SVGSVGElement, () => {
        examples.delete(story);
        render();
        notifyExample(story, 'removed');
        button.focus();
      }, true);
    }
    for (const [id, person] of names) {
      const icon = createFriendAvatarIcon(person.name);
      if (person.picture && getVRChatImagesAllowed()) {
        const image = person.picture.cloneNode(true) as HTMLImageElement;
        image.alt = '';
        icon.replaceChildren(image);
      }
      append(person.name, icon, () => { void change(id, person, false); });
    }
    if (hiddenWorld) append(hiddenWorld.name, createWorldIcon(), () => {
      setWorld(undefined);
      (list.querySelector<HTMLButtonElement>('.exclusions-remove:not(:disabled)') ?? button).focus({ preventScroll: true });
    });
    const count = names.size + examples.size + Number(!!hiddenWorld);
    const label = hiddenWorld || [...examples.keys()].some(story => story.matches('.worlds-story')) ? 'Recap exclusions' : 'Excluded users';
    title.textContent = label;
    dropdown.querySelector<HTMLElement>('.exclusions-empty')!.hidden = count > 0;
    button.dataset.count = String(count);
    button.setAttribute('aria-label', count ? `${label} (${count})` : label);
    dropdown.setAttribute('aria-busy', String(busy));
  }
  function setWorld(world?: HiddenWorld) {
    hiddenWorld = world;
    render();
    onWorldChange?.();
  }
  function open(focus = false) {
    position(); dropdown.showPopover();
    if (focus) (dropdown.querySelector<HTMLButtonElement>('.exclusions-remove:not(:disabled)') ?? button).focus({ preventScroll: true });
  }
  dropdown.addEventListener('beforetoggle', event => { if ((event as ToggleEvent).newState === 'open') position(); });
  dropdown.addEventListener('toggle', () => button.setAttribute('aria-expanded', String(dropdown.matches(':popover-open'))));
  dropdown.addEventListener('keydown', event => { if (event.key === 'Escape') { dropdown.hidePopover(); button.focus(); } });
  button.addEventListener('keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); open(true); } });
  window.addEventListener('resize', position);

  async function fly(trigger: HTMLElement): Promise<boolean> {
    const ticket = flightRevision;
    const start = trigger.getBoundingClientRect(), end = button.getBoundingClientRect();
    markExcluded(trigger);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return ticket === flightRevision;
    const clone = trigger.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id'); clone.removeAttribute('disabled'); clone.removeAttribute('aria-describedby');
    clone.querySelectorAll('.user-exclusion-tooltip').forEach(hint => hint.remove()); clone.setAttribute('aria-hidden', 'true'); clone.inert = true;
    clone.classList.add('exclusion-flight');
    Object.assign(clone.style, { left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.height}px` });
    document.body.append(clone);
    const dx = end.left + end.width / 2 - start.left - start.width / 2;
    const dy = end.top + end.height / 2 - start.top - start.height / 2;
    const animation = clone.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * .42}px,${dy * .72 - 70}px) scale(.8)`, opacity: .9, offset: .5 },
      { transform: `translate(${dx}px,${dy}px) scale(.2)`, opacity: .1 },
    ], { delay: 350, duration: 1400, easing: 'cubic-bezier(.22,.7,.25,1)', fill: 'both' });
    flights.add(animation);
    let finished = false;
    try { await animation.finished; finished = true; } catch { /* Reset or navigation interrupted the example. */ }
    flights.delete(animation); clone.remove();
    if (!finished || ticket !== flightRevision || !button.isConnected || !button.getClientRects().length) return false;
    button.animate([{ boxShadow: '0 0 0 0 #edb4ffb0' }, { boxShadow: '0 0 18px 7px #edb4ff00' }], { duration: 420 });
    return true;
  }
  async function change(id: string, person: Person, exclude: boolean) {
    if (busy) return false;
    const ticket = ++revision, before = new Map(names);
    if (exclude) names.set(id, person); else names.delete(id);
    busy = true; notice.hidden = true; render(); status.textContent = 'Updating your statistics…';
    try {
      await onChange([...names.keys()]);
      if (ticket !== revision) return false;
      busy = false; render(); status.textContent = '';
      if (!exclude && dropdown.matches(':popover-open')) (dropdown.querySelector<HTMLButtonElement>('.exclusions-remove') ?? button).focus();
      return true;
    } catch {
      if (ticket !== revision) return false;
      names.clear(); for (const entry of before) names.set(...entry);
      busy = false; render(); status.textContent = 'Could not update statistics. Your previous exclusions have been kept.'; notice.textContent = status.textContent; notice.hidden = false;
      return false;
    }
  }
  host.addEventListener('recap-exclusion-example', event => {
    const trigger = (event as CustomEvent<{ trigger: HTMLElement }>).detail?.trigger;
    if (!(trigger instanceof HTMLElement)) return;
    const story = trigger.closest<HTMLElement>('.friends-story, .worlds-story');
    const icon = trigger.querySelector<SVGSVGElement>('svg:not(.exclusion-cross)');
    if (!story || !icon) return;
    const name = story.matches('.worlds-story') ? 'Example world' : 'Example user';
    void fly(trigger).then(arrived => {
      if (!arrived) { notifyExample(story, 'removed'); return; }
      examples.set(story, { name, icon });
      render(); status.textContent = ''; open(true); notifyExample(story, 'added');
    });
  });
  onVRChatImagesChange(() => { if (names.size) render(); });
  render();
  return {
    ids: () => [...names.keys()],
    openPerson(id: string, name: string, trigger: HTMLElement, picture?: HTMLImageElement) {
      if (busy) return;
      dropdown.hidePopover();
      const displayedPicture = picture ?? trigger.querySelector<HTMLImageElement>('.friends-avatar img') ?? undefined;
      void fly(trigger);
      void change(id, { name, picture: displayedPicture }, true).then(updated => { if (updated === false) { trigger.classList.remove('has-exclusion-mark'); trigger.querySelector('.exclusion-cross')?.remove(); } });
    },
    world: () => hiddenWorld,
    openWorld(world: HiddenWorld, thumbnail: HTMLElement) {
      if (busy) return;
      dropdown.hidePopover();
      const restoreFocus = thumbnail.contains(document.activeElement);
      void fly(thumbnail);
      setWorld(world);
      if (restoreFocus) button.focus({ preventScroll: true });
    },
    close() { flightRevision++; for (const animation of flights) animation.cancel(); dropdown.hidePopover(); },
    reset() {
      revision++; flightRevision++; busy = false; hiddenWorld = undefined; examples.clear(); names.clear(); notice.hidden = true;
      for (const animation of flights) animation.cancel();
      dropdown.hidePopover(); render();
      host.querySelectorAll<HTMLElement>('.friends-story, .worlds-story').forEach(story => notifyExample(story, 'removed'));
    },
  };
}
