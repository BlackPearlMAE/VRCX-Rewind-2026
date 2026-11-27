import { bundledWorldThumbnail } from '../data/world-thumbnail-index';

/** Session-only opt-in. Controlled by the main-page image permission switch. */
let imagesAllowed = false;
const consentChanges = new EventTarget();
const imageHosts = new Set(['api.vrchat.cloud', 'files.vrchat.cloud', 'assets.vrchat.com', 'd348imysud55la.cloudfront.net']);
export function permittedImage(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && imageHosts.has(url.hostname) ? url.href : undefined;
  } catch { return undefined; }
}

// A single display image per URL is reused between pages. No persistent cache or metadata API.
const images = new Map<string, Promise<HTMLImageElement | undefined>>();
const pending = new Set<() => void>();
function loadImage(url: string): Promise<HTMLImageElement | undefined> {
  const cached = images.get(url);
  if (cached) return cached;
  const result = new Promise<HTMLImageElement | undefined>(resolve => {
    const image = new Image();
    let finished = false;
    const finish = (ok: boolean) => {
      if (finished) return;
      finished = true; clearTimeout(timer); pending.delete(cancel);
      image.onload = null; image.onerror = null;
      if (!ok) image.removeAttribute('src');
      resolve(ok ? image : undefined);
    };
    const cancel = () => finish(false);
    const timer = setTimeout(cancel, 8000);
    pending.add(cancel);
    image.referrerPolicy = 'no-referrer'; image.decoding = 'async';
    image.onload = () => finish(true); image.onerror = cancel;
    // Plain display; browser cookie policy applies. No pixel reads, proxy, or account credentials.
    image.src = url;
  });
  images.set(url, result);
  return result;
}
export function setVRChatImagesAllowed(allowed: boolean) {
  if (imagesAllowed === allowed) return;
  imagesAllowed = allowed;
  if (!allowed) { [...pending].forEach(cancel => cancel()); images.clear(); }
  consentChanges.dispatchEvent(new Event('change'));
}
export function getVRChatImagesAllowed() { return imagesAllowed; }
export function onVRChatImagesChange(listener: () => void) {
  consentChanges.addEventListener('change', listener);
  return () => consentChanges.removeEventListener('change', listener);
}

type ImageSource = { worldId?: string; imageUrl?: string; label?: string };
/** No request before consent and visibility. Missing/failed thumbnails take no space. */
export type WorldThumbnailState = 'idle' | 'loading' | 'loaded' | 'failed';
export function createWorldThumbnail(onStateChange: (state: WorldThumbnailState) => void = () => {}) {
  const element = document.createElement('figure');
  element.className = 'record-world-image'; element.hidden = true;
  let source: ImageSource | undefined;
  let visible = false;
  let generation = 0;
  let state: WorldThumbnailState = 'idle';
  function setState(value: WorldThumbnailState) {
    if (state === value) return;
    state = value;
    onStateChange(value);
  }
  async function refresh() {
    const token = ++generation;
    element.hidden = true;
    if (!imagesAllowed || !visible || !source) { setState('idle'); return; }
    setState('loading');
    try {
      let url = source.imageUrl ? permittedImage(source.imageUrl) : undefined;
      if (!url && source.worldId) url = await bundledWorldThumbnail(source.worldId);
      if (token !== generation || !imagesAllowed || !visible) return;
      if (!url) { setState('failed'); return; }
      if (!navigator.onLine && !images.has(url)) { setState('failed'); return; }
      const image = await loadImage(url);
      if (token !== generation || !imagesAllowed || !visible) return;
      if (!image) { setState('failed'); return; }
      const caption = document.createElement('figcaption');
      caption.className = 'record-world-name'; caption.textContent = source.label ?? '';
      // Two worlds can share one catalog image. Preserve both visible rows while
      // reusing the original element whenever its previous page is hidden.
      const displayImage = image.isConnected && image.parentElement !== element && !image.closest('.opening-card[hidden]')
        ? image.cloneNode(true) as HTMLImageElement : image;
      displayImage.alt = source.label ? `${source.label} world thumbnail` : 'World thumbnail';
      element.replaceChildren(caption, displayImage); element.hidden = false;
      setState('loaded');
    } catch { if (token === generation && imagesAllowed && visible) setState('failed'); }
  }
  const unsubscribe = onVRChatImagesChange(() => {
    if (!imagesAllowed) element.replaceChildren();
    void refresh();
  });
  return {
    element,
    update(value?: ImageSource) {
      if (source?.worldId === value?.worldId && source?.imageUrl === value?.imageUrl && source?.label === value?.label) return;
      source = value; element.replaceChildren(); void refresh();
    },
    setVisible(value: boolean) { if (visible !== value) { visible = value; void refresh(); } },
    dispose() { generation++; visible = false; unsubscribe(); element.replaceChildren(); element.hidden = true; setState('idle'); },
  };
}
