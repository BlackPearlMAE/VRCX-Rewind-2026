export interface TitleOptions {
  color?: string;
  depthColor?: string;
  shineColor?: string;
  shine?: boolean;
  musicReactive?: boolean;
}

/** Shared lettering for headings, transition labels, and other recap text. */
export function createTitle(text: string, options: TitleOptions = {}, tag: 'h1' | 'h2' | 'strong' | 'span' = 'strong'): HTMLElement {
  const title = document.createElement(tag);
  title.className = 'effect-title';
  if (options.color) title.style.setProperty('--title-face-color', options.color);
  if (options.shineColor) title.style.setProperty('--title-shine-color', options.shineColor);
  if (options.depthColor) {
    [100, 94, 88, 82, 75, 68, 61, 55, 49, 44].forEach((percent, index) => {
      title.style.setProperty(`--title-depth-${index + 1}`, `color-mix(in srgb, ${options.depthColor} ${percent}%, black)`);
    });
    [25, 10, 0, 0].forEach((white, index) => {
      title.style.setProperty(`--title-glow-${index + 1}`, `color-mix(in srgb, ${options.depthColor}, white ${white}%)`);
    });
  }
  const face = document.createElement('span');
  face.className = 'title-face';
  face.textContent = text;
  title.append(face);
  if (options.musicReactive !== false) {
    const glow = document.createElement('span');
    glow.className = 'title-music-glow';
    glow.setAttribute('aria-hidden', 'true');
    glow.textContent = text;
    title.prepend(glow);
  }
  if (options.shine !== false) {
    const shine = document.createElement('span');
    shine.className = 'title-reflection';
    shine.setAttribute('aria-hidden', 'true');
    shine.textContent = text;
    title.append(shine);
  }
  return title;
}
