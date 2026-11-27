import { createDatabaseChecker } from '../data/database-check';
import { friendsDemoReady } from '../data/friends-demo';
import { addStorySpectrum } from '../components/story-spectrum';
import { addRecapAtmosphere } from '../components/recap-atmosphere';
import { addLandingMusic } from '../components/landing-music';
import { createLandingPage } from '../pages/entry/landing';
import { addGradientDots } from '../components/gradient-dots';

interface AppStartup {
  ready: Promise<void>;
  muted: boolean;
  start: () => void;
}

export function mountApp(root: HTMLElement): AppStartup {
  const checker = createDatabaseChecker();
  const page = createLandingPage(checker);
  root.replaceChildren(page);
  const readMusicLevel = addLandingMusic(page);
  const updateAtmosphere = addRecapAtmosphere(page);
  const updateStorySpectrum = addStorySpectrum(page, readMusicLevel.readSpectrum);
  const title = page.querySelector<HTMLElement>('#landing-title');
  let previousGlow = '';
  addGradientDots(page, readMusicLevel, level => {
    updateAtmosphere(level);
    updateStorySpectrum();
    const glow = level.toFixed(3);
    if (glow !== previousGlow) {
      title?.style.setProperty('--title-music-glow', glow);
      // The body-level transition inherits the very same music pulse as the title.
      document.documentElement.style.setProperty('--title-music-glow', glow);
      previousGlow = glow;
    }
  });
  return { ready: Promise.all([readMusicLevel.ready, friendsDemoReady, checker.ready()]).then(() => {}), muted: readMusicLevel.muted, start: readMusicLevel.start };
}
