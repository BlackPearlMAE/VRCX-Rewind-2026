import { getVRChatImagesAllowed, onVRChatImagesChange, permittedImage } from './world-thumbnail';

const cached = new Map<string, Promise<HTMLImageElement | undefined>>();
const pending = new Set<() => void>();
onVRChatImagesChange(() => {
  if (!getVRChatImagesAllowed()) { for (const cancel of [...pending]) cancel(); cached.clear(); }
});
function load(url: string) {
  const previous = cached.get(url);
  if (previous) return previous;
  const promise = new Promise<HTMLImageElement | undefined>(resolve => {
    const image = new Image();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true; clearTimeout(timer); pending.delete(cancel);
      image.onload = null; image.onerror = null;
      if (!ok) image.removeAttribute('src');
      resolve(ok ? image : undefined);
    };
    const cancel = () => finish(false);
    const timer = setTimeout(cancel, 8000);
    pending.add(cancel);
    image.referrerPolicy = 'no-referrer'; image.decoding = 'async';
    image.onload = () => finish(true); image.onerror = cancel;
    image.src = url;
  });
  cached.set(url, promise);
  return promise;
}
/** Session-only, explicit opt-in; no profile API, retries or substitute images. */
export function createFriendAvatar(name: string, imageUrl?: string) {
  const element = document.createElement('span');
  element.className = 'friends-avatar';
  element.setAttribute('aria-hidden', 'true');
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0] ?? '').join('').toUpperCase() || '?';
  element.textContent = initials;
  let visible = false, revision = 0;
  async function refresh() {
    const token = ++revision;
    element.replaceChildren(document.createTextNode(initials));
    const url = imageUrl && permittedImage(imageUrl);
    if (!getVRChatImagesAllowed() || !visible || !url || !navigator.onLine) return;
    const image = await load(url);
    if (token !== revision || !getVRChatImagesAllowed() || !visible || !image) return;
    const display = image.cloneNode(true) as HTMLImageElement;
    display.alt = '';
    element.replaceChildren(display);
  }
  const unsubscribe = onVRChatImagesChange(() => { void refresh(); });
  return {
    element,
    setVisible(value: boolean) { if (visible !== value) { visible = value; void refresh(); } },
    dispose() { revision++; visible = false; unsubscribe(); element.replaceChildren(); },
  };
}
