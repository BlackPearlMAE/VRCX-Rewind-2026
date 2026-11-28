import { attachHSVColorPicker } from '../../components/hsv-color-picker';
import { bundledWorldThumbnail } from '../../data/world-thumbnail-index';
import { addPageKeyboardNavigation } from '../../components/page-navigation';
import { getVRChatImagesAllowed, setVRChatImagesAllowed, onVRChatImagesChange, permittedImage } from '../../components/world-thumbnail';
import type { OwnAvatarPicture, OwnShareProfile } from '../../data/own-avatar-query';
import { defaultShareColors, drawShareCard, type ShareCardData, type ShareCardKind, type ShareFriendRegion } from '../../export/share-card';

export function createSharePage(onPrevious: () => void, onShow: () => void, loadProfile: () => Promise<OwnShareProfile>, onExclude?: (person: {userId: string; name: string}, trigger: HTMLElement, picture?: HTMLImageElement) => void) {
  const section = document.createElement('section');
  section.className = 'opening-card share-page'; section.dataset.page = 'share'; section.hidden = true; section.tabIndex = -1;
  section.setAttribute('aria-labelledby','share-title');
  section.innerHTML = `<button type="button" class="share-back">Back to recap</button><div class="recap-stage"><div class="share-content">
    <header class="share-page-heading"><p class="share-eyebrow">VRCX REWIND 2026</p><h2 id="share-title">Your rewind, ready to share.</h2></header>

    <div class="share-workspace"><aside class="share-missing-pictures" aria-label="Missing pictures" hidden><h3>Missing pictures</h3><fieldset class="share-friend-pictures" hidden><legend>Friend pictures</legend><button type="button" class="share-friends-show-all" aria-pressed="false">Show all friends</button><div class="share-friend-picture-list"></div><input class="share-friend-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden><p class="share-friend-upload-status" role="status"></p><p class="share-local-note">Pictures you choose stay in this tab.</p></fieldset><fieldset class="share-world-pictures" hidden><legend>World pictures</legend><div class="share-world-picture-list"></div><input class="share-world-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden><p class="share-world-upload-status" role="status"></p><p class="share-local-note">Pictures you choose stay in this tab.</p></fieldset></aside><figure class="share-preview"><canvas class="share-card-canvas" width="1080" height="1350"></canvas><div class="share-friend-targets" aria-label="Exclude users from this recap"></div></figure>
    <div class="share-editor"><fieldset class="share-card-picker"><legend>Choose a card</legend><div class="share-kind-buttons"><button type="button" data-kind="stats" aria-pressed="true">Your stats</button><button type="button" data-kind="friends" aria-pressed="false">Friends</button><button type="button" data-kind="worlds" aria-pressed="false">Worlds</button></div></fieldset><hr class="share-settings-divider"><h3>Make it yours</h3>
      <label class="share-name-label">Name on card<input class="share-name" maxlength="48" placeholder="My 2026 in VRChat" autocomplete="off"></label>
      <hr class="share-settings-divider"><fieldset class="share-picture-picker"><legend>Profile picture</legend><label class="share-image-permission"><input type="checkbox" class="share-load-avatars"> Load world and avatar pictures from VRChat</label><p class="share-image-note">VRChat receives your IP address when images load.</p><p class="share-world-image-status" role="status"></p><p class="share-picture-status" role="status"></p><div class="share-picture-options"></div>
      <div class="share-picture-actions"><button type="button" class="share-upload">Upload profile picture</button><button type="button" class="share-no-picture" aria-pressed="true">No picture</button></div><input class="share-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden><p class="share-local-note">Pictures you choose stay in this tab.</p></fieldset>
      <hr class="share-settings-divider"><fieldset class="share-color-picker"><legend>Card colors</legend><div class="share-color-controls">
        <div><input type="text" class="share-gradient-color" aria-label="Gradient color" value="#1c605a"></div>
        <div><input type="text" class="share-shadow-color" aria-label="Accent and number shadow" value="#c54888"></div>
      </div></fieldset>
      <div class="share-export-actions"><button type="button" class="journey-button share-download">Download PNG</button><button type="button" class="share-screenshot">Open screenshot view</button><p class="share-export-note">Exports exactly the preview.</p><p class="share-download-status" role="status"></p></div>
    </div></div>
  </div></div><footer data-visualization="spectrum"></footer>
    <dialog class="share-screenshot-dialog" aria-labelledby="share-screenshot-title">
      <div class="share-screenshot-toolbar"><div><h3 id="share-screenshot-title">Save your card with a screenshot</h3><p>Use your device’s screenshot tool to capture just the card.</p></div><button type="button" class="share-screenshot-close">Back to editing</button></div>
      <div class="share-screenshot-stage"><canvas class="share-screenshot-canvas" width="1080" height="1350" role="img" aria-label="Your card, ready for a screenshot"></canvas></div>
    </dialog>`;
  section.querySelector('.share-back')!.addEventListener('click', onPrevious);
  addPageKeyboardNavigation(section,onPrevious);
  const canvas=section.querySelector<HTMLCanvasElement>('canvas')!;
  const friendTargets=section.querySelector<HTMLElement>('.share-friend-targets')!;
  function renderFriendTargets(regions: ShareFriendRegion[], pictures: ReadonlyMap<string, HTMLImageElement>) {
    const focused=document.activeElement;
    const focusedIndex=focused instanceof HTMLButtonElement && focused.parentElement===friendTargets ? [...friendTargets.children].indexOf(focused) : -1;
    const buttons=regions.map(region=>{
      const button=document.createElement('button');button.type='button';button.className='share-friend-target';button.dataset.userId=region.userId;
      button.setAttribute('aria-label',`Exclude ${region.name} from this recap`);
      button.title='Exclude from Rewind';
      Object.assign(button.style,{left:`${region.x/canvas.width*100}%`,top:`${region.y/canvas.height*100}%`,width:`${region.width/canvas.width*100}%`,height:`${region.height/canvas.height*100}%`,borderRadius:region.circle ? '50%' : '1.25rem'});
      button.addEventListener('click',()=>onExclude?.(region,button,pictures.get(region.userId)));
      return button;
    });
    friendTargets.replaceChildren(...buttons);
    if(focusedIndex>=0)(buttons[Math.min(focusedIndex,buttons.length-1)] ?? section.querySelector<HTMLButtonElement>(`[data-kind="${kind}"]`))?.focus({preventScroll:true});
  }
  const name=section.querySelector<HTMLInputElement>('.share-name')!;
  const gradient=section.querySelector<HTMLInputElement>('.share-gradient-color')!;
  const shadow=section.querySelector<HTMLInputElement>('.share-shadow-color')!;
  const gradientPicker=attachHSVColorPicker(gradient,'Gradient color');
  const shadowPicker=attachHSVColorPicker(shadow,'Accent and number shadow');
  let customColors: ReturnType<typeof defaultShareColors> | undefined;
  let profile: Promise<OwnShareProfile> | undefined, profileGeneration=0, nameEdited=false;
  let fixedName: string | undefined;
  const imagePermission=section.querySelector<HTMLInputElement>('.share-load-avatars')!;
  function syncImagePermission() {
    imagePermission.checked=getVRChatImagesAllowed();
    section.querySelector<HTMLElement>('.share-image-note')!.hidden=imagePermission.checked;
  }
  syncImagePermission();
  imagePermission.addEventListener('change',()=>setVRChatImagesAllowed(imagePermission.checked));
  const pictureStatus=section.querySelector<HTMLElement>('.share-picture-status')!;
  const pictureOptions=section.querySelector<HTMLElement>('.share-picture-options')!;
  const downloadStatus=section.querySelector<HTMLElement>('.share-download-status')!;
  const screenshotButton=section.querySelector<HTMLButtonElement>('.share-screenshot')!;
  const screenshotDialog=section.querySelector<HTMLDialogElement>('.share-screenshot-dialog')!;
  const screenshotCanvas=section.querySelector<HTMLCanvasElement>('.share-screenshot-canvas')!;
  function fitScreenshot() {
    if(!screenshotDialog.open)return;
    const stage=section.querySelector<HTMLElement>('.share-screenshot-stage')!;
    screenshotCanvas.style.width=Math.floor(Math.min(stage.clientWidth,stage.clientHeight*(screenshotCanvas.width/screenshotCanvas.height)))+'px';
  }
  screenshotButton.addEventListener('click',()=>{
    screenshotCanvas.width=canvas.width;screenshotCanvas.height=canvas.height;
    screenshotCanvas.getContext('2d')!.drawImage(canvas,0,0);
    screenshotCanvas.setAttribute('aria-label',canvas.getAttribute('aria-label') ?? 'Your card, ready for a screenshot');
    screenshotDialog.showModal();fitScreenshot();
  });
  section.querySelector('.share-screenshot-close')!.addEventListener('click',()=>screenshotDialog.close());
  screenshotDialog.addEventListener('keydown',event=>event.stopPropagation());
  screenshotDialog.addEventListener('close',()=>{screenshotCanvas.width=1080;screenshotCanvas.height=1350;if(!section.hidden)screenshotButton.focus({preventScroll:true});});
  window.addEventListener('resize',fitScreenshot);

  let kind: ShareCardKind='stats', data: ShareCardData={}, selectedPicture: HTMLImageElement | undefined;
  const openedCards=new Set<ShareCardKind>(['stats']);
  let worldGeneration=0, worldLoading=0;
  const worldImages=new Map<string,HTMLImageElement>();
  const friendImages=new Map<string,HTMLImageElement>();
  const friendRequests=new Set<string>();
  const uploadedFriendImages=new Map<string,HTMLImageElement>();
  const uploadedWorldImages=new Map<string,HTMLImageElement>();
  let worldUploadGeneration=0,worldUploadTarget: string | undefined;
  const missingPanel=section.querySelector<HTMLElement>('.share-missing-pictures')!;
  const worldPicker=section.querySelector<HTMLFieldSetElement>('.share-world-pictures')!;
  const worldList=section.querySelector<HTMLElement>('.share-world-picture-list')!;
  const worldFile=section.querySelector<HTMLInputElement>('.share-world-file')!;
  const worldUploadStatus=section.querySelector<HTMLElement>('.share-world-upload-status')!;
  function cardWorlds() {
    const worlds=new Map<string,{worldId:string;name:string;imageUrl?:string}>();
    if(kind==='friends')return [];
    for(const page of data.worlds ?? [])if((kind==='stats' ? page.id==='time' : page.id==='time' || page.id==='visits' || page.id==='discoveries') && page.status==='ready')
      for(const entry of page.entries.slice(0,kind==='stats' ? 3 : page.id==='discoveries' ? 1 : kind==='highlights' ? 3 : 5))if(!worlds.has(entry.worldId))worlds.set(entry.worldId,entry);
    return [...worlds.values()];
  }
  function renderWorldPicker(images: ReadonlyMap<string,HTMLImageElement>) {
    const missing=cardWorlds().filter(entry=>!images.has(entry.worldId));
    worldPicker.hidden=!missing.length;
    worldList.replaceChildren(...missing.map(entry=>{
      const row=document.createElement('div');row.className='share-world-picture-row';row.dataset.worldId=entry.worldId;
      const name=document.createElement('span');name.textContent=entry.name;
      const button=document.createElement('button');button.type='button';button.textContent='Upload world picture';button.setAttribute('aria-label',`Upload world picture for ${entry.name}`);
      button.addEventListener('click',()=>{worldUploadTarget=entry.worldId;worldFile.click();});row.append(name,button);return row;
    }));
  }
  let showAllFriendPictures=false, friendUploadGeneration=0, friendUploadTarget: string | undefined;
  const friendPicker=section.querySelector<HTMLFieldSetElement>('.share-friend-pictures')!;
  const friendList=section.querySelector<HTMLElement>('.share-friend-picture-list')!;
  const friendShowAll=section.querySelector<HTMLButtonElement>('.share-friends-show-all')!;
  const friendFile=section.querySelector<HTMLInputElement>('.share-friend-file')!;
  const friendUploadStatus=section.querySelector<HTMLElement>('.share-friend-upload-status')!;
  function cardFriends() {
    const people=new Map<string,{userId:string;name:string;imageUrl?:string}>();
    for(const page of data.friends ?? [])if((kind==='stats' ? page.id==='time' || page.id==='added' : page.id==='time' || page.id==='added' || page.id==='overlap' || page.id==='mutuals') && page.status==='ready')
      for(const entry of page.entries.slice(0,kind==='stats' || kind==='highlights' ? (page.id==='time' || page.id==='added' ? 3 : 1) : page.id==='time' || page.id==='added' ? 5 : 1))if(!people.has(entry.userId))people.set(entry.userId,entry);
    return [...people.values()];
  }
  function renderFriendPicker(images: ReadonlyMap<string,HTMLImageElement>) {
    friendPicker.hidden=kind==='worlds' || !cardFriends().some(person=>!images.has(person.userId));
    if(friendPicker.hidden){friendList.replaceChildren();return;}
    friendShowAll.textContent=showAllFriendPictures ? 'Show only missing pictures' : 'Show all friends';
    friendShowAll.setAttribute('aria-pressed',String(showAllFriendPictures));
    const friends=cardFriends().filter(person=>showAllFriendPictures || !images.has(person.userId));
    const rows=friends.map(person=>{
      const row=document.createElement('div');row.className='share-friend-picture-row';row.dataset.userId=person.userId;
      const label=document.createElement('div'),name=document.createElement('span'),status=document.createElement('small');
      name.textContent=person.name;status.textContent=uploadedFriendImages.has(person.userId) ? 'Uploaded picture' : images.has(person.userId) ? 'Saved avatar' : 'Missing picture';
      label.append(name,status);
      const button=document.createElement('button');button.type='button';button.textContent='Upload profile picture';button.setAttribute('aria-label',`Upload profile picture for ${person.name}`);
      button.addEventListener('click',()=>{friendUploadTarget=person.userId;friendFile.click();});
      row.append(label,button);return row;
    });
    if(!rows.length) {
      const empty=document.createElement('p');empty.className='share-local-note';empty.textContent=cardFriends().length ? 'Everyone on this card has a picture.' : 'No friends to display on this card.';
      friendList.replaceChildren(empty);
    } else friendList.replaceChildren(...rows);
  }
  let friendGeneration=0;
  const worldRequests=new Map<string,Promise<void>>();
  const worldStatus=section.querySelector<HTMLElement>('.share-world-image-status')!;
  let selectedSource: 'upload' | 'remote' | undefined;
  let pictureChoiceMade=false;
  let generation=0, uploadGeneration=0, requested=false;
  const pendingImages=new Set<() => void>();
  function render() {
    name.readOnly = fixedName !== undefined;
    if (fixedName !== undefined) name.value = fixedName;
    section.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.kind===kind));
      button.classList.toggle('share-card-unopened',!openedCards.has(button.dataset.kind as ShareCardKind));
    });
    const colors=customColors ?? defaultShareColors(kind);
    gradient.value=colors.gradientColor;shadow.value=colors.shadowColor;
    gradientPicker.sync(gradient.value);shadowPicker.sync(shadow.value);
    const activeFriendImages=new Map([...friendImages,...uploadedFriendImages]);
    const activeWorldImages=new Map([...worldImages,...uploadedWorldImages]);
    renderFriendPicker(activeFriendImages);renderWorldPicker(activeWorldImages);
    missingPanel.hidden=friendPicker.hidden && worldPicker.hidden;
    const regions: ShareFriendRegion[]=[];
    drawShareCard(canvas,kind,data,{onFriendRegion:onExclude ? region=>regions.push(region) : undefined,name:name.value,picture:selectedPicture,worldImages:activeWorldImages,friendImages:activeFriendImages,friendNames:true,gradientColor:gradient.value,shadowColor:shadow.value});
    section.style.setProperty('--share-card-ratio',String(canvas.width/canvas.height));
    renderFriendTargets(regions, activeFriendImages);
    const hasRemoteProfile=selectedSource==='remote' && selectedPicture?.dataset.exportSafe==='false';
    const previewOnly=!!hasRemoteProfile || cardWorlds().some(entry=>activeWorldImages.get(entry.worldId)?.dataset.exportSafe==='false') || (kind!=='worlds' && cardFriends().some(person=>activeFriendImages.get(person.userId)?.dataset.exportSafe==='false'));
    const download=section.querySelector<HTMLButtonElement>('.share-download')!;
    download.disabled=previewOnly;download.hidden=previewOnly;
    screenshotButton.classList.toggle('journey-button',previewOnly);
    section.querySelector('.share-export-note')!.textContent=previewOnly
      ? 'Due to technical limitations, we can’t generate a downloadable image of this card with VRChat pictures. Please take a screenshot to save it.'
      : 'Download a PNG, or open the screenshot view.';
  }
  function worldImageStatus() {
    if(kind!=='worlds' && kind!=='highlights')worldStatus.textContent='';
    else if(!getVRChatImagesAllowed())worldStatus.textContent='Enable VRChat pictures below to load the world artwork.';
    else if(worldLoading)worldStatus.textContent='Loading world artwork…';
    else worldStatus.textContent=worldImages.size ? 'World artwork is ready. Missing pictures use placeholders.' : 'Unavailable pictures use placeholders.';
  }
  async function prepareWorldImages() {
    worldImageStatus();
    if(section.hidden || kind==='friends' || !getVRChatImagesAllowed())return;
    const revision=worldGeneration;
    const entries=new Map<string,{worldId:string;imageUrl?:string}>();
    for(const page of data.worlds ?? [])if((kind==='stats' ? page.id==='time' : page.id==='time' || page.id==='visits' || page.id==='discoveries') && page.status==='ready')
      for(const entry of page.entries.slice(0,kind==='stats' ? 3 : page.id==='discoveries' ? 1 : kind==='highlights' ? 3 : 5))if(!entries.has(entry.worldId) || entry.imageUrl)entries.set(entry.worldId,entry);
    const jobs: Promise<void>[]=[];
    for(const entry of entries.values()) {
      const key=entry.worldId+'|'+(entry.imageUrl ?? '');
      if(worldRequests.has(key))continue;
      worldLoading++;
      const job=(async()=>{
        try {
          let url=(entry.imageUrl && permittedImage(entry.imageUrl)) || await bundledWorldThumbnail(entry.worldId);
          const winner=data.worlds?.some(page=>(page.id==='time' || page.id==='visits') && page.entries[0]?.worldId===entry.worldId);
          if(winner && url)url=url.replace(/\/api\/1\/image\/(file_[0-9a-f-]+)\/(\d+)\/\d+$/i,'/api/1/file/$1/$2/file');
          if(revision!==worldGeneration || !getVRChatImagesAllowed())return;
          if(!url)return;
          let image=await loadImage(url,true);
          if(image)image.dataset.exportSafe='true';
          else if(revision===worldGeneration && getVRChatImagesAllowed()) {
            image=await loadImage(url,false);
            if(image)image.dataset.exportSafe='false';
          }
          if(revision===worldGeneration && getVRChatImagesAllowed() && image)worldImages.set(entry.worldId,image);
        } finally {
          if(revision===worldGeneration) { worldLoading--;worldImageStatus();render(); }
        }
      })();
      worldRequests.set(key,job);jobs.push(job);
    }
    worldImageStatus();await Promise.all(jobs);
  }
  async function prepareFriendImages() {
    if(section.hidden || kind==='worlds' || !getVRChatImagesAllowed())return;
    const revision=friendGeneration;
    const entries=new Map(cardFriends().map(entry=>[entry.userId,entry]));
    await Promise.all([...entries.values()].map(async entry=>{
      const url=entry.imageUrl && permittedImage(entry.imageUrl);
      if(!url)return;
      const key=entry.userId+'|'+url;if(friendRequests.has(key))return;friendRequests.add(key);
      let image=await loadImage(url,true);
      if(image)image.dataset.exportSafe='true';
      else if(revision===friendGeneration && getVRChatImagesAllowed()) {
        image=await loadImage(url,false);if(image)image.dataset.exportSafe='false';
      }
      if(revision===friendGeneration && getVRChatImagesAllowed() && image) {friendImages.set(entry.userId,image);render();}
    }));
  }
  worldFile.addEventListener('change',async()=>{
    const worldId=worldUploadTarget,file=worldFile.files?.[0],revision=++worldUploadGeneration;worldFile.value='';
    if(!worldId || !file)return;
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type) || file.size>15*1024*1024) {worldUploadStatus.textContent='Choose a PNG, JPG, WebP or GIF up to 15 MB.';return;}
    const url=URL.createObjectURL(file);
    try {
      const image=await loadImage(url,false);
      if(revision!==worldUploadGeneration || !cardWorlds().some(entry=>entry.worldId===worldId))return;
      if(!image){worldUploadStatus.textContent='This picture could not be opened. Try another image up to 8192 × 8192.';return;}
      image.dataset.exportSafe='true';uploadedWorldImages.set(worldId,image);worldUploadStatus.textContent='World picture updated.';render();
    } finally {URL.revokeObjectURL(url);}
  });
  friendShowAll.addEventListener('click',()=>{showAllFriendPictures=!showAllFriendPictures;render();});
  friendFile.addEventListener('change',async()=>{
    const userId=friendUploadTarget,file=friendFile.files?.[0],revision=++friendUploadGeneration;friendFile.value='';
    if(!userId || !file)return;
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type) || file.size>15*1024*1024) {
      friendUploadStatus.textContent='Choose a PNG, JPG, WebP or GIF up to 15 MB.';return;
    }
    const url=URL.createObjectURL(file);
    try {
      const image=await loadImage(url,false);
      if(revision!==friendUploadGeneration || !cardFriends().some(person=>person.userId===userId))return;
      if(!image) {friendUploadStatus.textContent='This picture could not be opened. Try another image up to 8192 × 8192.';return;}
      image.dataset.exportSafe='true';uploadedFriendImages.set(userId,image);
      friendUploadStatus.textContent='Friend picture updated.';render();
    } finally {URL.revokeObjectURL(url);}
  });
  for(const input of [gradient,shadow])input.addEventListener('input',()=>{
    const valid=(value: string)=>/^#[0-9a-f]{6}$/i.test(value);
    if(!valid(input.value))return;
    const previous=customColors ?? defaultShareColors(kind);
    customColors={gradientColor:valid(gradient.value) ? gradient.value : previous.gradientColor,shadowColor:valid(shadow.value) ? shadow.value : previous.shadowColor};
    render();
  });
  function selectPicture(image?: HTMLImageElement, source?: 'upload' | 'remote', manual=false) {
    if(manual)pictureChoiceMade=true;
    selectedPicture=image; selectedSource=source;
    pictureOptions.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.firstElementChild===image)));
    section.querySelector('.share-no-picture')!.setAttribute('aria-pressed',String(!image)); render();
  }
  function loadImage(url: string, cors: boolean): Promise<HTMLImageElement | undefined> {
    return new Promise(resolve=>{
      const image=new Image(); if(cors) image.crossOrigin='anonymous'; image.referrerPolicy='no-referrer';
      let done=false;
      const finish=(ok: boolean)=>{ if(done)return; done=true; clearTimeout(timer); pendingImages.delete(cancel); image.onload=null; image.onerror=null; if(!ok)image.removeAttribute('src'); resolve(ok?image:undefined); };
      const cancel=()=>finish(false);
      // Both CORS and ordinary remote requests must stop when consent is revoked.
      if(!url.startsWith('blob:'))pendingImages.add(cancel);
      const timer=setTimeout(cancel,6000);
      image.onload=()=>finish(image.naturalWidth>0 && image.naturalWidth<=8192 && image.naturalHeight<=8192); image.onerror=()=>finish(false); image.src=url;
    });
  }
  function prepareProfile(): Promise<OwnShareProfile> {
    if(!profile) {
      const revision=profileGeneration;
      profile=loadProfile().catch((): OwnShareProfile=>({pictures:[]})).then(result=>{
        if(revision===profileGeneration && fixedName === undefined && !nameEdited && result.displayName) { name.value=result.displayName; render(); }
        return result;
      });
    }
    return profile;
  }
  async function preparePictures() {
    if(section.hidden || requested) return;
    if(!getVRChatImagesAllowed()) { pictureStatus.textContent='Upload a profile picture, or enable saved avatar pictures above.'; return; }
    requested=true; const revision=++generation;
    pictureStatus.textContent='Looking for recent avatar pictures…';
    let candidates: OwnAvatarPicture[]=[];
    try { candidates=(await prepareProfile()).pictures; } catch { /* Optional pictures. */ }
    const seen=new Set<string>(); let loaded=0;
    for(let index=0;index<candidates.length && loaded<5;index+=5) {
      if(revision!==generation || !getVRChatImagesAllowed())return;
      const batch=candidates.slice(index,index+5).filter(candidate=>{
        const url=permittedImage(candidate.url); if(!url || seen.has(url))return false; seen.add(url); return true;
      });
      const results=await Promise.all(batch.map(async candidate=>{
        const url=permittedImage(candidate.url)!;
        let image=await loadImage(url,true);
        if(image)image.dataset.exportSafe='true';
        else if(revision===generation && getVRChatImagesAllowed()) {image=await loadImage(url,false);if(image)image.dataset.exportSafe='false';}
        return {candidate,image};
      }));
      if(revision!==generation || !getVRChatImagesAllowed())return;
      for(const {candidate,image} of results) {
        if(!image || loaded>=5)continue; loaded++;
        const button=document.createElement('button'); button.type='button'; button.setAttribute('aria-label',`Use ${candidate.name}`); button.setAttribute('aria-pressed','false'); image.alt='';
        button.append(image); button.addEventListener('click',()=>selectPicture(image,'remote',true)); pictureOptions.append(button);
        if(!pictureChoiceMade && !selectedPicture)selectPicture(image,'remote');
      }
    }
    if(revision===generation) pictureStatus.textContent=loaded ? 'Recent worn avatars. Choose one or upload a picture.' : 'No saved avatar pictures could be loaded. You can upload your own.';
  }
  onVRChatImagesChange(()=>{
    syncImagePermission();
    worldGeneration++; worldLoading=0; worldRequests.clear(); worldImages.clear(); friendGeneration++; friendRequests.clear(); friendImages.clear();
    generation++; requested=false; [...pendingImages].forEach(cancel=>cancel()); pictureOptions.replaceChildren();
    if(selectedSource==='remote')selectPicture();
    render();
    if(!section.hidden) { void preparePictures(); void prepareWorldImages(); void prepareFriendImages(); }
  });
  section.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(button=>button.addEventListener('click',()=>{
    kind=button.dataset.kind as ShareCardKind;openedCards.add(kind);
    section.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    downloadStatus.textContent=''; render(); void prepareWorldImages(); void prepareFriendImages();
  }));
  name.addEventListener('input',()=>{if(fixedName===undefined)nameEdited=true;render();});
  const fileInput=section.querySelector<HTMLInputElement>('.share-file')!;
  section.querySelector('.share-upload')!.addEventListener('click',()=>fileInput.click());
  section.querySelector('.share-no-picture')!.addEventListener('click',()=>{ uploadGeneration++; selectPicture(undefined,undefined,true); });
  fileInput.addEventListener('change',async()=>{
    const revision=++uploadGeneration, file=fileInput.files?.[0]; fileInput.value=''; if(!file)return;
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type) || file.size>15*1024*1024) { pictureStatus.textContent='Choose a PNG, JPG, WebP or GIF up to 15 MB.'; return; }
    pictureChoiceMade=true;
    const url=URL.createObjectURL(file);
    try {
      const image=await loadImage(url,false);
      if(revision!==uploadGeneration)return;
      if(!image) { pictureStatus.textContent='This picture could not be opened. Try another image up to 8192 × 8192.'; return; }
      selectPicture(image,'upload'); pictureStatus.textContent='Your uploaded picture is selected.';
    } finally { URL.revokeObjectURL(url); }
  });
  const download=section.querySelector<HTMLButtonElement>('.share-download')!;
  download.addEventListener('click',()=>{
    const exportedKind=kind;
    download.disabled=true; downloadStatus.textContent='Preparing PNG…';
    try {
      canvas.toBlob(blob=>{
        download.disabled=false;
        if(!blob) { downloadStatus.textContent='The PNG could not be created. Try again.'; return; }
        const url=URL.createObjectURL(blob), link=document.createElement('a');
        link.href=url; link.download=`vrcx-rewind-2026-${exportedKind}.png`; link.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000); downloadStatus.textContent='PNG downloaded.';
      },'image/png');
    } catch { download.disabled=false; downloadStatus.textContent='This picture cannot be exported. Choose an uploaded picture or no picture.'; }
  });
  render();
  return {
    section,
    show() { section.hidden=false; onShow(); render(); section.focus({preventScroll:true}); void prepareProfile(); void preparePictures(); void prepareWorldImages(); void prepareFriendImages(); },
    hide() { gradientPicker.close();shadowPicker.close();section.hidden=true;if(screenshotDialog.open)screenshotDialog.close(); },
    setFixedName(value?: string) { fixedName=value; render(); },
    update(values: Partial<ShareCardData>) { data={...data,...values}; render(); void prepareWorldImages(); void prepareFriendImages(); },
    reset() { fixedName=undefined;name.readOnly=false;kind='stats';openedCards.clear();openedCards.add('stats');gradientPicker.close();shadowPicker.close();if(screenshotDialog.open)screenshotDialog.close();worldGeneration++; worldLoading=0; worldRequests.clear(); worldImages.clear(); friendGeneration++; friendRequests.clear(); friendImages.clear(); uploadedFriendImages.clear();uploadedWorldImages.clear();worldUploadGeneration++;worldUploadTarget=undefined;worldList.replaceChildren();worldUploadStatus.textContent='';friendUploadGeneration++;friendUploadTarget=undefined;showAllFriendPictures=false;friendList.replaceChildren();friendUploadStatus.textContent='';data={}; profileGeneration++; profile=undefined; nameEdited=false; pictureChoiceMade=false; generation++; uploadGeneration++; requested=false; [...pendingImages].forEach(cancel=>cancel()); name.value=''; customColors=undefined; pictureOptions.replaceChildren(); pictureStatus.textContent=''; downloadStatus.textContent=''; selectPicture(); },
  };
}
