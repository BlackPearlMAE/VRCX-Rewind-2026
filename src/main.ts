import { partStartupScreen } from './components/startup-transition';
import { prepareMusicAssets } from './data/music-assets';

const root = document.querySelector<HTMLDivElement>('#app');
const startup = document.querySelector<HTMLElement>('#startup');
const startButton = document.querySelector<HTMLButtonElement>('#startup-start');
const status = document.querySelector<HTMLElement>('#startup-status');
const bar = document.querySelector<HTMLElement>('#startup-bar');
const fill = bar?.querySelector<HTMLElement>('span');
if (!root || !startup || !startButton || !status || !bar || !fill) throw new Error('Application shell is missing.');

const minimumLoading = new Promise<void>(resolve => window.setTimeout(resolve, 1200));
const progress = { app: 0, fonts: 0, worlds: 0, music: 0, playback: 0 };
const weights = { app: 10, fonts: 5, worlds: 10, music: 70, playback: 5 };
function advance(asset: keyof typeof progress, fraction = 1): void {
  progress[asset] = Math.max(progress[asset], Math.min(1, fraction));
  const percent = Math.round((Object.keys(progress) as (keyof typeof progress)[]).reduce((sum, key) => sum + progress[key] * weights[key], 0));
  fill!.style.width = `${percent}%`;
  bar!.setAttribute('aria-valuenow', String(percent));
  bar!.setAttribute('aria-valuetext', `${percent}% of asset preparation complete`);
}
async function boot(): Promise<void> {
  const music = prepareMusicAssets(fraction => advance('music', fraction));
  const worlds = import('./data/world-thumbnail-index').then(async ({ bundledWorldCatalog }) => {
    const catalog = await bundledWorldCatalog();
    advance('worlds');
    return catalog.size > 0;
  }).catch(() => { advance('worlds'); return false; });
  const fonts = document.fonts.load('400 1em Questrial').then(() => document.fonts.ready).then(() => advance('fonts'));
  const { mountApp } = await import('./app/mount');
  const app = mountApp(root!);
  advance('app');
  const playback = app.ready.then(() => advance('playback'));
  const [musicLoaded, worldsLoaded] = await Promise.all([music, worlds, fonts, playback, minimumLoading]);
  // Let the final completed step finish its visual transition before showing Start.
  await new Promise<void>(resolve => window.setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400));
  startup!.setAttribute('aria-busy', 'false');
  bar!.hidden = true; status!.hidden = true;
  if (!musicLoaded || !worldsLoaded) {
    status!.hidden = false;
    status!.classList.add('has-asset-error');
    status!.textContent = 'Some optional assets could not load. You can still start.';
  }
  startButton!.hidden = false;
  startButton!.addEventListener('click', () => {
    startButton!.disabled = true;
    app.start();
    void partStartupScreen(startup!, root!).then(() => {
      const title = root!.querySelector<HTMLElement>('#landing-title');
      title?.setAttribute('tabindex', '-1'); title?.focus({ preventScroll: true });
    });
  }, { once: true });
}

void boot().catch(() => {
  bar.hidden = true;
  startup.setAttribute('aria-busy', 'false');
  status.hidden = false;
  status.classList.add('has-asset-error');
  status.textContent = 'Could not load. Please try again.';
  startButton.textContent = 'Try again'; startButton.hidden = false;
  startButton.addEventListener('click', () => location.reload(), { once: true });
});
