import { createSharePage } from '../rewind/share';
import { createRecapExclusions } from '../../components/recap-exclusions';
import { addFriendsExclusionIntro } from '../../components/friends-exclusion-intro';
import { filterDemoFriendRecord } from '../../data/friends-demo-filter';
import { friendsDefinitions } from '../../data/friends-definitions';
import { createFriendsPage } from '../rewind/friends';
import type { FriendsPageData } from '../../data/friends-data';
import { savedFriendsDemo, savedFriendsSnapshot } from '../../data/friends-demo';
import { demoShareProfile } from '../../data/demo-profile';
import { createTimelineSynth } from '../../components/timeline-synth';
import { createWorldsPage } from '../rewind/worlds';
import { worldsDefinitions, type WorldsPageData } from '../../data/worlds-data';
import { savedWorldsDemo } from '../../data/worlds-demo';
import { selectRecordSequence } from '../../data/record-selection';
import { setVRChatImagesAllowed, getVRChatImagesAllowed, onVRChatImagesChange } from '../../components/world-thumbnail';
import { createRecordPage } from '../rewind/record';
import { recordDefinitions, type RecordPageData } from '../../data/record-pages';
import { recordedRecordDemo } from '../../data/recorded-record-demo';
import { createRecapChrome } from '../../components/recap-chrome';
import { createPageTransition, type RecapPage } from '../../components/page-transition';
import { savedTimePlayedDemo } from '../../data/timeline-demo';
import type { TimelineLoadResult } from '../../data/timeline-query';
import { createStoryPage } from '../rewind/story';
import { createTitle } from '../../components/title';
import { createSliceTransition } from '../../components/slice-transition';
import { createOpeningCard } from '../rewind/opening';
import { createDatabaseChecker } from '../../data/database-check';
import { addOpeningScrollResistance } from '../../components/scroll-resistance';

