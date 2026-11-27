import { getVRChatImagesAllowed, onVRChatImagesChange, permittedImage } from './world-thumbnail';

/** The original rising boop confetti, with all available designs and session-only images. */
export function createBoopParticles(section: HTMLElement) {
  const layer = document.createElement('div'); layer.className = 'boop-particles'; layer.setAttribute('aria-hidden', 'true'); section.append(layer);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fallback = ['✨', '💖', '⭐', '😊', '🎉', '💫'];
  const images = new Map<string, HTMLImageElement>();
  const failed = new Set<string>();
  const pending = new Map<string, () => void>();
  const animations = new Set<Animation>();
  const targets = new Map<string, Set<HTMLElement>>();
  let timer = 0, visible = false, urls: string[] = [];
  function stop() {
    clearTimeout(timer); timer = 0;
    for (const animation of animations) animation.cancel();
    animations.clear(); targets.clear(); layer.replaceChildren();
  }
  function cancelImages() { for (const cancel of [...pending.values()]) cancel(); pending.clear(); }
  function prepare() {
    if (!visible || section.hidden || reduced.matches || !getVRChatImagesAllowed() || !navigator.onLine) return;
    for (const url of urls) {
      if (pending.size >= 6) break;
      if (images.has(url) || pending.has(url) || failed.has(url)) continue;
      const image = new Image(); let done = false;
      const finish = (ok: boolean, cancelled = false) => {
        if (done) return; done = true; clearTimeout(timeout); pending.delete(url);
        image.onload = null; image.onerror = null;
        if (ok && getVRChatImagesAllowed()) {
          images.set(url, image);
          for (const particle of targets.get(url) ?? []) if (particle.isConnected) particle.replaceChildren(image.cloneNode(true));
        } else { image.removeAttribute('src'); if (!cancelled) failed.add(url); }
        queueMicrotask(prepare);
      };
      const timeout = setTimeout(() => finish(false), 8000);
      pending.set(url, () => finish(false, true));
      image.referrerPolicy = 'no-referrer'; image.decoding = 'async'; image.alt = '';
      image.onload = () => finish(true); image.onerror = () => finish(false); image.src = url;
    }
  }
  function burst() {
    timer = 0;
    if (!visible || section.hidden || !section.isConnected || document.hidden || reduced.matches) return;
    const selected = [...urls];
    for (let index = selected.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [selected[index], selected[other]] = [selected[other]!, selected[index]!];
    }
    const count = Math.max(8, selected.length);
    for (let index = 0; index < count; index++) {
      const particle = document.createElement('span'); particle.className = 'boop-particle';
      particle.style.left = `${5 + Math.random() * 90}%`;
      const url = selected[index];
      const image = url && getVRChatImagesAllowed() ? images.get(url) : undefined;
      if (image) particle.append(image.cloneNode(true)); else particle.textContent = fallback[Math.floor(Math.random() * fallback.length)]!;
      if (url) { if (!targets.has(url)) targets.set(url, new Set()); targets.get(url)!.add(particle); }
      layer.append(particle);
      const drift = Math.random() * 300 - 150;
      const rise = layer.clientHeight * (.62 + Math.random() * .22);
      const animation = particle.animate([
        { transform: 'translateY(80px) scale(.85)', opacity: 0, easing: 'ease-out' },
        { transform: `translate(${drift * .16}px,-${rise * .4}px) rotate(${drift * .15}deg) scale(1)`, opacity: .95, offset: .12, easing: 'cubic-bezier(.15,.65,.3,1)' },
        { transform: `translate(${drift * .5}px,-${rise}px) rotate(${drift * .45}deg) scale(1.05)`, opacity: 1, offset: .44, easing: 'cubic-bezier(.45,0,.8,.4)' },
        { transform: `translate(${drift * .82}px,-${rise * .45}px) rotate(${drift * .8}deg) scale(1)`, opacity: .9, offset: .8, easing: 'ease-in' },
        { transform: `translate(${drift}px,88px) rotate(${drift}deg) scale(.95)`, opacity: 0 },
      ], { duration: 4000 + Math.random() * 1000, delay: index * 100, easing: 'linear', fill: 'both' });
      animations.add(animation);
      void animation.finished.catch(() => {}).finally(() => { animations.delete(animation); if (url) targets.get(url)?.delete(particle); particle.remove(); });
    }
  }
  onVRChatImagesChange(() => {
    if (!getVRChatImagesAllowed()) { cancelImages(); images.clear(); failed.clear(); layer.querySelectorAll('img').forEach(image => image.replaceWith(document.createTextNode('💖'))); }
    else prepare();
  });
  reduced.addEventListener('change', () => { if (reduced.matches) { stop(); cancelImages(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  return {
    update(values: readonly string[]) { stop(); cancelImages(); urls = [...new Set(values.map(permittedImage).filter((url): url is string => !!url))]; prepare(); },
    setVisible(value: boolean) { visible = value; if (!value) { stop(); cancelImages(); } else prepare(); },
    schedule() { clearTimeout(timer); timer = window.setTimeout(burst, 350); },
    stop,
  };
}