export function createLandingPage(initialChecker = createDatabaseChecker()): HTMLElement {
  const main = document.createElement('main');
  // Static owner-supplied copy only. Never interpolate imported data into HTML.
  main.innerHTML = `
    <section class="landing" aria-labelledby="landing-title">
      <header class="landing-header">
        <h1 id="landing-title">VRCX REWIND 2026<span class="title-reflection" aria-hidden="true">VRCX REWIND 2026</span></h1>
        <p class="intro">Look back on your year in VRChat through your worlds, friends and records.</p>
      </header>
      <div class="import-panel">

        <div class="panel-copy">
          <p>Create a personal rewind of your year in VRChat, built from your VRCX history.</p>
          <p>Designed to run locally in your browser, with your data staying on your device. For offline use, load the page before disconnecting.</p>
        </div>
        <div class="database-location">
          <p class="path-label">Copy your database path:</p>
          <div class="path-field">
            <p class="copy-feedback" aria-live="polite"></p>
            <code id="database-path" tabindex="0" aria-label="VRCX database path" aria-describedby="path-help">%AppData%\\VRCX\\<wbr>VRCX.sqlite3</code>
            <button class="copy-path" type="button" aria-label="Copy VRCX database path" title="Copy database path"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></button>
          </div>
          <p id="path-help">Paste this into the File name box, then click Open.</p>
          <button class="path-help-button" type="button" aria-haspopup="dialog" aria-controls="path-help-dialog">Instructions</button>
        </div>
        <div class="import-action">
          <button class="journey-button" type="button"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v1H5a2 2 0 0 0-2 2V7Z"/><path d="M3 12a2 2 0 0 1 2-2h16l-2 9H3v-7Z"/></svg><span>Select your VRCX database</span></button>
          <button class="choose-new-db" type="button" hidden>Choose a new database</button>
          <p class="drop-hint">or drop VRCX.sqlite3 here</p>
          <input class="file-input" type="file" accept=".sqlite3,.sqlite,.db" aria-label="Select your VRCX database" tabindex="-1">
          <p class="import-status" role="status" aria-live="polite"></p>
        </div>
        <div class="landing-options">
          <div class="demo-action"><button class="demo-button" type="button">Try demo</button></div>
          <div class="image-permission image-permission-tooltip">
            <label class="image-permission-label" for="allow-vrchat-images">
              <input id="allow-vrchat-images" type="checkbox" role="switch" aria-describedby="image-permission-help" autocomplete="off">
              <span class="image-permission-track" aria-hidden="true"></span>
              <span>Load images from VRChat</span>
            </label>
            <button class="image-permission-info" type="button" aria-label="About VRChat images" aria-describedby="image-permission-help"><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="M10 9v5M10 6v.5"/></svg></button>
            <p id="image-permission-help" role="tooltip">Optional. Loads world thumbnails and saved avatar images from VRChat’s servers. Off by default.</p>
          </div>
        </div>
      </div>
      <div class="more-link-container"><a class="more-link" href="#site-information"><span class="chevron" aria-hidden="true"></span><span>More Information about the Site</span><span class="chevron" aria-hidden="true"></span></a></div>
      <footer class="affiliation-notice">Independent community project. Not affiliated with or endorsed by VRChat or VRCX.</footer>
    </section>
    <section class="site-information" id="site-information" aria-label="More Information about the Site" tabindex="-1">
      <div class="information-list">
        <details class="information-item">
          <summary><span class="chevron" aria-hidden="true"></span><span>Security and your data</span></summary>
          <div class="information-content">
            <p>This app runs as a local browser application right on your device. The recap is designed to process your database locally, so your data stays on your machine. VRCX Rewind does not use analytics or set tracking cookies of its own. When you change the audio controls, this browser remembers your volume and mute preferences. These preferences expire 30 days after your last change and are not sent to us. Offline use will require loading all app assets before disconnecting.</p>
            <p>I tried to make this as safe and transparent as possible. The source code and hosting workflow are available on <a href="https://github.com/BlackPearlMAE/VRCX-Rewind-2026" target="_blank" rel="noopener noreferrer">GitHub</a> for inspection, and the site is hosted through GitHub Pages. The code currently has no reuse license. Please <a href="mailto:pearl.vrc@gmail.com">contact me</a> for permission before reusing the code or publishing your own version.</p>
            <p>Loading images from VRChat is optional and off by default. If you enable it, your browser connects directly to VRChat and its image hosts, which receive your IP address and the requested image URL. Depending on your browser’s privacy settings and the cookies’ rules, these requests may send existing cookies for those servers, including session cookies where permitted, or accept cookies they set. VRCX Rewind cannot read those cookies and does not ask for your VRChat login. Your database is not uploaded with these requests.</p>
          </div>
        </details>
        <details class="information-item">
          <summary><span class="chevron" aria-hidden="true"></span><span>About Me</span></summary>
          <div class="information-content">
            <p>Hi I'm Pearl. I am a German software developer and have been doing this for 10+ years. I'm also a fan of VRChat and VRCX and have thousands of hours using both. I wanted to create this project so users can share their experience and have some fun together.</p>
            <p>This is an independent community project. I am not affiliated with VRChat or VRCX, and this project is not endorsed or sponsored by either.</p>
            <p>Project contact: <a href="mailto:pearl.vrc@gmail.com">pearl.vrc@gmail.com</a></p>
          </div>
        </details>
        <details class="information-item">
          <summary><span class="chevron" aria-hidden="true"></span><span>AI usage in this project</span></summary>
          <div class="information-content">
            <p>I used AI to help build VRCX Rewind. I know some people will skip the site because of that. Fair enough, but I think they&#8217;re missing out.</p>
            <p>If &#8220;made with AI&#8221; makes you picture someone typing &#8220;build me a website&#8221; and calling it done, I spent more than two weeks and countless hours on this project. I made almost every decision, from what the rewind should show to how it should look and feel, and kept refining those choices as I went. Friends gave me feedback along the way. I&#8217;m proud of the work that went into it, and I can also say plainly that I wouldn&#8217;t have built it without AI.</p>
            <p>I used AI to help with coding, generate CSS, translate text, and polish the wording. I directed the visual style in FigCraft and used AI to turn that design into HTML and CSS. The soundtrack is credited below. Sound effects are generated by the app.</p>
            <p>I wanted VRCX Rewind to be free. I didn&#8217;t have the budget to hire an artist or the time to write every line of code from scratch. AI helped me make the experience I wanted to share.</p>
          </div>
        </details>
        <details class="information-item">
          <summary><span class="chevron" aria-hidden="true"></span><span>Music credits</span></summary>
          <div class="information-content">
            <p><a href="https://youtu.be/qptMg0JWmFY" target="_blank" rel="noopener noreferrer">Above All by HOME</a><br>
              Artist: <a href="http://soundcloud.com/home-2001" target="_blank" rel="noopener noreferrer">HOME</a><br>
              Sourced from @RoyaltyFreePlanet – <a href="https://royaltyfreeplanet.com" target="_blank" rel="noopener noreferrer">Royalty Free Planet</a><br>
              <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">Creative Commons Attribution-ShareAlike 3.0</a></p>
            <p><a href="https://youtu.be/jVTsD4UPT-k" target="_blank" rel="noopener noreferrer">失望した by EVA</a><br>
              Artist: <a href="https://joshlis.bandcamp.com" target="_blank" rel="noopener noreferrer">EVA</a><br>
              Sourced from @RoyaltyFreePlanet – <a href="https://www.royaltyfreeplanet.com" target="_blank" rel="noopener noreferrer">Royalty Free Planet</a><br>
              <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">Creative Commons Attribution 3.0</a></p>
            <p><a href="https://youtu.be/r_Q15eu03z8" target="_blank" rel="noopener noreferrer">AIRGLOW – New Touch</a><br>
              Artist: <a href="https://airglow-strat.bandcamp.com" target="_blank" rel="noopener noreferrer">AIRGLOW</a><br>
              Sourced from @RoyaltyFreePlanet – <a href="https://royaltyfreeplanet.com" target="_blank" rel="noopener noreferrer">Royalty Free Planet</a><br>
              <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">Creative Commons Attribution 3.0</a></p>
            <p>Audio converted to MP3 and volume-adjusted. Playback uses looping, fades/crossfades and music-reactive visuals. The adapted HOME recording retains CC BY-SA 3.0.</p>
            <p>These music licenses are separate from the application code’s permission notice. The code notice does not limit rights granted for the music.</p>
          </div>
        </details>
      </div>
    </section>
    <dialog class="path-help-dialog" id="path-help-dialog" aria-labelledby="path-help-title" aria-describedby="path-help-description">
      <button class="dialog-close" type="button" aria-label="Close database help">&#215;</button>
      <h2 id="path-help-title">Find your VRCX database</h2>
      <p id="path-help-description"><code>%AppData%</code> is a Windows shortcut to your account's application-data folder. The full file path on the main page lets you select your database without browsing through folders.</p>
      <ol class="folder-steps">
        <li>Close this guide, copy the database path on the main page, then click <strong>Select your VRCX database</strong>.</li>
        <li>Paste the path into the <strong>File name</strong> box at the bottom of the file picker: right-click inside it, then click <strong>Paste</strong>, as shown below.</li>
        <li>Click <strong>Open</strong> to select VRCX.sqlite3 directly.</li>
      </ol>
      <figure class="explorer-guide">
        <div class="picker-callout">Paste the full path into File name at the bottom</div>
        <div class="explorer-window picker-window" role="img" aria-label="Illustration of a Windows Open file dialog. The File name box at the bottom is highlighted in pink and contains the full database path. Paste the copied path there, then click Open at the bottom right.">
          <div class="picker-title"><span><span class="picker-app-icon" aria-hidden="true"></span> Open <span class="picker-example">Illustration</span></span><span aria-hidden="true">&#215;</span></div>
          <div class="picker-toolbar">
            <span class="picker-nav" aria-hidden="true">&#8592; &nbsp; &#8593;</span>
            <div class="picker-address"><span class="picker-document" aria-hidden="true"></span><span>This PC &#8250; Documents</span></div>
            <div class="picker-search"><span>Search Documents</span><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="5"/><path d="m12 12 5 5"/></svg></div>
          </div>
          <div class="picker-command" aria-hidden="true"><span>Organize</span><span>New folder</span></div>
          <div class="picker-body">
            <div class="picker-sidebar" aria-hidden="true"><span>Quick access</span><span>Desktop</span><span>Downloads</span><span>Documents</span><span>Pictures</span><span>This PC</span></div>
            <div class="picker-file-list"><div class="picker-columns"><span>Name</span><span>Type</span></div><div class="picker-file"><span><span class="picker-document" aria-hidden="true"></span> VRCX.sqlite3</span><span>Database</span></div></div>
          </div>
          <div class="picker-bottom"><div class="picker-filename"><span>File name:</span><span class="picker-filename-value"><code>%AppData%\\VRCX\\<wbr>VRCX.sqlite3</code><span class="picker-demo-cursor" aria-hidden="true"><svg viewBox="0 0 24 30" width="24" height="30"><path d="M2 1v23l6-6 5 10 4-2-5-10h9Z" fill="#fff" stroke="#17171a" stroke-width="1.5" stroke-linejoin="round"/></svg></span><span class="picker-demo-click" aria-hidden="true"></span><span class="picker-context-menu" aria-hidden="true"><span class="context-muted">Cut</span><span class="context-muted">Copy</span><span class="context-paste">Paste</span><span class="context-muted">Select all</span></span></span></div><div class="picker-actions" aria-hidden="true"><span class="picker-open">Open</span><span>Cancel</span></div></div>
        </div>
        <figcaption>This is an illustration, not an interactive window. Paste into File name, not the address bar or search box. Your Windows language and layout may differ.</figcaption>
      </figure>
      <p>Prefer drag and drop? Open the folder in File Explorer, then drag <strong>VRCX.sqlite3</strong> onto the database-selection area on this page.</p>      <p class="dialog-note">For a portable or custom VRCX installation, use the folder where it stores your database instead.</p>      <button class="dialog-done" type="button">Got it</button>
    </dialog>
    <dialog class="image-recommendation-dialog" id="image-recommendation-dialog" aria-labelledby="image-recommendation-title" aria-describedby="image-recommendation-description image-recommendation-privacy">
      <h2 id="image-recommendation-title">Enjoy your rewind with images</h2>
      <p id="image-recommendation-description">We recommend enabling images for the best rewind experience. See world thumbnails and saved avatar pictures alongside your memories.</p>
      <div class="image-permission">
        <label class="image-permission-label" for="allow-vrchat-images-dialog">
          <input id="allow-vrchat-images-dialog" type="checkbox" role="switch" aria-describedby="image-recommendation-privacy" autocomplete="off">
          <span class="image-permission-track" aria-hidden="true"></span>
          <span>Load images from VRChat</span>
        </label>
      </div>
      <p id="image-recommendation-privacy" class="dialog-note">Optional. Your browser will request images directly from VRChat and its image hosts, which receive your IP address and the requested image URL. Your database stays on your device.</p>
      <button class="dialog-done image-recommendation-continue" type="button" autofocus>Continue without images</button>
    </dialog>  `;

  const imagePermission = main.querySelector<HTMLInputElement>('#allow-vrchat-images')!;
  const imageDialog = main.querySelector<HTMLDialogElement>('#image-recommendation-dialog')!;
  const dialogImagePermission = main.querySelector<HTMLInputElement>('#allow-vrchat-images-dialog')!;
  const imageDialogContinue = imageDialog.querySelector<HTMLButtonElement>('.image-recommendation-continue')!;
  const imageTooltip = main.querySelector<HTMLElement>('.image-permission-tooltip')!;
  for (const event of ['pointerenter', 'focusin']) imageTooltip.addEventListener(event, () => imageTooltip.classList.remove('is-dismissed'));
  imageTooltip.addEventListener('keydown', event => {
    if (event.key === 'Escape') { imageTooltip.classList.add('is-dismissed'); event.stopPropagation(); }
  });
  imagePermission.checked = false;
  setVRChatImagesAllowed(false);
  let imagesEnabledOnLanding = false;
  function setLandingImagePermission(input: HTMLInputElement): void {
    imagesEnabledOnLanding = input.checked;
    setVRChatImagesAllowed(input.checked);
  }
  imagePermission.addEventListener('change', () => setLandingImagePermission(imagePermission));
  dialogImagePermission.addEventListener('change', () => setLandingImagePermission(dialogImagePermission));
  function syncImagePermission(): void {
    const allowed = getVRChatImagesAllowed();
    imagePermission.checked = dialogImagePermission.checked = allowed;
    if (!allowed) imagesEnabledOnLanding = false;
    imageTooltip.hidden = allowed && !imagesEnabledOnLanding && !!imageTooltip.closest('.import-panel')?.classList.contains('is-ready');
    imageDialogContinue.textContent = allowed ? 'Continue with images' : 'Continue without images';
  }
  onVRChatImagesChange(syncImagePermission);
  syncImagePermission();
  imageDialogContinue.addEventListener('click', () => imageDialog.close());

  const title = createTitle('VRCX REWIND 2026', {}, 'h1');
  title.id = 'landing-title';
  main.querySelector('#landing-title')!.replaceWith(title);
  const helpDialog = main.querySelector<HTMLDialogElement>('.path-help-dialog')!;
  const demoField = helpDialog.querySelector<HTMLElement>('.picker-filename-value')!;
  function positionOpenClick(): void {
    if (!helpDialog.open) return;
    const field = demoField.getBoundingClientRect();
    const open = helpDialog.querySelector<HTMLElement>('.picker-open')!.getBoundingClientRect();
    demoField.style.setProperty('--picker-open-x', `${open.left + open.width / 2 - field.left - 28}px`);
    demoField.style.setProperty('--picker-open-y', `${open.top + open.height / 2 - field.top - field.height / 2}px`);
  }
  const demoResizeObserver = new ResizeObserver(positionOpenClick);
  demoResizeObserver.observe(demoField);
  // Start the demonstration when its target is actually visible in the scrolled guide.
  const demoObserver = new IntersectionObserver(entries => {
    positionOpenClick();
    for (const entry of entries) demoField.classList.toggle('is-demonstrating', entry.isIntersecting && helpDialog.open);
  }, { root: helpDialog, threshold: .6 });
  demoObserver.observe(demoField);
  helpDialog.addEventListener('close', () => demoField.classList.remove('is-demonstrating'));
  const helpButton = main.querySelector<HTMLButtonElement>('.path-help-button')!;
  helpButton.addEventListener('click', () => {
    helpDialog.showModal();
    helpButton.classList.add('has-opened-instructions');
    document.documentElement.classList.add('has-help-dialog');
  });
  for (const closeButton of helpDialog.querySelectorAll<HTMLButtonElement>('.dialog-close, .dialog-done')) {
    closeButton.addEventListener('click', () => helpDialog.close());
  }
  helpDialog.addEventListener('close', () => document.documentElement.classList.remove('has-help-dialog'));
  helpDialog.addEventListener('click', event => {
    if (event.target !== helpDialog) return;
    const bounds = helpDialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) helpDialog.close();
  });
  const pathField = main.querySelector<HTMLElement>('#database-path')!;
  const copyButton = main.querySelector<HTMLButtonElement>('.copy-path')!;
  const copyFeedback = main.querySelector<HTMLParagraphElement>('.copy-feedback')!;
  function selectPath(): void {
    const range = document.createRange();
    range.selectNodeContents(pathField);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  pathField.addEventListener('click', selectPath);
  let copyNoticeTimer: ReturnType<typeof setTimeout> | undefined;
  function showCopyNotice(message: string): void {
    clearTimeout(copyNoticeTimer);
    copyFeedback.textContent = message;
    copyFeedback.classList.add('is-visible');
    copyNoticeTimer = setTimeout(() => {
      copyFeedback.classList.remove('is-visible');
    }, 1500);
  }
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pathField.textContent ?? '');
      showCopyNotice('Database path copied.');
    } catch {
      pathField.focus();
      selectPath();
      showCopyNotice('Path selected. Press Ctrl+C (or Command+C) to copy.');
    }
  });
  const bypassScrollResistance = addOpeningScrollResistance(main);
  const information = main.querySelector<HTMLElement>('#site-information')!;
  main.querySelector<HTMLAnchorElement>('.more-link')!.addEventListener('click', event => {
    event.preventDefault();
    bypassScrollResistance();
    information.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    information.focus({ preventScroll: true });
    history.replaceState(null, '', '#site-information');
  });
  const button = main.querySelector<HTMLButtonElement>('.journey-button')!;
  const demoButton = main.querySelector<HTMLButtonElement>('.demo-button')!;
  const input = main.querySelector<HTMLInputElement>('.file-input')!;
  const status = main.querySelector<HTMLParagraphElement>('.import-status')!;
  let checker = initialChecker;
  let needsDatabaseCheck = false;
  let selectedFile: File | undefined;
  let running = false;
  let recapSource: 'file' | 'demo' = 'file';
  let importedTimeline: TimelineLoadResult | undefined;
  let importedRecords: RecordPageData[] | undefined;
  let importedWorlds: WorldsPageData[] | undefined;
  let importedFriends: FriendsPageData[] | undefined;
  function returnToStart() {
    exclusions.close();
    pageTransition.cancel();
    opening.hide();
    story.hide();
    recordsStory.hide();
    worldsStory.hide();
    friendsStory.hide(); friendsPages.forEach(page => page.hide());
    endPage.hide(); sharePage.hide();
    worldsPages.forEach(page => page.hide());
    recordPages.forEach(page => page.hide());
    recapChrome.hide();
    main.querySelector<HTMLElement>('.landing')!.hidden = false;
    information.hidden = false;
    window.scrollTo({ top: 0, behavior: 'instant' });
    (recapSource === 'demo' && !demoButton.hidden ? demoButton : button).focus({ preventScroll: true });
  }
  const pageTransition = createPageTransition(main);
  let recapIndex = 0;
  let personRevision = 0;
  function showChrome(index: number) { recapIndex = index; recapChrome.show(index); }
  function navigateTo(index: number) {
    if (index < 0 || index >= pages.length || index === recapIndex) return;
    if (index === 1) opening.prepareAudio();
    if (pages[index]?.section.dataset.record || pages[index]?.section.dataset.worlds || pages[index]?.section.dataset.friends) void recordSynth.setEnabled(recordSoundEnabled);
    void pageTransition.slide(pages[recapIndex]!, pages[index]!, index > recapIndex ? 'next' : 'previous');
  }
  const previous = () => navigateTo(recapIndex - 1);
  const next = () => navigateTo(recapIndex + 1);
  const opening = createOpeningCard(returnToStart, previous, () => showChrome(1), next);
  const recordSynth = createTimelineSynth();
  let recordSoundEnabled = true;
  let recordSoundOwner: string | undefined;
  document.addEventListener('visibilitychange', () => { if (document.hidden) recordSynth.stop(); });
  window.addEventListener('pagehide', () => recordSynth.dispose(), { once: true });
  main.addEventListener('rewind-audio-change', event => {
    const settings = (event as CustomEvent<{ enabled: boolean; volume: number }>).detail;
    opening.setSoundEnabled(settings.enabled);
    opening.setSoundVolume(settings.volume);
    recordSoundEnabled = settings.enabled;
    recordSynth.setVolume(Math.min(1, settings.volume * 2.5));
    if (!settings.enabled || [...recordPages, ...worldsPages, ...friendsPages].some(page => !page.section.hidden)) void recordSynth.setEnabled(settings.enabled);
  });
  const story = createStoryPage(returnToStart, next, () => showChrome(0));
  const recordsStory = createStoryPage(returnToStart, next, () => showChrome(2), {
    id: 'records-story-title',
    kicker: 'Now, let’s have a look at',
    title: 'some of your records',
    copy: Number(new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin', year: 'numeric' }).format(new Date())) === 2026 ? 'of this year.' : 'of last year.',
    onPrevious: previous,
  });
  recordsStory.section.classList.add('records-story');
  const recordPages = recordDefinitions.map(definition => createRecordPage(
    definition.id, previous, next, () => {
      const index = pages.findIndex(page => page.section.dataset.record === definition.id);
      if (index >= 0) showChrome(index);
    }, {
      start(total) { recordSoundOwner = definition.id; recordSynth.start(total); },
      update(total) { if (recordSoundOwner === definition.id) recordSynth.update(total); },
      settled(rank) { if (recordSoundOwner === definition.id) recordSynth.settled(rank); },
      finish(completed) {
        if (recordSoundOwner !== definition.id) return;
        recordSynth.finish(completed);
        if (!completed) recordSoundOwner = undefined;
      },
      stop() {
        if (recordSoundOwner !== definition.id) return;
        recordSynth.stop(); recordSoundOwner = undefined;
      },
    },
  ));
  const worldsStory = createStoryPage(returnToStart, next, () => {
    showChrome(pages.indexOf(worldsStory));
  }, {
    id: 'worlds-story-title',
    kicker: 'Every visit took you somewhere.',
    title: 'The worlds you explored',
    copy: 'And the places you kept coming back to.',
    onPrevious: previous,
  });
  worldsStory.section.classList.add('worlds-story');
  const worldsPages = worldsDefinitions.map(definition => createWorldsPage(
    definition.id, previous, next,
    () => showChrome(pages.findIndex(page => page.section.dataset.worlds === definition.id)),
    {
      start(total) { recordSoundOwner = `worlds-${definition.id}`; recordSynth.start(total); },
      update(total) { if (recordSoundOwner === `worlds-${definition.id}`) recordSynth.update(total); },
      settled(rank) { if (recordSoundOwner === `worlds-${definition.id}`) recordSynth.settled(rank); },
      finish(completed) {
        if (recordSoundOwner !== `worlds-${definition.id}`) return;
        recordSynth.finish(completed);
        if (!completed) recordSoundOwner = undefined;
      },
      stop() {
        if (recordSoundOwner !== `worlds-${definition.id}`) return;
        recordSynth.stop(); recordSoundOwner = undefined;
      },
    },
  ));
  const friendsStory = createStoryPage(returnToStart, next, () => showChrome(pages.indexOf(friendsStory)), {
    id: 'friends-story-title', kicker: 'You had company along the way.', title: 'The friends you made',
    copy: 'And the people you spend time with.',
    disclaimer: 'Sadly, profile images can’t be loaded reliably. We’ll do our best to show saved avatar pictures instead. These may be older or unavailable.',
    onPrevious: previous,
  });
  friendsStory.section.classList.add('friends-story');
  addFriendsExclusionIntro(friendsStory.section);
  const friendsPages = friendsDefinitions.map(definition => createFriendsPage(returnToStart, previous,
    () => showChrome(pages.findIndex(page => page.section.dataset.friends === definition.id)), {
      start(total) { recordSoundOwner = `friends-${definition.id}`; recordSynth.start(total); },
      update(total) { if (recordSoundOwner === `friends-${definition.id}`) recordSynth.update(total); },
      settled(rank) { if (recordSoundOwner === `friends-${definition.id}`) recordSynth.settled(rank); },
      finish(completed) {
        if (recordSoundOwner !== `friends-${definition.id}`) return;
        recordSynth.finish(completed);
        if (!completed) recordSoundOwner = undefined;
      },
      stop() {
        if (recordSoundOwner !== `friends-${definition.id}`) return;
        recordSynth.stop(); recordSoundOwner = undefined;
      },
    }, { id: definition.id, onNext: next, onExclude: (entry, trigger) => exclusions.openPerson(entry.userId, entry.name, trigger) },
  ));
  const endPage = createStoryPage(returnToStart, next, () => showChrome(pages.indexOf(endPage)), {
    id: 'end-story-title',
    title: 'And that was your 2026.',
    copy: 'The worlds you explored, the friends you made, and all the time you spent together. Thanks for using VRCX Rewind. See you next year!',
    onPrevious: previous,
  });
  endPage.section.classList.add('end-page');
  endPage.section.dataset.page = 'end';
  endPage.section.querySelector('.story-kicker')!.remove();
  const shareButton = document.createElement('button');
  shareButton.type = 'button';
  shareButton.className = 'journey-button end-share-button';
  shareButton.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg><span>Share your rewind</span>';
  shareButton.addEventListener('click', next);
  endPage.section.querySelector('.story-content')!.append(shareButton);
  const sharePage = createSharePage(previous, () => showChrome(pages.indexOf(sharePage)), () => recapSource === 'file' ? checker.loadShareProfile(accountSelect.value) : Promise.resolve(structuredClone(demoShareProfile)), (entry, trigger) => exclusions.openPerson(entry.userId, entry.name, trigger));
  function applyFriends(data?: readonly FriendsPageData[]) {
    sharePage.update({ friends: data });
    const demoTimeline = recapSource === 'demo' ? savedTimePlayedDemo() : undefined;
    const demoHours = demoTimeline?.ok && demoTimeline.data?.months.some(month => month.value !== null)
      ? demoTimeline.data.months.reduce((total, month) => total + (month.value ?? 0), 0) : undefined;
    friendsPages.forEach((page, index) => {
      const value = data?.find(value => value.id === friendsDefinitions[index]!.id);
      page.update(value?.id === 'overlap' && value.ownSeconds === undefined && demoHours !== undefined ? {...value, ownSeconds: demoHours * 3600} : value);
    });
  }
  function applyWorlds(data?: readonly WorldsPageData[]) {
    sharePage.update({ worlds: data });
    worldsPages.forEach((page, index) => page.update(data?.find(value => value.id === worldsDefinitions[index]!.id)));
  }
  const allPages: RecapPage[] = [story, opening, recordsStory, ...recordPages, worldsStory, ...worldsPages, friendsStory, ...friendsPages, endPage, sharePage];
  const pages: RecapPage[] = [story, opening, recordsStory, worldsStory, ...worldsPages, friendsStory, ...friendsPages, endPage, sharePage];
  main.append(...allPages.map(page => page.section));
  const recapChrome = createRecapChrome(main, allPages.map(page => page.section), previous, next, navigateTo);
  recapChrome.setPages(pages.map(page => page.section), ['Your story', 'Your time', 'Your records', 'Your worlds', ...worldsDefinitions.map(page => page.title), 'Your friends', ...friendsDefinitions.map(page => page.title), 'End', 'Share']);
  async function refreshPeople(ids: string[]) {
    const revision = ++personRevision;
    if (recapSource === 'demo') {
      applyFriends(savedFriendsDemo(ids));
      applyRecords(filterDemoFriendRecord(recordedRecordDemo, savedFriendsSnapshot(), ids));
      return;
    }
    const account = accountSelect.value;
    const preparation = preparationRevision;
    const friends = await checker.loadFriends(account, ids);
    const records = await checker.loadRecords(account, ids);
    if (revision !== personRevision || preparation !== preparationRevision || recapSource !== 'file' || accountSelect.value !== account) return;
    if (friends.every(page => page.status !== 'ready')) throw new Error('Statistics unavailable');
    importedFriends = friends; importedRecords = records;
    applyFriends(friends); applyRecords(records);
  }
  const exclusions = createRecapExclusions(main, recapChrome.header, refreshPeople);
  function applyRecords(records?: readonly RecordPageData[]) {
    sharePage.update({ records });
    pageTransition.cancel();
    const currentPage = pages[recapIndex];
    const currentWasVisible = currentPage && !currentPage.section.hidden;
    const selected = selectRecordSequence(records ?? []);
    recordPages.forEach((page, index) => {
      const value = selected.find(entry => entry.record.id === recordDefinitions[index]!.id);
      if (value) {
        page.section.dataset.recordOrderDate = new Date(value.sortDate).toISOString().slice(0, 10);
        page.update(value.record);
      } else { page.hide(); page.reset(); }
    });
    const selectedPages = selected.map(entry => recordPages[recordDefinitions.findIndex(definition => definition.id === entry.record.id)]!);
    pages.splice(0, pages.length, story, opening, recordsStory, ...selectedPages, worldsStory, ...worldsPages, friendsStory, ...friendsPages, endPage, sharePage);
    recapChrome.setPages(pages.map(page => page.section), [
      'Your story', 'Your time', 'Your records',
      ...selected.map(entry => recordDefinitions.find(definition => definition.id === entry.record.id)!.title),
      'Your worlds', ...worldsDefinitions.map(page => page.title), 'Your friends', ...friendsDefinitions.map(page => page.title), 'End', 'Share',
    ]);
    const preserved = currentPage ? pages.indexOf(currentPage) : -1;
    recapIndex = preserved >= 0 ? preserved : Math.min(recapIndex, pages.length - 1);
    if (currentWasVisible && preserved < 0) pages[recapIndex]!.show();
  }
  function setSource(source: 'file' | 'demo') {
    const changed = source !== recapSource;
    if (changed) { sharePage.reset(); personRevision++; exclusions.reset(); opening.reset(); applyRecords(); }
    recapSource = source;
    sharePage.setFixedName(source === 'demo' ? demoShareProfile.displayName : undefined);
    if (source === 'demo') { sharePage.update({ timeline: savedTimePlayedDemo() }); opening.update(savedTimePlayedDemo()); applyRecords(filterDemoFriendRecord(recordedRecordDemo, savedFriendsSnapshot(), exclusions.ids())); applyWorlds(savedWorldsDemo()); applyFriends(savedFriendsDemo(exclusions.ids())); }
    else { sharePage.update({ timeline: importedTimeline }); if (importedTimeline) opening.update(importedTimeline); applyRecords(importedRecords); applyWorlds(importedWorlds); applyFriends(importedFriends); if (changed) { applyFriends(); void refreshPeople([]).catch(() => { applyFriends(friendsDefinitions.map(({ id }) => ({ id, status: 'unavailable', total: 0, rankingStatus: 'unavailable', entries: [], source: 'import' }))); }); } }
  }
  const accountLabel = document.createElement('label');
  accountLabel.className = 'rewind-account';
  accountLabel.hidden = true;
  accountLabel.textContent = 'Account for your rewind ';
  const accountSelect = document.createElement('select');
  accountSelect.setAttribute('aria-label', 'Account for your rewind');
  const accountNote = document.createElement('small');
  accountNote.textContent = 'Friends and profile details use this account. Playtime and world activity use the shared database history.';
  accountNote.className = 'account-history-note';
  accountLabel.append(accountSelect, accountNote);
  main.querySelector('.import-action')!.prepend(accountLabel);
  let prepared = false;
  let preparationRevision = 0;
  const transition = createSliceTransition(main);
  button.addEventListener('click', () => {
    if (!selectedFile) { input.click(); return; }
    setSource('file');
    if (!prepared && !running) startBackground();
    startRecap();
  });
  demoButton.addEventListener('click', () => {
    setSource('demo');
    startRecap();
  });
  function startRecap() {
    opening.prepareAudio();
    bypassScrollResistance();
    void transition.play(() => {
      main.querySelector<HTMLElement>('.landing')!.hidden = true;
      information.hidden = true;
      history.replaceState(null, '', location.pathname + location.search);
      window.scrollTo({ top: 0, behavior: 'instant' });
      story.show(true);
    }, () => story.show());
  }
  function cancelPreparation(): void {
    personRevision++; exclusions.reset();
    preparationRevision++;
    importedTimeline = undefined;
    importedRecords = undefined;
    importedWorlds = undefined;
    importedFriends = undefined;
    if (recapSource === 'file') { sharePage.reset(); applyWorlds(); applyFriends(); }
    applyRecords();
    opening.reset();
    checker.stop();
    checker = createDatabaseChecker();
    needsDatabaseCheck = true;
    running = false;
    prepared = false;
  }
  function updateImportedOpening() {
    if (!importedTimeline) return;
    const days = importedRecords?.find(record => record.id === 'days' && record.status === 'ready')?.timeline;
    if (importedTimeline.ok && days) importedTimeline = {
      ...importedTimeline,
      daysData: { source: 'recorded-aggregate', timeline: days, coverage: {
        start: '2025-12-31T23:00:00.000Z',
        endExclusive: new Date(Math.min(Date.now(), Date.parse('2026-12-31T23:00:00.000Z'))).toISOString(),
      } },
    };
    if (recapSource === 'file') { opening.update(importedTimeline); sharePage.update({ timeline: importedTimeline }); }
  }
  async function startBackground(): Promise<void> {
    if (!selectedFile || running) return;
    const file = selectedFile, account = accountSelect.value, activeChecker = checker;
    const revision = ++preparationRevision;
    const peopleRevision = personRevision;
    running = true;
    prepared = false;
    opening.reset();
    // Account changes and retries replace the worker. Reopen the selected file
    // before queuing any calculation on that fresh worker.
    if (needsDatabaseCheck) {
      const result = await activeChecker.check(file);
      if (revision !== preparationRevision) return;
      if (!result.ok) {
        running = false;
        status.dataset.state = 'error'; status.textContent = result.message;
        return;
      }
      needsDatabaseCheck = false;
    }
    // Queue the opening timeline first; later chapters can finish while it is shown.
    try {
      await Promise.all([
        activeChecker.loadTimeline(account).then(result => {
          if (revision !== preparationRevision) return;
          importedTimeline = result;
          updateImportedOpening();
        }),
        activeChecker.loadRecords(account, exclusions.ids()).then(records => {
          if (revision !== preparationRevision || peopleRevision !== personRevision) return;
          importedRecords = records;
          updateImportedOpening();
          if (recapSource === 'file') applyRecords(records);
        }),
        activeChecker.loadWorlds(account).then(worlds => {
          if (revision !== preparationRevision) return;
          importedWorlds = worlds;
          if (recapSource === 'file') applyWorlds(worlds);
        }),
        activeChecker.loadFriends(account, exclusions.ids()).then(friends => {
          if (revision !== preparationRevision || peopleRevision !== personRevision) return;
          importedFriends = friends;
          if (recapSource === 'file') applyFriends(friends);
        }),
      ]);
      if (revision === preparationRevision) prepared = true;
    } catch {
      if (revision === preparationRevision) {
        status.dataset.state = 'error';
        status.textContent = 'Your rewind could not be prepared. Please choose the database again.';
      }
    } finally {
      if (revision === preparationRevision) running = false;
    }
  }
  accountSelect.addEventListener('change', () => {
    cancelPreparation();
    button.disabled = !accountSelect.value;
    if (accountSelect.value) startBackground();
  });
  const buttonLabel = button.querySelector<HTMLElement>('span')!;
  const importPanel = main.querySelector<HTMLElement>('.import-panel')!;
  const panelCopy = main.querySelector<HTMLElement>('.panel-copy')!;
  const databaseLocation = main.querySelector<HTMLElement>('.database-location')!;
  const dropHint = main.querySelector<HTMLElement>('.drop-hint')!;
  const chooseNew = main.querySelector<HTMLButtonElement>('.choose-new-db')!;
  const buttonIcon = button.querySelector<SVGElement>('svg')!;
  const folderIcon = buttonIcon.innerHTML;
  chooseNew.addEventListener('click', () => {
    selectionRevision++;
    resetSelection('');
    delete button.dataset.state;
    delete status.dataset.state;
    button.focus({ preventScroll: true });
  });
  function setCollapsed(collapsed: boolean): void {
    if (collapsed && !importPanel.classList.contains('is-ready')) {
      importPanel.style.setProperty('--ready-panel-height', String(importPanel.getBoundingClientRect().height) + 'px');
    }
    importPanel.classList.toggle('is-ready', collapsed);
    demoButton.hidden=collapsed;
    syncImagePermission();
    panelCopy.hidden = collapsed;
    databaseLocation.hidden = collapsed;
    dropHint.hidden = collapsed;
    chooseNew.hidden = !collapsed;
    buttonIcon.innerHTML = collapsed ? '<path d="m8 4 12 8-12 8V4Z"/>' : folderIcon;
  }
  let selectionRevision = 0;
  let recommendedRevision = -1;
  function showImageRecommendation(): void {
    if (!selectedFile || button.dataset.state !== 'ready' || getVRChatImagesAllowed() || recommendedRevision === selectionRevision || imageDialog.open || helpDialog.open) return;
    recommendedRevision = selectionRevision;
    syncImagePermission();
    imageDialog.showModal();
  }
  helpDialog.addEventListener('close', showImageRecommendation);
  imageDialog.addEventListener('close', () => {
    if (imageDialog.open || button.dataset.state !== 'ready' || !selectedFile) return;
    (button.disabled ? accountSelect : button).focus({ preventScroll: true });
  });
  function resetSelection(message: string): void {
    if (selectedFile || running) cancelPreparation();
    selectedFile = undefined;
    accountLabel.hidden = true;
    setCollapsed(false);
    button.removeAttribute('title');
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.dataset.state = 'error';
    buttonLabel.textContent = 'Select your VRCX database';
    status.dataset.state = 'error';
    status.textContent = message;
  }
  async function selectFiles(files: FileList | File[]): Promise<void> {
    if (imageDialog.open) imageDialog.close();
    if (selectedFile || running) cancelPreparation();
    selectedFile = undefined;
    accountLabel.hidden = true;
    const revision = ++selectionRevision;
    if (files.length !== 1) {
      resetSelection('Please choose one VRCX.sqlite3 database at a time.');
      return;
    }
    const file = files[0]!;
    setCollapsed(false);
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.dataset.state = 'checking';
    buttonLabel.textContent = 'Checking database';
    status.dataset.state = 'checking';
    status.textContent = `Checking ${file.name} locally...`;
    const result = await checker.check(file);
    if (revision !== selectionRevision) return;
    if (!result.ok) { resetSelection(result.message); return; }
    selectedFile = file;
    needsDatabaseCheck = false;
    const accounts = result.accounts ?? [];
    const displayNames = new Map<string, string>();
    if (accounts.length > 1) {
      status.textContent = 'Loading account names locally...';
      // Read only each owner's latest saved name; avatar pictures are not needed.
      const profiles = await Promise.all(accounts.map(account => checker.loadShareProfile(account, false)));
      if (revision !== selectionRevision) return;
      profiles.forEach((profile, index) => {
        const name = profile.displayName?.trim();
        if (name) displayNames.set(accounts[index]!, name);
      });
    }
    button.disabled = false;
    button.removeAttribute('aria-busy');
    accountSelect.replaceChildren(...accounts.map((account, index) => {
      const option = document.createElement('option');
      option.value = account;
      const name = displayNames.get(account);
      const duplicate = name && [...displayNames.values()].filter(value => value === name).length > 1;
      option.textContent = name ? (duplicate ? `${name} (${account})` : name) : `Account ${index + 1}: ${account}`;
      option.title = account;
      return option;
    }));
    const multipleAccounts = (result.accounts?.length ?? 0) > 1;
    accountLabel.hidden = !multipleAccounts;
    if (multipleAccounts) {
      const placeholder = document.createElement('option');
      placeholder.value = ''; placeholder.textContent = 'Select your account'; placeholder.disabled = true; placeholder.selected = true;
      accountSelect.prepend(placeholder);
    } else startBackground();

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) {
      await importPanel.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.985)' }], { duration: 140, easing: 'ease-out' }).finished;
      if (revision !== selectionRevision) return;
    }
    button.dataset.state = 'ready';
    setCollapsed(true);
    buttonLabel.textContent = 'Start your rewind';
    button.disabled = multipleAccounts && !accountSelect.value;
    button.removeAttribute('title');
    status.dataset.state = 'ready';
    status.textContent = `${file.name} checked. Ready for your rewind.`;
    showImageRecommendation();
    if (!reduceMotion) {
      main.querySelector<HTMLElement>('.import-action')!.animate(
        [{ opacity: 0, transform: 'translateY(10px) scale(.96)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }],
        { duration: 320, easing: 'cubic-bezier(.2,.7,.2,1)' },
      );
    }
  }  input.addEventListener('change', () => {
    if (input.files?.length) void selectFiles(Array.from(input.files));
    input.value = '';
  });
  const dropArea = main.querySelector<HTMLElement>('.import-panel')!;
  let dragDepth = 0;
  const isFileDrag = (event: DragEvent): boolean => !!event.dataTransfer?.types.includes('Files');
  dropArea.addEventListener('dragenter', event => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepth++;
    dropArea.classList.add('is-dragging');
  });
  dropArea.addEventListener('dragover', event => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  dropArea.addEventListener('dragleave', event => {
    if (!isFileDrag(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropArea.classList.remove('is-dragging');
  });
  dropArea.addEventListener('drop', event => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepth = 0;
    dropArea.classList.remove('is-dragging');
    if (event.dataTransfer) void selectFiles(Array.from(event.dataTransfer.files));
  });
  // Avoid opening a dropped database as a browser page if it misses the target.
  for (const type of ['dragover', 'drop'] as const) {
    main.addEventListener(type, event => {
      if (isFileDrag(event)) event.preventDefault();
    });
  }  return main;
}
